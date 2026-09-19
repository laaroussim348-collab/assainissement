/**
 * telechargementJobs.js
 * -----------------------------------------------------------------------
 * Orchestration des téléchargements de couches de données : vérifie le
 * cache, appelle le bon client réseau, rend la progression consultable
 * par sondage (polling) depuis l'interface, et permet d'annuler un
 * téléchargement en cours (§3.3 : « interruptible, avec barre de
 * progression »).
 *
 * Un « job » vit en mémoire, dans CE processus Node (celui démarré par
 * electron-main.mjs) — pas de file d'attente persistante ni de base de
 * données : l'application est mono-utilisateur, mono-poste, et un
 * téléchargement interrompu par la fermeture du logiciel n'a pas besoin
 * de reprendre exactement où il s'est arrêté, juste de ne pas re-payer ce
 * qui est déjà en cache (voir cacheDonnees.js) — relancer le
 * téléchargement après redémarrage suffit à couvrir ce cas.
 *
 * PAS DE REPRISE OCTET PAR OCTET : annuler puis relancer refait le
 * téléchargement depuis le début (pas de fusion de progression
 * partielle). C'est un choix de portée assumé : la granularité fine
 * (mémoriser quels lots d'une grille d'altimétrie ont déjà répondu)
 * ajouterait une complexité sans rapport avec le bénéfice pour un
 * téléchargement qui prend, au pire, une poignée de minutes.
 * -----------------------------------------------------------------------
 */
import { randomUUID } from 'node:crypto';
import * as elevationClient from './elevationClient.js';
import * as overpassClient from './overpassClient.js';
import * as nasaPowerClient from './nasaPowerClient.js';
import * as soilGridsClient from './soilGridsClient.js';
import * as openTopographyClient from './openTopographyClient.js';
import { obtenirSource } from './sourcesDonnees.js';
import { obtenirCle } from './clesLocales.js';
import { clefCache, lireCache, ecrireCache } from './cacheDonnees.js';

const jobs = new Map();

class ErreurTelechargement extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function todayYYYYMMDD() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Centre approché du terrain, pour CENTRER une requête réseau (rayon de
 * recherche Overpass, point NASA POWER/SoilGrids) — PAS une mesure :
 * simple moyenne des sommets, suffisante pour ce seul usage. Toute
 * mesure réelle du terrain passe par calculations/geodesie.js.
 */
function centreApprox(sommets) {
  const lat = sommets.reduce((s, p) => s + p.lat, 0) / sommets.length;
  const lon = sommets.reduce((s, p) => s + p.lon, 0) / sommets.length;
  return { lat, lon };
}

function bboxDe(sommets) {
  return {
    latMin: Math.min(...sommets.map((s) => s.lat)),
    latMax: Math.max(...sommets.map((s) => s.lat)),
    lonMin: Math.min(...sommets.map((s) => s.lon)),
    lonMax: Math.max(...sommets.map((s) => s.lon)),
  };
}

function verifierAnnulation(job) {
  if (job.annule) throw new ErreurTelechargement('ANNULE', 'Téléchargement annulé.');
}

/** Un fetch par appel a son PROPRE contrôleur (timeout local), mais reste
 *  annulable par le contrôleur du job (écouté en plus) — voir le
 *  commentaire au-dessus de demarrerTelechargement pour pourquoi un seul
 *  contrôleur partagé entre tous les lots poserait problème (le repli
 *  Overpass sur le miroir, notamment, ne doit pas hériter d'un abandon
 *  déclenché par le timeout de la tentative précédente). */
function fetchAvecAnnulation(url, job, timeoutMs, options = {}) {
  return new Promise((resolve, reject) => {
    const controleur = new AbortController();
    const surAnnulationJob = () => controleur.abort();
    job.controleur.signal.addEventListener('abort', surAnnulationJob);
    const minuteur = setTimeout(() => controleur.abort(), timeoutMs);
    fetch(url, { signal: controleur.signal, ...options })
      .then(resolve, reject)
      .finally(() => {
        clearTimeout(minuteur);
        job.controleur.signal.removeEventListener('abort', surAnnulationJob);
      });
  });
}

async function fetchJson(url, job, timeoutMs = 30000) {
  let r;
  try {
    r = await fetchAvecAnnulation(url, job, timeoutMs);
  } catch (e) {
    verifierAnnulation(job);
    throw new Error(`Connexion impossible ou délai dépassé vers ${new URL(url).hostname} : ${e.message}`);
  }
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.text()).slice(0, 300); } catch { /* corps illisible : le code HTTP suffit */ }
    throw new Error(`${new URL(url).hostname} → HTTP ${r.status}${detail ? ' — ' + detail : ''}`);
  }
  return r.json();
}

async function fetchText(url, job, timeoutMs = 30000) {
  let r;
  try {
    r = await fetchAvecAnnulation(url, job, timeoutMs);
  } catch (e) {
    verifierAnnulation(job);
    throw new Error(`Connexion impossible ou délai dépassé vers ${new URL(url).hostname} : ${e.message}`);
  }
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.text()).slice(0, 300); } catch { /* corps illisible */ }
    throw new Error(`${new URL(url).hostname} → HTTP ${r.status}${detail ? ' — ' + detail : ''}`);
  }
  return r.text();
}

// ── Exécuteurs, un par source (voir sourcesDonnees.js) ─────────────────

async function executerElevation(job, sommets, parametres) {
  const grille = elevationClient.calculerGrilleElevation(
    sommets, parametres.espacementCible_m, parametres.maxPoints,
  );
  const lots = elevationClient.decouperEnLots(grille.points);
  const altitudes = [];
  for (let i = 0; i < lots.length; i++) {
    verifierAnnulation(job);
    const url = elevationClient.buildElevationUrl(lots[i].map((p) => [p.lat, p.lon]));
    const json = await fetchJson(url, job, 20000);
    altitudes.push(...elevationClient.parseElevationResponse(json));
    job.progres = (i + 1) / lots.length;
  }
  const points = grille.points.map((p, i) => ({ lat: p.lat, lon: p.lon, altitude_m: altitudes[i] }));
  return {
    donnees: { points, nbLignes: grille.nbLignes, nbColonnes: grille.nbColonnes, espacement_m: grille.espacementReel_m },
    meta: {
      resolutionObtenue: `${grille.espacementReel_m.toFixed(0)} m`,
      resolutionReduite: grille.espacementReduit,
      nbPoints: points.length,
    },
  };
}

async function executerOverpass(job, sommets, parametres) {
  const centre = centreApprox(sommets);
  const rayon_m = parametres.rayon_m || overpassClient.RAYON_RECHERCHE_M_DEFAUT;
  const ql = overpassClient.construireRequeteFacteursHydro(centre.lat, centre.lon, rayon_m);
  job.progres = 0.1;
  let json;
  try {
    json = await fetchJson(overpassClient.buildOverpassUrl(ql, overpassClient.OVERPASS_URL_PRINCIPALE), job, 70000);
  } catch (e) {
    verifierAnnulation(job);
    // Repli sur le miroir documenté (voir overpassClient.js) : l'instance
    // principale peut être temporairement surchargée sans que le service
    // Overpass lui-même soit indisponible.
    job.progres = 0.5;
    json = await fetchJson(overpassClient.buildOverpassUrl(ql, overpassClient.OVERPASS_URL_MIROIR), job, 70000);
  }
  job.progres = 0.9;
  const resultat = overpassClient.analyserReponseOverpass(json);
  job.progres = 1;
  return { donnees: resultat, meta: { resolutionObtenue: 'vecteur (OSM)', rayon_m } };
}

async function executerNasaPower(job, sommets) {
  const centre = centreApprox(sommets);
  const url = nasaPowerClient.buildDailyPrecipitationUrl(centre.lat, centre.lon, '19810101', todayYYYYMMDD());
  job.progres = 0.2;
  const json = await fetchJson(url, job, 45000);
  job.progres = 0.7;
  const serie = nasaPowerClient.parseNasaPowerSeries(json);
  const stats = nasaPowerClient.moyenneAnnuellePrecipitation(serie);
  job.progres = 1;
  return {
    donnees: stats,
    meta: { resolutionObtenue: '≈ 50-60 km (grille MERRA-2)', anneesUtilisees: stats.anneesUtilisees },
  };
}

async function executerSoilGrids(job, sommets) {
  const centre = centreApprox(sommets);
  const url = soilGridsClient.buildSoilGridsUrl(centre.lat, centre.lon);
  job.progres = 0.3;
  const json = await fetchJson(url, job, 20000);
  const resultat = soilGridsClient.parseSoilGridsResponse(json);
  job.progres = 1;
  return { donnees: resultat, meta: { resolutionObtenue: '250 m' } };
}

async function executerOpenTopography(job, sommets, parametres) {
  const cle = obtenirCle('opentopography-globaldem');
  if (!cle) {
    throw new ErreurTelechargement('CLE_MANQUANTE',
      "Aucune clé OpenTopography enregistrée — voir l'onglet Données pour en saisir une (§3.3 : inscription gratuite, hors de ce logiciel).");
  }
  const typeMnt = parametres.typeMnt || 'copernicus-30';
  const url = openTopographyClient.buildOpenTopographyUrl(bboxDe(sommets), cle, typeMnt);
  job.progres = 0.2;
  const texte = await fetchText(url, job, 60000);
  job.progres = 0.8;
  const grille = openTopographyClient.parseAsciiGrid(texte);
  job.progres = 1;
  return {
    donnees: {
      ncols: grille.ncols, nrows: grille.nrows, xllcorner: grille.xllcorner,
      yllcorner: grille.yllcorner, cellsize: grille.cellsize, nodata: grille.nodata,
      valeurs: Array.from(grille.valeurs),
    },
    meta: {
      resolutionObtenue: `${openTopographyClient.TYPES_MNT[typeMnt].resolution_m} m`,
      typeMnt,
    },
  };
}

const EXECUTEURS = {
  'elevation-open-meteo': executerElevation,
  'overpass-osm': executerOverpass,
  'nasa-power': executerNasaPower,
  'soilgrids-isric': executerSoilGrids,
  'opentopography-globaldem': executerOpenTopography,
};

/**
 * Démarre un téléchargement (ou renvoie immédiatement le cache si présent
 * — §3.3 : « un terrain retravaillé ne re-télécharge pas »). Renvoie un
 * identifiant de job à sonder via etatTelechargement().
 *
 * @param {string} idSource
 * @param {{lat:number, lon:number}[]} sommets
 * @param {object} [parametres]
 * @returns {string} jobId
 */
export function demarrerTelechargement(idSource, sommets, parametres = {}) {
  obtenirSource(idSource); // lève une erreur claire si idSource est inconnu
  const executeur = EXECUTEURS[idSource];
  if (!executeur) throw new Error(`Aucun exécuteur de téléchargement pour « ${idSource} ».`);
  if (!Array.isArray(sommets) || sommets.length < 3) {
    throw new Error('demarrerTelechargement : un terrain valide (≥ 3 sommets) est requis.');
  }

  const clef = clefCache(idSource, sommets, parametres);
  const jobId = randomUUID();

  const enCache = lireCache(idSource, clef);
  if (enCache) {
    jobs.set(jobId, {
      statut: 'termine', progres: 1, erreur: null, erreurCode: null, annule: false, controleur: null,
      resultat: { ...enCache, depuisCache: true },
    });
    return jobId;
  }

  const job = {
    statut: 'en_cours', progres: 0, erreur: null, erreurCode: null, annule: false,
    controleur: new AbortController(), resultat: null,
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      const { donnees, meta } = await executeur(job, sommets, parametres);
      if (job.annule) return; // annulerTelechargement a déjà positionné le statut
      ecrireCache(idSource, clef, donnees, meta);
      job.resultat = { meta: { ...meta, telechargeLe: new Date().toISOString() }, donnees, depuisCache: false };
      job.statut = 'termine';
      job.progres = 1;
    } catch (e) {
      if (job.annule) { job.statut = 'annule'; return; }
      job.statut = 'erreur';
      job.erreur = e.message;
      job.erreurCode = e.code || null;
    }
  })();

  return jobId;
}

/** État courant d'un job — à sonder périodiquement depuis l'interface. */
export function etatTelechargement(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  return {
    statut: job.statut, progres: job.progres, erreur: job.erreur, erreurCode: job.erreurCode,
    resultat: job.statut === 'termine' ? job.resultat : null,
  };
}

/** Demande l'annulation d'un job en cours. Renvoie false s'il n'existe pas ou est déjà terminé. */
export function annulerTelechargement(jobId) {
  const job = jobs.get(jobId);
  if (!job || job.statut !== 'en_cours') return false;
  job.annule = true;
  job.statut = 'annule';
  job.controleur?.abort();
  return true;
}

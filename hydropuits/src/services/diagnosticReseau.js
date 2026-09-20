/**
 * diagnosticReseau.js — « pourquoi le téléchargement échoue-t-il ? »
 * -----------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE (20/09/2026) : ce logiciel est développé dans
 * un environnement dont TOUT le réseau sortant est bloqué par politique
 * (vérifié : le mandataire répond 403 sur api.open-meteo.com,
 * power.larc.nasa.gov, rest.isric.org…). Les échecs de téléchargement ne
 * peuvent donc être reproduits QUE sur le poste de l'utilisateur. Deux
 * corrections successives ont été faites à partir d'un simple message
 * d'erreur affiché sur une capture d'écran — c'est insuffisant, et c'est
 * ce qui a fait perdre deux allers-retours.
 *
 * Ce module fait donc tourner, DEPUIS LE POSTE DE L'UTILISATEUR, un test
 * minimal contre chaque service, et produit un rapport factuel :
 * joignable ou non, code HTTP, temps de réponse, taille, et les premiers
 * caractères BRUTS de la réponse. C'est ce rapport — et non une
 * interprétation — qui permet de corriger la vraie cause.
 *
 * Le test de chaque cible est VOLONTAIREMENT minuscule (un point, une
 * tuile, un compteur) : il doit répondre en quelques secondes et ne rien
 * consommer d'un quota journalier.
 *
 * ── RÈGLE DE CONFIDENTIALITÉ ──────────────────────────────────────────
 * Le rapport est fait pour être COPIÉ ET ENVOYÉ. Aucune clé d'API ne doit
 * donc y figurer : `censurerCle()` (diagnosticRapport.js) les remplace
 * partout par «***» AVANT que l'URL testée n'entre dans le rapport. Test
 * couvert par tests/unit-diagnostic-reseau.test.js — une fuite de clé
 * serait le seul vrai danger de cette fonctionnalité.
 *
 * CE MODULE N'EST PAS IMPORTABLE CÔTÉ REACT (il lit la clé enregistrée,
 * donc `node:fs` via clesLocales.js). La mise en forme du rapport vit
 * dans diagnosticRapport.js, qui est pur et utilisable des deux côtés.
 * -----------------------------------------------------------------------
 */
import { fetchRobuste } from './reseauRobuste.js';
import { obtenirCle } from './clesLocales.js';
import { OVERPASS_URL_PRINCIPALE, OVERPASS_URL_MIROIR } from './overpassClient.js';
import { buildOpenTopographyUrl } from './openTopographyClient.js';
import { censurerCle, LONGUEUR_EXTRAIT } from './diagnosticRapport.js';

/**
 * Point de test, au Maroc (Marrakech), utilisé pour toutes les cibles qui
 * demandent une coordonnée. ORIGINE : zone d'usage réelle du logiciel —
 * tester au large de l'Atlantique donnerait « pas de donnée » sur des
 * services parfaitement fonctionnels, ce qui serait un faux négatif.
 */
export const LAT_TEST = 31.63;
export const LON_TEST = -8.0;

/**
 * Délai par cible, en millisecondes. ORIGINE : 20 s. Un diagnostic doit
 * rendre son verdict vite ; une cible qui met plus de 20 s à répondre à
 * une requête minuscule EST le problème, et c'est cela qu'il faut
 * rapporter — pas attendre qu'elle finisse par répondre.
 */
export const DELAI_CIBLE_MS = 20000;

/**
 * Construit la liste des cibles à tester. Fonction PURE : elle ne fait
 * aucun appel réseau, elle ne fait que décrire QUOI tester — ce qui la
 * rend vérifiable hors ligne (notamment la censure des clés).
 *
 * @param {string|null} cleOpenTopo clé OpenTopography si l'utilisateur en a saisi une
 */
export function construireCibles(cleOpenTopo = null) {
  const cibles = [
    {
      id: 'elevation-open-meteo',
      libelle: 'Open-Meteo Elevation (MNT ≈ 90 m)',
      url: `https://api.open-meteo.com/v1/elevation?latitude=${LAT_TEST}&longitude=${LON_TEST}`,
      type: 'json',
      essentiel: true,
    },
    {
      id: 'overpass-statut',
      libelle: 'Overpass — état du serveur et quota (overpass-api.de)',
      // /api/status : page texte documentée (wiki OSM), très peu coûteuse,
      // qui indique aussi le quota restant pour NOTRE adresse IP — donc
      // capable de distinguer « serveur injoignable » de « quota épuisé ».
      url: 'https://overpass-api.de/api/status',
      type: 'texte',
      essentiel: true,
    },
    {
      id: 'overpass-requete',
      libelle: 'Overpass — exécution d’une requête (overpass-api.de)',
      // `out count;` renvoie un simple compteur : prouve que l'interpréteur
      // exécute bien une requête, sans transférer la moindre géométrie.
      url: `${OVERPASS_URL_PRINCIPALE}?data=${encodeURIComponent(
        `[out:json][timeout:20];way["waterway"](around:500,${LAT_TEST},${LON_TEST});out count;`,
      )}`,
      type: 'json',
      essentiel: true,
    },
    {
      id: 'overpass-miroir',
      libelle: 'Overpass — miroir de secours (overpass.kumi.systems)',
      url: `${OVERPASS_URL_MIROIR}?data=${encodeURIComponent(
        `[out:json][timeout:20];way["waterway"](around:500,${LAT_TEST},${LON_TEST});out count;`,
      )}`,
      type: 'json',
      essentiel: false,
    },
    {
      id: 'nasa-power',
      libelle: 'NASA POWER (pluviométrie)',
      url: `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=PRECTOTCORR&community=AG&longitude=${LON_TEST}&latitude=${LAT_TEST}&format=JSON`,
      type: 'json',
      essentiel: true,
    },
    {
      id: 'soilgrids-isric',
      libelle: 'SoilGrids / ISRIC (texture du sol)',
      url: `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${LON_TEST}&lat=${LAT_TEST}&property=clay&depth=0-5cm&value=mean`,
      type: 'json',
      essentiel: false,
    },
    {
      id: 'fond-carte-esri',
      libelle: 'Fond de carte satellite (Esri)',
      // Tuile z=6 couvrant le Maroc — teste le fond de carte lui-même,
      // pour distinguer « les données ne se téléchargent pas » de « la
      // carte reste grise », deux pannes très différentes.
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/6/24/31',
      type: 'binaire',
      essentiel: true,
    },
    {
      id: 'fond-carte-labels',
      libelle: 'Fond de carte — calque des noms (CARTO)',
      url: 'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/6/31/24.png',
      type: 'binaire',
      essentiel: false,
    },
  ];

  if (cleOpenTopo) {
    // Emprise minuscule (0,01° ≈ 1 km) : un seul appel, quelques ko, mais
    // qui exerce EXACTEMENT le chemin de code qui a échoué en usage réel
    // (en-tête de grille ASCII).
    cibles.push({
      id: 'opentopography-globaldem',
      libelle: 'OpenTopography GlobalDEM (MNT 30 m, avec votre clé)',
      url: buildOpenTopographyUrl(
        { latMin: LAT_TEST, latMax: LAT_TEST + 0.01, lonMin: LON_TEST, lonMax: LON_TEST + 0.01 },
        cleOpenTopo,
      ),
      type: 'texte',
      essentiel: false,
      cle: cleOpenTopo,
    });
  } else {
    cibles.push({
      id: 'opentopography-globaldem',
      libelle: 'OpenTopography GlobalDEM (MNT 30 m)',
      url: null,
      type: 'texte',
      essentiel: false,
      ignore: 'Aucune clé enregistrée — source non testée (§3.3 : la clé est saisie par vous, jamais par le logiciel).',
    });
  }

  return cibles;
}

/** Teste UNE cible. Ne lève jamais : un échec EST le résultat attendu ici. */
async function testerCible(cible, signalExterne) {
  if (cible.ignore) {
    return { id: cible.id, libelle: cible.libelle, statut: 'ignore', detail: cible.ignore };
  }
  const debut = Date.now();
  try {
    // UNE SEULE tentative : un diagnostic doit montrer ce qui se passe
    // vraiment, pas le résultat après trois essais — c'est le rôle de
    // reseauRobuste en usage normal, pas celui du diagnostic.
    const reponse = await fetchRobuste(cible.url, {
      timeoutMs: DELAI_CIBLE_MS,
      tentatives: 1,
      signalExterne,
    });
    const duree_ms = Date.now() - debut;

    if (cible.type === 'binaire') {
      const buffer = await reponse.arrayBuffer();
      return {
        id: cible.id, libelle: cible.libelle, statut: 'ok',
        codeHttp: reponse.status, duree_ms, octets: buffer.byteLength,
        typeContenu: reponse.headers.get('content-type') || '',
        extrait: `(${buffer.byteLength} octets d’image)`,
      };
    }

    const texte = await reponse.text();
    return {
      id: cible.id, libelle: cible.libelle, statut: 'ok',
      codeHttp: reponse.status, duree_ms, octets: texte.length,
      typeContenu: reponse.headers.get('content-type') || '',
      extrait: censurerCle(texte.slice(0, LONGUEUR_EXTRAIT), cible.cle),
    };
  } catch (e) {
    return {
      id: cible.id, libelle: cible.libelle, statut: 'echec',
      codeHttp: e.statut ?? null,
      duree_ms: Date.now() - debut,
      erreur: censurerCle(e.message, cible.cle),
      extrait: censurerCle(e.extraitCorps || '', cible.cle),
    };
  }
}

/**
 * Exécute le diagnostic complet. Les cibles sont testées EN PARALLÈLE :
 * elles visent des serveurs différents, aucune ne gêne l'autre, et le
 * diagnostic complet tient ainsi dans le temps de la plus lente.
 */
export async function executerDiagnostic({ signalExterne } = {}) {
  const cleOpenTopo = obtenirCle('opentopography-globaldem');
  const cibles = construireCibles(cleOpenTopo);
  const resultats = await Promise.all(cibles.map((c) => testerCible(c, signalExterne)));

  const testees = resultats.filter((r) => r.statut !== 'ignore');
  const reussies = testees.filter((r) => r.statut === 'ok');
  const echecsEssentiels = resultats.filter(
    (r) => r.statut === 'echec' && cibles.find((c) => c.id === r.id)?.essentiel,
  );

  return {
    dateIso: new Date().toISOString(),
    resultats,
    resume: {
      nbTestees: testees.length,
      nbReussies: reussies.length,
      nbEchecsEssentiels: echecsEssentiels.length,
      // Aucune cible joignable du tout : le problème est le poste ou sa
      // connexion (pare-feu, proxy d'entreprise, coupure), pas les
      // services — le dire évite de chercher au mauvais endroit.
      toutBloque: testees.length > 0 && reussies.length === 0,
    },
  };
}


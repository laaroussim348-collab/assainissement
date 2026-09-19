/**
 * cacheDonnees.js
 * -----------------------------------------------------------------------
 * Cache disque des couches téléchargées, par terrain.
 *
 * POURQUOI : §3.3 impose que « chaque téléchargement doit être mis en
 * cache sur disque (un terrain retravaillé ne re-télécharge pas) […] et
 * re-jouable hors ligne à partir du cache ». Sans ce module, rouvrir un
 * projet redéclencherait des appels réseau vers des services tiers à
 * chaque fois — coûteux en temps, inutile puisque le MNT et le réseau
 * hydrographique ne changent pas d'une session à l'autre, et gênant sur
 * un poste qui travaille souvent hors ligne (le cas d'usage assumé par
 * tout ce logiciel, cahier des charges §0).
 *
 * CLEF DE CACHE : dérivée du CONTOUR du terrain (sommets arrondis à
 * ARRONDI_DECIMALES près, ~11 cm à l'équateur — largement sous le bruit
 * de saisie d'un utilisateur, donc deux tracés « identiques en pratique »
 * partagent le même cache) et des paramètres qui changent le résultat
 * téléchargé (résolution demandée, rayon de recherche, type de MNT…).
 * Changer le NOM du terrain ou tout autre champ du projet qui n'affecte
 * pas la géométrie ne déclenche donc PAS un nouveau téléchargement.
 *
 * EMPLACEMENT : sous HYDROPUITS_DATA_DIR (même racine que
 * .activation-local.json et .cles-sources-donnees.json), dans un
 * sous-dossier .cache-donnees/ — jamais dans le dossier d'installation
 * du logiciel (non accessible en écriture une fois installé, voir
 * activationClient.js).
 * -----------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE_LECTURE = path.join(__dirname, '..', '..');
const RACINE_ECRITURE = process.env.HYDROPUITS_DATA_DIR || RACINE_LECTURE;
const DOSSIER_CACHE = path.join(RACINE_ECRITURE, '.cache-donnees');

// Arrondi des sommets avant hachage — voir « CLEF DE CACHE » ci-dessus.
// 1e-6 degré ≈ 11 cm à l'équateur (cf. calculations/geodesie.js pour la
// mesure exacte) : très en dessous de la précision de saisie manuelle
// (§3.2 : « au millionième de degré ») ou du tracé à la souris.
const ARRONDI_DECIMALES = 6;

/**
 * Calcule la clef de cache d'un téléchargement — PURE, aucun accès
 * disque. Séparée de l'écriture/lecture pour rester testable sans fs.
 *
 * @param {string} idSource
 * @param {{lat:number, lon:number}[]} sommets  contour du terrain
 * @param {object} [parametres]  tout paramètre qui change le résultat
 *   (résolution, rayon de recherche, type de MNT…) — PAS le nom du
 *   terrain ni d'autres champs sans effet sur la donnée téléchargée.
 */
export function clefCache(idSource, sommets, parametres = {}) {
  if (!idSource) throw new Error('clefCache : identifiant de source manquant.');
  if (!Array.isArray(sommets) || sommets.length === 0) throw new Error('clefCache : contour vide.');
  const contourStable = sommets
    .map((s) => `${s.lat.toFixed(ARRONDI_DECIMALES)},${s.lon.toFixed(ARRONDI_DECIMALES)}`)
    .join(';');
  // Tri des clés du paramètre pour que {a:1,b:2} et {b:2,a:1} donnent la
  // même clef (l'ordre d'insertion d'un objet JS n'est pas garanti être
  // le même selon l'appelant).
  const parametresStable = JSON.stringify(parametres, Object.keys(parametres).sort());
  const brut = `${idSource}|${contourStable}|${parametresStable}`;
  return crypto.createHash('sha256').update(brut).digest('hex').slice(0, 24);
}

function cheminEntree(idSource, clef) {
  return path.join(DOSSIER_CACHE, idSource, `${clef}.json`);
}

/**
 * Lit une entrée de cache. Renvoie `null` si absente — ce n'est PAS une
 * erreur (cache froid, premier téléchargement de ce terrain).
 */
export function lireCache(idSource, clef) {
  try {
    const brut = fs.readFileSync(cheminEntree(idSource, clef), 'utf8');
    return JSON.parse(brut);
  } catch {
    return null;
  }
}

/**
 * Écrit une entrée de cache. `donnees` doit être sérialisable en JSON —
 * pour le MNT OpenTopography (grille dense), on stocke `{ncols, nrows,
 * xllcorner, yllcorner, cellsize, nodata, valeurs: [...]}` (tableau
 * ordinaire, pas le Float64Array renvoyé par parseAsciiGrid — JSON ne
 * sait pas sérialiser les tableaux typés directement).
 *
 * @param {object} meta  { resolutionObtenue, date, sourceUrl, ... } —
 *   affiché tel quel dans l'onglet Données (§6 : « résolution obtenue »).
 */
export function ecrireCache(idSource, clef, donnees, meta) {
  const chemin = cheminEntree(idSource, clef);
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  const enveloppe = { meta: { ...meta, telechargeLe: new Date().toISOString() }, donnees };
  // Écriture par fichier temporaire + renommage atomique : une coupure de
  // courant ou une fermeture brutale d'Electron pendant l'écriture ne
  // laisse jamais une entrée de cache à moitié écrite (qui échouerait au
  // JSON.parse suivant, silencieusement prise pour « cache froid » —
  // sans ce soin, un téléchargement interrompu au pire moment corromprait
  // le cache au lieu de simplement ne pas aboutir).
  const tmp = `${chemin}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(enveloppe), 'utf8');
  fs.renameSync(tmp, chemin);
}

export function supprimerCache(idSource, clef) {
  try { fs.unlinkSync(cheminEntree(idSource, clef)); } catch { /* déjà absent : rien à faire */ }
}

/** Liste des sources ayant au moins une entrée en cache, avec leur nombre d'entrées. */
export function etatGlobalCache() {
  try {
    const dossiers = fs.readdirSync(DOSSIER_CACHE, { withFileTypes: true }).filter((d) => d.isDirectory());
    const resultat = {};
    for (const d of dossiers) {
      const fichiers = fs.readdirSync(path.join(DOSSIER_CACHE, d.name)).filter((f) => f.endsWith('.json'));
      resultat[d.name] = fichiers.length;
    }
    return resultat;
  } catch {
    return {};
  }
}

/**
 * openTopographyClient.js
 * -----------------------------------------------------------------------
 * Construction des requêtes vers l'API GlobalDEM d'OpenTopography et
 * analyse de ses réponses — MNT haute résolution (Copernicus GLO-30,
 * SRTM 30 m, ALOS World 3D), alternative à Open-Meteo Elevation quand une
 * meilleure résolution que 90 m est souhaitée (§3.3, source « avec clé »).
 *
 * Source vérifiée le 19/09/2026 :
 *  - https://portal.opentopography.org/apidocs/ (endpoint
 *    /API/globaldem, paramètres demtype/south/north/west/east/
 *    outputFormat/API_Key)
 *  - https://opentopography.org/blog/introducing-api-keys-access-
 *    opentopography-global-datasets (clé personnelle gratuite, inscription
 *    immédiate sans validation manuelle, via portal.opentopography.org/
 *    myopentopo)
 *  - Quota vérifié : 250 appels/24h (compte académique) ou 50 appels/24h
 *    (compte non académique) — largement suffisant : ce logiciel fait UN
 *    appel par terrain téléchargé (voir cacheDonnees.js).
 *
 * FORMAT DE SORTIE : `outputFormat=AAIGrid` (Arc/Info ASCII Grid, .asc),
 * PAS `GTiff`. Choix délibéré : GTiff est un format binaire dont la
 * lecture correcte (compression, tuilage, en-têtes GeoTIFF) demanderait
 * soit une bibliothèque externe (interdite par le cahier des charges §1,
 * §8 — dépendances runtime limitées à 6 paquets, aucun lecteur GeoTIFF
 * parmi eux), soit un parseur binaire maison risqué à faire sans erreur.
 * AAIGrid est un format TEXTE simple et entièrement documenté (6 lignes
 * d'en-tête puis une grille de nombres séparés par des espaces) : il se
 * décode en quelques lignes, sans risque d'erreur de décompression
 * silencieuse sur un fichier corrompu.
 *
 * SÉPARATION PUR / RÉSEAU : buildOpenTopographyUrl() et
 * parseAsciiGrid() sont pures. L'appel fetch (fait côté serveur, avec la
 * clé de l'utilisateur) ne l'est pas.
 * -----------------------------------------------------------------------
 */

const BASE_URL = 'https://portal.opentopography.org/API/globaldem';

/** Types de MNT proposés — identifiants EXACTS attendus par l'API. */
export const TYPES_MNT = {
  'copernicus-30': { demtype: 'COP30', resolution_m: 30, libelleCle: 'otMntCopernicus30' },
  'srtm-30': { demtype: 'SRTMGL1', resolution_m: 30, libelleCle: 'otMntSrtm30' },
  'alos-30': { demtype: 'AW3D30', resolution_m: 30, libelleCle: 'otMntAlos30' },
};

/**
 * @param {{latMin:number, latMax:number, lonMin:number, lonMax:number}} bbox
 * @param {string} cle           clé API personnelle de l'utilisateur (§3.3 — jamais fournie par le logiciel)
 * @param {keyof TYPES_MNT} [typeMnt]
 */
export function buildOpenTopographyUrl(bbox, cle, typeMnt = 'copernicus-30') {
  const type = TYPES_MNT[typeMnt];
  if (!type) throw new Error(`buildOpenTopographyUrl : type de MNT inconnu « ${typeMnt} ».`);
  if (!cle || typeof cle !== 'string' || cle.trim() === '') {
    throw new Error('buildOpenTopographyUrl : une clé API OpenTopography est requise (voir §3.3 — clé fournie par l’utilisateur, jamais par le logiciel).');
  }
  const { latMin, latMax, lonMin, lonMax } = bbox;
  if (![latMin, latMax, lonMin, lonMax].every(Number.isFinite) || latMin >= latMax || lonMin >= lonMax) {
    throw new Error('buildOpenTopographyUrl : emprise géographique invalide.');
  }
  const params = new URLSearchParams({
    demtype: type.demtype,
    south: String(latMin),
    north: String(latMax),
    west: String(lonMin),
    east: String(lonMax),
    outputFormat: 'AAIGrid',
    API_Key: cle,
  });
  return `${BASE_URL}?${params.toString()}`;
}

/**
 * Analyse un fichier Arc/Info ASCII Grid (.asc).
 *
 * Format (documenté par Esri, repris tel quel par OpenTopography) :
 *   ncols        <entier>
 *   nrows        <entier>
 *   xllcorner    <réel>     coin bas-gauche, coordonnée X (longitude)
 *   yllcorner    <réel>     coin bas-gauche, coordonnée Y (latitude)
 *   cellsize     <réel>     taille de cellule, en degrés (le MNT est en WGS84)
 *   NODATA_value <réel>     valeur signalant une absence de donnée
 *   <nrows lignes de ncols nombres séparés par des espaces, du NORD vers le SUD>
 *
 * @returns {{
 *   ncols:number, nrows:number, xllcorner:number, yllcorner:number,
 *   cellsize:number, nodata:number, valeurs: Float64Array,
 *   valeur: (lig:number, col:number) => number,
 * }}
 */
export function parseAsciiGrid(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') {
    throw new Error('parseAsciiGrid : contenu vide ou invalide.');
  }
  // OpenTopography renvoie parfois un message d'erreur JSON (clé invalide,
  // quota dépassé) à la place du fichier .asc attendu — détecté ici pour
  // donner un message clair plutôt qu'un échec de parsing sans rapport.
  const debut = texte.trimStart().slice(0, 1);
  if (debut === '{' || debut === '[') {
    let detail = texte.trim();
    try { detail = JSON.parse(texte).error || detail; } catch { /* pas du JSON exploitable : on garde le texte brut */ }
    throw new Error(`OpenTopography a renvoyé une erreur au lieu d'un MNT : ${detail}`);
  }

  const lignes = texte.split(/\r\n|\r|\n/);
  const entete = {};
  let ligneDepart = 0;
  const CLES_ENTETE = ['ncols', 'nrows', 'xllcorner', 'yllcorner', 'cellsize', 'nodata_value'];
  for (let i = 0; i < lignes.length; i++) {
    const parts = lignes[i].trim().split(/\s+/);
    if (parts.length !== 2 || !CLES_ENTETE.includes(parts[0].toLowerCase())) { ligneDepart = i; break; }
    entete[parts[0].toLowerCase()] = Number(parts[1]);
  }
  for (const cle of CLES_ENTETE) {
    if (!Number.isFinite(entete[cle])) {
      throw new Error(`parseAsciiGrid : en-tête ASCII Grid incomplet — '${cle}' manquant ou non numérique.`);
    }
  }

  const { ncols, nrows, xllcorner, yllcorner, cellsize } = entete;
  const nodata = entete.nodata_value;
  const valeurs = new Float64Array(ncols * nrows);
  let idx = 0;
  for (let i = ligneDepart; i < lignes.length && idx < valeurs.length; i++) {
    const l = lignes[i].trim();
    if (l === '') continue;
    for (const tok of l.split(/\s+/)) {
      if (idx >= valeurs.length) break;
      valeurs[idx++] = Number(tok);
    }
  }
  if (idx !== valeurs.length) {
    throw new Error(`parseAsciiGrid : ${valeurs.length} valeurs attendues (${nrows}×${ncols}), ${idx} lues — fichier tronqué.`);
  }

  return {
    ncols, nrows, xllcorner, yllcorner, cellsize, nodata, valeurs,
    // (0,0) = coin NORD-OUEST (convention AAIGrid : les lignes vont du
    // nord vers le sud), lig croît vers le sud, col croît vers l'est.
    valeur(lig, col) {
      if (lig < 0 || lig >= nrows || col < 0 || col >= ncols) {
        throw new Error(`parseAsciiGrid.valeur : indice hors grille (lig=${lig}, col=${col}, grille ${nrows}×${ncols}).`);
      }
      return valeurs[lig * ncols + col];
    },
  };
}

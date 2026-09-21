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

/**
 * Valeur d'absence de donnée supposée quand l'en-tête n'en déclare
 * AUCUNE. ORIGINE : convention Esri du format ASCII Grid, qui donne
 * -9999 comme valeur par défaut de NODATA_value. Jamais substituée en
 * silence : `parseAsciiGrid` renvoie `nodataDeclare: false` et
 * l'interface l'affiche (§5).
 */
export const NODATA_DEFAUT_ESRI = -9999;

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
 * ⚠️ VARIANTE RÉELLE ACCEPTÉE : la spécification Esri du format autorise
 * `XLLCENTER`/`YLLCENTER` (coordonnée du CENTRE de la cellule en bas à
 * gauche) comme alternative à `XLLCORNER`/`YLLCORNER` (coordonnée du
 * COIN) — les deux formes sont documentées et effectivement produites
 * par différents générateurs de fichiers .asc (dont GDAL, selon la
 * source). Un échec réel de ce parseur (20/09/2026 : « en-tête ASCII
 * Grid incomplet — nodata_value manquant ») a montré que la boucle de
 * lecture de l'en-tête, qui ne reconnaissait QUE *corner, abandonnait
 * dès la 3ᵉ ligne face à `xllcenter` — les lignes cellsize/NODATA_value,
 * pourtant présentes, n'étaient donc jamais lues. Les deux formes sont
 * désormais acceptées ; `*center` est convertie en coin par
 * `- cellsize/2` (relation exacte entre les deux conventions).
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
  let ligneDepart = lignes.length;
  // xllcorner/yllcorner ET xllcenter/yllcenter reconnues à la lecture —
  // voir la réserve « VARIANTE RÉELLE ACCEPTÉE » ci-dessus. Les lignes
  // vides sont ignorées et l'ordre des champs n'est PAS supposé fixe
  // (seul le premier des 6 à 8 champs de tête EST garanti être une
  // ligne « clé valeur » — imposer un ordre ou une contiguïté stricte
  // romprait sur un en-tête par ailleurs valide mais légèrement
  // réagencé) : le corps de la grille commence à la première ligne qui
  // n'est PAS une entrée d'en-tête reconnue, jamais avant.
  const CLES_ENTETE = ['ncols', 'nrows', 'xllcorner', 'yllcorner', 'xllcenter', 'yllcenter', 'cellsize', 'nodata_value'];
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i].trim();
    if (ligne === '') continue;
    const parts = ligne.split(/\s+/);
    if (parts.length === 2 && CLES_ENTETE.includes(parts[0].toLowerCase()) && Number.isFinite(Number(parts[1]))) {
      entete[parts[0].toLowerCase()] = Number(parts[1]);
      continue;
    }
    ligneDepart = i;
    break;
  }
  // NODATA_value est FACULTATIF — corrigé le 20/09/2026 sur PREUVE, pas
  // sur hypothèse : le diagnostic réseau intégré, exécuté depuis le poste
  // d'un utilisateur réel, a capturé la réponse brute d'OpenTopography
  // pour une emprise au Maroc. Son en-tête compte 5 lignes et s'arrête à
  // `cellsize`, les altitudes commençant immédiatement après :
  //
  //     ncols        36
  //     nrows        36
  //     xllcorner    -8.000138900000
  //     yllcorner    31.630138900000
  //     cellsize     0.000277777778
  //     453.78460693359375 454.75750732421875 ...
  //
  // C'est conforme : la spécification Esri décrit NODATA_value comme
  // optionnel (valeur par défaut -9999), et un générateur l'omet
  // légitimement quand aucune cellule n'est vide — ce qui est le cas
  // d'un MNT Copernicus en plein continent. L'exiger était donc bien LA
  // cause de l'échec « nodata_value manquant » signalé par
  // l'utilisateur, et non la variante *center corrigée plus haut (qui
  // reste utile, mais ne concernait pas ce fichier : il utilise bien
  // xllcorner).
  const CLES_REQUISES = ['ncols', 'nrows', 'cellsize'];
  for (const cle of CLES_REQUISES) {
    if (!Number.isFinite(entete[cle])) {
      throw new Error(`parseAsciiGrid : en-tête ASCII Grid incomplet — '${cle}' manquant ou non numérique.`);
    }
  }
  // Absence DÉCLARÉE, pas devinée : `nodataDeclare` remonte jusqu'à
  // l'interface (§5 — une valeur par défaut n'est jamais substituée en
  // silence, elle est dite).
  const nodataDeclare = Number.isFinite(entete.nodata_value);
  if (!Number.isFinite(entete.xllcorner) && !Number.isFinite(entete.xllcenter)) {
    throw new Error("parseAsciiGrid : en-tête ASCII Grid incomplet — 'xllcorner'/'xllcenter' manquant ou non numérique.");
  }
  if (!Number.isFinite(entete.yllcorner) && !Number.isFinite(entete.yllcenter)) {
    throw new Error("parseAsciiGrid : en-tête ASCII Grid incomplet — 'yllcorner'/'yllcenter' manquant ou non numérique.");
  }

  const { ncols, nrows, cellsize } = entete;
  const xllcorner = Number.isFinite(entete.xllcorner) ? entete.xllcorner : entete.xllcenter - cellsize / 2;
  const yllcorner = Number.isFinite(entete.yllcorner) ? entete.yllcorner : entete.yllcenter - cellsize / 2;
  // Convention Esri en l'absence de NODATA_value : -9999. Sans danger
  // pour un MNT terrestre — aucune altitude réelle n'approche cette
  // valeur (le point émergé le plus bas du globe, la rive de la mer
  // Morte, est à environ -430 m).
  const nodata = nodataDeclare ? entete.nodata_value : NODATA_DEFAUT_ESRI;
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
    ncols, nrows, xllcorner, yllcorner, cellsize, nodata, nodataDeclare, valeurs,
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

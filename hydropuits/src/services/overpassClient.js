/**
 * overpassClient.js
 * -----------------------------------------------------------------------
 * Construction des requêtes Overpass QL vers l'API Overpass
 * (OpenStreetMap) et analyse de leurs réponses JSON — cours d'eau,
 * sources, puits existants et failles cartographiées, dans un rayon
 * autour d'un terrain.
 *
 * Sources vérifiées le 19/09/2026 :
 *  - https://wiki.openstreetmap.org/wiki/Overpass_API (API en lecture
 *    seule, sans clé ; point d'entrée principal overpass-api.de/api/
 *    interpreter, miroir overpass.kumi.systems/api/interpreter ; quota
 *    par IP consultable sur /api/status ; licence des données
 *    OpenStreetMap : Open Database License (ODbL), attribution requise)
 *  - https://wiki.openstreetmap.org/wiki/Tag:geological=fault (tag
 *    `geological=fault` — le tag `natural=fault`, plus ancien, est
 *    DÉPRÉCIÉ ; peu de failles sont effectivement cartographiées dans
 *    OSM, d'où l'avertissement renvoyé par analyserReponseOverpass()
 *    quand aucune n'est trouvée : absence de faute plutôt qu'absence de
 *    faille réelle)
 *
 * SÉPARATION PUR / RÉSEAU : construireRequeteFacteursHydro() et
 * analyserReponseOverpass() sont pures. Seul l'appel fetch (fait côté
 * serveur, voir server.mjs) ne l'est pas.
 * -----------------------------------------------------------------------
 */

export const OVERPASS_URL_PRINCIPALE = 'https://overpass-api.de/api/interpreter';
// Miroir : basculé automatiquement par server.mjs si l'instance
// principale répond mal (surcharge, panne) — voir cacheDonnees.js.
export const OVERPASS_URL_MIROIR = 'https://overpass.kumi.systems/api/interpreter';

// Délai d'exécution demandé au serveur Overpass, en secondes. ORIGINE :
// porté de 60 à 90s après un échec réel constaté en usage (19/09/2026 -
// 20/09/2026) : les instances publiques (overpass-api.de ET son miroir
// overpass.kumi.systems) peuvent mettre plus de 60s à répondre en
// période de charge, même pour une requête bornée à un petit rayon —
// l'API documente un défaut serveur de 180s pour les requêtes non
// bornées ; 90s reste une fraction de cette marge tout en couvrant les
// lenteurs observées sans laisser l'utilisateur attendre indéfiniment.
export const DELAI_TIMEOUT_S = 90;

/**
 * Rayon de recherche autour du terrain, en mètres.
 *
 * ORIGINE : choix par défaut, ajustable par l'utilisateur (affiché dans
 * l'onglet Critères aux côtés du rayon de densité, §3.4 — « rayon de
 * recherche paramétrable et affiché »). 2 km capture le réseau
 * hydrographique et les puits voisins pertinents pour la favorabilité
 * d'un terrain de quelques hectares, sans ramener des données d'une
 * région entière.
 */
export const RAYON_RECHERCHE_M_DEFAUT = 2000;

/**
 * Construit la requête Overpass QL qui ramène, dans un rayon donné autour
 * d'un point, les cours d'eau, sources, puits et failles cartographiées.
 *
 * Une seule requête regroupée (bloc `(...)`) plutôt que 4 requêtes
 * séparées : Overpass facture le temps serveur par requête HTTP, et
 * grouper réduit d'autant le nombre d'allers-retours et le risque
 * d'être compté comme un usage abusif par l'API.
 *
 * @param {number} lat  latitude du centre de recherche (centroïde du terrain)
 * @param {number} lon
 * @param {number} [rayon_m]
 */
export function construireRequeteFacteursHydro(lat, lon, rayon_m = RAYON_RECHERCHE_M_DEFAUT) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error(`construireRequeteFacteursHydro : coordonnées de centre invalides (${lat}, ${lon}).`);
  }
  if (!(rayon_m > 0)) throw new Error('construireRequeteFacteursHydro : le rayon doit être positif.');
  const autour = `(around:${rayon_m},${lat},${lon})`;
  return `[out:json][timeout:${DELAI_TIMEOUT_S}];
(
  way["waterway"]${autour};
  node["natural"="spring"]${autour};
  node["man_made"="water_well"]${autour};
  way["geological"="fault"]${autour};
  node["geological"="fault"]${autour};
);
out body;
>;
out skel qt;`;
}

/** Renvoie l'URL complète (GET) pour une requête Overpass QL donnée. */
export function buildOverpassUrl(requeteQL, urlBase = OVERPASS_URL_PRINCIPALE) {
  return `${urlBase}?data=${encodeURIComponent(requeteQL)}`;
}

/**
 * Analyse la réponse JSON d'Overpass (format `out:json` — éléments
 * `node`/`way` avec leurs `tags`, les `way` référençant des `nodes` par
 * id résolus séparément via `out skel qt` dans le même appel).
 *
 * Renvoie des géométries déjà résolues en [lat, lon], classées par type
 * de facteur — pas les objets OSM bruts, dont la structure (nœuds
 * référencés par id, tags libres) n'intéresse aucun autre module.
 *
 * @returns {{
 *   coursEau: {lat:number, lon:number}[][],
 *   sources: {lat:number, lon:number}[],
 *   puitsExistants: {lat:number, lon:number}[],
 *   failles: {lat:number, lon:number}[][],
 *   avertissements: {cle:string}[],
 * }}
 */
export function analyserReponseOverpass(json) {
  const elements = json?.elements;
  if (!Array.isArray(elements)) {
    throw new Error("Réponse Overpass inattendue : le champ 'elements' est absent ou invalide.");
  }

  const noeuds = new Map();
  for (const el of elements) {
    if (el.type === 'node') noeuds.set(el.id, { lat: el.lat, lon: el.lon });
  }

  const coursEau = [];
  const sources = [];
  const puitsExistants = [];
  const failles = [];

  function ligneDepuisWay(way) {
    if (!Array.isArray(way.nodes)) return null;
    const pts = way.nodes.map((id) => noeuds.get(id)).filter(Boolean);
    return pts.length >= 2 ? pts : null;
  }

  for (const el of elements) {
    const tags = el.tags || {};
    if (el.type === 'way' && tags.waterway) {
      const ligne = ligneDepuisWay(el);
      if (ligne) coursEau.push(ligne);
    } else if (el.type === 'node' && tags.natural === 'spring') {
      if (Number.isFinite(el.lat) && Number.isFinite(el.lon)) sources.push({ lat: el.lat, lon: el.lon });
    } else if (el.type === 'node' && tags.man_made === 'water_well') {
      if (Number.isFinite(el.lat) && Number.isFinite(el.lon)) puitsExistants.push({ lat: el.lat, lon: el.lon });
    } else if (tags.geological === 'fault') {
      if (el.type === 'way') {
        const ligne = ligneDepuisWay(el);
        if (ligne) failles.push(ligne);
      } else if (el.type === 'node' && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
        failles.push([{ lat: el.lat, lon: el.lon }]);
      }
    }
  }

  const avertissements = [];
  // L'absence de faille cartographiée n'est PAS une absence de faille
  // réelle : la couverture de ce tag dans OSM est très inégale (§5 —
  // dire explicitement qu'une couche manque, plutôt que laisser croire à
  // un socle homogène).
  if (failles.length === 0) avertissements.push({ cle: 'srcAvtAucuneFailleOsm' });
  if (coursEau.length === 0) avertissements.push({ cle: 'srcAvtAucunCoursEauOsm' });

  return { coursEau, sources, puitsExistants, failles, avertissements };
}

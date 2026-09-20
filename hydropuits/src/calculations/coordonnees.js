// ============================================================
//  coordonnees.js — Conversion entre WGS84 et les systèmes de
//  coordonnées utilisés au Maroc (Lambert Merchich, UTM).
//  ─────────────────────────────────────────────────────────────
//  POURQUOI CE FICHIER EXISTE MAINTENANT : le cahier des charges (§2.2)
//  demandait de réutiliser tel quel le `coordonnees.js` de HydroCrue.
//  Ce fichier a été demandé à l'utilisateur aux étapes 1, 3, 4 et 5,
//  jamais fourni — voir README.md, « Limites connues » §1. Un
//  utilisateur réel (20/09/2026) a signalé que « les coordonnées
//  Lambert et UTM ne fonctionnent pas », bloquant l'usage du logiciel
//  au Maroc. Plutôt que d'attendre indéfiniment un fichier qui n'arrive
//  pas, ce module implémente la conversion à partir de PARAMÈTRES
//  VÉRIFIÉS (§8 : jamais un nombre inventé) — voir chaque constante
//  ci-dessous pour sa source et sa date de vérification.
//
//  MÉTHODE, EN 3 ÉTAPES INDÉPENDANTES (chacune un problème géodésique
//  classique, documenté séparément) :
//   1. Géodésique (lat,lon,h) ↔ géocentrique cartésien (X,Y,Z), pour un
//      ellipsoïde donné — formule fermée standard (ex. Snyder, 1987 ;
//      NIMA TR8350.2).
//   2. Changement de datum Merchich ↔ WGS84 : translation géocentrique
//      à 3 paramètres (EPSG:1166), PAS une simple translation lat/lon —
//      les ellipsoïdes diffèrent (Clarke 1880 IGN vs WGS84), une
//      translation directe en degrés serait une approximation grossière
//      et fausse de plusieurs centaines de mètres.
//   3. Projection : Lambert conforme conique à 1 parallèle (EPSG 9801,
//      cas des 4 zones Lambert Maroc — toutes tangentes, lat_1=lat_0) ou
//      Mercator transverse (UTM, EPSG 9807), formules fermées de Snyder
//      (1987), *Map Projections — A Working Manual*, USGS Professional
//      Paper 1395, §8 (Lambert) et §7 (Mercator transverse).
//
//  PARAMÈTRES DES 4 ZONES LAMBERT MAROC — vérifiés le 20/09/2026,
//  recoupés sur au moins 3 sources indépendantes du registre EPSG
//  (OSGeo/PROJ-CRS-Explorer, JuliaEarth/CoordRefSystems.jl,
//  Omar-Elrefaei/plain-epsg-files — miroirs du registre officiel
//  epsg.org, lui-même injoignable depuis cet environnement de
//  développement) ainsi qu'un support de cours de géodésie universitaire
//  marocain (Université Cadi Ayyad). ⚠️ Un site tiers non officiel
//  (sig-maroc.com) donne des paramètres ERRONÉS pour la zone Sud (le nom
//  « Centre » n'existe pas dans le registre EPSG) et INTERVERTIT les
//  zones Sahara Nord/Sud — délibérément écarté comme source.
//
//  ⚠️ PRÉCISION DU CHANGEMENT DE DATUM : la transformation Merchich→WGS84
//  publiée par l'EPSG (EPSG:1166) est une translation à 3 paramètres
//  SEULE, précision annoncée ±7 m. Ce n'est PAS un calage géodésique de
//  précision centimétrique — une vraie campagne GPS différentielle
//  resterait nécessaire pour un usage cadastral de haute précision. À
//  l'échelle de ce logiciel (grille de calcul ≈ 90 m), ±7 m est très en
//  dessous de la résolution utile et n'affecte pas la favorabilité.
//
//  CE MODULE EST PUR : aucun accès réseau ni disque.
//  Couvert par tests/unit-coordonnees.test.js.
// ============================================================

// ── Ellipsoïdes ──────────────────────────────────────────────
/** WGS84 — mêmes valeurs que calculations/geodesie.js (NGA.STND.0036). */
export const WGS84 = { a: 6378137.0, invF: 298.257223563 };

/**
 * Clarke 1880 (IGN) — ellipsoïde du datum Merchich, utilisé par les 4
 * zones Lambert Maroc. Vérifié le 20/09/2026 (registre EPSG, ellipsoïde
 * EPSG:7011, datum EPSG:6261) : a = 6 378 249,2 m,
 * 1/f = 293,466021293627 — valeurs recoupées sur 3 sources indépendantes
 * (voir en-tête de fichier).
 */
export const CLARKE_1880_IGN = { a: 6378249.2, invF: 293.466021293627 };

/**
 * Translation géocentrique Merchich → WGS84 (mètres), EPSG:1166
 * « Merchich to WGS 84 (1) ». Vérifiée le 20/09/2026. Précision annoncée
 * par l'EPSG : ±7 m (voir réserve en en-tête de fichier). Aucune
 * rotation ni mise à l'échelle publiée par l'EPSG pour ce couple de
 * datums — translation à 3 paramètres seulement.
 */
const MERCHICH_VERS_WGS84_DXYZ = { dX: 31, dY: 146, dZ: 47 };

/**
 * Les 4 zones Lambert Maroc, toutes sur le datum Merchich (ellipsoïde
 * Clarke 1880 IGN). Vérifiées le 20/09/2026 (voir en-tête de fichier) —
 * lat0/lon0 en degrés décimaux (convertis depuis les grades des
 * définitions historiques : 1 grade = 0,9°, ex. 37 grades = 33,3°).
 * Chacune est le cas EPSG « Lambert conforme conique à 1 parallèle »
 * (méthode 9801) : lat_1 = lat_0 (cône tangent à l'origine).
 */
export const ZONES_LAMBERT = {
  'merchich-nord': { // EPSG:26191 — Lambert Nord Maroc
    lat0_deg: 33.3, lon0_deg: -5.4, k0: 0.999625769, x0: 500000, y0: 300000,
  },
  'merchich-sud': { // EPSG:26192 — Lambert Sud Maroc
    lat0_deg: 29.7, lon0_deg: -5.4, k0: 0.999615596, x0: 500000, y0: 300000,
  },
  'merchich-sahara-nord': { // EPSG:26194 — Lambert Sahara Nord
    lat0_deg: 26.1, lon0_deg: -5.4, k0: 0.999616304, x0: 1200000, y0: 400000,
  },
  'merchich-sahara-sud': { // EPSG:26195 — Lambert Sahara Sud
    lat0_deg: 22.5, lon0_deg: -5.4, k0: 0.999616437, x0: 1500000, y0: 400000,
  },
};

/**
 * Fuseaux UTM couvrant le Maroc et le Sahara occidental — vérifié le
 * 20/09/2026 (emprises EPSG 32628-32631) : fuseaux 28N à 31N. Longitude
 * centrale = fuseau×6 − 183 (définition standard UTM, largeur 6° par
 * fuseau). Ellipsoïde WGS84, k0=0,9996, FE=500000 m, FN=0 (hémisphère
 * nord) — paramètres UTM universels, pas spécifiques au Maroc.
 */
export const FUSEAUX_UTM_MAROC = [28, 29, 30, 31];
const UTM_K0 = 0.9996;
const UTM_FE = 500000;

// ── Ellipsoïde ↔ géocentrique cartésien (X,Y,Z) ─────────────────
// Formule fermée standard (ex. Snyder 1987, ou NIMA TR8350.2 §2.3) —
// vérifiable indépendamment sur n'importe quel manuel de géodésie,
// aucune table de coefficients à recopier. EXPORTÉES (avec les autres
// briques ci-dessous) pour rester testables indépendamment, comme
// calculerPente/calculerCourbure dans derivesMnt.js.
export function versGeocentrique(lat_deg, lon_deg, h, { a, invF }) {
  const f = 1 / invF;
  const e2 = f * (2 - f);
  const lat = lat_deg * Math.PI / 180;
  const lon = lon_deg * Math.PI / 180;
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  return {
    X: (N + h) * cosLat * Math.cos(lon),
    Y: (N + h) * cosLat * Math.sin(lon),
    Z: (N * (1 - e2) + h) * sinLat,
  };
}

/**
 * Inverse de versGeocentrique(), par itération à point fixe (Bowring) —
 * converge en 3-4 itérations pour toute altitude terrestre plausible ;
 * 12 itérations est une marge large, jamais atteinte en pratique, sans
 * coût perceptible (formule fermée non nécessaire ici).
 */
export function depuisGeocentrique(X, Y, Z, { a, invF }) {
  const f = 1 / invF;
  const e2 = f * (2 - f);
  const lon = Math.atan2(Y, X);
  const p = Math.hypot(X, Y);
  let lat = Math.atan2(Z, p * (1 - e2));
  for (let i = 0; i < 12; i++) {
    const sinLat = Math.sin(lat);
    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    lat = Math.atan2(Z + e2 * N * sinLat, p);
  }
  const sinLat = Math.sin(lat);
  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const h = p / Math.cos(lat) - N;
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI, h };
}

// ── Datum Merchich ↔ WGS84 ──────────────────────────────────────
// h=0 des deux côtés : les sommets de terrain de ce logiciel sont 2D
// (lat, lon) — aucune altitude n'est portée par etat.sommets. L'erreur
// résiduelle qu'introduit ce choix (une translation géocentrique dépend
// un peu de h) reste, pour toute altitude terrestre plausible, très en
// dessous de la précision ±7 m déjà annoncée par l'EPSG pour ce
// changement de datum (voir en-tête de fichier) — pas une simplification
// qui domine l'incertitude.
export function merchichVersWgs84(lat_deg, lon_deg) {
  const g = versGeocentrique(lat_deg, lon_deg, 0, CLARKE_1880_IGN);
  const { dX, dY, dZ } = MERCHICH_VERS_WGS84_DXYZ;
  const r = depuisGeocentrique(g.X + dX, g.Y + dY, g.Z + dZ, WGS84);
  return { lat: r.lat, lon: r.lon };
}

export function wgs84VersMerchich(lat_deg, lon_deg) {
  const g = versGeocentrique(lat_deg, lon_deg, 0, WGS84);
  const { dX, dY, dZ } = MERCHICH_VERS_WGS84_DXYZ;
  const r = depuisGeocentrique(g.X - dX, g.Y - dY, g.Z - dZ, CLARKE_1880_IGN);
  return { lat: r.lat, lon: r.lon };
}

// ── Lambert conforme conique à 1 parallèle (EPSG 9801) ──────────
// Formules de Snyder (1987), §8 — cône TANGENT (lat_1=lat_0), cas exact
// des 4 zones Lambert Maroc. `zone` = une entrée de ZONES_LAMBERT,
// `ellipsoide` = l'ellipsoïde du datum de la zone (Clarke 1880 IGN ici).
export function versLambert(lat_deg, lon_deg, zone, ellipsoide) {
  const { a, invF } = ellipsoide;
  const f = 1 / invF, e2 = f * (2 - f), e = Math.sqrt(e2);
  const lat0 = zone.lat0_deg * Math.PI / 180, lon0 = zone.lon0_deg * Math.PI / 180;
  const { k0, x0: FE, y0: FN } = zone;

  const n = Math.sin(lat0);
  const m0 = Math.cos(lat0) / Math.sqrt(1 - e2 * Math.sin(lat0) ** 2);
  const t0 = Math.tan(Math.PI / 4 - lat0 / 2) / Math.pow((1 - e * Math.sin(lat0)) / (1 + e * Math.sin(lat0)), e / 2);
  const F = m0 / (n * Math.pow(t0, n));
  const rho0 = a * k0 * F * Math.pow(t0, n);

  const lat = lat_deg * Math.PI / 180, lon = lon_deg * Math.PI / 180;
  const t = Math.tan(Math.PI / 4 - lat / 2) / Math.pow((1 - e * Math.sin(lat)) / (1 + e * Math.sin(lat)), e / 2);
  const rho = a * k0 * F * Math.pow(t, n);
  const theta = n * (lon - lon0);

  return { x: FE + rho * Math.sin(theta), y: FN + rho0 - rho * Math.cos(theta) };
}

export function depuisLambert(x, y, zone, ellipsoide) {
  const { a, invF } = ellipsoide;
  const f = 1 / invF, e2 = f * (2 - f), e = Math.sqrt(e2);
  const lat0 = zone.lat0_deg * Math.PI / 180, lon0 = zone.lon0_deg * Math.PI / 180;
  const { k0, x0: FE, y0: FN } = zone;

  const n = Math.sin(lat0);
  const m0 = Math.cos(lat0) / Math.sqrt(1 - e2 * Math.sin(lat0) ** 2);
  const t0 = Math.tan(Math.PI / 4 - lat0 / 2) / Math.pow((1 - e * Math.sin(lat0)) / (1 + e * Math.sin(lat0)), e / 2);
  const F = m0 / (n * Math.pow(t0, n));
  const rho0 = a * k0 * F * Math.pow(t0, n);

  const dE = x - FE, dN = y - FN;
  const signeN = n >= 0 ? 1 : -1;
  const rho = signeN * Math.hypot(dE, rho0 - dN);
  const theta = Math.atan2(signeN * dE, signeN * (rho0 - dN));
  const t = Math.pow(rho / (a * k0 * F), 1 / n);

  let lat = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 12; i++) {
    lat = Math.PI / 2 - 2 * Math.atan(t * Math.pow((1 - e * Math.sin(lat)) / (1 + e * Math.sin(lat)), e / 2));
  }
  const lon = theta / n + lon0;
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
}

// ── UTM (Mercator transverse, EPSG 9807) ─────────────────────────
// Formules fermées de Snyder (1987), §7, équations 8-9 à 8-11 —
// exactes à ~1 mm près à moins de 3° du méridien central (largeur d'un
// fuseau UTM), largement suffisant ici (grille de calcul ≈ 90 m). Pas
// la série de Krüger à l'ordre n⁶ (précision sub-millimétrique au-delà
// de plusieurs degrés) : inutile à cette échelle, et c'est précisément
// la série dont la vérification avait bloqué grilleLocale.js à l'étape
// 5 (voir README, « Écart assumé : pas de vraie projection UTM ») — la
// présente implémentation est un compromis différent et documenté
// comme tel, pas une reprise de cette tentative.
export function versUtm(lat_deg, lon_deg, fuseau) {
  const { a, invF } = WGS84;
  const f = 1 / invF, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const lon0 = (fuseau * 6 - 183) * Math.PI / 180;
  const lat = lat_deg * Math.PI / 180, lon = lon_deg * Math.PI / 180;

  const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const T = Math.tan(lat) ** 2;
  const C = ep2 * Math.cos(lat) ** 2;
  const A = (lon - lon0) * Math.cos(lat);
  const M = a * (
    (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * lat
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * lat)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * lat)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * lat)
  );

  const x = UTM_K0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + UTM_FE;
  let y = UTM_K0 * (M + N * Math.tan(lat) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24
    + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (lat_deg < 0) y += 10000000; // faux-nord de l'hémisphère sud (EPSG : +10 000 000 m)
  return { x, y };
}

export function depuisUtm(x, y, fuseau, hemisphereNord) {
  const { a, invF } = WGS84;
  const f = 1 / invF, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const lon0 = (fuseau * 6 - 183) * Math.PI / 180;

  const M = (hemisphereNord ? y : y - 10000000) / UTM_K0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const lat1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);

  const N1 = a / Math.sqrt(1 - e2 * Math.sin(lat1) ** 2);
  const T1 = Math.tan(lat1) ** 2;
  const C1 = ep2 * Math.cos(lat1) ** 2;
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(lat1) ** 2, 1.5);
  const D = (x - UTM_FE) / (N1 * UTM_K0);

  const lat = lat1 - (N1 * Math.tan(lat1) / R1) * (
    D ** 2 / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720
  );
  const lon = lon0 + (
    D - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120
  ) / Math.cos(lat1);

  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
}

/** Fuseau UTM standard contenant une longitude donnée (largeur 6°). */
export function fuseauUtmDepuisLongitude(lon_deg) {
  return Math.floor((lon_deg + 180) / 6) + 1;
}

// ── Interface unifiée par identifiant de système ─────────────────
/**
 * Systèmes actuellement implémentés dans ce module (voir TerrainTab.js,
 * SYSTEMES, pour l'ensemble complet proposé à l'écran — deux systèmes
 * historiques propres au Sahara occidental, `utm-point58` et
 * `utm-nordsahara59`, restent désactivés faute de paramètres de
 * changement de datum vérifiés à ce jour, voir README « Limites
 * connues »).
 */
export const SYSTEMES_IMPLEMENTES = [
  'wgs84', 'utm-wgs84',
  'merchich-nord', 'merchich-sud', 'merchich-sahara-nord', 'merchich-sahara-sud',
];

/**
 * Convertit un point du système `idSysteme` vers WGS84.
 * @param {string} idSysteme  un des SYSTEMES_IMPLEMENTES
 * @param {number} x  longitude (wgs84) OU easting/X (Lambert, UTM)
 * @param {number} y  latitude (wgs84) OU northing/Y (Lambert, UTM)
 * @param {{fuseau?:number, hemisphereNord?:boolean}} [options]  requis pour utm-wgs84
 * @returns {{lat:number, lon:number}}
 */
export function versWgs84(idSysteme, x, y, options = {}) {
  if (idSysteme === 'wgs84') return { lat: y, lon: x };
  if (idSysteme === 'utm-wgs84') {
    if (!Number.isFinite(options.fuseau)) throw new Error('versWgs84 : fuseau UTM requis pour utm-wgs84.');
    return depuisUtm(x, y, options.fuseau, options.hemisphereNord !== false);
  }
  const zone = ZONES_LAMBERT[idSysteme];
  if (!zone) throw new Error(`versWgs84 : système « ${idSysteme} » non implémenté.`);
  const { lat, lon } = depuisLambert(x, y, zone, CLARKE_1880_IGN);
  return merchichVersWgs84(lat, lon);
}

/**
 * Convertit un point WGS84 vers le système `idSysteme`.
 * @returns {{x:number, y:number}}
 */
export function depuisWgs84(idSysteme, lat_deg, lon_deg, options = {}) {
  if (idSysteme === 'wgs84') return { x: lon_deg, y: lat_deg };
  if (idSysteme === 'utm-wgs84') {
    const fuseau = options.fuseau ?? fuseauUtmDepuisLongitude(lon_deg);
    return versUtm(lat_deg, lon_deg, fuseau);
  }
  const zone = ZONES_LAMBERT[idSysteme];
  if (!zone) throw new Error(`depuisWgs84 : système « ${idSysteme} » non implémenté.`);
  const m = wgs84VersMerchich(lat_deg, lon_deg);
  return versLambert(m.lat, m.lon, zone, CLARKE_1880_IGN);
}

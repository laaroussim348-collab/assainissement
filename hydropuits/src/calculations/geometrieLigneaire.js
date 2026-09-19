// ============================================================
//  geometrieLigneaire.js — Densité linéaire (drainage, linéaments) et
//  distance aux cours d'eau, sur la grille de calcul métrique.
//  ─────────────────────────────────────────────────────────────
//  §3.4 : « Densités (drainage, linéaments) : noyau de densité normalisé
//  par une aire réelle en km², rayon de recherche paramétrable et
//  affiché » et « Distance aux cours d'eau : proche ⇒ favorable ».
//
//  MÉTHODE DE DENSITÉ — noyau de densité LINÉAIRE (pas ponctuel) : pour
//  chaque cellule, on additionne la longueur de toutes les lignes
//  (cours d'eau OU failles selon l'appel) qui traverse un cercle de
//  rayon R centré sur la cellule, divisée par l'aire de ce cercle en
//  km². C'est l'équivalent du « Line Density » standard des SIG
//  (ArcGIS/QGIS), généralisant la densité de drainage classique
//  Dd = longueur totale / surface du bassin à une fenêtre glissante
//  locale plutôt qu'un bassin entier.
//
//  Le calcul de longueur-dans-un-cercle par segment (voir
//  `longueurSegmentDansCercle`) est de la géométrie plane élémentaire
//  (intersection d'un segment et d'un cercle via une équation du second
//  degré en t) — dérivée et vérifiée directement dans ce fichier (voir
//  tests/unit-geometrie-ligneaire.test.js), aucune formule externe à
//  citer ici.
//
//  ⚠️ TOUT SE CALCULE EN COORDONNÉES MÉTRIQUES LOCALES (grilleLocale.js),
//  jamais en degrés — une longueur en degrés n'a pas de sens physique
//  uniforme (§4).
//
//  ⚠️ PERFORMANCE ASSUMÉE : recherche naïve (chaque cellule compare tous
//  les segments) — O(nCellules × nSegments). Adapté à l'échelle visée
//  par ce logiciel (grille de quelques milliers de cellules au plus,
//  §4 MAX_POINTS_GRILLE ; réseau OSM autour d'une parcelle, typiquement
//  quelques dizaines à quelques centaines de segments, §3.3
//  RAYON_RECHERCHE_M_DEFAUT). Un index spatial (grille de segments,
//  arbre R) n'apporterait rien à cette échelle et ajouterait de la
//  complexité — à reconsidérer seulement si l'échelle visée change.
//
//  CE MODULE EST PUR : aucun accès réseau ni disque.
// ============================================================
import { versLocal } from './grilleLocale.js';

/** Convertit un ensemble de polylignes en lat/lon en polylignes en mètres locaux. */
function versLignesLocales(lignesLatLon, origine) {
  return lignesLatLon.map((ligne) => ligne.map((p) => versLocal(p.lat, p.lon, origine)));
}

/**
 * Longueur de la portion d'un segment [p1,p2] située à l'intérieur d'un
 * cercle (centre c, rayon R) — géométrie plane exacte, PURE.
 *
 * Paramétrise le segment p(t) = p1 + t·(p2-p1), t∈[0,1], et résout
 * |p(t)-c|² = R² (équation du second degré en t : a·t²+b·t+c0-R²=0,
 * a=|p2-p1|²≥0 donc |p(t)-c|² est une parabole tournée vers le HAUT en
 * t — la portion « dans le cercle » (distance² < R²) est donc l'intervalle
 * ENTRE les deux racines, s'il y en a). Intersecté avec [0,1] car seul le
 * segment (pas la droite infinie) compte.
 */
function longueurSegmentDansCercle(p1, p2, centre, rayon) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const a = dx * dx + dy * dy;
  if (a === 0) return 0; // segment dégénéré (deux points confondus)
  const fx = p1.x - centre.x, fy = p1.y - centre.y;
  const b = 2 * (fx * dx + fy * dy);
  const c0 = fx * fx + fy * fy - rayon * rayon;

  const discriminant = b * b - 4 * a * c0;
  if (discriminant < 0) return 0; // la droite entière ne coupe pas le cercle

  const racineDisc = Math.sqrt(discriminant);
  const t1 = (-b - racineDisc) / (2 * a);
  const t2 = (-b + racineDisc) / (2 * a);
  const debut = Math.max(0, t1);
  const fin = Math.min(1, t2);
  if (fin <= debut) return 0;

  const longueurSegment = Math.sqrt(a);
  return (fin - debut) * longueurSegment;
}

/**
 * Densité linéaire en tout point de la grille de calcul, km de ligne par
 * km² de cercle de recherche.
 *
 * @param {object} grille  grille de calcul (grilleMnt.js)
 * @param {object} origine  origine locale (grilleLocale.js)
 * @param {{lat:number, lon:number}[][]} lignesLatLon  polylignes (cours
 *   d'eau OU failles — même fonction pour les deux, §3.4)
 * @param {number} rayon_m  rayon de recherche, en mètres
 * @returns {Float64Array} densité (km/km²) par cellule ; NaN hors du
 *   masque (§3.4 : « pas de calcul hors polygone »)
 */
export function calculerDensiteLigneaire(grille, origine, lignesLatLon, rayon_m) {
  if (!(rayon_m > 0)) throw new Error('calculerDensiteLigneaire : le rayon de recherche doit être positif.');
  const { nbLignes, nbColonnes, cellsize_m, xmin, ymin, masque } = grille;
  const lignesLocales = versLignesLocales(lignesLatLon, origine);
  const aire_km2 = Math.PI * (rayon_m / 1000) ** 2;

  const densite = new Float64Array(nbLignes * nbColonnes).fill(NaN);
  for (let i = 0; i < nbLignes; i++) {
    const y = ymin + i * cellsize_m;
    for (let j = 0; j < nbColonnes; j++) {
      const idx = i * nbColonnes + j;
      if (!masque[idx]) continue; // §3.4 : jamais de calcul hors polygone
      const x = xmin + j * cellsize_m;
      const centre = { x, y };
      let total_m = 0;
      for (const ligne of lignesLocales) {
        for (let k = 0; k < ligne.length - 1; k++) {
          total_m += longueurSegmentDansCercle(ligne[k], ligne[k + 1], centre, rayon_m);
        }
      }
      densite[idx] = (total_m / 1000) / aire_km2;
    }
  }
  return densite;
}

/** Distance PERPENDICULAIRE d'un point à un segment (projection sur le
 *  segment, bornée à ses deux extrémités). Géométrie plane élémentaire. */
function distancePointSegment(p, p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const long2 = dx * dx + dy * dy;
  if (long2 === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);
  let t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / long2;
  t = Math.max(0, Math.min(1, t));
  const px = p1.x + t * dx, py = p1.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

/**
 * Distance minimale, en mètres, de chaque cellule de la grille au réseau
 * hydrographique le plus proche.
 *
 * @returns {Float64Array} distance en mètres ; NaN hors du masque, et
 *   +Infinity (pas NaN — c'est une distance VALIDE, juste très grande) si
 *   aucune ligne n'a été fournie (couche manquante, §5 — à distinguer
 *   explicitement d'un « hors polygone »).
 */
export function calculerDistanceLignes(grille, origine, lignesLatLon) {
  const { nbLignes, nbColonnes, cellsize_m, xmin, ymin, masque } = grille;
  const lignesLocales = versLignesLocales(lignesLatLon, origine);

  const distance = new Float64Array(nbLignes * nbColonnes).fill(NaN);
  for (let i = 0; i < nbLignes; i++) {
    const y = ymin + i * cellsize_m;
    for (let j = 0; j < nbColonnes; j++) {
      const idx = i * nbColonnes + j;
      if (!masque[idx]) continue;
      const x = xmin + j * cellsize_m;
      const p = { x, y };
      let min = Infinity;
      for (const ligne of lignesLocales) {
        for (let k = 0; k < ligne.length - 1; k++) {
          const d = distancePointSegment(p, ligne[k], ligne[k + 1]);
          if (d < min) min = d;
        }
      }
      distance[idx] = min;
    }
  }
  return distance;
}

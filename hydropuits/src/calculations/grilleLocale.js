// ============================================================
//  grilleLocale.js — Projection métrique locale pour la grille de calcul.
//  ─────────────────────────────────────────────────────────────
//  POURQUOI CE MODULE EXISTE (cahier des charges §4) : « Grille de
//  calcul : construite dans une projection métrique locale (UTM du
//  fuseau du terrain), pas en degrés — une maille en degrés n'est pas
//  carrée et fausse toute pente et toute densité. » L'exigence de fond
//  est que les cellules de la grille soient CARRÉES ET EXACTES EN
//  MÈTRES ; « UTM » en est l'exemple nommé, pas une fin en soi.
//
//  ⚠️ ÉCART ASSUMÉ PAR RAPPORT AU LIBELLÉ « UTM » — À LIRE AVANT TOUTE
//  MODIFICATION DE CE FICHIER :
//  Une vraie projection UTM (série de Krüger à l'ordre n⁶, comme
//  `coordonnees.js` de HydroCrue était censé la porter pour le système
//  « utm-wgs84 », §2.2) demande une table de coefficients à plusieurs
//  termes. Ce fichier ayant été écrit dans un environnement où
//  `WebFetch` est bloqué sur TOUTES les sources de référence testées
//  (Wikipedia, movable-type.co.uk, neacsu.net — pas seulement celles
//  déjà signalées à l'étape 1), il n'a pas été possible de vérifier
//  cette série aujourd'hui. Plutôt que de recopier une formule à
//  plusieurs termes de mémoire — exactement ce que le cahier des
//  charges interdit (§8 : « vérifie sur le web […] en cas de doute,
//  dis-le au lieu de deviner ») — cette grille utilise une projection
//  PLUS SIMPLE mais tout aussi rigoureuse pour l'usage visé : un plan
//  tangent local au centroïde du terrain, mis à l'échelle par
//  différences finies géodésiques EXACTES (calculations/geodesie.js,
//  déjà validé indépendamment à l'étape 3 — voir unit-geodesie.test.js).
//
//  Ce choix n'est PAS une approximation « au pif » : sa distorsion est
//  elle-même MESURÉE avec le même moteur géodésique prouvé (voir
//  `distorsionMaximale_relatif` ci-dessous et son test), pas supposée.
//  Pour l'échelle d'un terrain visé par ce logiciel (parcelle de
//  quelques ares à quelques dizaines d'hectares), cette distorsion est
//  négligeable — quantifiée, pas devinée.
//
//  QUAND REVOIR CE CHOIX : dès que `coordonnees.js` sera fourni (§2.2),
//  son système « utm-wgs84 » (une fois copié tel quel, sans
//  modification) devient la référence à utiliser pour cette grille —
//  remplacer versLocal/versGeographique par ses fonctions, sans changer
//  la forme des fonctions exposées ici (mêmes signatures), pour que
//  grilleMnt.js et tout ce qui en dépend n'aient rien à changer.
//
//  CE MODULE EST PUR : aucun accès réseau ni disque.
// ============================================================
import { distanceGeodesique_m } from './geodesie.js';

// Pas de la différence finie utilisée pour mesurer le facteur d'échelle
// local (mètres par degré), en degrés. ORIGINE : choix par défaut — assez
// petit pour que le facteur d'échelle mesuré soit celui du POINT origine
// (pas une moyenne sur une grande distance), assez grand pour rester loin
// du bruit d'arrondi en double précision (1e-3° ≈ 111 m au méridien :
// largement au-dessus de la précision du mètre visée ici).
const PAS_DIFFERENCE_FINIE_DEG = 1e-3;

/**
 * Calcule l'origine locale (centroïde simple des sommets — un point de
 * référence, pas une mesure : voir services/telechargementJobs.js pour
 * le même choix et sa justification) et les facteurs d'échelle
 * mètres/degré en ce point, par différence finie géodésique EXACTE.
 *
 * @param {{lat:number, lon:number}[]} sommets
 * @returns {{lat0:number, lon0:number, mParDegLat:number, mParDegLon:number}}
 */
export function calculerOrigineLocale(sommets) {
  if (!Array.isArray(sommets) || sommets.length === 0) {
    throw new Error('calculerOrigineLocale : contour vide.');
  }
  const lat0 = sommets.reduce((s, p) => s + p.lat, 0) / sommets.length;
  const lon0 = sommets.reduce((s, p) => s + p.lon, 0) / sommets.length;

  const h = PAS_DIFFERENCE_FINIE_DEG;
  // Différence CENTRÉE (± h/2) : erreur de troncature en O(h²), pas O(h) —
  // sans changer h, cela suffit à rendre l'erreur de mesure du facteur
  // d'échelle négligeable devant la distorsion elle-même (voir le test).
  const mParDegLat = distanceGeodesique_m(lat0 - h / 2, lon0, lat0 + h / 2, lon0) / h;
  const mParDegLon = distanceGeodesique_m(lat0, lon0 - h / 2, lat0, lon0 + h / 2) / h;

  return { lat0, lon0, mParDegLat, mParDegLon };
}

/** Point géographique → coordonnées locales (mètres), plan tangent à l'origine. */
export function versLocal(lat, lon, origine) {
  return {
    x: (lon - origine.lon0) * origine.mParDegLon,
    y: (lat - origine.lat0) * origine.mParDegLat,
  };
}

/** Inverse EXACTE de versLocal (transformation linéaire — aucune itération,
 *  contrairement à l'inverse d'une vraie projection UTM qui demande de
 *  retrouver la latitude de pied par itération). */
export function versGeographique(x, y, origine) {
  return {
    lat: origine.lat0 + y / origine.mParDegLat,
    lon: origine.lon0 + x / origine.mParDegLon,
  };
}

/**
 * Mesure la distorsion RELATIVE de cette projection locale sur une paire
 * de points donnée : écart entre la distance géodésique EXACTE (référence)
 * et la distance euclidienne dans le plan local, rapporté à la distance
 * réelle. PURE, et volontairement lente (un appel géodésique complet) —
 * outil de VALIDATION (tests, avertissement si un terrain est trop grand
 * pour cette approximation), pas une fonction appelée par cellule de
 * grille.
 *
 * @returns {number} écart relatif (0.001 = 0,1 %)
 */
export function distorsionRelative(lat1, lon1, lat2, lon2, origine) {
  const reel_m = distanceGeodesique_m(lat1, lon1, lat2, lon2);
  const p1 = versLocal(lat1, lon1, origine);
  const p2 = versLocal(lat2, lon2, origine);
  const local_m = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  return reel_m > 0 ? Math.abs(local_m - reel_m) / reel_m : 0;
}

/**
 * Distorsion relative MAXIMALE de la grille locale sur un ensemble de
 * sommets (typiquement le contour du terrain) — pire cas parmi toutes les
 * paires. Sert à AVERTIR (pas à bloquer) si un terrain est trop étendu
 * pour que l'approximation en plan tangent reste négligeable — voir
 * grilleMnt.js.
 */
export function distorsionMaximale_relatif(sommets, origine) {
  let max = 0;
  for (let i = 0; i < sommets.length; i++) {
    for (let j = i + 1; j < sommets.length; j++) {
      const d = distorsionRelative(sommets[i].lat, sommets[i].lon, sommets[j].lat, sommets[j].lon, origine);
      if (d > max) max = d;
    }
  }
  return max;
}

/**
 * Seuil d'avertissement de distorsion. ORIGINE : choix par défaut — 0,1 %
 * correspond à 1 m d'écart tous les km, très en dessous de la résolution
 * du MNT utilisé (≈ 90 m) : la distorsion de projection ne peut alors pas
 * être la source d'erreur dominante du calcul. Un terrain qui approche ce
 * seuil est en toute hypothèse déjà bien plus grand que ce que ce
 * logiciel vise (une parcelle, pas un bassin versant).
 */
export const SEUIL_DISTORSION_RELATIF = 0.001;

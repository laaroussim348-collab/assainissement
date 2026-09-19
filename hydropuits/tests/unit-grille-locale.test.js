/**
 * unit-grille-locale.test.js — projection métrique locale (§4).
 * -----------------------------------------------------------------------
 * Deux familles de vérifications, aucune ne recopie une valeur externe :
 *  1. INVERSIBILITÉ EXACTE — versGeographique(versLocal(p)) doit rendre p
 *     au bit près (transformation linéaire, pas de série tronquée).
 *  2. BORNE DE DISTORSION — mesurée avec le moteur géodésique de Karney
 *     déjà validé indépendamment (unit-geodesie.test.js), pas supposée.
 *     Un carré de 500 m de côté (échelle d'une parcelle) doit rester
 *     largement sous SEUIL_DISTORSION_RELATIF ; un rectangle de 50 km
 *     (hors du domaine d'usage visé) doit le dépasser, pour vérifier que
 *     le seuil réagit bien à l'échelle et n'est pas un simple 'true' figé.
 * -----------------------------------------------------------------------
 */
import {
  calculerOrigineLocale, versLocal, versGeographique,
  distorsionRelative, distorsionMaximale_relatif, SEUIL_DISTORSION_RELATIF,
} from '../src/calculations/grilleLocale.js';
import { distanceGeodesique_m } from '../src/calculations/geodesie.js';

const PARCELLE = [
  { lat: 31.600, lon: -8.000 }, { lat: 31.600, lon: -7.996 },
  { lat: 31.603, lon: -7.996 }, { lat: 31.603, lon: -8.000 },
];

export const casGrilleLocale = [
  {
    libelle: 'Origine locale : centroïde simple des sommets',
    attendu: (31.600 + 31.600 + 31.603 + 31.603) / 4,
    tolerancePourcent: 1e-9,
    source: 'unité', executer: () => calculerOrigineLocale(PARCELLE).lat0,
  },
  {
    // Ordre de grandeur seulement : le rayon de courbure méridien varie
    // avec la latitude sur l'ellipsoïde (~110 574 m/° à l'équateur,
    // ~111 694 m/° aux pôles) — une valeur unique figée serait fausse par
    // construction. La cohérence FINE est vérifiée par les tests suivants,
    // contre le même moteur géodésique.
    libelle: "Facteur d'échelle latitude dans la plage ellipsoïdale plausible",
    attendu: true,
    source: 'cohérence — plage dérivée du rayon de courbure méridien WGS84',
    executer: () => {
      const m = calculerOrigineLocale(PARCELLE).mParDegLat;
      return m > 110500 && m < 111800;
    },
  },
  {
    libelle: 'Origine locale : x=0,y=0 exactement au point origine',
    attendu: '0,0',
    source: 'unité',
    executer: () => {
      const o = calculerOrigineLocale(PARCELLE);
      const p = versLocal(o.lat0, o.lon0, o);
      return `${p.x},${p.y}`;
    },
  },
  {
    libelle: 'Inversibilité exacte : versGeographique(versLocal(p)) = p',
    attendu: 0,
    tolerancePourcent: 1e-10,
    source: 'transformation linéaire — pas de série tronquée, pas d’itération',
    executer: () => {
      const o = calculerOrigineLocale(PARCELLE);
      const p = versLocal(31.6021, -7.9973, o);
      const r = versGeographique(p.x, p.y, o);
      return Math.abs(r.lat - 31.6021) + Math.abs(r.lon - (-7.9973));
    },
  },
  {
    // NOTE DE FORME : comparer un écart à « attendu: 0 » avec une
    // tolérance en % ne fonctionne pas ici (0 % de 0 = 0, la moindre
    // imprécision en virgule flottante fait alors échouer le test — voir
    // comparerNombre dans run-tests.js). D'où un test booléen, comme pour
    // les seuils de distorsion plus bas.
    libelle: 'Distance locale ≈ distance géodésique sur un petit côté (< 0,01 % à l’échelle parcelle)',
    attendu: true,
    source: '§4 — la grille doit être « exacte en mètres » à l’échelle visée',
    executer: () => {
      const o = calculerOrigineLocale(PARCELLE);
      return distorsionRelative(31.600, -8.000, 31.603, -7.996, o) < 1e-4;
    },
  },
  {
    libelle: 'distorsionRelative = 0 quand le point ne bouge pas',
    attendu: 0,
    source: 'garde-fou',
    executer: () => {
      const o = calculerOrigineLocale(PARCELLE);
      return distorsionRelative(31.6, -8.0, 31.6, -8.0, o);
    },
  },
  {
    libelle: 'Terrain à l’échelle parcelle : distorsion max largement sous le seuil',
    attendu: true,
    source: `§4 — seuil ${SEUIL_DISTORSION_RELATIF}`,
    executer: () => {
      const o = calculerOrigineLocale(PARCELLE);
      return distorsionMaximale_relatif(PARCELLE, o) < SEUIL_DISTORSION_RELATIF / 10;
    },
  },
  {
    libelle: 'Terrain à l’échelle d’un grand bassin (50 km) : dépasse le seuil',
    attendu: true,
    source: 'le seuil doit réagir à l’échelle, pas être un « true » figé',
    executer: () => {
      const grand = [
        { lat: 31.0, lon: -8.5 }, { lat: 31.0, lon: -7.5 },
        { lat: 31.5, lon: -7.5 }, { lat: 31.5, lon: -8.5 },
      ];
      const o = calculerOrigineLocale(grand);
      return distorsionMaximale_relatif(grand, o) > SEUIL_DISTORSION_RELATIF;
    },
  },
  {
    libelle: 'Cohérence : distance locale euclidienne proche de la distance géodésique directe (< 0,5 %)',
    attendu: true,
    source: 'oracle indépendant : calculations/geodesie.js (déjà validé, étape 3)',
    executer: () => {
      const o = calculerOrigineLocale(PARCELLE);
      const a = versLocal(31.600, -8.000, o);
      const b = versLocal(31.603, -7.996, o);
      const localeM = Math.hypot(b.x - a.x, b.y - a.y);
      const reelleM = distanceGeodesique_m(31.600, -8.000, 31.603, -7.996);
      return Math.abs(localeM - reelleM) / reelleM < 0.005;
    },
  },
];

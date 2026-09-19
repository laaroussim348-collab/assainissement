/**
 * unit-geodesie.test.js — validation de la géodésie sur l'ellipsoïde WGS84.
 * -----------------------------------------------------------------------
 * PRINCIPE DE CES TESTS : ne comparer à AUCUNE valeur recopiée d'une
 * source externe. Le cahier des charges (§8) interdit d'inventer une
 * référence ; recopier un nombre trouvé sur un site, sans pouvoir le
 * refaire, n'est pas beaucoup mieux — on ne saurait pas dire, en cas
 * d'échec, qui de la référence ou du code a tort.
 *
 * Toutes les valeurs attendues ci-dessous sont donc soit ANALYTIQUES
 * (forme close exacte), soit calculées ici même par un ORACLE
 * INDÉPENDANT, écrit dans ce fichier avec une méthode différente de
 * celle du code testé :
 *
 *  1. Équateur — la géodésique est le cercle équatorial : s = a·Δλ,
 *     exactement, sans aucune série.
 *  2. Méridien — arc de méridien par quadrature de Simpson composite de
 *     l'intégrale ∫ a(1-e²)/(1-e²sin²φ)^{3/2} dφ. Rien de commun avec
 *     les séries de Karney : si les deux coïncident à 10⁻¹⁴ près, c'est
 *     que les deux sont justes.
 *  3. Cas généraux — formule inverse de VINCENTY (1975), implémentée ici
 *     de façon totalement indépendante. Vincenty plafonne vers 0,5 mm,
 *     d'où une tolérance plus lâche sur ces cas : c'est la limite de
 *     l'oracle, pas celle du code testé.
 *  4. Aires — la surface d'un fuseau délimité par l'équateur et deux
 *     méridiens (tous géodésiques) vaut EXACTEMENT S·Δλ/720, où S est la
 *     surface totale de l'ellipsoïde, elle-même de forme close. C'est la
 *     seule référence d'aire géodésique exacte disponible sans outil
 *     externe, et elle valide directement les coefficients C4.
 *
 * ⚠️ MANQUE ENCORE (cahier des charges §7) : le polygone de référence
 * dont l'éditeur possède la surface CADASTRALE. C'est le seul test qui
 * confrontera le logiciel à une mesure de terrain réelle plutôt qu'à
 * des mathématiques. À ajouter dès que ces données seront fournies.
 * -----------------------------------------------------------------------
 */
import {
  distanceGeodesique_m, airePerimetreGeodesiques, AIRE_ELLIPSOIDE_M2,
} from '../src/calculations/geodesie.js';

// Paramètres définissants du WGS84, redéclarés ICI volontairement : un
// test qui importerait les constantes du module testé ne testerait rien.
const A = 6378137.0;
const F = 1 / 298.257223563;
const B = A * (1 - F);
const E2 = F * (2 - F);

// ── Oracle 1 : arc de méridien par quadrature de Simpson ──────
function arcMeridien_m(phiDeg, N = 200000) {
  const phi = phiDeg * Math.PI / 180;
  const g = (t) => A * (1 - E2) / Math.pow(1 - E2 * Math.sin(t) ** 2, 1.5);
  const h = phi / N;
  let s = g(0) + g(phi);
  for (let i = 1; i < N; i++) s += g(i * h) * (i % 2 ? 4 : 2);
  return s * h / 3;
}

// ── Oracle 2 : formule inverse de Vincenty (1975) ─────────────
// Vincenty, T., « Direct and inverse solutions of geodesics on the
// ellipsoid with application of nested equations », Survey Review 23(176),
// 88-93, 1975. Implémentation indépendante, uniquement à usage de test.
function vincenty_m(lat1, lon1, lat2, lon2) {
  const L = (lon2 - lon1) * Math.PI / 180;
  const U1 = Math.atan((1 - F) * Math.tan(lat1 * Math.PI / 180));
  const U2 = Math.atan((1 - F) * Math.tan(lat2 * Math.PI / 180));
  const sU1 = Math.sin(U1); const cU1 = Math.cos(U1);
  const sU2 = Math.sin(U2); const cU2 = Math.cos(U2);
  let lam = L; let lamP; let it = 0;
  let sS; let cS; let sig; let sAl; let c2Al; let c2Sm; let C;
  do {
    const sL = Math.sin(lam); const cL = Math.cos(lam);
    sS = Math.sqrt((cU2 * sL) ** 2 + (cU1 * sU2 - sU1 * cU2 * cL) ** 2);
    if (sS === 0) return 0;
    cS = sU1 * sU2 + cU1 * cU2 * cL;
    sig = Math.atan2(sS, cS);
    sAl = cU1 * cU2 * sL / sS;
    c2Al = 1 - sAl * sAl;
    c2Sm = c2Al !== 0 ? cS - 2 * sU1 * sU2 / c2Al : 0;
    C = F / 16 * c2Al * (4 + F * (4 - 3 * c2Al));
    lamP = lam;
    lam = L + (1 - C) * F * sAl * (sig + C * sS * (c2Sm + C * cS * (-1 + 2 * c2Sm * c2Sm)));
  } while (Math.abs(lam - lamP) > 1e-14 && ++it < 300);
  const u2 = c2Al * (A * A - B * B) / (B * B);
  const Av = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const Bv = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dS = Bv * sS * (c2Sm + Bv / 4 * (cS * (-1 + 2 * c2Sm * c2Sm)
    - Bv / 6 * c2Sm * (-3 + 4 * sS * sS) * (-3 + 4 * c2Sm * c2Sm)));
  return B * Av * (sig - dS);
}

/** Fuseau : équateur de 0 à dl, méridien dl jusqu'au pôle, méridien 0 au retour. */
const fuseau = (dl) => [{ lat: 0, lon: 0 }, { lat: 0, lon: dl }, { lat: 90, lon: dl }];

// Tolérances, en POURCENT (format du lanceur de tests).
const TOL_EXACTE = 1e-12;    // 1e-14 en relatif : la limite du double
const TOL_QUADRATURE = 1e-10; // limite de l'oracle de Simpson
const TOL_VINCENTY = 1e-9;    // limite de l'oracle de Vincenty (~0,5 mm)

export const casGeodesie = [
  // ── 1. Équateur : référence analytique exacte ──
  {
    libelle: 'Équateur (0,0)→(0,1°) = a·π/180',
    attendu: A * Math.PI / 180,
    tolerancePourcent: TOL_EXACTE,
    source: 'analytique : la géodésique équatoriale est le cercle de rayon a',
    executer: () => distanceGeodesique_m(0, 0, 0, 1),
  },
  {
    libelle: 'Équateur (0,0)→(0,90°) = a·π/2',
    attendu: A * Math.PI / 2,
    tolerancePourcent: TOL_EXACTE,
    source: 'analytique',
    executer: () => distanceGeodesique_m(0, 0, 0, 90),
  },

  // ── 2. Méridien vs quadrature de Simpson ──
  ...[1, 10, 45, 60, 90].map(lat => ({
    libelle: `Méridien (0,0)→(${lat}°,0) vs quadrature`,
    attendu: arcMeridien_m(lat),
    tolerancePourcent: TOL_QUADRATURE,
    source: 'Simpson composite sur ∫a(1-e²)/(1-e²sin²φ)^1.5 dφ',
    executer: () => distanceGeodesique_m(0, 0, lat, 0),
  })),

  // ── 3. Cas généraux vs Vincenty ──
  ...[
    [31.6, -8.0, 31.7, -7.9],            // échelle d'une commune marocaine
    [33.9716, -6.8498, 31.6295, -7.9811], // Rabat → Marrakech
    [-33.0, 18.0, 40.0, -74.0],           // transocéanique
    [48.8566, 2.3522, 35.6762, 139.6503], // quasi-antipodal (Paris → Tokyo)
    [1.0, 1.0, -1.0, -1.0],               // à cheval sur l'équateur ET le méridien origine
  ].map(([la1, lo1, la2, lo2]) => ({
    libelle: `Général (${la1},${lo1})→(${la2},${lo2}) vs Vincenty`,
    attendu: vincenty_m(la1, lo1, la2, lo2),
    tolerancePourcent: TOL_VINCENTY,
    source: 'Vincenty 1975 (oracle indépendant)',
    executer: () => distanceGeodesique_m(la1, lo1, la2, lo2),
  })),

  // ── 4. Symétrie ──
  {
    libelle: 'Distance symétrique : d(A,B) = d(B,A)',
    attendu: 0,
    tolerancePourcent: TOL_EXACTE,
    source: 'propriété mathématique',
    executer: () => distanceGeodesique_m(31.6, -8, 33.9, -6.8) - distanceGeodesique_m(33.9, -6.8, 31.6, -8),
  },

  // ── 5. Aires : fuseaux de forme close ──
  ...[30, 90, 120, 170].map(dl => ({
    libelle: `Aire du fuseau Δλ=${dl}° = S·${dl}/720`,
    attendu: AIRE_ELLIPSOIDE_M2 * dl / 720,
    tolerancePourcent: TOL_EXACTE,
    source: 'analytique : équateur et méridiens sont des géodésiques',
    executer: () => airePerimetreGeodesiques(fuseau(dl)).aire_m2,
  })),
  {
    libelle: 'Additivité : fuseaux 0-40° + 40-90° = 0-90°',
    attendu: AIRE_ELLIPSOIDE_M2 * 90 / 720,
    tolerancePourcent: TOL_EXACTE,
    source: 'analytique',
    executer: () => airePerimetreGeodesiques(fuseau(40)).aire_m2
      + airePerimetreGeodesiques([{ lat: 0, lon: 40 }, { lat: 0, lon: 90 }, { lat: 90, lon: 90 }]).aire_m2,
  },
  {
    libelle: "Périmètre de l'octant = quart d'équateur + 2 quarts de méridien",
    attendu: A * Math.PI / 2 + 2 * arcMeridien_m(90),
    tolerancePourcent: TOL_QUADRATURE,
    source: 'analytique + quadrature',
    executer: () => airePerimetreGeodesiques(fuseau(90)).perimetre_m,
  },

  // ── 6. Polygone enfermant un pôle ──
  // Sans le comptage des traversées du méridien origine, on obtiendrait
  // ici l'aire du COMPLÉMENTAIRE (tout le reste de la Terre).
  {
    libelle: 'Polygone enfermant le pôle Nord = 4 × son quart',
    attendu: 4 * airePerimetreGeodesiques([{ lat: 90, lon: 0 }, { lat: 80, lon: 0 }, { lat: 80, lon: 90 }]).aire_m2,
    tolerancePourcent: 1e-11,
    source: 'symétrie de révolution',
    executer: () => airePerimetreGeodesiques(
      [{ lat: 80, lon: 0 }, { lat: 80, lon: 90 }, { lat: 80, lon: 180 }, { lat: 80, lon: -90 }]).aire_m2,
  },

  // ── 7. Propriétés attendues d'une parcelle réelle ──
  // Un quadrilatère découpé en deux triangles par une diagonale : la
  // somme des deux doit redonner le tout. Test de cohérence interne, sur
  // une figure à l'échelle et à la latitude réelles d'usage du logiciel.
  {
    libelle: 'Découpage en 2 triangles = quadrilatère entier',
    attendu: 0,
    tolerancePourcent: 1e-9,
    source: 'cohérence interne, parcelle à 31,6°N',
    executer: () => {
      const A1 = { lat: 31.600, lon: -8.000 };
      const B1 = { lat: 31.600, lon: -7.996 };
      const C1 = { lat: 31.603, lon: -7.995 };
      const D1 = { lat: 31.604, lon: -8.001 };
      const tout = airePerimetreGeodesiques([A1, B1, C1, D1]).aire_m2;
      const t1 = airePerimetreGeodesiques([A1, B1, C1]).aire_m2;
      const t2 = airePerimetreGeodesiques([A1, C1, D1]).aire_m2;
      return (t1 + t2 - tout) / tout; // écart relatif, attendu nul
    },
  },
  {
    libelle: 'Aire indépendante du sens de parcours',
    attendu: 0,
    tolerancePourcent: TOL_EXACTE,
    source: 'propriété mathématique',
    executer: () => {
      const p = [{ lat: 31.60, lon: -8.00 }, { lat: 31.60, lon: -7.99 },
        { lat: 31.61, lon: -7.99 }, { lat: 31.61, lon: -8.00 }];
      return airePerimetreGeodesiques(p).aire_m2 - airePerimetreGeodesiques([...p].reverse()).aire_m2;
    },
  },
  {
    libelle: 'Sens de parcours détecté : direct vs inversé',
    attendu: 'false|true',
    source: 'aire signée de Karney',
    executer: () => {
      const p = [{ lat: 31.60, lon: -8.00 }, { lat: 31.60, lon: -7.99 },
        { lat: 31.61, lon: -7.99 }, { lat: 31.61, lon: -8.00 }];
      return `${airePerimetreGeodesiques(p).sensHoraire}|${airePerimetreGeodesiques([...p].reverse()).sensHoraire}`;
    },
  },

  // ── 8. Accumulation sur un grand nombre de côtés ──
  // 200 sommets alignés sur l'équateur puis le pôle : l'aire reste
  // exactement celle du fuseau, ce qui vérifie que la sommation
  // compensée ne perd rien sur 200 termes qui se compensent largement.
  {
    libelle: 'Fuseau à 200 sommets = fuseau à 3 sommets',
    attendu: AIRE_ELLIPSOIDE_M2 / 8,
    tolerancePourcent: 1e-11,
    source: 'analytique : ajouter des sommets sur une géodésique ne change rien',
    executer: () => {
      // 199 sommets répartis sur l'équateur de 0° à 90°, puis le pôle :
      // 200 côtés en tout, dont 198 alignés sur l'équateur. L'aire doit
      // rester EXACTEMENT celle de l'octant à 3 sommets.
      const p = [];
      for (let k = 0; k <= 198; k++) p.push({ lat: 0, lon: k * (90 / 198) });
      p.push({ lat: 90, lon: 90 });
      return airePerimetreGeodesiques(p).aire_m2;
    },
  },

  // ── 9. Refus bruyants (§4 : « échouent bruyamment ») ──
  {
    libelle: 'Refus : moins de 3 sommets',
    attendu: 'refus',
    source: 'cahier des charges §3.2',
    executer: () => {
      try { airePerimetreGeodesiques([{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }]); return 'aucun refus'; }
      catch { return 'refus'; }
    },
  },
  {
    libelle: 'Refus : latitude hors de [-90, 90]',
    attendu: 'refus',
    source: 'garde-fou de saisie',
    executer: () => {
      try { distanceGeodesique_m(91, 0, 0, 0); return 'aucun refus'; }
      catch { return 'refus'; }
    },
  },
  {
    libelle: 'Refus : coordonnée non numérique',
    attendu: 'refus',
    source: 'garde-fou de saisie',
    executer: () => {
      try { distanceGeodesique_m(NaN, 0, 0, 0); return 'aucun refus'; }
      catch { return 'refus'; }
    },
  },
];

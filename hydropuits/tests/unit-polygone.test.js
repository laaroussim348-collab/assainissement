/**
 * unit-polygone.test.js — validation et normalisation du polygone de terrain.
 * -----------------------------------------------------------------------
 * Couvre les cas imposés par le cahier des charges §7 : auto-intersection,
 * polygone dégénéré, 3 sommets, 200 sommets — plus les doublons et la
 * normalisation du sens de parcours demandés au §3.2.
 *
 * Chaque cas de refus vérifie la CLÉ D'ERREUR renvoyée, pas seulement le
 * fait qu'il y ait un refus : c'est cette clé qui détermine le message
 * affiché à l'utilisateur, et un mauvais message sur un contour croisé
 * est presque aussi gênant que pas de message du tout.
 * -----------------------------------------------------------------------
 */
import {
  validerPolygone, detecterAutoIntersections, detecterDoublons,
  normaliserSens, pointDansPolygone, insererSommetSurCote,
  retirerDoublonsConsecutifs, SOMMETS_MINIMUM,
} from '../src/calculations/polygone.js';

// Parcelle de travail : quadrilatère à 31,6°N (plaine du Haouz, échelle
// et latitude réelles d'usage du logiciel).
const CARRE = [
  { lat: 31.600, lon: -8.000 },
  { lat: 31.600, lon: -7.996 },
  { lat: 31.603, lon: -7.996 },
  { lat: 31.603, lon: -8.000 },
];

/** Le même contour, mais parcouru en sens horaire. */
const CARRE_HORAIRE = [CARRE[0], ...CARRE.slice(1).reverse()];

/** Nœud papillon : les côtés 1 et 3 se croisent. */
const PAPILLON = [
  { lat: 31.600, lon: -8.000 },
  { lat: 31.603, lon: -7.996 },
  { lat: 31.600, lon: -7.996 },
  { lat: 31.603, lon: -8.000 },
];

/** Trois sommets alignés : aucune surface enfermée. */
const ALIGNES = [
  { lat: 31.600, lon: -8.000 },
  { lat: 31.601, lon: -7.999 },
  { lat: 31.602, lon: -7.998 },
];

/** Polygone convexe à 200 sommets (approximation d'un cercle). */
function polygone200() {
  const p = [];
  const lat0 = 31.6;
  const lon0 = -8.0;
  const r = 0.005; // ≈ 555 m
  const cosLat = Math.cos(lat0 * Math.PI / 180);
  for (let k = 0; k < 200; k++) {
    const th = 2 * Math.PI * k / 200;
    p.push({ lat: lat0 + r * Math.cos(th), lon: lon0 + r * Math.sin(th) / cosLat });
  }
  return p;
}

/** Première clé d'erreur renvoyée, ou '' si le polygone est accepté. */
function premiereErreur(sommets, options) {
  const r = validerPolygone(sommets, options);
  return r.valide ? '' : (r.erreurs[0]?.cle ?? 'erreur sans clé');
}

export const casPolygone = [
  // ── Cas nominaux ──
  {
    libelle: 'Quadrilatère régulier accepté',
    attendu: true,
    source: 'cahier des charges §3.2',
    executer: () => validerPolygone(CARRE).valide,
  },
  {
    libelle: 'Triangle (3 sommets) accepté',
    attendu: true,
    source: 'cahier des charges §7 (« 3 sommets »)',
    executer: () => validerPolygone(CARRE.slice(0, 3)).valide,
  },
  {
    libelle: 'Polygone à 200 sommets accepté',
    attendu: true,
    source: 'cahier des charges §7 (« 200 sommets »)',
    executer: () => validerPolygone(polygone200()).valide,
  },
  {
    libelle: 'Polygone à 200 sommets : aucun sommet perdu',
    attendu: 200,
    source: 'cahier des charges §7',
    executer: () => validerPolygone(polygone200()).sommets.length,
  },

  // ── Refus ──
  {
    libelle: 'Refus : 2 sommets seulement',
    attendu: 'polyErrTropPeuDeSommets',
    source: `cahier des charges §3.2 (minimum ${SOMMETS_MINIMUM})`,
    executer: () => premiereErreur(CARRE.slice(0, 2)),
  },
  {
    libelle: 'Refus : contour auto-intersecté (nœud papillon)',
    attendu: 'polyErrAutoIntersection',
    source: 'cahier des charges §3.2 (« polygone croisé → message clair, pas de calcul »)',
    executer: () => premiereErreur(PAPILLON),
  },
  {
    libelle: 'Contour croisé : aucune mesure renvoyée',
    attendu: true,
    source: 'cahier des charges §3.2 (« pas de calcul »)',
    executer: () => validerPolygone(PAPILLON).mesures === null,
  },
  {
    libelle: 'Refus : sommets alignés (polygone dégénéré)',
    attendu: 'polyErrDegenere',
    source: 'cahier des charges §7',
    executer: () => premiereErreur(ALIGNES),
  },
  {
    libelle: 'Refus : sommets confondus non consécutifs',
    attendu: 'polyErrSommetsConfondus',
    source: 'cahier des charges §3.2 (« détection des doublons de sommets »)',
    // Le 4e sommet revient exactement sur le 2e : le contour repasse par
    // un point déjà visité, ce qui n'est pas rattrapable automatiquement.
    executer: () => premiereErreur([CARRE[0], CARRE[1], CARRE[2], { ...CARRE[1] }, CARRE[3]]),
  },
  {
    libelle: 'Refus : latitude hors bornes',
    attendu: 'polyErrCoordonneesInvalides',
    source: 'garde-fou de saisie',
    executer: () => premiereErreur([CARRE[0], CARRE[1], { lat: 95, lon: -8 }]),
  },
  {
    libelle: 'Refus : coordonnée non numérique',
    attendu: 'polyErrCoordonneesInvalides',
    source: 'garde-fou de saisie (import de fichier notamment)',
    executer: () => premiereErreur([CARRE[0], CARRE[1], { lat: NaN, lon: -8 }]),
  },

  // ── Fermeture explicite et doublons consécutifs ──
  {
    libelle: 'Contour fermé explicitement : dernier sommet retiré',
    attendu: 4,
    source: 'fichiers SIG qui répètent le premier point à la fin',
    executer: () => validerPolygone([...CARRE, { ...CARRE[0] }]).sommets.length,
  },
  {
    libelle: 'Contour fermé explicitement : reste accepté',
    attendu: true,
    source: 'fichiers SIG',
    executer: () => validerPolygone([...CARRE, { ...CARRE[0] }]).valide,
  },
  {
    libelle: 'Contour fermé explicitement : avertissement émis',
    attendu: 'polyAvtDoublonsConsecutifs',
    source: '§5 — une correction automatique est toujours dite',
    executer: () => validerPolygone([...CARRE, { ...CARRE[0] }]).avertissements[0]?.cle ?? '',
  },
  {
    libelle: 'Double clic (sommet répété) retiré',
    attendu: 4,
    source: 'saisie à la carte',
    executer: () => retirerDoublonsConsecutifs([CARRE[0], { ...CARRE[0] }, CARRE[1], CARRE[2], CARRE[3]]).length,
  },

  // ── Sens de parcours ──
  {
    libelle: 'Sens horaire détecté et normalisé',
    attendu: true,
    source: 'cahier des charges §3.2 (« normalisation du sens de parcours »)',
    executer: () => validerPolygone(CARRE_HORAIRE).sensInverse,
  },
  {
    libelle: 'Sens direct laissé tel quel',
    attendu: false,
    source: 'cahier des charges §3.2',
    executer: () => validerPolygone(CARRE).sensInverse,
  },
  {
    libelle: 'Après normalisation, les deux sens donnent le même contour',
    attendu: true,
    source: 'cahier des charges §3.2',
    executer: () => {
      const a = validerPolygone(CARRE).sommets;
      const z = validerPolygone(CARRE_HORAIRE).sommets;
      return a.length === z.length && a.every((s, i) => s.lat === z[i].lat && s.lon === z[i].lon);
    },
  },
  {
    libelle: 'Normalisation idempotente',
    attendu: false,
    source: 'normaliser deux fois ne doit plus rien changer',
    executer: () => normaliserSens(normaliserSens(CARRE_HORAIRE).sommets).inverse,
  },
  {
    libelle: 'Le premier sommet reste en tête après normalisation',
    attendu: true,
    source: 'confort : la numérotation affichée ne doit pas sauter',
    executer: () => {
      const s = validerPolygone(CARRE_HORAIRE).sommets[0];
      return s.lat === CARRE_HORAIRE[0].lat && s.lon === CARRE_HORAIRE[0].lon;
    },
  },

  // ── Détecteurs pris isolément ──
  {
    libelle: 'detecterAutoIntersections : 1 croisement sur le papillon',
    attendu: 1,
    source: 'unité',
    executer: () => detecterAutoIntersections(PAPILLON).length,
  },
  {
    libelle: 'detecterAutoIntersections : aucun sur un carré',
    attendu: 0,
    source: 'unité',
    executer: () => detecterAutoIntersections(CARRE).length,
  },
  {
    libelle: 'detecterAutoIntersections : aucun sur 200 sommets convexes',
    attendu: 0,
    source: 'unité — vérifie l’absence de faux positif en O(n²)',
    executer: () => detecterAutoIntersections(polygone200()).length,
  },
  {
    libelle: 'detecterDoublons : aucun sur un carré',
    attendu: 0,
    source: 'unité',
    executer: () => detecterDoublons(CARRE).length,
  },
  {
    libelle: 'detecterDoublons : sommets à 0,5 m confondus (tolérance 1 m)',
    attendu: 1,
    // 0,000004° de latitude ≈ 0,44 m — sous la tolérance par défaut.
    source: 'unité — tolérance TOLERANCE_DOUBLON_M_DEFAUT',
    executer: () => detecterDoublons([CARRE[0], CARRE[1], { lat: CARRE[1].lat + 0.000004, lon: CARRE[1].lon }]).length,
  },
  {
    libelle: 'detecterDoublons : sommets à 11 m distincts',
    attendu: 0,
    // 0,0001° de latitude ≈ 11 m — bien au-dessus de la tolérance.
    source: 'unité — pas de faux positif',
    executer: () => detecterDoublons([CARRE[0], CARRE[1], { lat: CARRE[1].lat + 0.0001, lon: CARRE[1].lon }]).length,
  },

  // ── Appartenance et insertion ──
  {
    libelle: 'pointDansPolygone : centre du carré → dedans',
    attendu: true,
    source: 'étape 5 — « pas de calcul hors polygone »',
    executer: () => pointDansPolygone({ lat: 31.6015, lon: -7.998 }, CARRE),
  },
  {
    libelle: 'pointDansPolygone : point voisin extérieur → dehors',
    attendu: false,
    source: 'étape 5',
    executer: () => pointDansPolygone({ lat: 31.6015, lon: -7.9900 }, CARRE),
  },
  {
    libelle: 'pointDansPolygone : point très éloigné → dehors',
    attendu: false,
    source: 'étape 5',
    executer: () => pointDansPolygone({ lat: 0, lon: 0 }, CARRE),
  },
  {
    libelle: 'insererSommetSurCote : sommet inséré au bon rang',
    attendu: '31.6,31.6,31.6005,31.603,31.603',
    source: 'carte, mode 1 — clic sur un segment',
    executer: () => insererSommetSurCote(CARRE, 1, { lat: 31.6005, lon: -7.996 })
      .map(s => s.lat).join(','),
  },
  {
    libelle: 'insererSommetSurCote : le tableau source est inchangé',
    attendu: 4,
    source: 'immutabilité — React compare les références',
    executer: () => { insererSommetSurCote(CARRE, 1, { lat: 31.6005, lon: -7.996 }); return CARRE.length; },
  },

  // ── Mesures rendues ──
  {
    libelle: 'Un polygone valide porte sa surface et son périmètre',
    attendu: true,
    source: 'cahier des charges §6 (onglet Terrain)',
    executer: () => {
      const m = validerPolygone(CARRE).mesures;
      return m !== null && m.aire_m2 > 0 && m.perimetre_m > 0 && Number.isFinite(m.aire_ha);
    },
  },
  {
    libelle: 'Surface en hectares cohérente avec les m²',
    attendu: 0,
    source: 'cahier des charges §6',
    executer: () => {
      const m = validerPolygone(CARRE).mesures;
      return m.aire_ha - m.aire_m2 / 10000;
    },
  },
];

/**
 * unit-hydrologie-grille.test.js — remplissage de cuvette, D8, TWI (§7).
 * -----------------------------------------------------------------------
 * DEUX SCÉNARIOS SYNTHÉTIQUES, CALCULÉS À LA MAIN :
 *
 * 1) CUVETTE (remplissage) — grille 5×5, cellsize=10 m :
 *      i=4 :  100 100 100 100 100        (bord nord)
 *      i=3 :  100  90  90  90 100
 *      i=2 :  100  90 [50] 90 100   [50] = creux central
 *      i=1 :  100  90  80  90 100        80 = « col » au sud du centre
 *      i=0 :   30  30  30  30  30        (bord sud, bas : exutoire)
 *    (2,2)=50 n'a directement accès qu'à des voisins ≥ 80 ⇒ rempli à
 *    80+ε. Le reste de l'anneau a chacun un chemin direct vers un voisin
 *    déjà résolu à une altitude ≤ la sienne ⇒ inchangé. Ce scénario ne
 *    sert QU'au remplissage — voir le piège ci-dessous pour la direction.
 *
 * 2) TRANCHÉE (direction D8 + accumulation) — un bord aussi bas que celui
 *    ci-dessus crée un raccourci DIAGONAL compétitif avec un pas
 *    ORTHOGONAL vers l'intérieur (D8 choisit la pente la PLUS FORTE, pas
 *    le voisin le PLUS BAS — un voisin orthogonal proche mais un peu
 *    moins bas peut battre un voisin diagonal plus bas mais 1,41× plus
 *    loin). Un premier jeu de tests, tracé sur le scénario n°1, s'est
 *    révélé FAUX pour cette raison exacte à l'écriture de ce fichier :
 *    plusieurs cellules de l'anneau filaient tout droit vers le bord bas
 *    plutôt que de converger vers le col, contredisant le tracé à la
 *    main. D'où un second scénario, censé être SANS AMBIGUÏTÉ : une
 *    tranchée d'une cellule de large, encaissée dans un mur bien plus
 *    haut (500) que toute diagonale ne peut jamais concurrencer :
 *      trench (i=2) : 90 80 70 60 50 40 30   (j=0..6, strictement décroissante)
 *      tout le reste (i≠2) : 500
 *
 *    ⚠️ SECOND PIÈGE, trouvé en re-dérivant à la main une deuxième fois :
 *    la tranchée n'est PAS isolée du mur. Les rangées i=1 et i=3
 *    (immédiatement adjacentes à la tranchée) ont CHACUNE un voisin
 *    orthogonal dans la tranchée bien plus bas qu'elles (500 contre
 *    30-90) — cette pente écrase toujours la comparaison avec une
 *    diagonale (démontré : 500-T > 475,85 pour tout T de la tranchée,
 *    condition triviale ici), donc TOUTE cellule des rangées 1 et 3
 *    s'écoule directement, orthogonalement, dans la tranchée. Chaque
 *    colonne de la tranchée reçoit donc, en plus de l'apport de la
 *    colonne précédente : +1 (rangée 1) +1 (rangée 3) — d'où la chaîne
 *    3, 6, 9, 12, 15, 18, 21 (pas 1..7). Valeurs confirmées par un script
 *    de contrôle imprimant la grille de direction et d'accumulation
 *    complète avant d'être figées dans ce fichier — pas seulement
 *    re-dérivées à la main une troisième fois.
 * -----------------------------------------------------------------------
 */
import {
  remplirCuvettes, calculerDirectionsD8, calculerAccumulation, calculerTWI, calculerHydrologie,
  EPSILON_REMPLISSAGE_M,
} from '../src/calculations/hydrologieGrille.js';
import { calculerGrillesDerivees } from '../src/calculations/derivesMnt.js';

const CELLSIZE = 10;
const NB = 5;
const IDX = (i, j) => i * NB + j;

function grilleCuvette() {
  const Z = [
    [30, 30, 30, 30, 30],   // i=0
    [100, 90, 80, 90, 100], // i=1
    [100, 90, 50, 90, 100], // i=2
    [100, 90, 90, 90, 100], // i=3
    [100, 100, 100, 100, 100], // i=4
  ];
  const altitudes = new Float64Array(NB * NB);
  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) altitudes[IDX(i, j)] = Z[i][j];
  return { nbLignes: NB, nbColonnes: NB, cellsize_m: CELLSIZE, altitudes };
}

function grillePlanSansCreux() {
  const altitudes = new Float64Array(NB * NB);
  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) altitudes[IDX(i, j)] = 500 + i * 2 + j * 3;
  return { nbLignes: NB, nbColonnes: NB, cellsize_m: CELLSIZE, altitudes };
}

// ── Tranchée : cellsize identique, 5 lignes × 7 colonnes ──
const NBT_LIG = 5, NBT_COL = 7;
const IDXT = (i, j) => i * NBT_COL + j;
function grilleTranchee() {
  const altitudes = new Float64Array(NBT_LIG * NBT_COL);
  const trenche = [90, 80, 70, 60, 50, 40, 30]; // j=0..6, décroissante
  for (let i = 0; i < NBT_LIG; i++) {
    for (let j = 0; j < NBT_COL; j++) {
      altitudes[IDXT(i, j)] = i === 2 ? trenche[j] : 500;
    }
  }
  return { nbLignes: NBT_LIG, nbColonnes: NBT_COL, cellsize_m: CELLSIZE, altitudes };
}

const CUVETTE = grilleCuvette();
const W_CUVETTE = remplirCuvettes(CUVETTE);

const TRANCHEE = grilleTranchee();
const W_TRANCHEE = remplirCuvettes(TRANCHEE); // ne devrait RIEN changer : déjà monotone décroissante
const DIRECTIONS_T = calculerDirectionsD8(TRANCHEE, W_TRANCHEE);
const ACCUMULATION_T = calculerAccumulation(TRANCHEE, W_TRANCHEE, DIRECTIONS_T);

export const casHydrologieGrille = [
  // ── remplirCuvettes ──
  {
    libelle: 'Remplissage : aucun changement sur un plan sans creux',
    attendu: true,
    source: 'Planchon & Darboux (2001) — un plan a toujours un chemin descendant',
    executer: () => {
      const g = grillePlanSansCreux();
      const w = remplirCuvettes(g);
      return Array.from(w).every((v, i) => v === g.altitudes[i]);
    },
  },
  {
    libelle: 'Remplissage : le col (1,2)=80 reste INCHANGÉ (chemin direct vers le bord)',
    attendu: 80,
    tolerancePourcent: 1e-9,
    source: 'calcul à la main — voir en-tête du fichier',
    executer: () => W_CUVETTE[IDX(1, 2)],
  },
  {
    libelle: 'Remplissage : le creux central (2,2) est rempli JUSTE au-dessus du col (80+ε)',
    attendu: 80 + EPSILON_REMPLISSAGE_M,
    tolerancePourcent: 1e-6,
    source: 'calcul à la main',
    executer: () => W_CUVETTE[IDX(2, 2)],
  },
  {
    libelle: 'Remplissage : le creux central reste strictement sous 80+10ε (pas sur-rempli)',
    attendu: true,
    source: 'calcul à la main',
    executer: () => W_CUVETTE[IDX(2, 2)] < 80 + 10 * EPSILON_REMPLISSAGE_M,
  },
  {
    libelle: 'Remplissage : toutes les autres cellules intérieures inchangées',
    attendu: true,
    source: 'calcul à la main — chaque cellule a un chemin direct vers un voisin plus bas déjà résolu',
    executer: () => {
      const attendues = [[1, 1, 90], [1, 3, 90], [2, 1, 90], [2, 3, 90], [3, 1, 90], [3, 2, 90], [3, 3, 90]];
      return attendues.every(([i, j, z]) => Math.abs(W_CUVETTE[IDX(i, j)] - z) < 1e-9);
    },
  },
  {
    libelle: 'Remplissage : le bord de grille (bas, i=0) reste inchangé',
    attendu: true,
    source: 'un bord de grille est toujours un exutoire, jamais rempli',
    executer: () => [0, 1, 2, 3, 4].every((j) => W_CUVETTE[IDX(0, j)] === 30),
  },
  {
    libelle: 'Remplissage : préserve les trous (NaN) du MNT',
    attendu: true,
    source: '§4 — un trou reste un trou, jamais rempli',
    executer: () => {
      const g = grilleCuvette();
      g.altitudes[IDX(3, 3)] = NaN;
      const w = remplirCuvettes(g);
      return Number.isNaN(w[IDX(3, 3)]);
    },
  },

  // ── calculerDirectionsD8 (scénario tranchée — sans ambiguïté diagonale) ──
  {
    libelle: 'Remplissage : la tranchée, déjà monotone décroissante, n’est pas modifiée',
    attendu: true,
    source: 'régression — une pente qui s’écoule déjà ne doit jamais être touchée',
    executer: () => Array.from(W_TRANCHEE).every((v, k) => v === TRANCHEE.altitudes[k]),
  },
  ...[0, 1, 2, 3, 4, 5].map((j) => ({
    libelle: `D8 tranchée : (2,${j}) s’écoule vers (2,${j + 1}) — seul voisin plus bas, le mur (500) élimine toute diagonale`,
    attendu: IDXT(2, j + 1),
    source: 'calcul à la main — voir en-tête du fichier',
    executer: () => DIRECTIONS_T[IDXT(2, j)],
  })),
  {
    libelle: 'D8 tranchée : l’exutoire (2,6) n’a nulle part où aller (-1)',
    attendu: -1,
    source: 'tous ses voisins sont plus hauts (mur à 500, rien à l’est)',
    executer: () => DIRECTIONS_T[IDXT(2, 6)],
  },
  {
    libelle: 'D8 tranchée : une cellule du mur ÉLOIGNÉ (rangée 0, hors de portée) n’a pas de direction',
    attendu: -1,
    source: 'ses seuls voisins sont d’autres cellules du mur, à la même altitude (500) — pente nulle, aucune direction valide',
    executer: () => DIRECTIONS_T[IDXT(0, 0)],
  },
  {
    libelle: 'D8 tranchée : le mur ADJACENT (rangée 1) draine, lui, directement dans la tranchée',
    attendu: IDXT(2, 3),
    source: 'second piège trouvé en re-dérivant (voir en-tête) — 500 contre 60 écrase toute diagonale',
    executer: () => DIRECTIONS_T[IDXT(1, 3)],
  },

  // ── calculerAccumulation — chaîne 3, 6, 9, 12, 15, 18, 21 (voir en-tête :
  // chaque colonne reçoit aussi les rangées 1 et 3, pas seulement la
  // colonne précédente) ──
  ...[0, 1, 2, 3, 4, 5, 6].map((j) => ({
    libelle: `Accumulation tranchée : (2,${j}) = ${3 * (j + 1)}`,
    attendu: 3 * (j + 1),
    source: 'valeurs confirmées par script de contrôle avant d’être figées ici — voir en-tête',
    executer: () => ACCUMULATION_T[IDXT(2, j)],
  })),
  {
    libelle: 'Accumulation tranchée : le mur éloigné (rangée 0) ne reçoit rien (=1, lui-même seulement)',
    attendu: 1,
    source: 'hors de portée de la tranchée (à 2 cellules, jamais adjacent)',
    executer: () => ACCUMULATION_T[IDXT(0, 3)],
  },
  {
    libelle: 'Accumulation tranchée : le mur adjacent (rangée 1) ne reçoit rien non plus (=1) — il DONNE, il ne REÇOIT pas',
    attendu: 1,
    source: 'rien ne s’écoule vers le mur (toujours plus haut que la tranchée)',
    executer: () => ACCUMULATION_T[IDXT(1, 3)],
  },

  // ── calculerTWI ──
  {
    libelle: 'TWI : défini là où pente et accumulation existent (le long de la tranchée)',
    attendu: true,
    source: '§3.4 (« aire drainée + pente »)',
    executer: () => {
      const derivees = calculerGrillesDerivees(TRANCHEE);
      // pente_ratio n'est pas exposé par calculerGrillesDerivees (seulement
      // pente_pourcent) : reconstruire ratio = pourcent/100 pour ce test.
      const penteRatio = Float64Array.from(derivees.pente_pourcent, (v) => v / 100);
      const twi = calculerTWI(TRANCHEE, ACCUMULATION_T, penteRatio);
      return Number.isFinite(twi[IDXT(2, 3)]);
    },
  },
  {
    libelle: 'TWI : NaN au bord de grille (pente non définie)',
    attendu: true,
    source: '§4 — pas de valeur inventée en l’absence de pente',
    executer: () => {
      const derivees = calculerGrillesDerivees(TRANCHEE);
      const penteRatio = Float64Array.from(derivees.pente_pourcent, (v) => v / 100);
      const twi = calculerTWI(TRANCHEE, ACCUMULATION_T, penteRatio);
      return Number.isNaN(twi[IDXT(0, 0)]);
    },
  },
  {
    libelle: 'TWI : croît vers l’aval le long de la tranchée (aire drainée croissante, pente comparable)',
    attendu: true,
    source: '§3.4 (« fort ⇒ favorable ») — cohérence de sens sur toute la chaîne, pas un seul point',
    executer: () => {
      const derivees = calculerGrillesDerivees(TRANCHEE);
      const penteRatio = Float64Array.from(derivees.pente_pourcent, (v) => v / 100);
      const twi = calculerTWI(TRANCHEE, ACCUMULATION_T, penteRatio);
      // Points intérieurs de la tranchée uniquement (2,1)..(2,5) : les
      // extrémités (2,0),(2,6) sont des bords, pente non calculable (§4).
      for (let j = 1; j < 5; j++) {
        if (!(twi[IDXT(2, j + 1)] >= twi[IDXT(2, j)])) return false;
      }
      return true;
    },
  },

  // ── calculerHydrologie (orchestration) ──
  {
    libelle: 'calculerHydrologie : orchestration complète cohérente avec les fonctions séparées (cuvette)',
    attendu: true,
    source: 'cohérence interne',
    executer: () => {
      const derivees = calculerGrillesDerivees(CUVETTE);
      const penteRatio = Float64Array.from(derivees.pente_pourcent, (v) => v / 100);
      const r = calculerHydrologie(CUVETTE, penteRatio);
      return Math.abs(r.altitudesRemplies[IDX(2, 2)] - (80 + EPSILON_REMPLISSAGE_M)) < 1e-6;
    },
  },
  {
    libelle: 'calculerHydrologie : orchestration complète cohérente (tranchée, accumulation bout en bout)',
    attendu: 21,
    source: 'cohérence interne',
    executer: () => {
      const derivees = calculerGrillesDerivees(TRANCHEE);
      const penteRatio = Float64Array.from(derivees.pente_pourcent, (v) => v / 100);
      return calculerHydrologie(TRANCHEE, penteRatio).accumulation[IDXT(2, 6)];
    },
  },
  {
    libelle: 'calculerHydrologie : aireDrainage_m2 cohérente avec accumulation × surface de cellule',
    attendu: 21 * CELLSIZE * CELLSIZE,
    tolerancePourcent: 1e-9,
    source: 'unité',
    executer: () => {
      const derivees = calculerGrillesDerivees(TRANCHEE);
      const penteRatio = Float64Array.from(derivees.pente_pourcent, (v) => v / 100);
      return calculerHydrologie(TRANCHEE, penteRatio).aireDrainage_m2[IDXT(2, 6)];
    },
  },
];

/**
 * unit-derives-mnt.test.js — pente (Horn) et courbure (Zevenbergen-Thorne)
 * sur MNT synthétique (§7 : « Pente et TWI sur un MNT synthétique — plan
 * incliné, cuvette — dont le résultat est calculable analytiquement »).
 * -----------------------------------------------------------------------
 * PLAN INCLINÉ À PENTES EST/NORD DIFFÉRENTES (px ≠ py) : c'est le test le
 * plus important de ce fichier — il détecterait immédiatement une
 * inversion nord/sud ou est/ouest dans la re-dérivation des formules de
 * Horn (voir l'avertissement en tête de derivesMnt.js), ce qu'un plan à
 * pente symétrique (px=py) ne pourrait PAS détecter.
 *
 * PARABOLOÏDE (cuvette/dôme) : z=a(x²+y²) a des dérivées secondes
 * exactement constantes (2a), donc l'ajustement quadratique de
 * Zevenbergen-Thorne doit reconstruire D=E=a EXACTEMENT (pas
 * approximativement) en tout point intérieur — voir le calcul en tête de
 * derivesMnt.js pour la dérivation.
 * -----------------------------------------------------------------------
 */
import { calculerPente, calculerCourbure, calculerGrillesDerivees } from '../src/calculations/derivesMnt.js';

const CELLSIZE = 10; // m
const N = 9; // grille N×N, assez grande pour plusieurs cellules intérieures

/** Grille synthétique à partir d'une fonction z(x,y) — x=est, y=nord, en mètres. */
function grilleDe(f) {
  const nbLignes = N, nbColonnes = N;
  const altitudes = new Float64Array(nbLignes * nbColonnes);
  for (let i = 0; i < nbLignes; i++) {
    const y = i * CELLSIZE;
    for (let j = 0; j < nbColonnes; j++) {
      const x = j * CELLSIZE;
      altitudes[i * nbColonnes + j] = f(x, y);
    }
  }
  return { nbLignes, nbColonnes, cellsize_m: CELLSIZE, altitudes };
}

// Plan : dz/dx = 0.05 (5 % vers l'est), dz/dy = 0.02 (2 % vers le nord) — délibérément différents.
const PX = 0.05, PY = 0.02, Z0 = 500;
const PLAN = grilleDe((x, y) => Z0 + PX * x + PY * y);

// Paraboloïde (cuvette) centré au milieu de la grille.
const A_PARABOLOIDE = 0.002; // courbure douce, réaliste (≈ pente de 3,6 % à 90 m du centre)
const CENTRE_X = Math.floor(N / 2) * CELLSIZE;
const CENTRE_Y = Math.floor(N / 2) * CELLSIZE;
const CUVETTE = grilleDe((x, y) => A_PARABOLOIDE * ((x - CENTRE_X) ** 2 + (y - CENTRE_Y) ** 2));
const DOME = grilleDe((x, y) => -A_PARABOLOIDE * ((x - CENTRE_X) ** 2 + (y - CENTRE_Y) ** 2));

const IC = Math.floor(N / 2), JC = Math.floor(N / 2); // indice central, loin de tout bord

export const casDerivesMnt = [
  // ── Pente : plan incliné, résultat analytique exact ──
  {
    libelle: 'Pente : dz/dx (est) exact sur un plan',
    attendu: PX,
    tolerancePourcent: 1e-9,
    source: 'Horn (1981) — plan incliné, dérivée constante',
    executer: () => calculerPente(PLAN, IC, JC).dzdx,
  },
  {
    libelle: 'Pente : dz/dy (nord) exact sur un plan — détecte une inversion nord/sud',
    attendu: PY,
    tolerancePourcent: 1e-9,
    source: 'Horn (1981) — px≠py : une inversion nord/sud donnerait -0,02 au lieu de +0,02',
    executer: () => calculerPente(PLAN, IC, JC).dzdy,
  },
  {
    libelle: 'Pente : magnitude cohérente avec √(dzdx²+dzdy²)',
    attendu: Math.sqrt(PX * PX + PY * PY) * 100,
    tolerancePourcent: 1e-9,
    source: 'unité', executer: () => calculerPente(PLAN, IC, JC).pente_pourcent,
  },
  {
    libelle: 'Pente : identique en tout point intérieur (plan = pente constante)',
    attendu: 0,
    tolerancePourcent: 1e-9,
    source: 'propriété d’un plan',
    executer: () => calculerPente(PLAN, IC, JC).pente_pourcent - calculerPente(PLAN, 2, 3).pente_pourcent,
  },
  {
    libelle: 'Pente : null sur un bord de grille (voisinage 3×3 incomplet)',
    attendu: null,
    source: '§4 (« gestion explicite des bords ») — jamais un 0 silencieux',
    executer: () => calculerPente(PLAN, 0, JC),
  },
  {
    libelle: 'Pente : null au coin de grille',
    attendu: null,
    source: '§4', executer: () => calculerPente(PLAN, 0, 0),
  },
  {
    libelle: 'Pente : null si un voisin est un trou (NaN)',
    attendu: null,
    source: '§4 (« pas de remplissage silencieux par 0 »)',
    executer: () => {
      const g = grilleDe((x, y) => Z0 + PX * x + PY * y);
      g.altitudes[(IC + 1) * N + JC] = NaN; // voisin nord immédiat troué
      return calculerPente(g, IC, JC);
    },
  },
  {
    libelle: 'Pente : les cellules NON adjacentes au trou restent valides',
    attendu: true,
    source: '§4 — un trou local ne doit pas invalider toute la grille',
    executer: () => {
      const g = grilleDe((x, y) => Z0 + PX * x + PY * y);
      g.altitudes[(IC + 1) * N + JC] = NaN;
      return calculerPente(g, 2, 2) !== null;
    },
  },

  // ── Courbure : paraboloïde, résultat analytique exact ──
  {
    libelle: 'Courbure : D exact sur un paraboloïde (cuvette)',
    attendu: A_PARABOLOIDE,
    tolerancePourcent: 1e-6,
    source: 'Zevenbergen & Thorne (1987) — z=a(x²+y²) ⇒ D=E=a exactement',
    executer: () => calculerCourbure(CUVETTE, IC, JC).D,
  },
  {
    libelle: 'Courbure : E exact sur un paraboloïde (cuvette)',
    attendu: A_PARABOLOIDE,
    tolerancePourcent: 1e-6,
    source: 'Zevenbergen & Thorne (1987)',
    executer: () => calculerCourbure(CUVETTE, IC, JC).E,
  },
  {
    libelle: 'Courbure : F ≈ 0 sur un paraboloïde de révolution (pas de terme croisé)',
    attendu: 0,
    tolerancePourcent: 1e-9,
    source: 'z=a(x²+y²) n’a pas de terme xy',
    executer: () => calculerCourbure(CUVETTE, IC, JC).F,
  },
  {
    libelle: 'Courbure : cuvette ⇒ courbureTotale NÉGATIVE (concave, favorable)',
    attendu: -4 * A_PARABOLOIDE,
    tolerancePourcent: 1e-6,
    source: 'cahier des charges §3.4 (« concave ⇒ favorable ») — convention de signe vérifiée',
    executer: () => calculerCourbure(CUVETTE, IC, JC).courbureTotale,
  },
  {
    libelle: 'Courbure : dôme ⇒ courbureTotale POSITIVE (convexe)',
    attendu: 4 * A_PARABOLOIDE,
    tolerancePourcent: 1e-6,
    source: 'symétrique du cas cuvette',
    executer: () => calculerCourbure(DOME, IC, JC).courbureTotale,
  },
  {
    libelle: 'Courbure : D constant en tout point (paraboloïde exact partout, pas seulement au centre)',
    attendu: A_PARABOLOIDE,
    tolerancePourcent: 1e-6,
    source: 'z=a(x²+y²) : dérivées secondes constantes sur tout le domaine',
    executer: () => calculerCourbure(CUVETTE, 2, 3).D,
  },
  {
    libelle: 'Courbure : plan ⇒ courbureTotale nulle (pas de courbure)',
    attendu: 0,
    tolerancePourcent: 1e-9,
    source: 'un plan n’a pas de courbure',
    executer: () => calculerCourbure(PLAN, IC, JC).courbureTotale,
  },
  {
    libelle: 'Courbure : courbureProfil/Plan indéfinies sur un plat (gradient nul)',
    attendu: true,
    source: 'singularité connue et documentée — division par G²+H²',
    executer: () => {
      const g = grilleDe(() => 500); // parfaitement plat
      const c = calculerCourbure(g, IC, JC);
      return c.courbureProfil === null && c.courburePlan === null;
    },
  },
  {
    libelle: 'Courbure : null sur un bord de grille',
    attendu: null,
    source: '§4', executer: () => calculerCourbure(PLAN, 0, JC),
  },

  // ── calculerGrillesDerivees : application sur toute la grille ──
  {
    libelle: 'Grille dérivée : bord de grille = NaN (pas 0)',
    attendu: true,
    source: '§4', executer: () => Number.isNaN(calculerGrillesDerivees(PLAN).pente_pourcent[0]),
  },
  {
    libelle: 'Grille dérivée : cellule intérieure = valeur attendue',
    attendu: Math.sqrt(PX * PX + PY * PY) * 100,
    tolerancePourcent: 1e-9,
    source: '§4', executer: () => calculerGrillesDerivees(PLAN).pente_pourcent[IC * N + JC],
  },
  {
    libelle: 'Grille dérivée : (N-2)² cellules intérieures valides sur un plan sans trou',
    attendu: (N - 2) * (N - 2),
    source: 'cohérence — exactement les cellules à 1 de distance du bord',
    executer: () => calculerGrillesDerivees(PLAN).cellulesValides,
  },
];

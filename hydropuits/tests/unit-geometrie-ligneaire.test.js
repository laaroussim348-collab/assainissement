/**
 * unit-geometrie-ligneaire.test.js — densité linéaire et distance aux
 * lignes, sur géométrie plane calculable analytiquement (§7).
 * -----------------------------------------------------------------------
 * Origine locale FACTICE pour rendre les calculs à la main triviaux :
 * mParDegLat = mParDegLon = 1000, lat0 = lon0 = 0, donc 0,001° = 1 m
 * EXACTEMENT (pas de vrai rapport degré/mètre ici — sans importance,
 * ces fonctions ne consomment l'origine que mécaniquement, sans savoir
 * qu'il s'agit de vrais degrés). Grille 3×3, cellsize=100 m, centres en
 * (0,0), (100,0), (200,0) / … / (0,200)…(200,200) — la cellule (1,1) est
 * exactement au centre, en (100,100).
 *
 * Tous les résultats attendus sont des formes closes de géométrie
 * élémentaire (corde d'un cercle 2√(R²-d²), distance point-segment) —
 * aucune valeur recopiée d'ailleurs.
 * -----------------------------------------------------------------------
 */
import { calculerDensiteLigneaire, calculerDistanceLignes } from '../src/calculations/geometrieLigneaire.js';

const ORIGINE = { lat0: 0, lon0: 0, mParDegLat: 1000, mParDegLon: 1000 };
// lat/lon ici = x/y en mètres locaux, divisés par 1000 (voir ORIGINE ci-dessus).
const versLL = (x, y) => ({ lat: y / 1000, lon: x / 1000 });

function grille3x3(masqueTout1 = true) {
  const nbLignes = 3, nbColonnes = 3, cellsize_m = 100;
  const masque = new Uint8Array(9).fill(masqueTout1 ? 1 : 0);
  return { nbLignes, nbColonnes, cellsize_m, xmin: 0, ymin: 0, masque };
}
const IDX3 = (i, j) => i * 3 + j;

// Ligne horizontale à y=100, traversant EXACTEMENT le centre de la cellule (1,1)=(100,100).
const LIGNE_CENTRALE = [[versLL(-1000, 100), versLL(1000, 100)]];
// Ligne verticale à x=150 (décalée de 50 m du centre de (1,1)).
const LIGNE_DECALEE = [[versLL(150, -1000), versLL(150, 1000)]];
// Segment démarrant PILE au centre (100,100) et s'éloignant vers le nord.
const SEGMENT_DEPUIS_CENTRE = [[versLL(100, 100), versLL(100, 500)]];
// Ligne très loin (hors de tout rayon raisonnable).
const LIGNE_LOINTAINE = [[versLL(10000, 10000), versLL(11000, 10000)]];

export const casGeometrieLigneaire = [
  // ── calculerDensiteLigneaire ──
  {
    libelle: 'Densité : corde complète (ligne traversant le centre, R=50) = 2R/1000 sur π(R/1000)²',
    attendu: (2 * 50 / 1000) / (Math.PI * (50 / 1000) ** 2),
    tolerancePourcent: 1e-9,
    source: '§3.4 — géométrie du cercle, corde passant par le centre',
    executer: () => calculerDensiteLigneaire(grille3x3(), ORIGINE, LIGNE_CENTRALE, 50)[IDX3(1, 1)],
  },
  {
    libelle: 'Densité : corde décalée de 50 m, R=60 ⇒ 2√(R²-d²)',
    attendu: (2 * Math.sqrt(60 ** 2 - 50 ** 2) / 1000) / (Math.PI * (60 / 1000) ** 2),
    tolerancePourcent: 1e-6,
    source: '§3.4 — corde d’un cercle à distance perpendiculaire d < R',
    executer: () => calculerDensiteLigneaire(grille3x3(), ORIGINE, LIGNE_DECALEE, 60)[IDX3(1, 1)],
  },
  {
    libelle: 'Densité : ligne hors de portée du rayon ⇒ 0',
    attendu: 0,
    source: '§3.4', executer: () => calculerDensiteLigneaire(grille3x3(), ORIGINE, LIGNE_DECALEE, 20)[IDX3(1, 1)],
  },
  {
    libelle: 'Densité : segment démarrant au centre, R=50 ⇒ longueur dans le cercle = R exactement',
    attendu: (50 / 1000) / (Math.PI * (50 / 1000) ** 2),
    tolerancePourcent: 1e-9,
    source: 'calcul à la main — voir en-tête du fichier de test (t1=-0,125, t2=0,125, borné à [0,1])',
    executer: () => calculerDensiteLigneaire(grille3x3(), ORIGINE, SEGMENT_DEPUIS_CENTRE, 50)[IDX3(1, 1)],
  },
  {
    libelle: 'Densité : deux lignes se cumulent (additivité)',
    attendu: true,
    source: 'un noyau de densité additionne toutes les lignes présentes',
    executer: () => {
      const g = grille3x3();
      const seule = calculerDensiteLigneaire(g, ORIGINE, LIGNE_CENTRALE, 50)[IDX3(1, 1)];
      const deux = calculerDensiteLigneaire(g, ORIGINE, [...LIGNE_CENTRALE, ...LIGNE_CENTRALE], 50)[IDX3(1, 1)];
      return Math.abs(deux - 2 * seule) < 1e-9;
    },
  },
  {
    libelle: 'Densité : NaN hors du masque (§3.4 « pas de calcul hors polygone »)',
    attendu: true,
    source: '§3.4',
    executer: () => Number.isNaN(calculerDensiteLigneaire(grille3x3(false), ORIGINE, LIGNE_CENTRALE, 50)[IDX3(1, 1)]),
  },
  {
    libelle: 'Densité : refuse un rayon nul ou négatif',
    attendu: 'refus',
    source: 'garde-fou',
    executer: () => { try { calculerDensiteLigneaire(grille3x3(), ORIGINE, LIGNE_CENTRALE, 0); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'Densité : aucune ligne fournie ⇒ 0 partout dans le polygone (pas d’erreur)',
    attendu: 0,
    source: 'robustesse — couche vide ≠ couche cassée',
    executer: () => calculerDensiteLigneaire(grille3x3(), ORIGINE, [], 50)[IDX3(1, 1)],
  },

  // ── calculerDistanceLignes ──
  {
    libelle: 'Distance : cellule sur la ligne ⇒ 0',
    attendu: 0,
    tolerancePourcent: 1e-9,
    source: '§3.4', executer: () => calculerDistanceLignes(grille3x3(), ORIGINE, LIGNE_CENTRALE)[IDX3(1, 1)],
  },
  {
    libelle: 'Distance : cellule (0,0) [x=0,y=0] à 100 m de la ligne horizontale y=100',
    attendu: 100,
    tolerancePourcent: 1e-9,
    source: '§3.4', executer: () => calculerDistanceLignes(grille3x3(), ORIGINE, LIGNE_CENTRALE)[IDX3(0, 0)],
  },
  {
    libelle: 'Distance : cellule (1,1) à 50 m de la ligne décalée (x=150)',
    attendu: 50,
    tolerancePourcent: 1e-9,
    source: '§3.4', executer: () => calculerDistanceLignes(grille3x3(), ORIGINE, LIGNE_DECALEE)[IDX3(1, 1)],
  },
  {
    libelle: 'Distance : prend le MINIMUM sur plusieurs lignes',
    attendu: 50,
    tolerancePourcent: 1e-9,
    source: '§3.4 (« proche ⇒ favorable » — c’est la plus proche qui compte)',
    executer: () => calculerDistanceLignes(grille3x3(), ORIGINE, [...LIGNE_LOINTAINE, ...LIGNE_DECALEE])[IDX3(1, 1)],
  },
  {
    libelle: 'Distance : NaN hors du masque',
    attendu: true,
    source: '§3.4', executer: () => Number.isNaN(calculerDistanceLignes(grille3x3(false), ORIGINE, LIGNE_CENTRALE)[IDX3(1, 1)]),
  },
  {
    libelle: 'Distance : +Infinity (pas NaN) si aucune ligne — couche manquante, pas « hors polygone »',
    attendu: true,
    source: '§5 — distinguer explicitement une couche absente d’un calcul hors zone',
    executer: () => calculerDistanceLignes(grille3x3(), ORIGINE, [])[IDX3(1, 1)] === Infinity,
  },
];

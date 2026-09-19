/**
 * unit-favorabilite.test.js — combinaison pondérée des classes en score
 * de favorabilité, classement des meilleurs points (§3.4, §5, §7).
 * -----------------------------------------------------------------------
 * Grille 3×3 synthétique, origine locale FACTICE (mêmes conventions que
 * unit-geometrie-ligneaire.test.js : 0,001° = 1 m exactement, pour que
 * les coordonnées du classement se vérifient de tête). Deux facteurs
 * synthétiques a/b dont les classes et la combinaison pondérée sont
 * calculées à la main (arithmétique élémentaire, pas de boîte noire).
 * -----------------------------------------------------------------------
 */
import {
  reclasserTousLesFacteurs, combinerFavorabilite, classerMeilleursPoints, detailPoint,
} from '../src/calculations/favorabilite.js';

const ORIGINE = { lat0: 0, lon0: 0, mParDegLat: 1000, mParDegLon: 1000 };
const GRILLE = { nbLignes: 3, nbColonnes: 3, cellsize_m: 100, xmin: 0, ymin: 0, origine: ORIGINE };

// a croît de gauche à droite (1..5 par ligne, motif répété), b décroît en miroir.
const CLASSE_A = Float64Array.from([1, 2, 3, 4, 5, 1, 2, 3, 4]);
const CLASSE_B = Float64Array.from([5, 4, 3, 2, 1, 5, 4, 3, 2]);
const GRILLES_CLASSES = { a: CLASSE_A, b: CLASSE_B };
const POIDS = { a: 0.6, b: 0.4 };
// score[idx] = a[idx]*0.6 + b[idx]*0.4 — calculé à la main :
// [2.6, 2.8, 3.0, 3.2, 3.4, 2.6, 2.8, 3.0, 3.2]
const SCORE_ATTENDU = [2.6, 2.8, 3.0, 3.2, 3.4, 2.6, 2.8, 3.0, 3.2];

const MASQUE_TOUT = new Uint8Array(9).fill(1);

export const casFavorabilite = [
  // ── combinerFavorabilite ──
  ...SCORE_ATTENDU.map((v, idx) => ({
    libelle: `Combinaison : score[${idx}] = ${v} (a×0,6 + b×0,4, calculé à la main)`,
    attendu: v, tolerancePourcent: 1e-9,
    source: 'arithmétique élémentaire — voir en-tête du fichier',
    executer: () => combinerFavorabilite(GRILLES_CLASSES, POIDS, MASQUE_TOUT).score[idx],
  })),
  {
    libelle: 'Combinaison : reste dans [1,5] (poids normalisés à 1, classes 1..5 — jamais un pourcentage, §5)',
    attendu: true, source: '§5',
    executer: () => SCORE_ATTENDU.every((v) => v >= 1 && v <= 5),
  },
  {
    libelle: 'Combinaison : NaN hors masque',
    attendu: true, source: '§5',
    executer: () => {
      const masque = new Uint8Array([0, 1, 1, 1, 1, 1, 1, 1, 1]);
      return Number.isNaN(combinerFavorabilite(GRILLES_CLASSES, POIDS, masque).score[0]);
    },
  },
  {
    libelle: 'Combinaison : nHorsMasque compte correctement',
    attendu: 1, source: '§5',
    executer: () => {
      const masque = new Uint8Array([0, 1, 1, 1, 1, 1, 1, 1, 1]);
      return combinerFavorabilite(GRILLES_CLASSES, POIDS, masque).nHorsMasque;
    },
  },
  {
    libelle: 'Combinaison : UN SEUL facteur actif manquant à une cellule invalide TOUT son score (pas de moyenne partielle silencieuse)',
    attendu: true, source: '§5 — voir en-tête de favorabilite.js',
    executer: () => {
      const a = Float64Array.from(CLASSE_A); a[2] = NaN; // b[2]=3 reste fini
      const r = combinerFavorabilite({ a, b: CLASSE_B }, POIDS, MASQUE_TOUT);
      return Number.isNaN(r.score[2]) && r.nManquantes === 1;
    },
  },
  {
    libelle: 'Combinaison : un facteur de poids 0 (désactivé) ne compte pas, même avec une donnée manquante',
    attendu: true, source: '§3.4 — un facteur désactivé est totalement hors du calcul',
    executer: () => {
      const a = Float64Array.from(CLASSE_A); a[2] = NaN;
      const r = combinerFavorabilite({ a, b: CLASSE_B }, { a: 0, b: 1 }, MASQUE_TOUT);
      return Number.isFinite(r.score[2]) && Math.abs(r.score[2] - CLASSE_B[2]) < 1e-9;
    },
  },
  {
    libelle: 'Combinaison : refuse si aucun facteur actif',
    attendu: 'refus', source: 'garde-fou',
    executer: () => { try { combinerFavorabilite(GRILLES_CLASSES, { a: 0, b: 0 }, MASQUE_TOUT); return 'aucun refus'; } catch { return 'refus'; } },
  },

  // ── classerMeilleursPoints ──
  {
    libelle: 'Classement : la cellule (i=1,j=1), score=3,4, est 1ère',
    attendu: true, source: 'calcul à la main',
    executer: () => {
      const { score } = combinerFavorabilite(GRILLES_CLASSES, POIDS, MASQUE_TOUT);
      const classement = classerMeilleursPoints(GRILLE, score, 3);
      return classement[0].i === 1 && classement[0].j === 1 && Math.abs(classement[0].score - 3.4) < 1e-9 && classement[0].rang === 1;
    },
  },
  {
    libelle: 'Classement : coordonnées géographiques correctes (x=100,y=100 ⇒ lat=0,1, lon=0,1, voir ORIGINE)',
    attendu: true, source: 'grilleLocale.versGeographique — même convention que unit-geometrie-ligneaire.test.js',
    executer: () => {
      const { score } = combinerFavorabilite(GRILLES_CLASSES, POIDS, MASQUE_TOUT);
      const classement = classerMeilleursPoints(GRILLE, score, 1);
      return Math.abs(classement[0].lat - 0.1) < 1e-9 && Math.abs(classement[0].lon - 0.1) < 1e-9;
    },
  },
  {
    libelle: 'Classement : ordre strictement décroissant',
    attendu: true, source: '§3.4',
    executer: () => {
      const { score } = combinerFavorabilite(GRILLES_CLASSES, POIDS, MASQUE_TOUT);
      const classement = classerMeilleursPoints(GRILLE, score, 9);
      return classement.every((c, k) => k === 0 || classement[k - 1].score >= c.score);
    },
  },
  {
    libelle: 'Classement : n limite bien le nombre de points renvoyés',
    attendu: 3, source: '§3.4',
    executer: () => {
      const { score } = combinerFavorabilite(GRILLES_CLASSES, POIDS, MASQUE_TOUT);
      return classerMeilleursPoints(GRILLE, score, 3).length;
    },
  },
  {
    libelle: 'Classement : les cellules NaN sont exclues, jamais classées par défaut',
    attendu: 8, source: '§5',
    executer: () => {
      const masque = new Uint8Array([0, 1, 1, 1, 1, 1, 1, 1, 1]);
      const { score } = combinerFavorabilite(GRILLES_CLASSES, POIDS, masque);
      return classerMeilleursPoints(GRILLE, score, 20).length; // 9 cellules - 1 hors masque = 8
    },
  },
  {
    libelle: 'Classement : refuse un n non positif',
    attendu: 'refus', source: 'garde-fou',
    executer: () => { try { classerMeilleursPoints(GRILLE, SCORE_ATTENDU, 0); return 'aucun refus'; } catch { return 'refus'; } },
  },

  // ── reclasserTousLesFacteurs (orchestration légère sur reclassement.js) ──
  {
    libelle: 'reclasserTousLesFacteurs : reclasse chaque facteur avec SES PROPRES seuils/sens',
    attendu: true, source: '§3.4',
    executer: () => {
      const brutes = { pente: Float64Array.from([1, 15, 30]), twi: Float64Array.from([1, 15, 30]) };
      const masque = new Uint8Array([1, 1, 1]);
      const seuils = { pente: [2, 5, 10, 20], twi: [2, 5, 10, 20] };
      const sens = { pente: 'decroissant', twi: 'croissant' };
      const { grillesClasses } = reclasserTousLesFacteurs(brutes, masque, seuils, sens);
      // pente=15 -> classeBrute4 -> décroissant -> 6-4=2 ; twi=15 -> classeBrute4 -> croissant -> 4
      return grillesClasses.pente[1] === 2 && grillesClasses.twi[1] === 4;
    },
  },
  {
    libelle: 'reclasserTousLesFacteurs : remonte les comptes manquantes/hors-masque par facteur',
    attendu: true, source: '§5',
    executer: () => {
      const brutes = { pente: Float64Array.from([NaN, 15, 30]) };
      const masque = new Uint8Array([1, 1, 0]);
      const { comptesParFacteur } = reclasserTousLesFacteurs(brutes, masque, { pente: [2, 5, 10, 20] }, { pente: 'croissant' });
      return comptesParFacteur.pente.nManquantes === 1 && comptesParFacteur.pente.nHorsMasque === 1;
    },
  },

  // ── detailPoint ──
  {
    libelle: 'detailPoint : détaille la contribution de chaque facteur actif à une cellule',
    attendu: true, source: '§5 — traçabilité d’un score',
    executer: () => {
      const d = detailPoint(GRILLES_CLASSES, POIDS, 4); // a=5,b=1
      return d.a.classe === 5 && Math.abs(d.a.contribution - 3.0) < 1e-9
        && d.b.classe === 1 && Math.abs(d.b.contribution - 0.4) < 1e-9;
    },
  },
  {
    libelle: 'detailPoint : ignore les facteurs de poids nul',
    attendu: true, source: '§3.4',
    executer: () => {
      const d = detailPoint(GRILLES_CLASSES, { a: 1, b: 0 }, 4);
      return ('a' in d) && !('b' in d);
    },
  },
  {
    libelle: 'detailPoint : classe null (pas 0) si la donnée manque à cette cellule',
    attendu: true, source: '§5',
    executer: () => {
      const a = Float64Array.from(CLASSE_A); a[4] = NaN;
      const d = detailPoint({ a, b: CLASSE_B }, POIDS, 4);
      return d.a.classe === null && d.a.contribution === null;
    },
  },
];

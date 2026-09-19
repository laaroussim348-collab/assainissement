/**
 * unit-sensibilite.test.js — analyse de sensibilité ±20 % des poids AHP
 * (§3.4 : « analyse de sensibilité obligatoire », §7).
 * -----------------------------------------------------------------------
 * Même grille 3×3 et mêmes classes synthétiques (CLASSE_A/CLASSE_B) que
 * unit-favorabilite.test.js, pour rester directement comparable. Les
 * valeurs de `perturberPoids` sur 2 et 3 facteurs sont vérifiées par
 * arithmétique élémentaire (redistribution proportionnelle : la somme
 * doit rester 1, et le RAPPORT entre deux facteurs non perturbés doit
 * être invariant — propriété caractéristique d'une redistribution
 * proportionnelle, pas une coïncidence numérique). Les écarts moyens de
 * `analyserSensibilite` sont recalculés par un script jetable (même
 * méthodologie que unit-ahp.test.js/unit-hydrologie-grille.test.js) puis
 * relus ici.
 * -----------------------------------------------------------------------
 */
import { perturberPoids, analyserSensibilite, AMPLITUDE_SENSIBILITE } from '../src/calculations/sensibilite.js';

const ORIGINE = { lat0: 0, lon0: 0, mParDegLat: 1000, mParDegLon: 1000 };
const GRILLE = { nbLignes: 3, nbColonnes: 3, cellsize_m: 100, xmin: 0, ymin: 0, origine: ORIGINE };
const CLASSE_A = Float64Array.from([1, 2, 3, 4, 5, 1, 2, 3, 4]);
const CLASSE_B = Float64Array.from([5, 4, 3, 2, 1, 5, 4, 3, 2]);
const GRILLES_CLASSES = { a: CLASSE_A, b: CLASSE_B };
const MASQUE_TOUT = new Uint8Array(9).fill(1);

export const casSensibilite = [
  {
    libelle: 'AMPLITUDE_SENSIBILITE = 0,20 (±20 %, imposé par §3.4/§7)',
    attendu: 0.20, source: '§3.4, §7', executer: () => AMPLITUDE_SENSIBILITE,
  },

  // ── perturberPoids : redistribution proportionnelle (2 facteurs) ──
  {
    libelle: 'perturberPoids : {a:0.6,b:0.4}, a+20% ⇒ a=0,72 exactement (0,6×1,2)',
    attendu: 0.72, tolerancePourcent: 1e-9,
    source: 'arithmétique élémentaire', executer: () => perturberPoids({ a: 0.6, b: 0.4 }, 'a', 0.2).a,
  },
  {
    libelle: 'perturberPoids : {a:0.6,b:0.4}, a+20% ⇒ b redistribué à 0,28 (somme=1)',
    attendu: 0.28, tolerancePourcent: 1e-9,
    source: 'arithmétique élémentaire', executer: () => perturberPoids({ a: 0.6, b: 0.4 }, 'a', 0.2).b,
  },
  {
    libelle: 'perturberPoids : {a:0.6,b:0.4}, a-20% ⇒ a=0,48, b=0,52',
    attendu: true, source: 'arithmétique élémentaire',
    executer: () => {
      const r = perturberPoids({ a: 0.6, b: 0.4 }, 'a', -0.2);
      return Math.abs(r.a - 0.48) < 1e-9 && Math.abs(r.b - 0.52) < 1e-9;
    },
  },
  {
    libelle: 'perturberPoids : la somme reste EXACTEMENT 1 après perturbation',
    attendu: true, source: 'propriété de la redistribution proportionnelle',
    executer: () => {
      const r = perturberPoids({ a: 0.6, b: 0.4 }, 'a', 0.2);
      return Math.abs(r.a + r.b - 1) < 1e-12;
    },
  },

  // ── perturberPoids : 3 facteurs, proportion préservée entre les non-perturbés ──
  {
    libelle: 'perturberPoids : {a:0.5,b:0.3,c:0.2}, b+20% ⇒ rapport a/c INCHANGÉ (2,5)',
    attendu: 2.5, tolerancePourcent: 1e-9,
    source: 'propriété caractéristique d’une redistribution PROPORTIONNELLE (pas une coïncidence)',
    executer: () => {
      const r = perturberPoids({ a: 0.5, b: 0.3, c: 0.2 }, 'b', 0.2);
      return r.a / r.c;
    },
  },
  {
    libelle: 'perturberPoids : {a:0.5,b:0.3,c:0.2}, b+20% ⇒ somme = 1',
    attendu: true, source: 'propriété de la redistribution proportionnelle',
    executer: () => {
      const r = perturberPoids({ a: 0.5, b: 0.3, c: 0.2 }, 'b', 0.2);
      return Math.abs(r.a + r.b + r.c - 1) < 1e-9;
    },
  },

  // ── perturberPoids : cas limite, clampé à 1 ──
  {
    libelle: 'perturberPoids : {a:0.95,b:0.05}, a+20% (⇒1,14) est BORNÉ à 1',
    attendu: 1, tolerancePourcent: 1e-9,
    source: 'garde-fou — un poids ne peut jamais dépasser 1',
    executer: () => perturberPoids({ a: 0.95, b: 0.05 }, 'a', 0.2).a,
  },
  {
    libelle: 'perturberPoids : refuse de perturber un facteur inactif (poids nul ou absent)',
    attendu: 'refus', source: 'garde-fou',
    executer: () => { try { perturberPoids({ a: 0.6, b: 0.4, c: 0 }, 'c', 0.2); return 'aucun refus'; } catch { return 'refus'; } },
  },

  // ── analyserSensibilite : valeurs calculées par le module lui-même (script jetable, voir en-tête) ──
  {
    libelle: 'Sensibilité : score de référence identique à combinerFavorabilite (cohérence interne)',
    attendu: 3.4, tolerancePourcent: 1e-9,
    source: 'cohérence — même formule que favorabilite.combinerFavorabilite',
    executer: () => analyserSensibilite(GRILLE, GRILLES_CLASSES, { a: 0.6, b: 0.4 }, MASQUE_TOUT).scoreReference[4],
  },
  {
    libelle: 'Sensibilité : facteur « a » (poids 0,6) — écart moyen absolu à la hausse = 0,26667 (calculé)',
    attendu: 0.26666666666666655, tolerancePourcent: 1e-6,
    source: 'valeur calculée par analyserSensibilite() elle-même (script jetable)',
    executer: () => {
      const r = analyserSensibilite(GRILLE, GRILLES_CLASSES, { a: 0.6, b: 0.4 }, MASQUE_TOUT);
      return r.resultats.find((x) => x.id === 'a').hausse.ecartMoyenAbsolu;
    },
  },
  {
    libelle: 'Sensibilité : facteur « b » (poids 0,4) — écart moyen absolu à la hausse = 0,17778 (calculé)',
    attendu: 0.17777777777777778, tolerancePourcent: 1e-6,
    source: 'valeur calculée (script jetable)',
    executer: () => {
      const r = analyserSensibilite(GRILLE, GRILLES_CLASSES, { a: 0.6, b: 0.4 }, MASQUE_TOUT);
      return r.resultats.find((x) => x.id === 'b').hausse.ecartMoyenAbsolu;
    },
  },
  {
    libelle: 'Sensibilité : le facteur au poids le plus élevé (a) a l’écart maximal le plus grand ⇒ trié en tête',
    attendu: 'a', source: '§3.4 — identifier le(s) facteur(s) le(s) plus influent(s)',
    executer: () => analyserSensibilite(GRILLE, GRILLES_CLASSES, { a: 0.6, b: 0.4 }, MASQUE_TOUT).resultats[0].id,
  },
  {
    libelle: 'Sensibilité : « a » à -20% change le meilleur point (calculé — cas non trivial vérifié)',
    attendu: false, source: 'valeur calculée (script jetable) — le point i=1,j=1 cesse d’être le meilleur',
    executer: () => analyserSensibilite(GRILLE, GRILLES_CLASSES, { a: 0.6, b: 0.4 }, MASQUE_TOUT)
      .resultats.find((x) => x.id === 'a').baisse.meilleurPointIdentique,
  },
  {
    libelle: 'Sensibilité : « b » à +20% ET -20% NE change PAS le meilleur point (calculé)',
    attendu: true, source: 'valeur calculée (script jetable)',
    executer: () => {
      const b = analyserSensibilite(GRILLE, GRILLES_CLASSES, { a: 0.6, b: 0.4 }, MASQUE_TOUT).resultats.find((x) => x.id === 'b');
      return b.hausse.meilleurPointIdentique === true && b.baisse.meilleurPointIdentique === true;
    },
  },
  {
    libelle: 'Sensibilité : un seul facteur actif ⇒ insuffisant=true, aucun résultat (rien à comparer)',
    attendu: true, source: '§5 — le dire explicitement plutôt qu’un tableau vide sans explication',
    executer: () => {
      const r = analyserSensibilite(GRILLE, GRILLES_CLASSES, { a: 1, b: 0 }, MASQUE_TOUT);
      return r.insuffisant === true && r.resultats.length === 0;
    },
  },
  {
    libelle: 'Sensibilité : amplitude personnalisée respectée (±10% au lieu de ±20%)',
    attendu: true, source: '§3.4 — amplitude paramétrable',
    executer: () => {
      const r = analyserSensibilite(GRILLE, GRILLES_CLASSES, { a: 0.6, b: 0.4 }, MASQUE_TOUT, { amplitude: 0.10 });
      const a = r.resultats.find((x) => x.id === 'a');
      return Math.abs(a.hausse.poids - 0.6 * 1.1) < 1e-9 && r.amplitude === 0.10;
    },
  },
];

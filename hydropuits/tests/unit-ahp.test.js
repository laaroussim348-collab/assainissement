/**
 * unit-ahp.test.js — moteur AHP : vecteur propre, cohérence (CI/CR),
 * refus explicite, renormalisation (§3.4, §4, §7).
 * -----------------------------------------------------------------------
 * MÉTHODOLOGIE (leçon tirée de tests/unit-hydrologie-grille.test.js,
 * dont l'en-tête raconte deux dérivations à la main erronées de suite) :
 * aucune valeur attendue ci-dessous n'est recopiée « à vue d'œil ». Les
 * cas 1, 3 et 5 reposent sur des PROPRIÉTÉS ANALYTIQUES vérifiables
 * indépendamment du code (une matrice construite comme ratios exacts
 * d'un vecteur est mathématiquement PARFAITEMENT cohérente, CI=CR=0 —
 * ce n'est pas une coïncidence numérique, c'est la définition même de
 * la cohérence de Saaty) ; les cas 4 et 6 utilisent des valeurs
 * calculées par le module lui-même via un script jetable puis relues
 * ici — jamais l'inverse.
 * -----------------------------------------------------------------------
 */
import {
  IDS_FACTEURS, INDICE_ALEATOIRE_SAATY, SEUIL_CR_MAX, MATRICE_DEFAUT_AHP,
  validerStructureMatrice, calculerVecteurProprePrincipal, calculerLambdaMax,
  evaluerCoherence, calculerPoidsAhp, pairesLesPlusIncoherentes,
  associerPoids, construireMatriceDepuisComparaisons, renormaliserPoids,
} from '../src/calculations/ahp.js';

const MATRICE_INDIFFERENTE_5 = Array.from({ length: 5 }, () => new Array(5).fill(1));

// Ratios EXACTS d'un vecteur de poids connu w=[8,4,2,1] : par
// définition, aᵢⱼ=wᵢ/wⱼ décrit une matrice PARFAITEMENT cohérente
// (Saaty 1980) — λmax=n=4 exactement, CI=CR=0. Poids attendus normalisés :
// 8/15, 4/15, 2/15, 1/15.
const W_CONNU = [8, 4, 2, 1];
const MATRICE_COHERENTE_4 = Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => W_CONNU[i] / W_CONNU[j]));

// Cycle A≫B≫C≫A (a12=9, a23=9, a13=1/9) : intransitivité maximale sur
// l'échelle de Saaty, cas d'école d'incohérence extrême (n=3, RI=0,58).
const MATRICE_CYCLIQUE_INCOHERENTE = [
  [1, 9, 1 / 9],
  [1 / 9, 1, 9],
  [9, 1 / 9, 1],
];

export const casAhp = [
  // ── Constantes ──
  {
    libelle: 'IDS_FACTEURS : les 8 facteurs du cahier des charges (§3.4), aucun de plus, aucun de moins',
    attendu: true,
    source: '§3.4',
    executer: () => IDS_FACTEURS.length === 8
      && new Set(IDS_FACTEURS).size === 8
      && ['pente', 'twi', 'densiteDrainage', 'densiteLineaments', 'distanceCoursEau', 'courbure', 'lithologieSol', 'pluviometrie']
        .every((id) => IDS_FACTEURS.includes(id)),
  },
  {
    libelle: 'INDICE_ALEATOIRE_SAATY : RI(3)=0,58 (Saaty 1980, table RI)',
    attendu: 0.58, executer: () => INDICE_ALEATOIRE_SAATY[2],
    source: 'Saaty (1980), The Analytic Hierarchy Process — confirmé par recherche à l’étape 1',
  },
  {
    libelle: 'SEUIL_CR_MAX = 0,10 (seuil conventionnel de Saaty)',
    attendu: 0.10, executer: () => SEUIL_CR_MAX, source: 'Saaty (1980)',
  },

  // ── Matrice parfaitement cohérente (propriété analytique) ──
  {
    libelle: 'Vecteur propre : matrice cohérente (w=[8,4,2,1]) ⇒ poids[0] = 8/15 EXACTEMENT',
    attendu: 8 / 15, tolerancePourcent: 1e-9,
    source: 'définition de la cohérence de Saaty — aᵢⱼ=wᵢ/wⱼ ⇒ le vecteur propre EST w normalisé',
    executer: () => calculerVecteurProprePrincipal(MATRICE_COHERENTE_4)[0],
  },
  {
    libelle: 'Vecteur propre : matrice cohérente ⇒ poids[3] = 1/15 EXACTEMENT',
    attendu: 1 / 15, tolerancePourcent: 1e-9,
    source: 'idem', executer: () => calculerVecteurProprePrincipal(MATRICE_COHERENTE_4)[3],
  },
  {
    libelle: 'λmax d’une matrice parfaitement cohérente = n EXACTEMENT (propriété de Saaty)',
    attendu: 4, tolerancePourcent: 1e-9,
    source: 'Saaty (1980) — λmax=n ssi la matrice est parfaitement cohérente',
    executer: () => calculerLambdaMax(MATRICE_COHERENTE_4, calculerVecteurProprePrincipal(MATRICE_COHERENTE_4)),
  },
  {
    libelle: 'CR d’une matrice parfaitement cohérente = 0',
    attendu: true, source: 'idem',
    executer: () => Math.abs(evaluerCoherence(MATRICE_COHERENTE_4).cr) < 1e-9,
  },
  {
    libelle: 'calculerPoidsAhp accepte une matrice parfaitement cohérente (ne refuse pas à tort)',
    attendu: true, source: '§5 — pas de faux refus',
    executer: () => { calculerPoidsAhp(MATRICE_COHERENTE_4); return true; },
  },

  // ── Matrice d’indifférence totale (n=5, tous les aᵢⱼ=1) ──
  {
    libelle: 'Indifférence totale (tous facteurs jugés égaux) ⇒ poids égaux 1/5 chacun',
    attendu: 0.2, tolerancePourcent: 1e-9,
    source: 'cas trivial : un facteur ne peut pas peser plus qu’un autre s’ils sont tous jugés équivalents',
    executer: () => calculerVecteurProprePrincipal(MATRICE_INDIFFERENTE_5)[2],
  },
  {
    libelle: 'Indifférence totale ⇒ CR = 0',
    attendu: true, source: 'idem',
    executer: () => Math.abs(evaluerCoherence(MATRICE_INDIFFERENTE_5).cr) < 1e-9,
  },

  // ── Matrice cyclique très incohérente ──
  {
    libelle: 'Cycle A≫B≫C≫A : CR très supérieur au seuil (calculé : ≈6,130)',
    attendu: 6.1302681992337185, tolerancePourcent: 1e-6,
    source: 'valeur calculée par evaluerCoherence() elle-même (script jetable, voir en-tête)',
    executer: () => evaluerCoherence(MATRICE_CYCLIQUE_INCOHERENTE).cr,
  },
  {
    libelle: 'Cycle A≫B≫C≫A : coherent=false',
    attendu: false, source: '§5',
    executer: () => evaluerCoherence(MATRICE_CYCLIQUE_INCOHERENTE).coherent,
  },
  {
    libelle: 'calculerPoidsAhp REFUSE une matrice trop incohérente (§3.4, §5 — jamais un poids qui a l’air valide)',
    attendu: 'AHP_INCOHERENT',
    source: '§5',
    executer: () => { try { calculerPoidsAhp(MATRICE_CYCLIQUE_INCOHERENTE); return 'aucun refus'; } catch (e) { return e.code; } },
  },
  {
    libelle: 'Refus : la paire la plus incohérente désignée est (2,3) — comparaison a23=9 la plus contradictoire avec le poids implicite',
    attendu: true, source: 'valeur calculée (script jetable) : écart relatif 8,000 pour (2,3), 7,9999… pour (1,2)',
    executer: () => {
      const { poids } = evaluerCoherence(MATRICE_CYCLIQUE_INCOHERENTE);
      const paires = pairesLesPlusIncoherentes(MATRICE_CYCLIQUE_INCOHERENTE, poids, 3);
      return paires.length === 3 && paires[0].i === 2 && paires[0].j === 3;
    },
  },

  // ── Matrice par défaut (§3.4) ──
  {
    libelle: 'MATRICE_DEFAUT_AHP : taille 8×8',
    attendu: true, source: '§3.4',
    executer: () => MATRICE_DEFAUT_AHP.length === 8 && MATRICE_DEFAUT_AHP.every((l) => l.length === 8),
  },
  {
    libelle: 'MATRICE_DEFAUT_AHP : cohérente (CR < 0,10), calculé — pas visé a priori',
    attendu: true, source: 'valeur calculée par evaluerCoherence() elle-même, voir commentaire dans ahp.js',
    executer: () => evaluerCoherence(MATRICE_DEFAUT_AHP).coherent,
  },
  {
    libelle: 'MATRICE_DEFAUT_AHP : la densité de linéaments (rang 1 par défaut) reçoit le poids le plus élevé',
    attendu: true, source: '§3.4 — cohérence du classement avec l’ordre déclaré dans ahp.js',
    executer: () => {
      const { poids } = evaluerCoherence(MATRICE_DEFAUT_AHP);
      const idxLineaments = IDS_FACTEURS.indexOf('densiteLineaments');
      return poids.every((p, i) => i === idxLineaments || p <= poids[idxLineaments]);
    },
  },
  {
    libelle: 'calculerPoidsAhp(MATRICE_DEFAUT_AHP) : les poids somment à 1',
    attendu: true, source: 'propriété de normalisation du vecteur propre',
    executer: () => {
      const { poids } = calculerPoidsAhp(MATRICE_DEFAUT_AHP);
      return Math.abs(poids.reduce((s, v) => s + v, 0) - 1) < 1e-9;
    },
  },

  // ── validerStructureMatrice ──
  {
    libelle: 'validerStructureMatrice : accepte une matrice valide (aucune erreur)',
    attendu: 0, source: 'garde-fou', executer: () => validerStructureMatrice(MATRICE_COHERENTE_4).length,
  },
  {
    libelle: 'validerStructureMatrice : détecte une matrice non carrée',
    attendu: true, source: 'garde-fou',
    executer: () => validerStructureMatrice([[1, 2], [0.5, 1, 3]]).some((e) => e.cle === 'ahpErrMatriceNonCarree'),
  },
  {
    libelle: 'validerStructureMatrice : détecte une diagonale ≠ 1',
    attendu: true, source: 'garde-fou',
    executer: () => validerStructureMatrice([[2, 1], [1, 1]]).some((e) => e.cle === 'ahpErrDiagonaleInvalide'),
  },
  {
    libelle: 'validerStructureMatrice : détecte une paire non réciproque (a12·a21 ≠ 1)',
    attendu: true, source: 'garde-fou',
    executer: () => validerStructureMatrice([[1, 3], [3, 1]]).some((e) => e.cle === 'ahpErrNonReciproque'),
  },
  {
    libelle: 'validerStructureMatrice : détecte une valeur non positive',
    attendu: true, source: 'garde-fou',
    executer: () => validerStructureMatrice([[1, -2], [-0.5, 1]]).some((e) => e.cle === 'ahpErrValeurNonPositive'),
  },

  // ── construireMatriceDepuisComparaisons ──
  {
    libelle: 'construireMatriceDepuisComparaisons : diagonale à 1 et réciproques correctes',
    attendu: true, source: '§3.4 — construction depuis le triangle supérieur seul',
    executer: () => {
      const m = construireMatriceDepuisComparaisons(['a', 'b', 'c'], { '0-1': 3, '0-2': 5, '1-2': 2 });
      return m[0][0] === 1 && m[1][1] === 1 && m[2][2] === 1
        && m[1][0] === 1 / 3 && m[2][0] === 1 / 5 && m[2][1] === 1 / 2
        && m[0][1] === 3 && m[0][2] === 5 && m[1][2] === 2;
    },
  },
  {
    libelle: 'construireMatriceDepuisComparaisons : refuse une paire manquante',
    attendu: 'refus', source: 'garde-fou',
    executer: () => { try { construireMatriceDepuisComparaisons(['a', 'b', 'c'], { '0-1': 3 }); return 'aucun refus'; } catch { return 'refus'; } },
  },

  // ── associerPoids ──
  {
    libelle: 'associerPoids : associe correctement identifiants et vecteur positionnel',
    attendu: true, source: '§3.4',
    executer: () => {
      const obj = associerPoids(['a', 'b', 'c'], [0.5, 0.3, 0.2]);
      return obj.a === 0.5 && obj.b === 0.3 && obj.c === 0.2;
    },
  },

  // ── renormaliserPoids (§3.4 : « renormalisation automatique » — test explicite requis par §7) ──
  {
    libelle: 'renormaliserPoids : désactiver un facteur renormalise les autres à somme=1',
    attendu: true, source: '§3.4, §7',
    executer: () => {
      const r = renormaliserPoids({ a: 0.4, b: 0.3, c: 0.3 }, ['a', 'b']);
      return Math.abs(r.a - 0.4 / 0.7) < 1e-12 && Math.abs(r.b - 0.3 / 0.7) < 1e-12 && r.c === 0
        && Math.abs(r.a + r.b - 1) < 1e-12;
    },
  },
  {
    libelle: 'renormaliserPoids : tous facteurs actifs ⇒ poids inchangés',
    attendu: true, source: 'cas limite',
    executer: () => {
      const r = renormaliserPoids({ a: 0.5, b: 0.5 }, ['a', 'b']);
      return Math.abs(r.a - 0.5) < 1e-12 && Math.abs(r.b - 0.5) < 1e-12;
    },
  },
  {
    libelle: 'renormaliserPoids : refuse si aucun facteur actif',
    attendu: 'refus', source: 'garde-fou — une somme nulle ne peut pas être divisée',
    executer: () => { try { renormaliserPoids({ a: 0.5, b: 0.5 }, []); return 'aucun refus'; } catch { return 'refus'; } },
  },

  // ── Convergence (§4) ──
  {
    libelle: 'calculerVecteurProprePrincipal : refuse une matrice structurellement invalide plutôt que de calculer sur des données incohérentes',
    attendu: 'refus', source: '§4, §5',
    executer: () => { try { calculerVecteurProprePrincipal([[1, 2], [1, 1]]); return 'aucun refus'; } catch { return 'refus'; } },
  },
];

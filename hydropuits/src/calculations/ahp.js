// ============================================================
//  ahp.js — Moteur AHP (Analytic Hierarchy Process, Saaty) : poids des
//  facteurs, contrôle de cohérence, renormalisation.
//  ─────────────────────────────────────────────────────────────
//  §3.4 impose une pondération MULTICRITÈRE PAR AHP UNIQUEMENT (« pas
//  d'apprentissage automatique ») : les 8 facteurs sont comparés deux à
//  deux sur l'échelle de Saaty (1 à 9 et leurs inverses), et le poids
//  de chaque facteur est le VECTEUR PROPRE PRINCIPAL de la matrice de
//  comparaisons — pas une simple moyenne des colonnes normalisées
//  (approximation répandue mais moins précise, cf. Saaty 1980/2008).
//
//  VECTEUR PROPRE : puissance itérée (power iteration), normalisée à
//  chaque étape, jusqu'à ce que le poids de CHAQUE facteur cesse de
//  bouger de plus de CONVERGENCE_VECTEUR_PROPRE d'une itération à
//  l'autre (critère de convergence explicite — §4 : une méthode
//  itérative doit déclarer son critère et échouer bruyamment si elle ne
//  converge pas, jamais renvoyer silencieusement un résultat approché).
//
//  COHÉRENCE (CI/CR) — Saaty, T.L. (1980), *The Analytic Hierarchy
//  Process*, McGraw-Hill : indice de cohérence CI = (λmax − n)/(n − 1),
//  ratio de cohérence CR = CI / RI(n). La table RI (indice aléatoire
//  moyen, matrices tirées au hasard) est reprise identique dans la
//  quasi-totalité des études AHP appliquées à la prospection
//  hydrogéologique consultées pour ce projet (ex. AHP appliqué aux
//  zones à potentiel d'eaux souterraines, Natham Taluk, Tamil Nadu,
//  Scientific Reports, https://www.nature.com/articles/s41598-025-13829-z,
//  consulté le 19/09/2026 — CI/CR calculés de façon identique). Seuil
//  d'acceptation CR < 0,10 : c'est le seuil de Saaty lui-même, pas un
//  choix de ce projet. CR ≥ 0,10 ⇒ refus explicite de produire un poids
//  (§5 : jamais un chiffre qui a l'air valide sur une comparaison
//  incohérente).
//
//  DÉFAUTS DE LA MATRICE (MATRICE_DEFAUT_AHP, plus bas) — honnêteté
//  scientifique (§4, §8 : jamais un chiffre inventé, jamais une
//  référence inventée) : AUCUNE publication ne fournit une matrice 8×8
//  pour exactement cet ensemble de 8 facteurs, et les études publiées
//  ne s'accordent PAS entre elles sur des poids numériques — deux
//  recherches menées pour ce projet (19/09/2026) l'illustrent : l'une
//  trouve la densité de linéaments, la pente et la densité de drainage
//  en tête ; une autre (facteurs proches mais différents) donne
//  lithologie 38 %, occupation du sol 16 %, TWI 14 %, densité de
//  linéaments 10 %, pente 9 %, densité de drainage 7 %, sol 3 %,
//  pluviométrie 3 %. MATRICE_DEFAUT_AHP n'est donc PAS la reproduction
//  d'une matrice publiée : c'est un ORDRE relatif défendable pour un
//  socle fracturé (linéaments et pente en tête ; pluviométrie en
//  dernier, car quasi uniforme à l'échelle d'une seule parcelle — donc
//  peu discriminante ICI, même si son importance hydrogéologique
//  générale n'est pas en cause), construit pour être cohérent (CR
//  vérifié par test) et ENTIÈREMENT modifiable : le CR reste recalculé
//  et affiché à chaque modification (§3.4).
//
//  CE MODULE EST PUR : aucun accès réseau ni disque.
//  Couvert par tests/unit-ahp.test.js.
// ============================================================

/**
 * Identifiants des 8 facteurs du cahier des charges (§3.4), dans l'ordre
 * où ils y sont énumérés. Cet ordre est celui de TOUT état applicatif
 * qui indexe les facteurs par position (ex. un vecteur de poids) — ne
 * pas le changer sans mettre à jour les modules qui en dépendent.
 */
export const IDS_FACTEURS = [
  'pente',
  'twi',
  'densiteDrainage',
  'densiteLineaments',
  'distanceCoursEau',
  'courbure',
  'lithologieSol',
  'pluviometrie',
];

/**
 * Table RI (indice aléatoire moyen) de Saaty pour n = 1..10 comparaisons.
 * ORIGINE : Saaty (1980), *The Analytic Hierarchy Process* — valeurs
 * reprises telles quelles dans les études consultées pour ce projet
 * (voir en-tête de fichier), confirmées une seconde fois par recherche
 * ciblée à l'étape 6 (19/09/2026). Indexée à partir de n=1 (RI[n-1]).
 */
export const INDICE_ALEATOIRE_SAATY = [0, 0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49];

/**
 * Seuil de ratio de cohérence au-delà duquel une matrice de comparaisons
 * est jugée trop incohérente pour produire un poids exploitable.
 * ORIGINE : Saaty (1980) — seuil conventionnel de 0,10, universellement
 * repris dans la littérature AHP (y compris toutes les études
 * hydrogéologiques consultées pour ce projet). Ce n'est pas un réglage
 * de ce logiciel.
 */
export const SEUIL_CR_MAX = 0.10;

/** Écart relatif maximal toléré entre deux itérations du vecteur propre. */
const CONVERGENCE_VECTEUR_PROPRE = 1e-12;

/**
 * Nombre maximal d'itérations avant échec déclaré. La puissance itérée
 * converge en pratique en quelques dizaines d'itérations pour une
 * matrice de taille ≤ 10 (Saaty) — cette marge est volontairement très
 * large pour ne jamais interrompre un cas légitime, tout en restant
 * finie (§4 : pas de boucle qui pourrait tourner indéfiniment).
 */
const MAX_ITERATIONS_VECTEUR_PROPRE = 1000;

/**
 * Vérifie qu'une matrice a la forme attendue d'une matrice de
 * comparaisons de Saaty : carrée, diagonale à 1, réciproque
 * (m[j][i] = 1/m[i][j]) et strictement positive.
 *
 * Ne lève jamais d'exception : renvoie la liste des problèmes (clés de
 * traduction + paramètres, même convention que polygone.js) pour que
 * l'UI l'affiche telle quelle.
 *
 * @returns {{cle:string, params?:object}[]}
 */
export function validerStructureMatrice(matrice) {
  const erreurs = [];
  if (!Array.isArray(matrice) || matrice.length === 0) {
    return [{ cle: 'ahpErrMatriceVide' }];
  }
  const n = matrice.length;
  for (const ligne of matrice) {
    if (!Array.isArray(ligne) || ligne.length !== n) {
      return [{ cle: 'ahpErrMatriceNonCarree', params: { taille: n } }];
    }
  }
  for (let i = 0; i < n; i++) {
    if (!(matrice[i][i] > 0) || Math.abs(matrice[i][i] - 1) > 1e-9) {
      erreurs.push({ cle: 'ahpErrDiagonaleInvalide', params: { ligne: i + 1 } });
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = matrice[i][j];
      const b = matrice[j][i];
      if (!(a > 0) || !(b > 0)) {
        erreurs.push({ cle: 'ahpErrValeurNonPositive', params: { i: i + 1, j: j + 1 } });
        continue;
      }
      if (Math.abs(a * b - 1) > 1e-6) {
        erreurs.push({ cle: 'ahpErrNonReciproque', params: { i: i + 1, j: j + 1 } });
      }
    }
  }
  return erreurs;
}

/**
 * Vecteur propre principal d'une matrice de comparaisons, par puissance
 * itérée : w ← normaliser(M·w), répété jusqu'à convergence.
 *
 * @returns {number[]} poids normalisés (somme = 1)
 * @throws si la matrice est structurellement invalide, ou si la méthode
 *   ne converge pas en MAX_ITERATIONS_VECTEUR_PROPRE itérations (§4 :
 *   échec explicite plutôt qu'un nombre silencieusement approché).
 */
export function calculerVecteurProprePrincipal(matrice) {
  const erreurs = validerStructureMatrice(matrice);
  if (erreurs.length > 0) {
    throw new Error(`calculerVecteurProprePrincipal : matrice invalide — ${JSON.stringify(erreurs)}`);
  }
  const n = matrice.length;
  let w = new Array(n).fill(1 / n);
  for (let iter = 0; iter < MAX_ITERATIONS_VECTEUR_PROPRE; iter++) {
    const mw = matrice.map((ligne) => ligne.reduce((s, v, j) => s + v * w[j], 0));
    const somme = mw.reduce((s, v) => s + v, 0);
    const wSuivant = mw.map((v) => v / somme);
    let ecartMax = 0;
    for (let i = 0; i < n; i++) ecartMax = Math.max(ecartMax, Math.abs(wSuivant[i] - w[i]));
    w = wSuivant;
    if (ecartMax < CONVERGENCE_VECTEUR_PROPRE) return w;
  }
  throw new Error(
    `calculerVecteurProprePrincipal : pas de convergence après ${MAX_ITERATIONS_VECTEUR_PROPRE} itérations ` +
    `(§4 — échec explicite, jamais un poids approché en silence).`
  );
}

/**
 * λmax de la matrice pour un vecteur de poids donné :
 * λmax = (1/n) · Σᵢ (M·w)ᵢ / wᵢ — définition standard AHP (Saaty 1980).
 */
export function calculerLambdaMax(matrice, poids) {
  const n = matrice.length;
  let somme = 0;
  for (let i = 0; i < n; i++) {
    const mwi = matrice[i].reduce((s, v, j) => s + v * poids[j], 0);
    somme += mwi / poids[i];
  }
  return somme / n;
}

/**
 * Évalue la cohérence d'une matrice de comparaisons : poids (vecteur
 * propre principal), λmax, indice de cohérence CI, ratio de cohérence
 * CR, et si CR passe sous SEUIL_CR_MAX.
 *
 * Pour n ≤ 2, une matrice réciproque est TOUJOURS parfaitement cohérente
 * (il n'existe qu'une seule comparaison, rien à contredire) — cas
 * particulier de Saaty, géré explicitement pour éviter une division par
 * l'indice aléatoire RI(n)=0.
 */
export function evaluerCoherence(matrice) {
  const n = matrice.length;
  const poids = calculerVecteurProprePrincipal(matrice);
  const lambdaMax = calculerLambdaMax(matrice, poids);
  const ci = n > 2 ? (lambdaMax - n) / (n - 1) : 0;
  const ri = INDICE_ALEATOIRE_SAATY[n - 1];
  const cr = ri > 0 ? ci / ri : 0;
  return { poids, lambdaMax, ci, cr, coherent: cr < SEUIL_CR_MAX };
}

/**
 * Identifie les paires de facteurs qui contribuent le plus à
 * l'incohérence : celles où la valeur saisie s'écarte le plus du
 * rapport de poids qu'elle impliquerait si la matrice était parfaitement
 * cohérente (aᵢⱼ = wᵢ/wⱼ). Sert à guider l'utilisateur vers LES
 * comparaisons à revoir en priorité, plutôt qu'un simple refus non
 * exploitable (§5).
 *
 * @returns {{i:number, j:number, ecartRelatif:number}[]} indices 1-based,
 *   triés par écart décroissant.
 */
export function pairesLesPlusIncoherentes(matrice, poids, top = 3) {
  const n = matrice.length;
  const ecarts = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ratioImplicite = poids[i] / poids[j];
      const ecartRelatif = Math.abs(matrice[i][j] - ratioImplicite) / ratioImplicite;
      ecarts.push({ i: i + 1, j: j + 1, ecartRelatif });
    }
  }
  ecarts.sort((a, b) => b.ecartRelatif - a.ecartRelatif);
  return ecarts.slice(0, top);
}

/**
 * Point d'entrée principal : poids AHP d'une matrice de comparaisons,
 * REFUSÉ explicitement si la matrice est trop incohérente (§3.4, §5).
 *
 * @returns {{poids:number[], lambdaMax:number, ci:number, cr:number}}
 * @throws {Error & {code:'AHP_INCOHERENT', cr:number, pairesProblematiques}}
 *   si CR ≥ SEUIL_CR_MAX — jamais un poids qui a l'air valide.
 */
export function calculerPoidsAhp(matrice) {
  const { poids, lambdaMax, ci, cr, coherent } = evaluerCoherence(matrice);
  if (!coherent) {
    const paires = pairesLesPlusIncoherentes(matrice, poids);
    const err = new Error(
      `calculerPoidsAhp : matrice de comparaisons trop incohérente (CR=${cr.toFixed(3)} ≥ ${SEUIL_CR_MAX}) — ` +
      `révisez en priorité les comparaisons ${paires.map((p) => `(${p.i},${p.j})`).join(', ')}.`
    );
    err.code = 'AHP_INCOHERENT';
    err.cr = cr;
    err.pairesProblematiques = paires;
    throw err;
  }
  return { poids, lambdaMax, ci, cr };
}

/** Associe un vecteur de poids positionnel aux identifiants de facteurs. */
export function associerPoids(ids, poidsVecteur) {
  const obj = {};
  ids.forEach((id, i) => { obj[id] = poidsVecteur[i]; });
  return obj;
}

/**
 * Construit une matrice complète à partir des seules comparaisons du
 * triangle supérieur (n(n-1)/2 valeurs), la diagonale et le triangle
 * inférieur (réciproques) étant déduits — c'est la forme sous laquelle
 * une interface fait saisir les comparaisons (une case par paire, pas
 * une matrice entière à remplir deux fois).
 *
 * @param {string[]} ids  identifiants des facteurs, dans l'ordre voulu
 * @param {object} valeurs  { "i-j": valeurSaaty } pour i<j (indices dans
 *   `ids`) ; valeurSaaty > 1 signifie « ids[i] plus important que ids[j] ».
 */
export function construireMatriceDepuisComparaisons(ids, valeurs) {
  const n = ids.length;
  const m = Array.from({ length: n }, () => new Array(n).fill(1));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = valeurs[`${i}-${j}`];
      if (!(v > 0)) {
        throw new Error(`construireMatriceDepuisComparaisons : valeur manquante ou invalide pour la paire ${ids[i]}/${ids[j]}.`);
      }
      m[i][j] = v;
      m[j][i] = 1 / v;
    }
  }
  return m;
}

/**
 * Renormalise des poids par facteur pour que seuls les facteurs ACTIFS
 * comptent, en gardant leurs proportions relatives, somme = 1 (§3.4 :
 * « chaque facteur activable/désactivable, avec renormalisation
 * automatique des poids »). Les facteurs inactifs reçoivent un poids de
 * 0 (conservés dans l'objet renvoyé, pour ne rien faire disparaître de
 * l'état applicatif — seulement la contribution au calcul).
 *
 * @param {object} poidsParFacteur  { id: poids }
 * @param {string[]|Set<string>} facteursActifs
 */
export function renormaliserPoids(poidsParFacteur, facteursActifs) {
  const actifs = facteursActifs instanceof Set ? facteursActifs : new Set(facteursActifs);
  const somme = Object.entries(poidsParFacteur)
    .filter(([id]) => actifs.has(id))
    .reduce((s, [, v]) => s + v, 0);
  if (!(somme > 0)) {
    throw new Error('renormaliserPoids : aucun facteur actif (ou somme de poids nulle) — rien à renormaliser.');
  }
  const resultat = {};
  for (const [id, v] of Object.entries(poidsParFacteur)) {
    resultat[id] = actifs.has(id) ? v / somme : 0;
  }
  return resultat;
}

// ── Matrice par défaut ─────────────────────────────────────────
// Rang d'importance par défaut (1 = le plus important), voir
// justification et réserves dans l'en-tête du fichier.
const RANG_IMPORTANCE_DEFAUT = {
  densiteLineaments: 1,
  pente: 2,
  densiteDrainage: 3,
  twi: 4,
  distanceCoursEau: 5,
  lithologieSol: 6,
  courbure: 7,
  pluviometrie: 8,
};

/**
 * Valeur de Saaty pour un écart de rang donné, construite comme une
 * suite géométrique de raison 2 (rang adjacent ⇒ 2, deux rangs d'écart
 * ⇒ 4, trois rangs d'écart ⇒ 8), PLAFONNÉE à 9. Ce plafond n'est pas
 * une limite technique : c'est l'échelle de Saaty (1980) elle-même, qui
 * s'arrête à 9 (« importance absolue ») — au-delà, l'échelle ne
 * distingue plus rien de plus. Une suite géométrique (plutôt que
 * linéaire) est utilisée pour que la matrice obtenue reste PROCHE de la
 * cohérence parfaite : une matrice exactement cohérente vérifie
 * aᵢⱼ = wᵢ/wⱼ, une relation MULTIPLICATIVE, pas additive.
 */
function valeurSaatyDepuisEcartRang(ecart) {
  return Math.min(9, 2 ** ecart);
}

/** Construit une matrice de comparaisons à partir d'un classement de rangs. */
function matriceDepuisRangs(ids, rangs) {
  const n = ids.length;
  const m = Array.from({ length: n }, () => new Array(n).fill(1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const ri = rangs[ids[i]];
      const rj = rangs[ids[j]];
      const valeur = valeurSaatyDepuisEcartRang(Math.abs(ri - rj));
      m[i][j] = ri < rj ? valeur : 1 / valeur;
    }
  }
  return m;
}

/**
 * Matrice de comparaisons par défaut pour les 8 facteurs (§3.4), dans
 * l'ordre de IDS_FACTEURS. Voir l'en-tête du fichier pour la
 * justification bibliographique et ses limites assumées. Entièrement
 * modifiable par l'utilisateur — ce n'est qu'un POINT DE DÉPART cohérent :
 * CR = 0,079 (< 0,10), valeur CALCULÉE par ce module lui-même et vérifiée
 * dans tests/unit-ahp.test.js — pas une valeur visée a priori.
 */
export const MATRICE_DEFAUT_AHP = matriceDepuisRangs(IDS_FACTEURS, RANG_IMPORTANCE_DEFAUT);

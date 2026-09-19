// ============================================================
//  reclassement.js — Reclassement d'un facteur brut en 5 classes de
//  favorabilité (§3.4 : « chaque facteur reclassifié 1 à 5, sur seuils
//  éditables »).
//  ─────────────────────────────────────────────────────────────
//  CONVENTION DE CLASSE : 1 = le moins favorable, 5 = le plus favorable,
//  IDENTIQUE pour les 8 facteurs — c'est ce qui permet à ahp.js de
//  combiner ensuite les classes par une simple somme pondérée (étape 7)
//  sans que chaque facteur n'ait sa propre convention à retenir.
//
//  4 SEUILS DÉLIMITENT 5 CLASSES, bornes fermées à gauche / ouvertes à
//  droite (sauf la dernière) : [s1,s2,s3,s4] partagent l'axe des
//  valeurs BRUTES en [-∞,s1), [s1,s2), [s2,s3), [s3,s4), [s4,+∞) — le
//  SENS (croissant/décroissant) décide ensuite si la tranche la plus
//  basse ou la plus haute reçoit la classe 5.
//
//  SEUILS PAR DÉFAUT — honnêteté scientifique (§4, §8) : pour la
//  plupart des 8 facteurs, aucun seuil absolu universel ne peut être
//  cité (la pente est la seule exception défendable, voir plus bas) —
//  le TWI, les densités linéaires, la distance aux cours d'eau et la
//  courbure dépendent tous de la résolution de grille et de l'étendue
//  du terrain (§4 le documente déjà pour le TWI dans
//  hydrologieGrille.js). Inventer un seuil absolu pour ces facteurs
//  serait EXACTEMENT le genre de « constante sans origine » interdit
//  par le cahier des charges. La solution retenue : des seuils
//  CALCULÉS À PARTIR DES DONNÉES RÉELLES du terrain analysé (quantiles
//  20/40/60/80 %, méthode usuelle de classification par quantiles en
//  cartographie thématique — chaque classe contient alors ~20 % des
//  cellules), toujours affichés et modifiables (§3.4).
//
//  CE MODULE EST PUR : aucun accès réseau ni disque.
//  Couvert par tests/unit-reclassement.test.js.
// ============================================================

/** Sens de variation entre la valeur brute et la favorabilité. */
export const SENS = { CROISSANT: 'croissant', DECROISSANT: 'decroissant' };

/**
 * Sens par défaut pour chacun des 8 facteurs (§3.4), avec sa
 * justification hydrogéologique. Modifiable par l'utilisateur au même
 * titre que les seuils.
 */
export const SENS_DEFAUT_PAR_FACTEUR = {
  // Pente forte ⇒ ruissellement dominant, infiltration réduite (principe
  // hydrologique de base, ex. Horton 1933 sur la genèse du ruissellement)
  // ⇒ valeur BRUTE croissante = MOINS favorable.
  pente: SENS.DECROISSANT,
  // TWI = ln(a/tanβ) : élevé ⇒ zone de convergence et d'accumulation
  // d'eau (Beven & Kirkby, 1979) ⇒ favorable.
  twi: SENS.CROISSANT,
  // Forte densité de drainage ⇒ réseau de ruissellement développé, signe
  // qualitatif répandu en cartographie AHP du potentiel en eaux
  // souterraines d'une perméabilité de surface FAIBLE (peu d'infiltration,
  // beaucoup de ruissellement organisé) ⇒ moins favorable.
  densiteDrainage: SENS.DECROISSANT,
  // Densité de linéaments/failles élevée ⇒ porosité secondaire et voies
  // d'écoulement préférentielles en socle fracturé ⇒ favorable.
  densiteLineaments: SENS.CROISSANT,
  // Proche d'un cours d'eau ⇒ connexion hydraulique et recharge
  // potentielle ⇒ favorable (valeur brute = distance en m, donc
  // DÉCROISSANTE pour que « proche » = classe haute).
  distanceCoursEau: SENS.DECROISSANT,
  // courbureTotale NÉGATIVE = cuvette = convergence = favorable, POSITIVE
  // = dôme = divergence (voir derivesMnt.js, signe vérifié
  // analytiquement) ⇒ valeur brute croissante = moins favorable.
  courbure: SENS.DECROISSANT,
  // ⚠️ PROVISOIRE : le sens dépend ENTIÈREMENT de la propriété de sol
  // réellement utilisée (ex. teneur en argile vs teneur en sable auraient
  // des sens opposés) — aucune source de lithologie/sol n'est câblée à
  // l'étape 6 (voir services/sourcesDonnees.js, source SoilGrids marquée
  // indisponible). Ce sens est un défaut arbitraire, PAS une conclusion
  // hydrogéologique, à revalider explicitement dès qu'une vraie donnée
  // alimente ce facteur.
  lithologieSol: SENS.CROISSANT,
  // Plus de pluie ⇒ plus de recharge potentielle ⇒ favorable.
  pluviometrie: SENS.CROISSANT,
};

/**
 * Classes de pente usuelles en évaluation de l'aptitude à l'infiltration
 * (FAO — classification par classes de pente reprise dans de nombreux
 * guides d'évaluation des terres ; 0–2 %, 2–5 %, 5–10 %, 10–15 %,
 * 15–30 %, >30 % — fusionnées ici en 5 classes car §3.4 en impose 5, pas
 * 6). C'est le SEUL facteur de ce module dont le seuil par défaut est
 * une valeur absolue plutôt que calculée sur les données : la notion de
 * « pente forte » ne dépend pas de la résolution de grille, contrairement
 * au TWI ou aux densités.
 */
export const SEUILS_PENTE_POURCENT_DEFAUT = [2, 5, 10, 20];

function validerSeuils(seuils) {
  if (!Array.isArray(seuils) || seuils.length !== 4) {
    throw new Error('reclassement : il faut exactement 4 seuils pour délimiter 5 classes.');
  }
  for (let i = 1; i < 4; i++) {
    if (!(seuils[i] > seuils[i - 1])) {
      throw new Error('reclassement : les seuils doivent être strictement croissants (s1<s2<s3<s4).');
    }
  }
}

/**
 * Reclasse UNE valeur brute en classe de favorabilité 1..5.
 *
 * @param {number} valeur  valeur brute du facteur (NaN/non fini = donnée
 *   manquante)
 * @param {number[]} seuils  [s1,s2,s3,s4], strictement croissants
 * @param {'croissant'|'decroissant'} sens
 * @returns {number|null} classe 1..5, ou `null` si la donnée est
 *   manquante (§5 : jamais une classe par défaut inventée pour un trou)
 */
export function reclasserValeur(valeur, seuils, sens = SENS.CROISSANT) {
  validerSeuils(seuils);
  if (!Number.isFinite(valeur)) return null;
  let classeBrute;
  if (valeur < seuils[0]) classeBrute = 1;
  else if (valeur < seuils[1]) classeBrute = 2;
  else if (valeur < seuils[2]) classeBrute = 3;
  else if (valeur < seuils[3]) classeBrute = 4;
  else classeBrute = 5;
  return sens === SENS.DECROISSANT ? 6 - classeBrute : classeBrute;
}

/**
 * Reclasse une grille entière (Float64Array/tableau de valeurs brutes)
 * en classes de favorabilité, en respectant le masque du polygone.
 *
 * @param {ArrayLike<number>} valeurs
 * @param {Uint8Array|null} masque  1 = dans le terrain ; `null` = pas de
 *   masque (toutes les cellules considérées)
 * @param {number[]} seuils
 * @param {'croissant'|'decroissant'} sens
 * @returns {{classes:Float64Array, nManquantes:number, nHorsMasque:number}}
 *   `classes` vaut NaN hors masque ET sur donnée manquante — les deux
 *   compteurs permettent à l'UI de les distinguer explicitement (§5).
 */
export function reclasserGrille(valeurs, masque, seuils, sens = SENS.CROISSANT) {
  validerSeuils(seuils);
  const n = valeurs.length;
  const classes = new Float64Array(n).fill(NaN);
  let nManquantes = 0;
  let nHorsMasque = 0;
  for (let idx = 0; idx < n; idx++) {
    if (masque && !masque[idx]) { nHorsMasque++; continue; }
    const c = reclasserValeur(valeurs[idx], seuils, sens);
    if (c === null) { nManquantes++; continue; }
    classes[idx] = c;
  }
  return { classes, nManquantes, nHorsMasque };
}

/**
 * Seuils par défaut CALCULÉS SUR LES DONNÉES RÉELLES : quantiles
 * 20/40/60/80 % des valeurs valides — voir justification en en-tête de
 * fichier. Méthode d'interpolation linéaire entre rangs (convention
 * usuelle des quantiles, ex. NumPy `percentile(..., method='linear')`).
 *
 * @param {ArrayLike<number>} valeurs  valeurs brutes (les non-finies sont
 *   ignorées)
 * @param {number[]} quantiles  4 fractions croissantes dans ]0,1[
 * @throws si moins de 5 valeurs valides (impossible de distinguer 5
 *   classes de façon non arbitraire)
 */
export function seuilsQuantiles(valeurs, quantiles = [0.2, 0.4, 0.6, 0.8]) {
  const valides = Array.from(valeurs, (v) => v).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (valides.length < 5) {
    throw new Error(`seuilsQuantiles : au moins 5 valeurs valides nécessaires (obtenu : ${valides.length}).`);
  }
  const seuils = quantiles.map((q) => {
    const pos = q * (valides.length - 1);
    const bas = Math.floor(pos);
    const haut = Math.ceil(pos);
    if (bas === haut) return valides[bas];
    const frac = pos - bas;
    return valides[bas] * (1 - frac) + valides[haut] * frac;
  });
  // En cas de plateau (valeurs répétées, ex. TWI arrondi) deux quantiles
  // consécutifs peuvent coïncider : reclasserValeur exige des seuils
  // STRICTEMENT croissants, donc on écarte du minimum représentable
  // plutôt que d'échouer sur des données réelles légitimes.
  for (let i = 1; i < seuils.length; i++) {
    if (seuils[i] <= seuils[i - 1]) {
      seuils[i] = seuils[i - 1] + Number.EPSILON * Math.max(1, Math.abs(seuils[i - 1]));
    }
  }
  return seuils;
}

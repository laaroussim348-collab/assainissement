// ============================================================
//  sensibilite.js — Analyse de sensibilité des poids AHP (§3.4 : «
//  analyse de sensibilité obligatoire » ; §7 : tests dédiés).
//  ─────────────────────────────────────────────────────────────
//  MÉTHODE — « one-at-a-time » (OAT) avec redistribution proportionnelle,
//  méthode usuelle d'analyse de sensibilité en AHP (Triantaphyllou &
//  Sanchez, 1997, « A sensitivity analysis approach for some deterministic
//  multi-criteria decision-making methods », Decision Sciences 28(1)) :
//  pour CHAQUE facteur actif, son poids est augmenté puis diminué de
//  AMPLITUDE_SENSIBILITE (±20 %, imposé par le cahier des charges), et
//  les poids de TOUS LES AUTRES facteurs actifs sont redistribués
//  PROPORTIONNELLEMENT (leurs proportions relatives entre eux restent
//  inchangées) pour que la somme reste 1 — c'est la seule manière de
//  perturber un poids sans en changer arbitrairement un autre en
//  particulier.
//
//  CE QUI EST MESURÉ, pour chaque perturbation :
//   - l'écart moyen absolu du score de favorabilité sur les cellules
//     valides (impact GLOBAL sur la carte) ;
//   - si le MEILLEUR point change (impact sur la DÉCISION elle-même,
//     l'indicateur le plus concret pour l'utilisateur) ;
//   - combien des N meilleurs points restent dans le top N (stabilité du
//     classement).
//
//  Les facteurs sont ensuite triés par écart maximal (hausse ou baisse)
//  décroissant : ceux en tête sont ceux dont la valeur donnée à leur
//  poids influence le plus le résultat — l'information que §3.4 demande
//  de fournir à l'utilisateur.
//
//  CE MODULE EST PUR : aucun accès réseau ni disque.
//  Couvert par tests/unit-sensibilite.test.js.
// ============================================================
import { combinerFavorabilite, classerMeilleursPoints } from './favorabilite.js';

/**
 * Amplitude de perturbation d'un poids, en proportion relative de sa
 * valeur (0,20 = ±20 %).
 * ORIGINE : imposée par le cahier des charges (§3.4 : « analyse de
 * sensibilité obligatoire », §7 : « tests sur une perturbation de
 * ±20 % ») — ce n'est pas un choix de ce logiciel.
 */
export const AMPLITUDE_SENSIBILITE = 0.20;

/** Nombre de meilleurs points comparés pour la stabilité du classement. */
const N_MEILLEURS_SENSIBILITE_DEFAUT = 10;

/**
 * Perturbe le poids d'UN facteur de `delta` (proportion relative,
 * ex. +0,20 ou -0,20), en redistribuant PROPORTIONNELLEMENT les poids de
 * tous les autres facteurs actifs pour que la somme reste 1.
 *
 * @param {{[id:string]:number}} poids  poids actuels (facteurs actifs
 *   uniquement — un poids à 0 ou absent est ignoré, jamais perturbé)
 * @param {string} idFacteur
 * @param {number} delta  ex. 0.20 (+20 %) ou -0.20 (-20 %)
 * @returns {{[id:string]:number}} nouveaux poids, somme = 1
 */
export function perturberPoids(poids, idFacteur, delta) {
  if (!(poids[idFacteur] > 0)) {
    throw new Error(`perturberPoids : « ${idFacteur} » n'est pas un facteur actif (poids nul ou absent).`);
  }
  const idsActifs = Object.keys(poids).filter((id) => poids[id] > 0);
  const wOriginal = poids[idFacteur];
  // Borné à [0,1] : une perturbation ne peut pas donner un poids négatif
  // ni dépasser la totalité — un cas limite possible seulement si un
  // facteur pèse déjà une très grande part des poids actifs.
  const wNouveau = Math.max(0, Math.min(1, wOriginal * (1 + delta)));

  const autres = idsActifs.filter((id) => id !== idFacteur);
  const sommeAutresOriginale = autres.reduce((s, id) => s + poids[id], 0);
  const facteurRedistribution = sommeAutresOriginale > 0 ? (1 - wNouveau) / sommeAutresOriginale : 0;

  const resultat = {};
  for (const id of Object.keys(poids)) {
    if (id === idFacteur) resultat[id] = wNouveau;
    else if (autres.includes(id)) resultat[id] = poids[id] * facteurRedistribution;
    else resultat[id] = 0;
  }
  return resultat;
}

/** Écart moyen absolu entre deux grilles de score, sur les cellules
 *  finies dans LES DEUX (une cellule NaN dans l'une ou l'autre — hors
 *  masque ou donnée manquante — n'entre pas dans la moyenne). */
function ecartMoyenAbsolu(a, b) {
  let somme = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      somme += Math.abs(b[i] - a[i]);
      n++;
    }
  }
  return n > 0 ? somme / n : NaN;
}

/** Vrai si les deux meilleurs points (classerMeilleursPoints[0]) désignent la même cellule. */
function memePoint(p1, p2) {
  return !!p1 && !!p2 && p1.i === p2.i && p1.j === p2.j;
}

/**
 * Analyse de sensibilité complète : pour chaque facteur actif, calcule
 * l'effet d'une perturbation de ±AMPLITUDE_SENSIBILITE sur le score de
 * favorabilité et le classement des meilleurs points.
 *
 * @param {object} grille  grille de calcul (grilleMnt.js)
 * @param {{[id:string]:Float64Array}} grillesClasses  favorabilite.reclasserTousLesFacteurs().grillesClasses
 * @param {{[id:string]:number}} poidsReference  poids AHP renormalisés (facteurs actifs, somme=1)
 * @param {Uint8Array} masque
 * @param {{amplitude?:number, nMeilleurs?:number}} [options]
 * @returns {{
 *   scoreReference: Float64Array,
 *   meilleursReference: object[],
 *   amplitude: number,
 *   insuffisant: boolean,
 *   resultats: Array<{
 *     id: string, poidsReference: number,
 *     hausse: {delta:number, poids:number, ecartMoyenAbsolu:number, meilleurPointIdentique:boolean, nCommunsDansTopN:number},
 *     baisse: {delta:number, poids:number, ecartMoyenAbsolu:number, meilleurPointIdentique:boolean, nCommunsDansTopN:number},
 *     ecartMoyenMax: number,
 *   }>,
 * }}
 */
export function analyserSensibilite(grille, grillesClasses, poidsReference, masque, options = {}) {
  const amplitude = options.amplitude ?? AMPLITUDE_SENSIBILITE;
  const nMeilleurs = options.nMeilleurs ?? N_MEILLEURS_SENSIBILITE_DEFAUT;

  const { score: scoreReference } = combinerFavorabilite(grillesClasses, poidsReference, masque);
  const meilleursReference = classerMeilleursPoints(grille, scoreReference, nMeilleurs);
  const idsActifs = Object.keys(poidsReference).filter((id) => poidsReference[id] > 0);

  // Avec un seul facteur actif, il n'y a rien à redistribuer et donc
  // rien à comparer entre facteurs — le dire explicitement plutôt que
  // de renvoyer un tableau vide sans explication (§5).
  if (idsActifs.length < 2) {
    return { scoreReference, meilleursReference, amplitude, insuffisant: true, resultats: [] };
  }

  function variante(id, delta) {
    const poidsPerturbes = perturberPoids(poidsReference, id, delta);
    const { score } = combinerFavorabilite(grillesClasses, poidsPerturbes, masque);
    const meilleurs = classerMeilleursPoints(grille, score, nMeilleurs);
    return {
      delta,
      poids: poidsPerturbes[id],
      ecartMoyenAbsolu: ecartMoyenAbsolu(scoreReference, score),
      meilleurPointIdentique: memePoint(meilleurs[0], meilleursReference[0]),
      nCommunsDansTopN: meilleurs.filter((p) => meilleursReference.some((r) => r.i === p.i && r.j === p.j)).length,
    };
  }

  const resultats = idsActifs.map((id) => {
    const hausse = variante(id, amplitude);
    const baisse = variante(id, -amplitude);
    return {
      id,
      poidsReference: poidsReference[id],
      hausse,
      baisse,
      ecartMoyenMax: Math.max(hausse.ecartMoyenAbsolu, baisse.ecartMoyenAbsolu),
    };
  });
  resultats.sort((a, b) => b.ecartMoyenMax - a.ecartMoyenMax);

  return { scoreReference, meilleursReference, amplitude, insuffisant: false, resultats };
}

// ============================================================
//  favorabilite.js — Combine les 8 facteurs reclassés (reclassement.js)
//  par leurs poids AHP (ahp.js) en une carte de favorabilité RELATIVE et
//  un classement des meilleurs points (§3.4 : « sortie sous forme de
//  carte de favorabilité + liste classée des meilleurs points »).
//  ─────────────────────────────────────────────────────────────
//  ÉCHELLE DU SCORE — honnêteté scientifique (§5) : le score combiné est
//  une SOMME PONDÉRÉE de classes 1..5 par des poids qui somment à 1 —
//  il reste donc lui-même dans [1,5], DIRECTEMENT comparable aux classes
//  individuelles de chaque facteur. Volontairement PAS ramené à un
//  pourcentage 0-100 % : un pourcentage ressemblerait à une probabilité
//  de trouver de l'eau, ce que ce logiciel s'interdit de présenter
//  (§5 — voir Avertissement.js, affiché sur tout écran de résultat).
//
//  RÈGLE DE COMPLÉTUDE — UN SEUL facteur ACTIF manquant à une cellule
//  invalide le score de cette cellule ENTIÈRE (NaN), jamais une moyenne
//  recalculée en silence sur les facteurs restants : la pondération AHP
//  a été choisie par l'utilisateur pour CES facteurs précis, recalculer
//  localement reviendrait à lui faire dire autre chose que ce qu'il a
//  validé, sans le prévenir (§5, § « jamais de substitution silencieuse »).
//
//  CE MODULE EST PUR : aucun accès réseau ni disque.
//  Couvert par tests/unit-favorabilite.test.js.
// ============================================================
import { reclasserGrille } from './reclassement.js';
import { versGeographique } from './grilleLocale.js';

/**
 * Reclasse toutes les grilles de facteurs bruts (facteurs.js) en classes
 * 1..5, avec les seuils et le sens CHOISIS par l'utilisateur (onglet
 * Critères) — jamais recalculés ici : les défauts (reclassement.
 * seuilsQuantiles, SENS_DEFAUT_PAR_FACTEUR) sont établis UNE FOIS par
 * l'appelant, pour que ce que l'utilisateur voit et ajuste soit
 * exactement ce qui est utilisé.
 *
 * @param {{[idFacteur:string]: Float64Array}} grillesBrutes  voir
 *   facteurs.js, toutesLesGrillesFacteurs()
 * @param {Uint8Array} masque  grille.masque (grilleMnt.js)
 * @param {{[idFacteur:string]: number[]}} seuilsParFacteur
 * @param {{[idFacteur:string]: 'croissant'|'decroissant'}} sensParFacteur
 * @returns {{
 *   grillesClasses: {[idFacteur:string]: Float64Array},
 *   comptesParFacteur: {[idFacteur:string]: {nManquantes:number, nHorsMasque:number}},
 * }}
 */
export function reclasserTousLesFacteurs(grillesBrutes, masque, seuilsParFacteur, sensParFacteur) {
  const grillesClasses = {};
  const comptesParFacteur = {};
  for (const id of Object.keys(grillesBrutes)) {
    const seuils = seuilsParFacteur[id];
    const sens = sensParFacteur[id];
    const r = reclasserGrille(grillesBrutes[id], masque, seuils, sens);
    grillesClasses[id] = r.classes;
    comptesParFacteur[id] = { nManquantes: r.nManquantes, nHorsMasque: r.nHorsMasque };
  }
  return { grillesClasses, comptesParFacteur };
}

/**
 * Combine les classes reclassées en un score de favorabilité relative
 * (échelle 1..5, voir en-tête du fichier).
 *
 * @param {{[idFacteur:string]: Float64Array}} grillesClasses
 * @param {{[idFacteur:string]: number}} poids  UNIQUEMENT les facteurs
 *   actifs, déjà renormalisés à somme=1 (ahp.renormaliserPoids) — un
 *   facteur absent de cet objet, ou de poids nul, ne compte pas.
 * @param {Uint8Array} masque
 * @returns {{score:Float64Array, nManquantes:number, nHorsMasque:number}}
 *   `score` vaut NaN hors masque ET dès qu'un facteur actif manque à une
 *   cellule dans le masque — les deux comptes permettent à l'UI de les
 *   distinguer explicitement (§5).
 * @throws si aucun facteur n'est actif (rien à combiner)
 */
export function combinerFavorabilite(grillesClasses, poids, masque) {
  const idsActifs = Object.keys(poids).filter((id) => poids[id] > 0);
  if (idsActifs.length === 0) {
    throw new Error('combinerFavorabilite : aucun facteur actif (poids tous nuls ou absents) — rien à combiner.');
  }
  const n = masque.length;
  const score = new Float64Array(n).fill(NaN);
  let nManquantes = 0;
  let nHorsMasque = 0;
  for (let idx = 0; idx < n; idx++) {
    if (!masque[idx]) { nHorsMasque++; continue; }
    let somme = 0;
    let complet = true;
    for (const id of idsActifs) {
      const c = grillesClasses[id]?.[idx];
      if (!Number.isFinite(c)) { complet = false; break; }
      somme += c * poids[id];
    }
    if (complet) score[idx] = somme; else nManquantes++;
  }
  return { score, nManquantes, nHorsMasque };
}

/**
 * Classe les N meilleures cellules par score de favorabilité décroissant,
 * avec leurs coordonnées géographiques (centre de cellule). Les cellules
 * sans résultat (NaN) sont exclues, jamais classées par défaut (§5).
 *
 * @param {object} grille  grille de calcul (grilleMnt.js — origine, xmin,
 *   ymin, cellsize_m, nbLignes, nbColonnes)
 * @param {Float64Array} score  sortie de combinerFavorabilite()
 * @param {number} [n]  nombre de points à renvoyer
 * @returns {{rang:number, lat:number, lon:number, score:number, i:number, j:number}[]}
 *   trié par score décroissant ; à score égal, l'ordre de balayage de la
 *   grille (sud→nord, ouest→est) départage — Array.prototype.sort est
 *   stable, donc reproductible d'un appel à l'autre.
 */
export function classerMeilleursPoints(grille, score, n = 10) {
  if (!(n > 0)) throw new Error('classerMeilleursPoints : n doit être positif.');
  const candidats = [];
  for (let i = 0; i < grille.nbLignes; i++) {
    for (let j = 0; j < grille.nbColonnes; j++) {
      const idx = i * grille.nbColonnes + j;
      const s = score[idx];
      if (Number.isFinite(s)) candidats.push({ i, j, idx, score: s });
    }
  }
  candidats.sort((a, b) => b.score - a.score);
  return candidats.slice(0, n).map((c, k) => {
    const x = grille.xmin + c.j * grille.cellsize_m;
    const y = grille.ymin + c.i * grille.cellsize_m;
    const { lat, lon } = versGeographique(x, y, grille.origine);
    return { rang: k + 1, lat, lon, score: c.score, i: c.i, j: c.j };
  });
}

/**
 * Détail de la contribution de chaque facteur ACTIF au score d'une
 * cellule donnée (index linéaire i*nbColonnes+j) — pour que le rapport
 * (étape 8) puisse EXPLIQUER un score plutôt que seulement l'afficher
 * (§5 : une favorabilité relative doit rester traçable jusqu'aux
 * facteurs qui la composent).
 *
 * @returns {{[idFacteur:string]: {classe:number|null, poids:number, contribution:number|null}}}
 */
export function detailPoint(grillesClasses, poids, idx) {
  const detail = {};
  for (const id of Object.keys(poids)) {
    if (!(poids[id] > 0)) continue;
    const classe = grillesClasses[id]?.[idx];
    const classeFinie = Number.isFinite(classe) ? classe : null;
    detail[id] = {
      classe: classeFinie,
      poids: poids[id],
      contribution: classeFinie !== null ? classeFinie * poids[id] : null,
    };
  }
  return detail;
}

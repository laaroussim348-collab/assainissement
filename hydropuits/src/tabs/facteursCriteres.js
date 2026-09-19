// ============================================================
//  facteursCriteres.js — Règles de PRIORITÉ partagées entre les onglets
//  Critères et Résultats : quel seuil/sens/poids utiliser quand
//  l'utilisateur n'a rien (encore) choisi explicitement.
//  ─────────────────────────────────────────────────────────────
//  ÉCRIT UNE SEULE FOIS ICI pour que les deux onglets ne puissent jamais
//  se contredire sur « quelle est la valeur effective d'un seuil » —
//  exactement la même raison d'être que facteurs.js pour la
//  correspondance facteur ↔ source (§3.4).
//
//  ORDRE DE PRIORITÉ D'UN SEUIL : réglage explicite de l'utilisateur
//  (etat.facteurs.seuils) > défaut ABSOLU défendable (pente, classes FAO)
//  > défaut CALCULÉ SUR LES DONNÉES du terrain (quantiles, voir
//  reclassement.js) > `null` (pas encore calculable, données non
//  récupérées) — jamais un nombre inventé pour combler le dernier cas.
// ============================================================
import { IDS_FACTEURS, MATRICE_DEFAUT_AHP, evaluerCoherence, associerPoids, renormaliserPoids } from '../calculations/ahp.js';
import { SENS_DEFAUT_PAR_FACTEUR, SEUILS_PENTE_POURCENT_DEFAUT, seuilsQuantiles } from '../calculations/reclassement.js';

/**
 * Facteurs actifs par défaut : tous SAUF lithologieSol, dont la source
 * (SoilGrids) reste marquée `indisponibleTemporairement` (voir
 * services/sourcesDonnees.js et soilGridsClient.js) — l'activer par
 * défaut produirait systématiquement une grille sans donnée.
 */
export const FACTEURS_ACTIFS_PAR_DEFAUT = IDS_FACTEURS.filter((id) => id !== 'lithologieSol');

export function actifsEffectifs(etat) {
  return etat.facteurs?.actifs || FACTEURS_ACTIFS_PAR_DEFAUT;
}

export function sensEffectif(etat, id) {
  return etat.facteurs?.sens?.[id] || SENS_DEFAUT_PAR_FACTEUR[id];
}

/**
 * Seuils effectifs d'un facteur, voir l'ordre de priorité en en-tête.
 * @param {object} etat  état du projet (majEtat)
 * @param {string} id  identifiant du facteur (IDS_FACTEURS)
 * @param {{[id:string]:Float64Array}|null} grillesFacteurs  facteurs.toutesLesGrillesFacteurs()
 * @param {Uint8Array|null} masque  grille.masque
 * @returns {number[]|null}
 */
export function seuilsEffectifs(etat, id, grillesFacteurs, masque) {
  const override = etat.facteurs?.seuils?.[id];
  if (override) return override;
  if (id === 'pente') return SEUILS_PENTE_POURCENT_DEFAUT;
  if (!grillesFacteurs || !grillesFacteurs[id] || !masque) return null;
  const valides = [];
  for (let idx = 0; idx < masque.length; idx++) {
    if (masque[idx] && Number.isFinite(grillesFacteurs[id][idx])) valides.push(grillesFacteurs[id][idx]);
  }
  try {
    return seuilsQuantiles(valides);
  } catch {
    return null; // pas assez de cellules valides (§5 — pas de seuil inventé)
  }
}

export function matriceEffective(etat) {
  return etat.matriceAhp || MATRICE_DEFAUT_AHP;
}

/**
 * Poids finaux (renormalisés sur les seuls facteurs actifs, somme=1), ou
 * `null` si la matrice de comparaisons est incohérente (CR ≥ 0,10, §5 —
 * jamais un poids qui a l'air valide).
 */
export function poidsFinaux(etat) {
  const matrice = matriceEffective(etat);
  const { poids, coherent } = evaluerCoherence(matrice);
  if (!coherent) return null;
  const poidsParFacteur = associerPoids(IDS_FACTEURS, poids);
  try {
    return renormaliserPoids(poidsParFacteur, actifsEffectifs(etat));
  } catch {
    return null; // aucun facteur actif — rien à renormaliser
  }
}

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
 * Facteurs actifs par défaut : LES 8.
 *
 * lithologieSol en était exclu tant que SoilGrids était en pause côté
 * ISRIC — l'activer aurait produit une grille systématiquement vide. Le
 * diagnostic réseau du 20/09/2026, exécuté depuis le poste d'un
 * utilisateur réel, montre le service rétabli (HTTP 200, réponse
 * conforme) : le facteur redevient actif par défaut. Si la source
 * retombait en panne, il serait désormais écarté automatiquement et
 * l'utilisateur en serait informé (voir actifsDisponibles ci-dessous),
 * au lieu de bloquer tout le calcul.
 */
export const FACTEURS_ACTIFS_PAR_DEFAUT = IDS_FACTEURS;

export function actifsEffectifs(etat) {
  return etat.facteurs?.actifs || FACTEURS_ACTIFS_PAR_DEFAUT;
}

/**
 * Facteurs actifs RÉELLEMENT calculables : les facteurs actifs, moins
 * ceux dont la source n'a pas pu être récupérée (facteurs.disponibilite).
 *
 * POURQUOI (corrigé le 20/09/2026, sur retour d'un utilisateur réel) :
 * un facteur actif mais sans donnée invalide TOUTES les cellules du
 * calcul (règle voulue de favorabilite.js : pas de moyenne partielle
 * silencieuse). Conséquence non voulue : une seule source en panne —
 * Overpass en surcharge, SoilGrids en pause — ne dégradait pas le
 * résultat, elle le supprimait ENTIÈREMENT, et l'utilisateur n'obtenait
 * plus rien du tout. Écarter le facteur et renormaliser les poids sur
 * les restants donne un résultat honnête et utilisable, À CONDITION de
 * le dire à l'écran — c'est fait dans ResultatsTab.js, et ça reste
 * l'application de la règle de renormalisation déjà prévue au §3.4,
 * simplement déclenchée par une panne plutôt que par un décochage.
 */
export function actifsDisponibles(etat, disponibilite) {
  const actifs = actifsEffectifs(etat);
  if (!disponibilite) return actifs;
  return actifs.filter((id) => disponibilite[id] !== false);
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
  return poidsFinauxPourActifs(etat, actifsEffectifs(etat));
}

/**
 * Comme poidsFinaux(), mais renormalisés sur une liste de facteurs
 * IMPOSÉE — celle réellement calculable (voir actifsDisponibles). La
 * matrice de comparaisons reste celle de l'utilisateur : seuls les poids
 * issus de son vecteur propre sont redistribués, jamais réinventés.
 */
export function poidsFinauxPourActifs(etat, actifs) {
  const matrice = matriceEffective(etat);
  const { poids, coherent } = evaluerCoherence(matrice);
  if (!coherent) return null;
  const poidsParFacteur = associerPoids(IDS_FACTEURS, poids);
  try {
    return renormaliserPoids(poidsParFacteur, actifs);
  } catch {
    return null; // aucun facteur actif — rien à renormaliser
  }
}

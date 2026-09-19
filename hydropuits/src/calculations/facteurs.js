// ============================================================
//  facteurs.js — Assemble les 8 facteurs du §3.4 à partir des données
//  déjà téléchargées (étape 4) et des modules de calcul purs de l'étape
//  5 (grilleMnt, derivesMnt, hydrologieGrille, geometrieLigneaire).
//  ─────────────────────────────────────────────────────────────
//  RÔLE : chaque module de calcul reste ignorant des autres (pente ne
//  sait pas que TWI existe, geometrieLigneaire ne sait pas ce qu'est un
//  facteur) — c'est ICI, et nulle part ailleurs, que la correspondance
//  facteur ↔ source(s) est écrite, pour que reclassement.js et
//  favorabilite.js n'aient jamais à la redécouvrir.
//
//  CORRESPONDANCE FACTEUR → SOURCE(S) (§3.3 → §3.4) :
//    pente, TWI, courbure        ← MNT (élévation)     — GRILLÉS (Horn/Z-T/D8)
//    densité de drainage         ← Overpass (coursEau)  — GRILLÉ (noyau linéaire)
//    densité de linéaments       ← Overpass (failles)   — GRILLÉ (noyau linéaire)
//    distance aux cours d'eau    ← Overpass (coursEau)  — GRILLÉ
//    lithologie / sol            ← SoilGrids (% sable)  — SCALAIRE
//    pluviométrie                 ← NASA POWER (moyenne annuelle) — SCALAIRE
//
//  POURQUOI LITHOLOGIE ET PLUVIOMÉTRIE SONT DES SCALAIRES, PAS DES
//  GRILLES : SoilGrids et NASA POWER sont interrogés en UN SEUL point
//  (le centre approché du terrain — voir services/telechargementJobs.js,
//  centreApprox()), à des résolutions natives (≈ 250 m et ≈ 50-60 km
//  respectivement) bien plus grossières que la parcelle visée par ce
//  logiciel. Interpoler une grille à partir d'un seul point serait une
//  fausse précision, pas une vraie variation spatiale mesurée — la
//  valeur est donc appliquée UNIFORMÉMENT sur tout le terrain. Ce n'est
//  pas un défaut silencieux : c'est écrit ici, affiché dans
//  l'interface (§5) et documenté dans le README.
//
//  POURQUOI LE % DE SABLE POUR « LITHOLOGIE/SOL » : un sol sableux a une
//  conductivité hydraulique bien supérieure à un sol argileux — principe
//  de base de la physique des sols (granulométrie ↔ perméabilité), pas
//  une référence spécifique à vérifier. C'est une SIMPLIFICATION assumée
//  (une vraie évaluation lithologique demanderait la nature de la roche
//  et la profondeur au substratum, pas seulement la texture du sol de
//  surface 0-30 cm) — voir SENS_DEFAUT_PAR_FACTEUR dans reclassement.js.
//
//  POURQUOI LA GRILLE DE CALCUL EXIGE LE MNT : construireGrilleCalcul()
//  (grilleMnt.js) définit la géométrie de la grille (xmin/ymin/cellsize/
//  masque) EN MÊME TEMPS qu'elle interpole l'altitude — les 3 facteurs
//  géométriques (densités, distance) EN DÉPENDENT AUSSI, même s'ils
//  n'utilisent pas l'altitude elle-même. Si le MNT est indisponible,
//  AUCUN facteur grillé n'est calculable, et c'est dit explicitement
//  (§5) plutôt que de laisser deviner pourquoi la carte reste vide.
//
//  CE MODULE EST PUR : ni requête réseau ni accès disque — il reçoit des
//  données DÉJÀ téléchargées (services/*Client.js, appelés côté serveur,
//  voir telechargementJobs.js) et le contour déjà validé (polygone.js).
// ============================================================
import { construireGrilleCalcul } from './grilleMnt.js';
import { calculerGrillesDerivees } from './derivesMnt.js';
import { calculerHydrologie } from './hydrologieGrille.js';
import { calculerDensiteLigneaire, calculerDistanceLignes } from './geometrieLigneaire.js';
import { IDS_FACTEURS } from './ahp.js';

/**
 * Rayon de recherche par défaut pour les noyaux de densité linéaire
 * (drainage, linéaments), en mètres.
 *
 * ORIGINE : choix par défaut, ajustable par l'utilisateur (§3.4 : « rayon
 * de recherche paramétrable et affiché »). Un quart du rayon de collecte
 * Overpass (2 km, voir services/overpassClient.js) : un noyau glissant
 * qui couvrirait tout le rayon de collecte donnerait la MÊME densité à
 * chaque cellule (moyenne sur toute la zone récupérée), ce qui viderait
 * le noyau de tout pouvoir discriminant à l'échelle de la parcelle.
 */
export const RAYON_DENSITE_M_DEFAUT = 500;

/**
 * Construit les 8 facteurs (§3.4) à partir de données déjà téléchargées.
 * Ne fait AUCUNE hypothèse sur ce qui est disponible : chaque source
 * manquante désactive explicitement ce qu'elle seule permettait de
 * calculer, avec un avertissement nommé (§5) — jamais une grille à moitié
 * remplie sans le dire.
 *
 * @param {{lat:number, lon:number}[]} sommets  contour déjà validé
 * @param {object} sourcesBrutes
 * @param {object|null} sourcesBrutes.grilleSourceMnt  déjà normalisée par
 *   `depuisElevationOpenMeteo` OU `depuisOpenTopographyAscii`
 *   (grilleMnt.js) — au choix de l'appelant selon la source disponible.
 * @param {{coursEau:object[][], failles:object[][]}|null} sourcesBrutes.overpass
 * @param {{pma_mm_an:number}|null} sourcesBrutes.nasaPower
 * @param {{sable_pourcent:number}|null} sourcesBrutes.soilGrids
 * @param {{espacement_m?:number, rayonDensite_m?:number}} [options]
 *
 * @returns {{
 *   grille: object|null,
 *   grillesBrutes: {[idFacteur:string]: Float64Array|null},
 *   valeursScalaires: {lithologieSol:number|null, pluviometrie:number|null},
 *   disponibilite: {[idFacteur:string]: boolean},
 *   avertissements: {cle:string, params?:object}[],
 * }}
 */
export function construireFacteurs(sommets, sourcesBrutes, options = {}) {
  const { grilleSourceMnt = null, overpass = null, nasaPower = null, soilGrids = null } = sourcesBrutes || {};
  const avertissements = [];
  const disponibilite = Object.fromEntries(IDS_FACTEURS.map((id) => [id, false]));
  const grillesBrutes = Object.fromEntries(
    IDS_FACTEURS.filter((id) => id !== 'lithologieSol' && id !== 'pluviometrie').map((id) => [id, null]),
  );
  const valeursScalaires = { lithologieSol: null, pluviometrie: null };

  let grille = null;
  if (!grilleSourceMnt) {
    avertissements.push({ cle: 'facAvtMntManquant' });
  } else {
    grille = construireGrilleCalcul(sommets, grilleSourceMnt, { espacement_m: options.espacement_m });
    avertissements.push(...grille.avertissements);

    const derivees = calculerGrillesDerivees(grille);
    grillesBrutes.pente = derivees.pente_pourcent;
    grillesBrutes.courbure = derivees.courbureTotale;
    disponibilite.pente = true;
    disponibilite.courbure = true;

    const hydro = calculerHydrologie(grille, derivees.pente_ratio);
    grillesBrutes.twi = hydro.twi;
    disponibilite.twi = true;

    if (!overpass) {
      avertissements.push({ cle: 'facAvtOverpassManquant' });
    } else {
      const rayon_m = options.rayonDensite_m || RAYON_DENSITE_M_DEFAUT;
      if (overpass.coursEau && overpass.coursEau.length > 0) {
        grillesBrutes.densiteDrainage = calculerDensiteLigneaire(grille, grille.origine, overpass.coursEau, rayon_m);
        grillesBrutes.distanceCoursEau = calculerDistanceLignes(grille, grille.origine, overpass.coursEau);
        disponibilite.densiteDrainage = true;
        disponibilite.distanceCoursEau = true;
      } else {
        avertissements.push({ cle: 'facAvtAucunCoursEau' });
      }
      if (overpass.failles && overpass.failles.length > 0) {
        grillesBrutes.densiteLineaments = calculerDensiteLigneaire(grille, grille.origine, overpass.failles, rayon_m);
        disponibilite.densiteLineaments = true;
      } else {
        avertissements.push({ cle: 'facAvtAucuneFaille' });
      }
    }
  }

  if (!soilGrids || !Number.isFinite(soilGrids.sable_pourcent)) {
    avertissements.push({ cle: 'facAvtSoilGridsManquant' });
  } else {
    valeursScalaires.lithologieSol = soilGrids.sable_pourcent;
    disponibilite.lithologieSol = true;
  }

  if (!nasaPower || !Number.isFinite(nasaPower.pma_mm_an)) {
    avertissements.push({ cle: 'facAvtNasaPowerManquant' });
  } else {
    valeursScalaires.pluviometrie = nasaPower.pma_mm_an;
    disponibilite.pluviometrie = true;
  }

  return { grille, grillesBrutes, valeursScalaires, disponibilite, avertissements };
}

/** Diffuse une valeur scalaire sur toutes les cellules DANS LE MASQUE
 *  (NaN ailleurs, comme une cellule hors terrain pour tout autre
 *  facteur). Renvoie une grille entièrement NaN si la valeur est
 *  elle-même manquante — jamais un 0 ou une moyenne inventée (§5). */
function diffuserScalaireSurGrille(grille, valeur) {
  const n = grille.nbLignes * grille.nbColonnes;
  const sortie = new Float64Array(n).fill(NaN);
  if (!Number.isFinite(valeur)) return sortie;
  for (let idx = 0; idx < n; idx++) {
    if (grille.masque[idx]) sortie[idx] = valeur;
  }
  return sortie;
}

/**
 * Ramène les 8 facteurs à UNE SEULE forme (une grille Float64Array de
 * même taille que `grille`), en diffusant les facteurs scalaires
 * (lithologie, pluviométrie) — pour que reclassement.js et
 * favorabilite.js n'aient jamais à distinguer « facteur grillé » de
 * « facteur ponctuel » : un facteur totalement indisponible devient
 * simplement une grille entièrement NaN, comme un facteur grillé dont
 * la source a échoué.
 *
 * @param {ReturnType<typeof construireFacteurs>} construction
 * @returns {{[idFacteur:string]: Float64Array}|null} `null` si aucune
 *   grille de calcul n'existe (MNT manquant, §5 : rien à diffuser).
 */
export function toutesLesGrillesFacteurs(construction) {
  const { grille, grillesBrutes, valeursScalaires } = construction;
  if (!grille) return null;
  const n = grille.nbLignes * grille.nbColonnes;
  const vide = () => new Float64Array(n).fill(NaN);
  const sortie = {};
  for (const id of IDS_FACTEURS) {
    if (id === 'lithologieSol' || id === 'pluviometrie') {
      sortie[id] = diffuserScalaireSurGrille(grille, valeursScalaires[id]);
    } else {
      sortie[id] = grillesBrutes[id] || vide();
    }
  }
  return sortie;
}

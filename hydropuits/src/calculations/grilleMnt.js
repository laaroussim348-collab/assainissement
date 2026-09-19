// ============================================================
//  grilleMnt.js — Construction de la grille de calcul métrique et
//  interpolation BILINÉAIRE du MNT dessus (cahier des charges §4 :
//  « Interpolation du MNT : bilinéaire, jamais plus proche voisin »).
//  ─────────────────────────────────────────────────────────────
//  Deux sources de MNT possibles (étape 4), toutes deux des grilles
//  RÉGULIÈRES EN DEGRÉS (pas en mètres — c'est justement pour ça qu'on
//  construit une grille de calcul séparée, en mètres, voir grilleLocale.js) :
//    - Open-Meteo Elevation : { points:[{lat,lon,altitude_m}], nbLignes,
//      nbColonnes } — rangées du SUD vers le NORD (voir
//      services/elevationClient.js, calculerGrilleElevation).
//    - OpenTopography (.asc) : { ncols, nrows, xllcorner, yllcorner,
//      cellsize, nodata, valeurs:[...] } — rangées du NORD vers le SUD
//      (convention Arc/Info ASCII Grid, voir
//      services/openTopographyClient.js).
//
//  depuisElevationOpenMeteo()/depuisOpenTopographyAscii() ramènent l'une
//  ou l'autre à une même interface interne (RANGÉE 0 = SUD, uniformément),
//  pour qu'interpolerBilineaire() n'ait qu'UNE seule convention à
//  connaître — sans ça, un bug d'inversion nord/sud serait facile à
//  introduire en changeant de source.
//
//  CE MODULE EST PUR (aucun accès réseau ni disque) : il reçoit les
//  données déjà téléchargées (voir services/telechargementJobs.js) et le
//  contour déjà validé (voir calculations/polygone.js).
// ============================================================
import { calculerOrigineLocale, versLocal, versGeographique, distorsionMaximale_relatif, SEUIL_DISTORSION_RELATIF } from './grilleLocale.js';
import { pointDansPolygone } from './polygone.js';

/**
 * Enveloppe une réponse Open-Meteo (voir services/elevationClient.js) en
 * grille régulière normalisée, rangée 0 = sud.
 */
export function depuisElevationOpenMeteo(donnees) {
  const { points, nbLignes, nbColonnes } = donnees;
  if (!Array.isArray(points) || points.length !== nbLignes * nbColonnes) {
    throw new Error('depuisElevationOpenMeteo : structure de grille incohérente.');
  }
  const latMin = points[0].lat;
  const latMax = points[(nbLignes - 1) * nbColonnes].lat;
  const lonMin = points[0].lon;
  const lonMax = points[nbColonnes - 1].lon;
  return {
    nbLignes, nbColonnes, latMin, latMax, lonMin, lonMax,
    // i=0 au sud (comme les points d'Open-Meteo), j=0 à l'ouest.
    valeur(i, j) {
      const v = points[i * nbColonnes + j]?.altitude_m;
      return Number.isFinite(v) ? v : NaN;
    },
  };
}

/**
 * Enveloppe une réponse OpenTopography (.asc parsé, voir
 * services/openTopographyClient.js, parseAsciiGrid) en grille régulière
 * normalisée, rangée 0 = sud — l'INVERSE de la convention AAIGrid brute
 * (qui numérote ses lignes du nord vers le sud), d'où l'indexation
 * `nrows-1-i` ci-dessous.
 */
export function depuisOpenTopographyAscii(donnees) {
  const { ncols, nrows, xllcorner, yllcorner, cellsize, nodata, valeurs } = donnees;
  const latMin = yllcorner;
  const latMax = yllcorner + (nrows - 1) * cellsize;
  const lonMin = xllcorner;
  const lonMax = xllcorner + (ncols - 1) * cellsize;
  return {
    nbLignes: nrows, nbColonnes: ncols, latMin, latMax, lonMin, lonMax,
    valeur(i, j) {
      const ligneAscii = nrows - 1 - i; // ligne 0 (AAIGrid) = nord = i=nrows-1 ici
      const v = valeurs[ligneAscii * ncols + j];
      return Number.isFinite(v) && v !== nodata ? v : NaN;
    },
  };
}

/**
 * Interpolation BILINÉAIRE d'une grille régulière en degrés, au point
 * (lat, lon) demandé.
 *
 * §4 : « jamais plus proche voisin ». Si l'un des 4 points encadrants est
 * un TROU (NaN — absence de donnée ou NODATA), le résultat est NaN : on
 * ne devine jamais une altitude à partir d'un voisinage incomplet (« pas
 * de remplissage silencieux »). Hors de l'emprise de la grille source :
 * NaN également (pas d'extrapolation).
 *
 * @returns {number} altitude interpolée, ou NaN
 */
export function interpolerBilineaire(grille, lat, lon) {
  const { nbLignes, nbColonnes, latMin, latMax, lonMin, lonMax } = grille;
  if (lat < latMin || lat > latMax || lon < lonMin || lon > lonMax) return NaN;

  const fi = ((lat - latMin) / (latMax - latMin)) * (nbLignes - 1);
  const fj = ((lon - lonMin) / (lonMax - lonMin)) * (nbColonnes - 1);
  const i0 = Math.min(Math.floor(fi), nbLignes - 2);
  const j0 = Math.min(Math.floor(fj), nbColonnes - 2);
  const i1 = i0 + 1;
  const j1 = j0 + 1;
  const ti = fi - i0;
  const tj = fj - j0;

  const v00 = grille.valeur(i0, j0);
  const v10 = grille.valeur(i0, j1);
  const v01 = grille.valeur(i1, j0);
  const v11 = grille.valeur(i1, j1);
  if (![v00, v10, v01, v11].every(Number.isFinite)) return NaN;

  const bas = v00 * (1 - tj) + v10 * tj;
  const haut = v01 * (1 - tj) + v11 * tj;
  return bas * (1 - ti) + haut * ti;
}

/**
 * Espacement par défaut de la grille de calcul, en mètres.
 *
 * ORIGINE : calé sur la résolution native du MNT le plus courant sans clé
 * (Copernicus GLO-90, ≈ 90 m — voir services/elevationClient.js). Une
 * maille plus fine qu'une donnée de 90 m n'ajouterait que du bruit
 * d'interpolation ; ajustable si un MNT plus fin (OpenTopography, 30 m)
 * est effectivement utilisé (voir `espacement_m` en option).
 */
export const ESPACEMENT_GRILLE_CALCUL_M_DEFAUT = 90;

/**
 * Construit la grille de calcul métrique (§4) : en mètres (pas en
 * degrés), couvrant le terrain avec une marge d'une cellule (pour que les
 * dérivées — pente, courbure, étape suivante — disposent d'un voisinage
 * complet jusqu'au bord du polygone), et interpole le MNT dessus.
 *
 * @param {{lat:number, lon:number}[]} sommets  contour déjà validé
 * @param {ReturnType<typeof depuisElevationOpenMeteo>} grilleSource
 * @param {{espacement_m?:number}} [options]
 * @returns {{
 *   origine: object, cellsize_m: number, nbLignes: number, nbColonnes: number,
 *   xmin: number, ymin: number,
 *   altitudes: Float64Array,   // NaN = trou (hors couverture MNT)
 *   masque: Uint8Array,        // 1 = à l'intérieur du polygone, 0 = marge
 *   avertissements: {cle:string, params?:object}[],
 * }}
 */
export function construireGrilleCalcul(sommets, grilleSource, options = {}) {
  if (!Array.isArray(sommets) || sommets.length < 3) {
    throw new Error('construireGrilleCalcul : il faut un contour validé (≥ 3 sommets).');
  }
  const cellsize_m = options.espacement_m || ESPACEMENT_GRILLE_CALCUL_M_DEFAUT;
  if (!(cellsize_m > 0)) throw new Error('construireGrilleCalcul : espacement invalide.');

  const origine = calculerOrigineLocale(sommets);
  const avertissements = [];
  const distorsion = distorsionMaximale_relatif(sommets, origine);
  if (distorsion > SEUIL_DISTORSION_RELATIF) {
    avertissements.push({ cle: 'grilleAvtDistorsion', params: { pourcent: (distorsion * 100).toFixed(2) } });
  }

  const pointsLocaux = sommets.map((s) => versLocal(s.lat, s.lon, origine));
  // Marge d'UNE cellule de part et d'autre : voisinage 3×3 complet
  // disponible même pour les cellules touchant le bord du polygone.
  const xmin = Math.min(...pointsLocaux.map((p) => p.x)) - cellsize_m;
  const xmax = Math.max(...pointsLocaux.map((p) => p.x)) + cellsize_m;
  const ymin = Math.min(...pointsLocaux.map((p) => p.y)) - cellsize_m;
  const ymax = Math.max(...pointsLocaux.map((p) => p.y)) + cellsize_m;

  const nbColonnes = Math.max(3, Math.ceil((xmax - xmin) / cellsize_m) + 1);
  const nbLignes = Math.max(3, Math.ceil((ymax - ymin) / cellsize_m) + 1);

  const altitudes = new Float64Array(nbLignes * nbColonnes);
  const masque = new Uint8Array(nbLignes * nbColonnes);
  let trousDetectes = 0;

  for (let i = 0; i < nbLignes; i++) {
    const y = ymin + i * cellsize_m;
    for (let j = 0; j < nbColonnes; j++) {
      const x = xmin + j * cellsize_m;
      const idx = i * nbColonnes + j;
      const { lat, lon } = versGeographique(x, y, origine);
      const alt = interpolerBilineaire(grilleSource, lat, lon);
      altitudes[idx] = alt;
      if (!Number.isFinite(alt)) trousDetectes++;
      masque[idx] = pointDansPolygone({ lat, lon }, sommets) ? 1 : 0;
    }
  }

  if (trousDetectes > 0) {
    avertissements.push({ cle: 'grilleAvtTrousMnt', params: { nombre: trousDetectes, total: altitudes.length } });
  }

  return { origine, cellsize_m, nbLignes, nbColonnes, xmin, ymin, altitudes, masque, avertissements };
}

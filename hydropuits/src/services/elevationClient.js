/**
 * elevationClient.js
 * -----------------------------------------------------------------------
 * Construction des requêtes vers l'API d'altimétrie Open-Meteo et analyse
 * de ses réponses JSON, + construction PURE de la grille de points à
 * interroger pour couvrir un terrain.
 *
 * buildElevationUrl() et parseElevationResponse() sont reprises À
 * L'IDENTIQUE de src/services/delineationClient.js de HydroCrue (cahier
 * des charges §3.3 : « Déjà utilisée dans delineationClient.js : réutilise
 * buildElevationUrl() et parseElevationResponse() »). Les fonctions
 * propres à HydroCrue (délimitation de bassin via mghydro.com,
 * buildWatershedUrl, etc.) ne sont PAS reprises : HydroPuits ne délimite
 * aucun bassin versant, seule l'altimétrie l'intéresse.
 *
 * Source vérifiée le 19/09/2026 :
 *  - https://open-meteo.com/en/docs/elevation-api (API sans clé, CORS
 *    activé, MNT Copernicus DEM 2021 GLO-90 ~90m, jusqu'à 100 points par
 *    requête, licence Copernicus — réutilisation libre avec attribution)
 *
 * SÉPARATION PUR / RÉSEAU (cahier des charges) : buildElevationUrl(),
 * parseElevationResponse() et calculerGrilleElevation() sont pures et
 * testables hors ligne. Seul l'appel fetch (fait côté serveur, voir
 * server.mjs) ne l'est pas.
 * -----------------------------------------------------------------------
 */

/** @param {[number,number][]} pointsLatLon */
export function buildElevationUrl(pointsLatLon) {
  const lats = pointsLatLon.map((p) => p[0]).join(',');
  const lons = pointsLatLon.map((p) => p[1]).join(',');
  return `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;
}

/**
 * Analyse la réponse de l'API d'altimétrie Open-Meteo.
 * Format documenté : { "elevation": [z1, z2, ...] }, dans l'ordre des
 * points fournis.
 */
export function parseElevationResponse(json) {
  const elevations = json?.elevation;
  if (!Array.isArray(elevations)) {
    throw new Error("Réponse d'altimétrie inattendue : le champ 'elevation' est absent ou invalide.");
  }
  return elevations.map(Number);
}

// ── Grille de points à interroger ──────────────────────────────────────

// 100 points par requête : limite DOCUMENTÉE de l'API (voir source
// ci-dessus), pas un choix arbitraire — elle fixe la taille d'un lot.
export const POINTS_PAR_REQUETE = 100;

/**
 * Nombre maximal de points interrogés pour UN terrain, tous lots
 * confondus.
 *
 * ORIGINE DE LA VALEUR (cahier des charges §4 — « toute valeur numérique
 * porte en commentaire son origine ») : choix par défaut, ajustable. À
 * 100 points par requête et en tablant sur ~1 requête/seconde en pratique
 * (latence réseau, pas une limite documentée par Open-Meteo), 4000 points
 * tiennent en moins d'une minute de téléchargement — au-delà, l'attente
 * devient gênante pour un usage interactif. Un terrain plus grand n'est
 * pas tronqué : la maille est élargie pour rester sous ce budget (voir
 * calculerGrilleElevation), et l'écart entre résolution demandée et
 * résolution effectivement utilisée est affiché à l'écran (§5 — jamais de
 * dégradation silencieuse).
 */
export const MAX_POINTS_GRILLE = 4000;

/**
 * Espacement cible de la grille d'altimétrie, en mètres.
 *
 * ORIGINE : calé sur la résolution native du MNT (Copernicus GLO-90,
 * ~90 m — voir en tête de fichier). Interroger plus finement que la
 * résolution native du MNT n'apporterait aucune information supplémentaire
 * (l'API renverrait des valeurs interpolées ou répétées) ; interroger plus
 * grossièrement perdrait du relief réellement présent dans la donnée.
 */
export const ESPACEMENT_CIBLE_M = 90;

const RAYON_TERRE_M = 6371000; // rayon moyen (m) — suffisant pour DIMENSIONNER une grille, pas pour la MESURER (voir geodesie.js pour les mesures)

/**
 * Construit une grille régulière de points (lat, lon) couvrant l'emprise
 * (bounding box) d'un polygone, à l'espacement demandé — ou plus large si
 * nécessaire pour rester sous maxPoints.
 *
 * PURE : ne fait aucun appel réseau. Le padding (marge autour du polygone)
 * garantit que l'interpolation bilinéaire (étape 5) dispose toujours d'un
 * point de grille de part et d'autre de chaque sommet du contour, y
 * compris ceux situés sur la bordure de l'emprise.
 *
 * @param {{lat:number, lon:number}[]} sommets
 * @param {number} [espacementCible_m]
 * @param {number} [maxPoints]
 * @returns {{
 *   points: {lat:number, lon:number}[],
 *   nbLignes: number, nbColonnes: number,
 *   espacementReel_m: number, espacementReduit: boolean,
 *   bbox: {latMin:number, latMax:number, lonMin:number, lonMax:number},
 * }}
 */
export function calculerGrilleElevation(sommets, espacementCible_m = ESPACEMENT_CIBLE_M, maxPoints = MAX_POINTS_GRILLE) {
  if (!Array.isArray(sommets) || sommets.length < 3) {
    throw new Error('calculerGrilleElevation : il faut un polygone (au moins 3 sommets).');
  }
  const lats = sommets.map((s) => s.lat);
  const lons = sommets.map((s) => s.lon);
  const latMoy = lats.reduce((a, b) => a + b, 0) / lats.length;

  // Conversion degré -> mètre locale (WGS84, sphère de dimensionnement) :
  // suffisante ici, on ne fait que DIMENSIONNER un pas de grille, la
  // mesure du terrain lui-même reste géodésique exacte (calculations/geodesie.js).
  const mParDegLat = (Math.PI / 180) * RAYON_TERRE_M;
  const mParDegLon = mParDegLat * Math.cos((latMoy * Math.PI) / 180);

  // Marge d'un pas de grille de part et d'autre, pour l'interpolation.
  const margeLat = espacementCible_m / mParDegLat;
  const margeLon = espacementCible_m / mParDegLon;
  const bbox = {
    latMin: Math.min(...lats) - margeLat,
    latMax: Math.max(...lats) + margeLat,
    lonMin: Math.min(...lons) - margeLon,
    lonMax: Math.max(...lons) + margeLon,
  };

  const largeur_m = (bbox.lonMax - bbox.lonMin) * mParDegLon;
  const hauteur_m = (bbox.latMax - bbox.latMin) * mParDegLat;

  let espacement_m = espacementCible_m;
  let nbColonnes = Math.max(2, Math.ceil(largeur_m / espacement_m) + 1);
  let nbLignes = Math.max(2, Math.ceil(hauteur_m / espacement_m) + 1);
  let espacementReduit = false;

  if (nbColonnes * nbLignes > maxPoints) {
    // Élargit l'espacement à surface constante pour repasser sous le
    // budget, plutôt que de rogner l'emprise (§5 : toute la surface
    // demandée reste couverte, à une résolution moindre — annoncée).
    //
    // Une seule mise à l'échelle par sqrt(ratio) NE SUFFIT PAS à garantir
    // nbColonnes×nbLignes ≤ maxPoints : les deux Math.ceil(...)+1
    // (largeur et hauteur) arrondissent chacun INDÉPENDAMMENT vers le
    // haut, et leur produit peut dépasser légèrement le budget malgré un
    // espacement en apparence suffisant (constaté : un terrain de
    // ~20×22 km calculait 4071 points pour un budget de 4000). On affine
    // donc par petits pas jusqu'à repasser sous le budget — au plus 50
    // itérations (choix par défaut : largement assez pour converger
    // depuis un dépassement de quelques % à quelques dizaines de %,
    // jamais atteint en pratique sur les tailles de terrain visées).
    espacementReduit = true;
    const facteur = Math.sqrt((nbColonnes * nbLignes) / maxPoints);
    espacement_m = espacementCible_m * facteur;
    const MAX_ITERATIONS_AJUSTEMENT = 50;
    for (let i = 0; i < MAX_ITERATIONS_AJUSTEMENT; i++) {
      nbColonnes = Math.max(2, Math.ceil(largeur_m / espacement_m) + 1);
      nbLignes = Math.max(2, Math.ceil(hauteur_m / espacement_m) + 1);
      if (nbColonnes * nbLignes <= maxPoints) break;
      espacement_m *= 1.02; // pas de 2% : converge en quelques itérations sans surcorriger
    }
  }

  const points = [];
  for (let i = 0; i < nbLignes; i++) {
    const lat = bbox.latMin + (i / (nbLignes - 1)) * (bbox.latMax - bbox.latMin);
    for (let j = 0; j < nbColonnes; j++) {
      const lon = bbox.lonMin + (j / (nbColonnes - 1)) * (bbox.lonMax - bbox.lonMin);
      points.push({ lat, lon });
    }
  }

  return { points, nbLignes, nbColonnes, espacementReel_m: espacement_m, espacementReduit, bbox };
}

/** Découpe un tableau de points en lots d'au plus POINTS_PAR_REQUETE. */
export function decouperEnLots(points, taille = POINTS_PAR_REQUETE) {
  const lots = [];
  for (let i = 0; i < points.length; i += taille) lots.push(points.slice(i, i + taille));
  return lots;
}

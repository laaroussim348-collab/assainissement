// ============================================================
//  carteBase.js — Fond de carte PARTAGÉ par toutes les cartes de
//  HydroPuits (terrain, favorabilité...).
//  ─────────────────────────────────────────────────────────────
//  EXTRAIT de CarteTerrain.js à l'étape 7 : la carte de favorabilité a
//  besoin du MÊME fond que la carte de saisie du terrain (cahier des
//  charges §2.1/§8 : « ne jamais changer le fond de carte, ZOOM_MAX »).
//  Avoir DEUX copies des mêmes URL de tuiles serait exactement le genre
//  de duplication qui finit par diverger silencieusement — ce fichier
//  est donc la SEULE source pour ces constantes, importée par les deux
//  cartes plutôt que recopiée.
//
//  Le contenu (fond satellite Esri, calque de noms CARTO, détection des
//  tuiles de remplacement, ZOOM_MAX=17) est inchangé par rapport à
//  l'original — voir CarteTerrain.js pour l'historique et les
//  justifications détaillées de chaque choix.
// ============================================================
import L from 'leaflet';

export const SATELLITE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
};

export const LABELS = {
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  subdomains: 'abcd',
};

/** Détecte la tuile de remplacement « Map data not yet available » d'Esri
 *  (HTTP 200, donc invisible à errorTileUrl) par analyse de son contenu
 *  (gris neutre quasi uniforme) — voir CarteTerrain.js pour le détail. */
export function estTuilePlaceholder(img) {
  try {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 8, 8);
    const { data } = ctx.getImageData(0, 0, 8, 8);
    let sR = 0, sG = 0, sB = 0, ecartMax = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      sR += r; sG += g; sB += b;
      ecartMax = Math.max(ecartMax, Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    }
    const n = data.length / 4;
    const [mR, mG, mB] = [sR / n, sG / n, sB / n];
    const grisNeutre = mR > 180 && mR < 225 && mG > 180 && mG < 225 && mB > 180 && mB < 225;
    return ecartMax < 12 && grisNeutre;
  } catch {
    return false; // CORS/canvas indisponible : on n'essaie pas de masquer, tant pis
  }
}

// Zoom plafonné à 17 (~1,2 m/pixel), pas 19 — voir CarteTerrain.js pour la
// justification complète (couverture Esri incomplète en zone rurale au-delà).
export const ZOOM_MAX = 17;

export function ajouterFond(map) {
  const fond = L.tileLayer(SATELLITE.url, {
    attribution: SATELLITE.attribution,
    crossOrigin: true,
    maxZoom: ZOOM_MAX,
  }).addTo(map);
  fond.on('tileload', (e) => {
    if (estTuilePlaceholder(e.tile)) e.tile.style.visibility = 'hidden';
  });
  L.tileLayer(LABELS.url, {
    attribution: LABELS.attribution,
    subdomains: LABELS.subdomains,
    crossOrigin: true,
    maxZoom: ZOOM_MAX,
  }).addTo(map); // pane par défaut (tilePane) : sous le tracé, au-dessus du satellite
  return fond;
}

/** Palier « rond » (mètres) juste inférieur ou égal à la distance mesurée
 *  — pour une échelle graphique lisible (100 m plutôt que 97,3 m). Même
 *  logique que L.control.scale. PARTAGÉ entre toutes les cartographies
 *  exportées en PNG (Terrain, Favorabilité) pour ne jamais avoir deux
 *  règles d'arrondi différentes selon l'écran. */
export const PALIERS_ECHELLE_M = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
export function palierEchelle(m) {
  const eligibles = PALIERS_ECHELLE_M.filter((p) => p <= m);
  return eligibles.length ? eligibles[eligibles.length - 1] : PALIERS_ECHELLE_M[0];
}

/**
 * Rasterise les tuiles Leaflet CHARGÉES d'un conteneur de carte sur un
 * nouveau canevas, à la résolution d'export (≥2×, indépendamment du
 * devicePixelRatio de l'écran — pour une image nette à l'impression et
 * dans le rapport). PARTAGÉ entre CarteTerrain.js et CarteFavorabilite.js
 * : chacune dessine ensuite SES PROPRES calques vectoriels (contour,
 * grille colorée, cartouche) par-dessus ce même socle.
 *
 * Fonctionne uniquement si les tuiles ont été chargées en CORS (voir
 * ajouterFond) — sinon le canevas est « taché » et toDataURL() lève une
 * exception, à intercepter par l'appelant avec un message explicite.
 */
export function creerCanvasExport(container) {
  const rect = container.getBoundingClientRect();
  const ratio = Math.max(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(ratio, ratio);

  const tuiles = container.querySelectorAll('.leaflet-tile-pane img.leaflet-tile-loaded');
  tuiles.forEach((img) => {
    const r = img.getBoundingClientRect();
    try { ctx.drawImage(img, r.left - rect.left, r.top - rect.top, r.width, r.height); } catch { /* tuile isolée illisible : ignorée */ }
  });

  return { canvas, ctx, rect };
}

export function creerCarte(container, { interactive }) {
  const map = L.map(container, {
    center: [31.792, -7.083], // centre approx. du Maroc, par défaut
    zoom: interactive ? 6 : 5,
    minZoom: interactive ? 2 : 3,
    maxZoom: ZOOM_MAX,
    zoomControl: false,
    dragging: interactive,
    scrollWheelZoom: interactive,
    doubleClickZoom: false,
    boxZoom: interactive,
    keyboard: interactive,
    touchZoom: interactive,
    attributionControl: interactive,
  });
  if (interactive) L.control.zoom({ position: 'bottomleft' }).addTo(map);
  ajouterFond(map);
  return { map };
}

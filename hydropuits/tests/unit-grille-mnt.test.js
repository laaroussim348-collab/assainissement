/**
 * unit-grille-mnt.test.js — grille de calcul métrique + interpolation
 * bilinéaire du MNT (§4, §7).
 * -----------------------------------------------------------------------
 * MNT SYNTHÉTIQUE : un PLAN INCLINÉ z = a·lat + b·lon + c. La bilinéaire
 * d'un plan est EXACTE (un plan est déjà bilinéaire) : l'interpolation
 * doit reproduire la formule au bit près, quel que soit le point — c'est
 * le test analytique le plus direct possible pour ce module.
 * -----------------------------------------------------------------------
 */
import {
  depuisElevationOpenMeteo, depuisOpenTopographyAscii, interpolerBilineaire, construireGrilleCalcul,
} from '../src/calculations/grilleMnt.js';

// ── Grille source Open-Meteo synthétique : plan z = 100 + 1000·(lat-31.6) - 2000·(lon+8) ──
const A = 1000, B = -2000, C = 100;
const planZ = (lat, lon) => A * (lat - 31.6) + B * (lon - (-8)) + C;

function grilleOpenMeteoSynthetique(latMin, latMax, lonMin, lonMax, nbLignes, nbColonnes) {
  const points = [];
  for (let i = 0; i < nbLignes; i++) {
    const lat = latMin + (i / (nbLignes - 1)) * (latMax - latMin);
    for (let j = 0; j < nbColonnes; j++) {
      const lon = lonMin + (j / (nbColonnes - 1)) * (lonMax - lonMin);
      points.push({ lat, lon, altitude_m: planZ(lat, lon) });
    }
  }
  return { points, nbLignes, nbColonnes };
}

const SOURCE_PLAN = grilleOpenMeteoSynthetique(31.590, 31.610, -8.010, -7.990, 11, 11);

// ── Grille source OpenTopography (.asc) synthétique, même plan ──
function grilleOpenTopoSynthetique() {
  const nrows = 6, ncols = 6, cellsize = 0.004, xllcorner = -8.010, yllcorner = 31.590;
  const valeurs = new Array(nrows * ncols);
  for (let ligneAscii = 0; ligneAscii < nrows; ligneAscii++) {
    // AAIGrid : ligne 0 = NORD
    const lat = yllcorner + (nrows - 1 - ligneAscii) * cellsize;
    for (let col = 0; col < ncols; col++) {
      const lon = xllcorner + col * cellsize;
      valeurs[ligneAscii * ncols + col] = planZ(lat, lon);
    }
  }
  return { ncols, nrows, xllcorner, yllcorner, cellsize, nodata: -9999, valeurs };
}

const CARRE = [
  { lat: 31.598, lon: -8.004 }, { lat: 31.598, lon: -7.996 },
  { lat: 31.602, lon: -7.996 }, { lat: 31.602, lon: -8.004 },
];

export const casGrilleMnt = [
  // ── depuisElevationOpenMeteo ──
  {
    libelle: 'Adaptateur Open-Meteo : bornes correctes',
    attendu: '31.59,31.61,-8.01,-7.99',
    source: '§4', executer: () => {
      const g = depuisElevationOpenMeteo(SOURCE_PLAN);
      return `${g.latMin},${g.latMax},${g.lonMin},${g.lonMax}`;
    },
  },
  {
    libelle: 'Adaptateur Open-Meteo : valeur(0,0) = coin sud-ouest',
    attendu: planZ(31.590, -8.010),
    tolerancePourcent: 1e-9,
    source: '§4', executer: () => depuisElevationOpenMeteo(SOURCE_PLAN).valeur(0, 0),
  },
  {
    libelle: 'Adaptateur Open-Meteo : refuse une structure incohérente',
    attendu: 'refus',
    source: 'garde-fou',
    executer: () => { try { depuisElevationOpenMeteo({ points: [], nbLignes: 3, nbColonnes: 3 }); return 'aucun refus'; } catch { return 'refus'; } },
  },

  // ── depuisOpenTopographyAscii : convention nord/sud inversée par rapport à Open-Meteo ──
  {
    libelle: 'Adaptateur OpenTopography : bornes correctes',
    attendu: true,
    source: '§4',
    executer: () => {
      const g = depuisOpenTopographyAscii(grilleOpenTopoSynthetique());
      return Math.abs(g.latMin - 31.590) < 1e-9 && Math.abs(g.lonMin - (-8.010)) < 1e-9;
    },
  },
  {
    libelle: 'Adaptateur OpenTopography : valeur(0,0) = coin SUD-ouest (pas nord — inversion appliquée)',
    attendu: planZ(31.590, -8.010),
    tolerancePourcent: 1e-6,
    source: '§4 — piège de convention AAIGrid (ligne 0 = nord)',
    executer: () => depuisOpenTopographyAscii(grilleOpenTopoSynthetique()).valeur(0, 0),
  },
  {
    libelle: 'Adaptateur OpenTopography : NODATA devient NaN',
    attendu: true,
    source: '§4 — trou, pas 0',
    executer: () => {
      const d = grilleOpenTopoSynthetique();
      d.valeurs[0] = -9999; // coin nord-ouest AAIGrid = valeur(nrows-1, 0) après inversion
      const g = depuisOpenTopographyAscii(d);
      return Number.isNaN(g.valeur(d.nrows - 1, 0));
    },
  },

  // ── interpolerBilineaire : exact sur un plan ──
  ...[[31.6, -8.0], [31.591, -8.009], [31.6035, -7.9912], [31.590, -8.010], [31.610, -7.990]].map(([lat, lon]) => ({
    libelle: `Bilinéaire exacte sur un plan, point (${lat},${lon})`,
    attendu: planZ(lat, lon),
    tolerancePourcent: 1e-8,
    source: '§4 (« interpolation bilinéaire ») — un plan est déjà bilinéaire, donc reproduit au bit près',
    executer: () => interpolerBilineaire(depuisElevationOpenMeteo(SOURCE_PLAN), lat, lon),
  })),
  {
    libelle: 'Bilinéaire : NaN hors emprise (pas d’extrapolation)',
    attendu: true,
    source: '§4', executer: () => Number.isNaN(interpolerBilineaire(depuisElevationOpenMeteo(SOURCE_PLAN), 32.0, -8.0)),
  },
  {
    libelle: 'Bilinéaire : NaN si un des 4 coins encadrants est un trou',
    attendu: true,
    source: '§4 (« pas de remplissage silencieux par 0 »)',
    executer: () => {
      const s = grilleOpenMeteoSynthetique(31.590, 31.610, -8.010, -7.990, 11, 11);
      s.points[0].altitude_m = NaN; // coin sud-ouest devient un trou
      const g = depuisElevationOpenMeteo(s);
      // point juste au-dessus du coin trouÃ© : le bloc bilinéaire l'englobe
      return Number.isNaN(interpolerBilineaire(g, 31.5905, -8.0095));
    },
  },
  {
    libelle: 'Bilinéaire : les deux sources (Open-Meteo, OpenTopography) s’accordent',
    attendu: true,
    source: 'cohérence croisée — même plan, deux adaptateurs différents',
    executer: () => {
      const v1 = interpolerBilineaire(depuisElevationOpenMeteo(SOURCE_PLAN), 31.601, -7.998);
      const v2 = interpolerBilineaire(depuisOpenTopographyAscii(grilleOpenTopoSynthetique()), 31.601, -7.998);
      return Math.abs(v1 - v2) < 0.01;
    },
  },

  // ── construireGrilleCalcul ──
  {
    libelle: 'Grille de calcul : refuse un contour invalide',
    attendu: 'refus',
    source: 'garde-fou',
    executer: () => { try { construireGrilleCalcul(CARRE.slice(0, 2), depuisElevationOpenMeteo(SOURCE_PLAN)); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'Grille de calcul : dimensions cohérentes (nbLignes × nbColonnes = altitudes.length)',
    attendu: 0,
    source: 'cohérence interne',
    executer: () => {
      const g = construireGrilleCalcul(CARRE, depuisElevationOpenMeteo(SOURCE_PLAN), { espacement_m: 50 });
      return g.altitudes.length - g.nbLignes * g.nbColonnes;
    },
  },
  {
    libelle: 'Grille de calcul : le centre du terrain est masqué « dedans »',
    attendu: 1,
    source: '§3.4 (« pas de calcul hors polygone »)',
    executer: () => {
      const g = construireGrilleCalcul(CARRE, depuisElevationOpenMeteo(SOURCE_PLAN), { espacement_m: 50 });
      const iCentre = Math.floor(g.nbLignes / 2);
      const jCentre = Math.floor(g.nbColonnes / 2);
      return g.masque[iCentre * g.nbColonnes + jCentre];
    },
  },
  {
    libelle: 'Grille de calcul : un coin de la marge est masqué « dehors »',
    attendu: 0,
    source: '§3.4',
    executer: () => {
      const g = construireGrilleCalcul(CARRE, depuisElevationOpenMeteo(SOURCE_PLAN), { espacement_m: 50 });
      return g.masque[0]; // coin sud-ouest de la grille = dans la marge, hors du carré
    },
  },
  {
    libelle: 'Grille de calcul : au moins une cellule dans le polygone',
    attendu: true,
    source: 'cohérence — un terrain non vide doit produire un masque non vide',
    executer: () => {
      const g = construireGrilleCalcul(CARRE, depuisElevationOpenMeteo(SOURCE_PLAN), { espacement_m: 50 });
      return Array.from(g.masque).some((m) => m === 1);
    },
  },
  {
    libelle: 'Grille de calcul : altitudes interpolées proches du plan attendu',
    attendu: true,
    source: '§4 — la grille métrique doit rester fidèle à la source MNT',
    executer: () => {
      const g = construireGrilleCalcul(CARRE, depuisElevationOpenMeteo(SOURCE_PLAN), { espacement_m: 50 });
      const iCentre = Math.floor(g.nbLignes / 2);
      const jCentre = Math.floor(g.nbColonnes / 2);
      const idx = iCentre * g.nbColonnes + jCentre;
      const { lat, lon } = { lat: 31.6, lon: -8.0 }; // proche du centre du carré
      return Math.abs(g.altitudes[idx] - planZ(lat, lon)) < 50; // tolérance large : cellule voisine, pas le point exact
    },
  },
];

/**
 * unit-elevation-client.test.js — client Open-Meteo Elevation (§7 : «
 * construction d'URL et parsing de réponse de chaque client réseau, sur
 * réponses synthétiques »).
 * -----------------------------------------------------------------------
 * calculerGrilleElevation() est le morceau le plus délicat : c'est elle
 * qui décide combien de points interroger et à quel espacement, sans
 * jamais dépasser MAX_POINTS_GRILLE ni rogner l'emprise demandée. Les cas
 * ci-dessous couvrent un petit terrain (grille fine, sous le budget) et un
 * grand terrain (grille élargie, toujours sous le budget, mais avec
 * l'avertissement `espacementReduit`).
 * -----------------------------------------------------------------------
 */
import {
  buildElevationUrl, parseElevationResponse, calculerGrilleElevation, decouperEnLots,
  POINTS_PAR_REQUETE, MAX_POINTS_GRILLE, ESPACEMENT_CIBLE_M,
} from '../src/services/elevationClient.js';

const PETIT_CARRE = [
  { lat: 31.600, lon: -8.000 }, { lat: 31.600, lon: -7.996 },
  { lat: 31.603, lon: -7.996 }, { lat: 31.603, lon: -8.000 },
];

// ≈ 0,2° de côté (~20 km) : assez grand pour forcer l'élargissement de
// l'espacement sous MAX_POINTS_GRILLE = 4000, à l'espacement natif de 90 m.
const GRAND_CARRE = [
  { lat: 31.50, lon: -8.10 }, { lat: 31.50, lon: -7.90 },
  { lat: 31.70, lon: -7.90 }, { lat: 31.70, lon: -8.10 },
];

export const casElevationClient = [
  // ── buildElevationUrl ──
  {
    libelle: 'buildElevationUrl : latitudes et longitudes dans le bon ordre',
    attendu: 'https://api.open-meteo.com/v1/elevation?latitude=31.6,31.61&longitude=-8,-7.99',
    source: '§7', executer: () => buildElevationUrl([[31.6, -8], [31.61, -7.99]]),
  },
  {
    libelle: 'buildElevationUrl : un seul point',
    attendu: 'https://api.open-meteo.com/v1/elevation?latitude=31.6&longitude=-8',
    source: '§7', executer: () => buildElevationUrl([[31.6, -8]]),
  },

  // ── parseElevationResponse ──
  {
    libelle: 'parseElevationResponse : tableau de nombres',
    attendu: '450,1200.5,-10',
    source: '§7 — réponse synthétique reproduisant le format documenté',
    executer: () => parseElevationResponse({ elevation: [450, 1200.5, -10] }).join(','),
  },
  {
    libelle: 'parseElevationResponse : refuse un champ manquant',
    attendu: 'refus',
    source: '§7', executer: () => { try { parseElevationResponse({}); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'parseElevationResponse : refuse un champ non-tableau',
    attendu: 'refus',
    source: '§7',
    executer: () => { try { parseElevationResponse({ elevation: 'pas un tableau' }); return 'aucun refus'; } catch { return 'refus'; } },
  },

  // ── calculerGrilleElevation ──
  {
    libelle: 'Grille : refuse un contour à moins de 3 sommets',
    attendu: 'refus',
    source: 'garde-fou', executer: () => { try { calculerGrilleElevation(PETIT_CARRE.slice(0, 2)); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'Petit terrain : espacement natif conservé (pas réduit)',
    attendu: false,
    source: '§4 — pas de dégradation silencieuse de la résolution',
    executer: () => calculerGrilleElevation(PETIT_CARRE).espacementReduit,
  },
  {
    libelle: 'Petit terrain : sous le budget de points',
    attendu: true,
    source: '§3.3', executer: () => calculerGrilleElevation(PETIT_CARRE).points.length <= MAX_POINTS_GRILLE,
  },
  {
    libelle: 'Petit terrain : la grille couvre bien le contour (marge incluse)',
    attendu: true,
    source: 'interpolation bilinéaire (étape 5) — il faut un point de grille de chaque côté du contour',
    executer: () => {
      const g = calculerGrilleElevation(PETIT_CARRE);
      return g.bbox.latMin < 31.600 && g.bbox.latMax > 31.603 && g.bbox.lonMin < -8.000 && g.bbox.lonMax > -7.996;
    },
  },
  {
    libelle: 'Grand terrain : reste sous le budget de points',
    attendu: true,
    source: '§4 — MAX_POINTS_GRILLE jamais dépassé',
    executer: () => calculerGrilleElevation(GRAND_CARRE).points.length <= MAX_POINTS_GRILLE,
  },
  {
    libelle: 'Grand terrain : espacement élargi et signalé',
    attendu: true,
    source: '§5 — toute dégradation de résolution est annoncée',
    executer: () => {
      const g = calculerGrilleElevation(GRAND_CARRE);
      return g.espacementReduit === true && g.espacementReel_m > ESPACEMENT_CIBLE_M;
    },
  },
  {
    libelle: 'Grand terrain : la surface entière reste couverte (pas rognée)',
    attendu: true,
    source: '§5 — un terrain élargi en espacement, jamais tronqué en emprise',
    executer: () => {
      const g = calculerGrilleElevation(GRAND_CARRE);
      return g.bbox.latMax - g.bbox.latMin > 0.19 && g.bbox.lonMax - g.bbox.lonMin > 0.19;
    },
  },
  {
    libelle: 'Nombre de points = nbLignes × nbColonnes',
    attendu: 0,
    source: 'cohérence interne',
    executer: () => calculerGrilleElevation(PETIT_CARRE).points.length - (calculerGrilleElevation(PETIT_CARRE).nbLignes * calculerGrilleElevation(PETIT_CARRE).nbColonnes),
  },

  // ── decouperEnLots ──
  {
    libelle: `decouperEnLots : lots de ${POINTS_PAR_REQUETE} au plus`,
    attendu: true,
    source: '§7 — limite documentée Open-Meteo (100 points/requête)',
    executer: () => {
      const pts = Array.from({ length: 250 }, (_, i) => ({ lat: i, lon: i }));
      const lots = decouperEnLots(pts);
      return lots.every((l) => l.length <= POINTS_PAR_REQUETE) && lots.length === 3;
    },
  },
  {
    libelle: 'decouperEnLots : aucun point perdu ni dupliqué',
    attendu: 250,
    source: 'unité',
    executer: () => decouperEnLots(Array.from({ length: 250 }, (_, i) => ({ lat: i, lon: i }))).flat().length,
  },
];

/**
 * unit-open-topography-client.test.js — client OpenTopography GlobalDEM (§7).
 * -----------------------------------------------------------------------
 * parseAsciiGrid() est testée sur un fichier .asc synthétique ÉCRIT À LA
 * MAIN selon le format Arc/Info ASCII Grid documenté (voir l'en-tête
 * d'openTopographyClient.js) — pas un extrait recopié, pour pouvoir
 * vérifier chaque valeur lue contre ce qu'on a écrit.
 * -----------------------------------------------------------------------
 */
import { buildOpenTopographyUrl, parseAsciiGrid, TYPES_MNT } from '../src/services/openTopographyClient.js';

const BBOX = { latMin: 31.59, latMax: 31.61, lonMin: -8.01, lonMax: -7.99 };

// Grille 3×4 (nrows=3, ncols=4) écrite à la main, valeurs croissantes de
// gauche à droite puis du nord vers le sud (convention AAIGrid), avec un
// NODATA au milieu pour vérifier qu'il est bien lu tel quel (pas
// interprété comme une altitude de -9999 m).
const ASCII_GRID_SYNTHETIQUE = `ncols        4
nrows        3
xllcorner    -8.0100000000
yllcorner    31.5900000000
cellsize     0.0066666667
NODATA_value  -9999
100 101 102 103
110 -9999 112 113
120 121 122 123
`;

// Même grille, mais avec la convention xllcenter/yllcenter (alternative
// documentée du format Esri, voir en-tête de openTopographyClient.js) au
// lieu de xllcorner/yllcorner — xllcenter = xllcorner + cellsize/2.
const ASCII_GRID_CENTER = `ncols        4
nrows        3
xllcenter    -8.0066666667
yllcenter    31.5933333333
cellsize     0.0066666667
NODATA_value  -9999
100 101 102 103
110 -9999 112 113
120 121 122 123
`;

export const casOpenTopographyClient = [
  // ── buildOpenTopographyUrl ──
  {
    libelle: 'URL : demtype et bbox corrects',
    attendu: true,
    source: '§7',
    executer: () => {
      const u = buildOpenTopographyUrl(BBOX, 'MA-CLE-TEST', 'copernicus-30');
      return ['demtype=COP30', 'south=31.59', 'north=31.61', 'west=-8.01', 'east=-7.99'].every((f) => u.includes(f));
    },
  },
  {
    libelle: 'URL : outputFormat=AAIGrid (pas GTiff)',
    attendu: true,
    source: 'choix documenté — pas de lecteur GeoTIFF sans dépendance',
    executer: () => buildOpenTopographyUrl(BBOX, 'MA-CLE-TEST').includes('outputFormat=AAIGrid'),
  },
  {
    libelle: 'URL : clé transmise',
    attendu: true,
    source: '§3.3', executer: () => buildOpenTopographyUrl(BBOX, 'MA-CLE-TEST').includes('API_Key=MA-CLE-TEST'),
  },
  {
    libelle: 'URL : type SRTM sélectionnable',
    attendu: true,
    source: '§3.3 (« OpenTopography — MNT haute résolution […] SRTM 30 m, ALOS »)',
    executer: () => buildOpenTopographyUrl(BBOX, 'k', 'srtm-30').includes(`demtype=${TYPES_MNT['srtm-30'].demtype}`),
  },
  {
    libelle: 'URL : refuse une clé absente (jamais fournie par le logiciel)',
    attendu: 'refus',
    source: '§3.3 (règle absolue — aucune clé n’est fournie par HydroPuits)',
    executer: () => { try { buildOpenTopographyUrl(BBOX, ''); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'URL : refuse une emprise invalide (sud ≥ nord)',
    attendu: 'refus',
    source: 'garde-fou',
    executer: () => { try { buildOpenTopographyUrl({ latMin: 32, latMax: 31, lonMin: -8, lonMax: -7 }, 'k'); return 'aucun refus'; } catch { return 'refus'; } },
  },

  // ── parseAsciiGrid ──
  {
    libelle: 'ASCII Grid : en-tête lu correctement',
    attendu: '4,3,0.0066666667',
    source: '§7', executer: () => {
      const g = parseAsciiGrid(ASCII_GRID_SYNTHETIQUE);
      return `${g.ncols},${g.nrows},${g.cellsize}`;
    },
  },
  {
    libelle: 'ASCII Grid : nombre de valeurs = nrows × ncols',
    attendu: 12,
    source: '§7', executer: () => parseAsciiGrid(ASCII_GRID_SYNTHETIQUE).valeurs.length,
  },
  {
    libelle: 'ASCII Grid : valeur(0,0) = coin nord-ouest',
    attendu: 100,
    source: 'convention AAIGrid — la grille commence au nord',
    executer: () => parseAsciiGrid(ASCII_GRID_SYNTHETIQUE).valeur(0, 0),
  },
  {
    libelle: 'ASCII Grid : valeur(2,3) = coin sud-est',
    attendu: 123,
    source: 'convention AAIGrid', executer: () => parseAsciiGrid(ASCII_GRID_SYNTHETIQUE).valeur(2, 3),
  },
  {
    libelle: 'ASCII Grid : NODATA lu tel quel (pas altéré)',
    attendu: -9999,
    source: '§4 — pas de remplissage silencieux des trous du MNT',
    executer: () => parseAsciiGrid(ASCII_GRID_SYNTHETIQUE).valeur(1, 1),
  },
  {
    libelle: 'ASCII Grid : refuse un indice hors grille',
    attendu: 'refus',
    source: 'garde-fou',
    executer: () => { try { parseAsciiGrid(ASCII_GRID_SYNTHETIQUE).valeur(5, 5); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'ASCII Grid : détecte une erreur JSON renvoyée à la place du fichier',
    attendu: 'refus',
    source: '§5 — clé invalide ou quota dépassé signalés distinctement d’une erreur de format',
    executer: () => { try { parseAsciiGrid('{"error":"Invalid API key"}'); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'ASCII Grid : refuse un fichier tronqué',
    attendu: 'refus',
    source: '§7', executer: () => { try { parseAsciiGrid('ncols 4\nnrows 3\nxllcorner 0\nyllcorner 0\ncellsize 1\nNODATA_value -9999\n100 101\n'); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'ASCII Grid : refuse un en-tête incomplet',
    attendu: 'refus',
    source: '§7', executer: () => { try { parseAsciiGrid('ncols 4\nnrows 3\n100 101 102 103\n'); return 'aucun refus'; } catch { return 'refus'; } },
  },

  // ── Variante xllcenter/yllcenter (voir en-tête du module) ──
  {
    libelle: 'ASCII Grid (xllcenter) : accepté, ne s’arrête pas à la 3ᵉ ligne d’en-tête',
    attendu: true, source: 'bug réel constaté en usage (20/09/2026), voir en-tête du module',
    executer: () => { parseAsciiGrid(ASCII_GRID_CENTER); return true; },
  },
  {
    libelle: 'ASCII Grid (xllcenter) : xllcorner dérivé = xllcenter - cellsize/2',
    attendu: -8.0100000000, tolerancePourcent: 1e-6,
    source: 'relation exacte entre les deux conventions Esri',
    executer: () => {
      const g = parseAsciiGrid(ASCII_GRID_CENTER);
      return g.xllcorner;
    },
  },
  {
    libelle: 'ASCII Grid (xllcenter) : mêmes valeurs lues que la version xllcorner',
    attendu: true, source: 'cohérence — seule la convention d’en-tête change, pas la grille',
    executer: () => {
      const gCorner = parseAsciiGrid(ASCII_GRID_SYNTHETIQUE);
      const gCenter = parseAsciiGrid(ASCII_GRID_CENTER);
      return gCorner.valeur(0, 0) === gCenter.valeur(0, 0) && gCorner.valeur(2, 3) === gCenter.valeur(2, 3);
    },
  },
];

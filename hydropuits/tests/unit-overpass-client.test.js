/**
 * unit-overpass-client.test.js — client Overpass API (§7).
 * -----------------------------------------------------------------------
 * analyserReponseOverpass() est testée sur une réponse JSON synthétique
 * reproduisant fidèlement la structure documentée du format `out:json` +
 * `out skel qt` : des éléments `node` (avec lat/lon) et `way` (avec une
 * liste d'id de nœuds à résoudre) mélangés dans un seul tableau
 * `elements`, exactement comme Overpass les renvoie en pratique.
 * -----------------------------------------------------------------------
 */
import {
  construireRequeteFacteursHydro, buildOverpassUrl, analyserReponseOverpass,
  OVERPASS_URL_PRINCIPALE, RAYON_RECHERCHE_M_DEFAUT,
} from '../src/services/overpassClient.js';

// Réponse synthétique : un oued (way, 3 nœuds), une source, un puits
// existant, et une faille cartographiée (way, 2 nœuds) — reproduit le
// format documenté (voir en-tête d'overpassClient.js).
const REPONSE_SYNTHETIQUE = {
  version: 0.6,
  elements: [
    { type: 'node', id: 1, lat: 31.601, lon: -8.010 },
    { type: 'node', id: 2, lat: 31.602, lon: -8.005 },
    { type: 'node', id: 3, lat: 31.603, lon: -8.000 },
    { type: 'way', id: 100, nodes: [1, 2, 3], tags: { waterway: 'stream', name: 'Oued Test' } },
    { type: 'node', id: 4, lat: 31.598, lon: -7.997, tags: { natural: 'spring' } },
    { type: 'node', id: 5, lat: 31.599, lon: -7.998, tags: { man_made: 'water_well' } },
    { type: 'node', id: 6, lat: 31.590, lon: -8.020 },
    { type: 'node', id: 7, lat: 31.595, lon: -8.015 },
    { type: 'way', id: 101, nodes: [6, 7], tags: { geological: 'fault' } },
  ],
};

const REPONSE_VIDE = { version: 0.6, elements: [] };

export const casOverpassClient = [
  // ── construireRequeteFacteursHydro ──
  {
    libelle: 'Requête : contient les 4 filtres attendus',
    attendu: true,
    source: '§3.3 (cours d’eau, sources, puits, failles)',
    executer: () => {
      const q = construireRequeteFacteursHydro(31.6, -8.0);
      return ['waterway', 'natural"="spring"', 'man_made"="water_well"', 'geological"="fault"'].every((frag) => q.includes(frag));
    },
  },
  {
    libelle: 'Requête : rayon par défaut injecté',
    attendu: true,
    source: '§3.3', executer: () => construireRequeteFacteursHydro(31.6, -8.0).includes(`around:${RAYON_RECHERCHE_M_DEFAUT}`),
  },
  {
    libelle: 'Requête : rayon personnalisé injecté',
    attendu: true,
    source: '§3.4 (« rayon de recherche paramétrable »)',
    executer: () => construireRequeteFacteursHydro(31.6, -8.0, 5000).includes('around:5000'),
  },
  {
    libelle: 'Requête : format out:json demandé',
    attendu: true,
    source: 'unité', executer: () => construireRequeteFacteursHydro(31.6, -8.0).startsWith('[out:json]'),
  },
  {
    libelle: 'Requête : refuse une latitude hors bornes',
    attendu: 'refus',
    source: 'garde-fou', executer: () => { try { construireRequeteFacteursHydro(95, -8.0); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'Requête : refuse un rayon négatif',
    attendu: 'refus',
    source: 'garde-fou', executer: () => { try { construireRequeteFacteursHydro(31.6, -8.0, -10); return 'aucun refus'; } catch { return 'refus'; } },
  },

  // ── buildOverpassUrl ──
  {
    libelle: 'URL : encode correctement la requête',
    attendu: true,
    source: '§7', executer: () => buildOverpassUrl('a=b&c').startsWith(`${OVERPASS_URL_PRINCIPALE}?data=`) && buildOverpassUrl('a=b&c').includes(encodeURIComponent('a=b&c')),
  },

  // ── analyserReponseOverpass ──
  {
    libelle: 'Réponse : 1 cours d’eau reconnu',
    attendu: 1,
    source: '§7 — réponse synthétique', executer: () => analyserReponseOverpass(REPONSE_SYNTHETIQUE).coursEau.length,
  },
  {
    libelle: 'Réponse : le cours d’eau a ses 3 points résolus (pas juste des id)',
    attendu: '31.601,-8.01|31.602,-8.005|31.603,-8',
    source: '§7', executer: () => analyserReponseOverpass(REPONSE_SYNTHETIQUE).coursEau[0].map((p) => `${p.lat},${p.lon}`).join('|'),
  },
  {
    libelle: 'Réponse : 1 source reconnue',
    attendu: 1,
    source: '§7', executer: () => analyserReponseOverpass(REPONSE_SYNTHETIQUE).sources.length,
  },
  {
    libelle: 'Réponse : 1 puits existant reconnu',
    attendu: 1,
    source: '§7', executer: () => analyserReponseOverpass(REPONSE_SYNTHETIQUE).puitsExistants.length,
  },
  {
    libelle: 'Réponse : 1 faille reconnue (way geological=fault)',
    attendu: 1,
    source: '§7', executer: () => analyserReponseOverpass(REPONSE_SYNTHETIQUE).failles.length,
  },
  {
    libelle: 'Réponse : aucun avertissement quand tout est présent',
    attendu: 0,
    source: '§5', executer: () => analyserReponseOverpass(REPONSE_SYNTHETIQUE).avertissements.length,
  },
  {
    libelle: 'Réponse vide : avertissement « aucun cours d’eau »',
    attendu: 'srcAvtAucunCoursEauOsm',
    source: '§5 — absence de couche signalée, jamais masquée',
    executer: () => analyserReponseOverpass(REPONSE_VIDE).avertissements.find((a) => a.cle.includes('CoursEau'))?.cle,
  },
  {
    libelle: 'Réponse vide : avertissement « aucune faille »',
    attendu: 'srcAvtAucuneFailleOsm',
    source: '§5', executer: () => analyserReponseOverpass(REPONSE_VIDE).avertissements.find((a) => a.cle.includes('Faille'))?.cle,
  },
  {
    libelle: 'Réponse vide : listes vides, pas d’erreur',
    attendu: '0,0,0,0',
    source: 'robustesse',
    executer: () => {
      const r = analyserReponseOverpass(REPONSE_VIDE);
      return `${r.coursEau.length},${r.sources.length},${r.puitsExistants.length},${r.failles.length}`;
    },
  },
  {
    libelle: 'Réponse : refuse un format inattendu',
    attendu: 'refus',
    source: '§7', executer: () => { try { analyserReponseOverpass({}); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'Réponse : way sans tag pertinent ignoré (pas classé par erreur)',
    attendu: 0,
    source: 'robustesse',
    executer: () => analyserReponseOverpass({
      elements: [
        { type: 'node', id: 1, lat: 31.6, lon: -8.0 },
        { type: 'node', id: 2, lat: 31.6, lon: -8.0 },
        { type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'residential' } },
      ],
    }).coursEau.length,
  },
];

/**
 * unit-cache-donnees.test.js — cache disque des couches téléchargées (§3.3).
 * -----------------------------------------------------------------------
 * clefCache() est pure (testée directement). ecrireCache/lireCache/
 * supprimerCache/etatGlobalCache touchent le disque pour de vrai : les
 * tests ci-dessous utilisent un identifiant de source RÉSERVÉ AUX TESTS
 * (`__test-cache-donnees__`, absent du registre réel) sous
 * `.cache-donnees/`, déjà exclu du dépôt par .gitignore — nettoyé avant
 * ET après la suite pour ne jamais laisser de résidu, y compris si un
 * test précédent a échoué en cours de route.
 * -----------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clefCache, ecrireCache, lireCache, supprimerCache, etatGlobalCache,
} from '../src/services/cacheDonnees.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE_PROJET = path.join(__dirname, '..');
const ID_SOURCE_TEST = '__test-cache-donnees__';
const DOSSIER_TEST = path.join(RACINE_PROJET, '.cache-donnees', ID_SOURCE_TEST);

function nettoyer() {
  fs.rmSync(DOSSIER_TEST, { recursive: true, force: true });
}

const TERRAIN_A = [{ lat: 31.600000, lon: -8.000000 }, { lat: 31.600000, lon: -7.996000 }, { lat: 31.603000, lon: -7.996000 }];
const TERRAIN_A_BRUIT = [{ lat: 31.6000001, lon: -8.0000002 }, { lat: 31.6000003, lon: -7.9960001 }, { lat: 31.6029999, lon: -7.9960002 }];
const TERRAIN_B = [{ lat: 31.700000, lon: -8.100000 }, { lat: 31.700000, lon: -8.096000 }, { lat: 31.703000, lon: -8.096000 }];

nettoyer(); // avant la suite, au cas où une exécution précédente aurait échoué

export const casCacheDonnees = [
  // ── clefCache (pure) ──
  {
    libelle: 'clefCache : déterministe (même entrée → même clef)',
    attendu: true,
    source: '§3.3', executer: () => clefCache('src', TERRAIN_A, { p: 1 }) === clefCache('src', TERRAIN_A, { p: 1 }),
  },
  {
    libelle: 'clefCache : insensible au bruit flottant sous ~11 cm',
    attendu: true,
    source: '§3.3 (« un terrain retravaillé ne re-télécharge pas ») — un tracé souris n’est jamais deux fois pixel-identique',
    executer: () => clefCache('src', TERRAIN_A, {}) === clefCache('src', TERRAIN_A_BRUIT, {}),
  },
  {
    libelle: 'clefCache : diffère pour un autre terrain',
    attendu: false,
    source: '§3.3', executer: () => clefCache('src', TERRAIN_A, {}) === clefCache('src', TERRAIN_B, {}),
  },
  {
    libelle: 'clefCache : diffère pour une autre source',
    attendu: false,
    source: '§3.3', executer: () => clefCache('src-1', TERRAIN_A, {}) === clefCache('src-2', TERRAIN_A, {}),
  },
  {
    libelle: 'clefCache : diffère si les paramètres changent',
    attendu: false,
    source: '§3.3 — une résolution différente redemande un téléchargement',
    executer: () => clefCache('src', TERRAIN_A, { espacement_m: 90 }) === clefCache('src', TERRAIN_A, { espacement_m: 30 }),
  },
  {
    libelle: 'clefCache : insensible à l’ordre des paramètres',
    attendu: true,
    source: 'robustesse', executer: () => clefCache('src', TERRAIN_A, { a: 1, b: 2 }) === clefCache('src', TERRAIN_A, { b: 2, a: 1 }),
  },
  {
    libelle: 'clefCache : refuse un contour vide',
    attendu: 'refus',
    source: 'garde-fou', executer: () => { try { clefCache('src', []); return 'aucun refus'; } catch { return 'refus'; } },
  },

  // ── écriture / lecture réelles sur disque ──
  {
    libelle: 'lireCache : cache froid renvoie null (pas une erreur)',
    attendu: null,
    source: '§3.3', executer: () => lireCache(ID_SOURCE_TEST, 'clef-absente'),
  },
  {
    libelle: 'ecrireCache puis lireCache : les données reviennent identiques',
    attendu: '{"points":[1,2,3]}',
    source: '§3.3 (« re-jouable hors ligne à partir du cache »)',
    executer: () => {
      const clef = clefCache(ID_SOURCE_TEST, TERRAIN_A, {});
      ecrireCache(ID_SOURCE_TEST, clef, { points: [1, 2, 3] }, { resolutionObtenue: '90 m' });
      const relu = lireCache(ID_SOURCE_TEST, clef);
      return JSON.stringify(relu.donnees);
    },
  },
  {
    libelle: 'ecrireCache : les métadonnées (résolution obtenue) sont conservées',
    attendu: '90 m',
    source: '§6 (« résolution obtenue » affichée dans l’onglet Données)',
    executer: () => {
      const clef = clefCache(ID_SOURCE_TEST, TERRAIN_A, {});
      const relu = lireCache(ID_SOURCE_TEST, clef);
      return relu.meta.resolutionObtenue;
    },
  },
  {
    libelle: 'ecrireCache : horodatage ajouté automatiquement',
    attendu: true,
    source: 'unité',
    executer: () => {
      const clef = clefCache(ID_SOURCE_TEST, TERRAIN_A, {});
      const relu = lireCache(ID_SOURCE_TEST, clef);
      return typeof relu.meta.telechargeLe === 'string' && !Number.isNaN(Date.parse(relu.meta.telechargeLe));
    },
  },
  {
    libelle: 'Un terrain retravaillé (même contour) retrouve le cache',
    attendu: true,
    source: '§3.3',
    executer: () => {
      const clef1 = clefCache(ID_SOURCE_TEST, TERRAIN_A, {});
      const clef2 = clefCache(ID_SOURCE_TEST, TERRAIN_A_BRUIT, {});
      return lireCache(ID_SOURCE_TEST, clef1) !== null && clef1 === clef2;
    },
  },
  {
    libelle: 'etatGlobalCache : compte l’entrée écrite',
    attendu: true,
    source: '§6', executer: () => (etatGlobalCache()[ID_SOURCE_TEST] || 0) >= 1,
  },
  {
    libelle: 'supprimerCache : l’entrée disparaît',
    attendu: null,
    source: 'unité',
    executer: () => {
      const clef = clefCache(ID_SOURCE_TEST, TERRAIN_A, {});
      supprimerCache(ID_SOURCE_TEST, clef);
      return lireCache(ID_SOURCE_TEST, clef);
    },
  },
  {
    libelle: 'supprimerCache : idempotente (pas d’erreur sur une clef déjà absente)',
    attendu: 'aucune erreur',
    source: 'robustesse',
    executer: () => { try { supprimerCache(ID_SOURCE_TEST, 'deja-absente'); return 'aucune erreur'; } catch (e) { return e.message; } },
  },
  {
    // DERNIER cas de la suite, volontairement : run-tests.js exécute les
    // `executer()` dans l'ordre du tableau, donc c'est ici — pas au niveau
    // du module, qui s'évalue avant qu'aucun test n'ait tourné — que le
    // nettoyage a réellement lieu APRÈS les écritures faites plus haut.
    libelle: 'Nettoyage final : aucun résidu laissé sous .cache-donnees/',
    attendu: 'aucune erreur',
    source: 'propreté du dépôt de travail (déjà gitignoré, mais autant ne rien laisser)',
    executer: () => { try { nettoyer(); return 'aucune erreur'; } catch (e) { return e.message; } },
  },
];

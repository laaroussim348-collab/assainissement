/**
 * server.mjs — Serveur de fichiers statiques, sans aucune dépendance externe.
 * -----------------------------------------------------------------------
 * Sert le dossier /build (interface React, générée par `npm run build`) et
 * expose les routes API du logiciel. Repris de HydroCrue (server.mjs),
 * même structure, même client HTTP natif, aucun framework.
 *
 * POURQUOI un serveur local plutôt que des appels fetch directs depuis le
 * navigateur : trois raisons, toutes héritées de HydroCrue et toutes
 * vérifiées en production —
 *  1. La licence a besoin des modules Node `os` et `crypto` (adresses MAC,
 *     SHA-256) et d'écrire un fichier d'état : impossible côté renderer.
 *  2. Le presse-papiers natif d'Electron n'est accessible que depuis le
 *     processus PRINCIPAL, où tourne ce serveur (voir /api/clipboard-*).
 *  3. Les services de données (étape 4) n'ont pas tous des en-têtes CORS ;
 *     passer par ici évite d'en dépendre, et permet de mettre en cache sur
 *     disque une fois pour toutes.
 *
 * ROUTES :
 *   GET  /api/activation-status  -> { active, raison?, expiresAt?, machineId, ... }
 *   GET  /api/machine-id         -> { machineId }
 *   POST /api/activer  {code}    -> { ok:false, erreur } (modèle sans code)
 *   GET  /api/clipboard-read     -> { ok, texte }   (404 hors Electron)
 *   POST /api/clipboard-write    -> { ok }          (404 hors Electron)
 *
 *   GET    /api/sources                 -> registre des sources + état (cache, clé) — accessible sans activation, c'est de la simple consultation
 *   POST   /api/diagnostic              -> teste chaque service et renvoie un rapport (sans aucune clé) — sans activation, volontairement
 *   POST   /api/cles/:idSource {cle}     -> enregistre une clé saisie par l'utilisateur (réservé aux postes activés, comme les téléchargements)
 *   DELETE /api/cles/:idSource           -> supprime une clé enregistrée
 *   POST   /api/telechargement/:idSource {sommets, parametres} -> démarre (ou récupère du cache) -> { jobId }
 *   GET    /api/telechargement/etat/:jobId      -> état courant (sondage périodique côté interface)
 *   POST   /api/telechargement/annuler/:jobId   -> demande d'annulation
 * Les 3 dernières routes sont réservées aux installations activées, comme
 * les routes réseau de HydroCrue (/api/delineation, /api/pluviometrie) —
 * ce sont les seules à consommer le quota des services tiers.
 *
 * Lancement :  npm run build && npm run server   →  http://localhost:3000
 * -----------------------------------------------------------------------
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { obtenirMachineId, activerAvecCode, verifierActivation } from './src/services/activationClient.js';
import { SOURCES, obtenirSource } from './src/services/sourcesDonnees.js';
import { enregistrerCle, supprimerCle, toutesLesClesPresentes } from './src/services/clesLocales.js';
import { etatGlobalCache } from './src/services/cacheDonnees.js';
import { demarrerTelechargement, etatTelechargement, annulerTelechargement } from './src/services/telechargementJobs.js';
import { executerDiagnostic } from './src/services/diagnosticReseau.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// build/ (sortie de `react-scripts build`) est embarqué dans l'app (archive
// .asar d'Electron) pour une distribution en un seul .exe installable.
const RACINE_STATIQUE = __dirname;
const RACINE_BUILD = path.join(__dirname, 'build');
const PORT = process.env.PORT || 3000;

function sendJson(res, statusCode, obj) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

// ---------------------------------------------------------------------
// Presse-papiers natif Electron (src/ui.js, Copier/Couper/Coller).
// navigator.clipboard SEUL ne suffit pas : Electron n'accorde par défaut
// aucune permission clipboard-read/clipboard-write au renderer (aucune
// invite non plus, la promesse échoue juste en silence), d'où
// « Copier/Coller ne marche pas » une fois le logiciel installé alors que
// ça fonctionnait en navigateur pendant le développement. Diagnostic et
// correctif entièrement repris de HydroCrue, où ils ont été validés chez
// le client — ne pas « simplifier » ce chemin sans le retester DANS
// l'application installée.
//
// process.versions.electron n'est présent QUE si ce processus tourne
// réellement sous le binaire Electron (pas `node server.mjs` en dev).
// Résolution VOLONTAIREMENT différée au premier appel réel : ce module est
// importé par electron-main.mjs AVANT même app.whenReady().
let clipboardElectronPromise = null;
function obtenirClipboardElectron() {
  if (!process.versions?.electron) return Promise.resolve(null);
  if (!clipboardElectronPromise) {
    clipboardElectronPromise = import('electron')
      // Deux formes possibles selon la version de Node/Electron quand un
      // module CommonJS est importé depuis un fichier ESM : propriétés
      // nommées directement, ou seulement `.default`. Lire les deux.
      .then((m) => m.clipboard || m.default?.clipboard || null)
      .catch(() => null);
  }
  return clipboardElectronPromise;
}

async function apiActivationStatus(res) {
  // statut.essai est déjà positionné par activationClient.js (true en essai,
  // absent une fois licencié).
  const statut = await verifierActivation();
  sendJson(res, 200, statut);
}

function apiMachineId(res) {
  sendJson(res, 200, { machineId: obtenirMachineId() });
}

async function apiActiver(req, res) {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', async () => {
    try {
      const { code } = JSON.parse(body || '{}');
      if (!code) { sendJson(res, 400, { ok: false, erreur: 'Code manquant.' }); return; }
      const resultat = await activerAvecCode(code.trim());
      sendJson(res, 200, { ok: true, expiresAt: resultat.expiresAt });
    } catch (e) {
      sendJson(res, 200, { ok: false, erreur: e.message });
    }
  });
}

// ---------------------------------------------------------------------
// Routes du registre des sources de données (étape 4).
// ---------------------------------------------------------------------

/** GET /api/sources -> registre + état de cache + état des clés, fusionnés
 *  pour que l'onglet Données n'ait qu'un seul appel à faire. Ne fait AUCUN
 *  appel réseau externe : c'est de la consultation d'état local. */
function apiSources(res) {
  const cache = etatGlobalCache();
  const cles = toutesLesClesPresentes();
  const sources = SOURCES.map((s) => ({
    ...s,
    nbEntreesCache: cache[s.id] || 0,
    cle: s.cleRequise ? (cles[s.id] || { presente: false }) : undefined,
  }));
  sendJson(res, 200, { sources });
}

/** POST /api/diagnostic -> teste chaque service et renvoie un rapport factuel.
 *  Voir services/diagnosticReseau.js : aucune clé d'API ne figure dans le
 *  rapport, qui est fait pour être copié et transmis. */
async function apiDiagnostic(res) {
  try {
    const rapport = await executerDiagnostic();
    sendJson(res, 200, { ok: true, rapport });
  } catch (e) {
    sendJson(res, 500, { ok: false, erreur: e.message });
  }
}

function lireCorpsJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(new Error(`Corps JSON invalide : ${e.message}`)); }
    });
    req.on('error', reject);
  });
}

async function apiEnregistrerCle(req, res, idSource) {
  try {
    obtenirSource(idSource); // lève si la source est inconnue
    const { cle } = await lireCorpsJson(req);
    enregistrerCle(idSource, cle);
    sendJson(res, 200, { ok: true });
  } catch (e) {
    sendJson(res, 400, { ok: false, erreur: e.message });
  }
}

function apiSupprimerCle(res, idSource) {
  try {
    obtenirSource(idSource);
    supprimerCle(idSource);
    sendJson(res, 200, { ok: true });
  } catch (e) {
    sendJson(res, 400, { ok: false, erreur: e.message });
  }
}

async function apiDemarrerTelechargement(req, res, idSource) {
  try {
    const statutLicence = await verifierActivation();
    if (!statutLicence.active) {
      sendJson(res, 403, { ok: false, erreur: "Logiciel non activé — voir l'écran d'activation.", licence: statutLicence });
      return;
    }
    const { sommets, parametres } = await lireCorpsJson(req);
    const jobId = demarrerTelechargement(idSource, sommets, parametres || {});
    sendJson(res, 200, { ok: true, jobId });
  } catch (e) {
    sendJson(res, 400, { ok: false, erreur: e.message });
  }
}

function apiEtatTelechargement(res, jobId) {
  const etat = etatTelechargement(jobId);
  if (!etat) { sendJson(res, 404, { ok: false, erreur: 'Identifiant de téléchargement inconnu (redémarrage du logiciel entre-temps ?).' }); return; }
  sendJson(res, 200, { ok: true, ...etat });
}

function apiAnnulerTelechargement(res, jobId) {
  const annule = annulerTelechargement(jobId);
  sendJson(res, 200, { ok: annule });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  // --- Licence : ces 3 routes restent accessibles MÊME SANS activation ---
  if (urlPath === '/api/activation-status' && req.method === 'GET') { await apiActivationStatus(res); return; }
  if (urlPath === '/api/machine-id' && req.method === 'GET') { apiMachineId(res); return; }
  if (urlPath === '/api/activer' && req.method === 'POST') { await apiActiver(req, res); return; }

  // --- Presse-papiers : Copier/Coller doit marcher même écran d'activation affiché ---
  if (urlPath === '/api/clipboard-read' && req.method === 'GET') {
    const cb = await obtenirClipboardElectron();
    if (!cb) { sendJson(res, 404, { ok: false, erreur: 'Presse-papiers natif indisponible (hors Electron).' }); return; }
    try {
      sendJson(res, 200, { ok: true, texte: cb.readText() });
    } catch (e) {
      sendJson(res, 500, { ok: false, erreur: e.message });
    }
    return;
  }
  if (urlPath === '/api/clipboard-write' && req.method === 'POST') {
    const cb = await obtenirClipboardElectron();
    if (!cb) { sendJson(res, 404, { ok: false, erreur: 'Presse-papiers natif indisponible (hors Electron).' }); return; }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const { texte } = JSON.parse(body || '{}');
        cb.writeText(texte || '');
        sendJson(res, 200, { ok: true });
      } catch (e) {
        sendJson(res, 400, { ok: false, erreur: e.message });
      }
    });
    return;
  }

  // --- Sources de données (étape 4) ---
  if (urlPath === '/api/sources' && req.method === 'GET') { apiSources(res); return; }

  // --- Diagnostic réseau (20/09/2026) ---
  // Volontairement accessible SANS activation : quand rien ne fonctionne,
  // c'est précisément le moment où l'on doit pouvoir savoir pourquoi.
  if (urlPath === '/api/diagnostic' && req.method === 'POST') { await apiDiagnostic(res); return; }

  {
    const mCle = urlPath.match(/^\/api\/cles\/([^/]+)$/);
    if (mCle && req.method === 'POST') { await apiEnregistrerCle(req, res, decodeURIComponent(mCle[1])); return; }
    if (mCle && req.method === 'DELETE') { apiSupprimerCle(res, decodeURIComponent(mCle[1])); return; }
  }

  {
    const mDemarrer = urlPath.match(/^\/api\/telechargement\/([^/]+)$/);
    if (mDemarrer && req.method === 'POST') { await apiDemarrerTelechargement(req, res, decodeURIComponent(mDemarrer[1])); return; }
  }
  {
    const mEtat = urlPath.match(/^\/api\/telechargement\/etat\/([^/]+)$/);
    if (mEtat && req.method === 'GET') { apiEtatTelechargement(res, mEtat[1]); return; }
  }
  {
    const mAnnuler = urlPath.match(/^\/api\/telechargement\/annuler\/([^/]+)$/);
    if (mAnnuler && req.method === 'POST') { apiAnnulerTelechargement(res, mAnnuler[1]); return; }
  }

  // Tout le reste est servi depuis /build (sortie de react-scripts build) ;
  // toute route inconnue retombe sur build/index.html (app monopage).
  const filePath = urlPath === '/' ? path.join(RACINE_BUILD, 'index.html') : path.join(RACINE_BUILD, urlPath);
  if (!path.resolve(filePath).startsWith(path.resolve(RACINE_STATIQUE))) {
    res.writeHead(403);
    res.end('Accès refusé.');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Route inconnue (pas d'extension de fichier) → repli sur index.html (app monopage)
      if (!path.extname(filePath)) {
        fs.readFile(path.join(RACINE_BUILD, 'index.html'), (err2, data2) => {
          if (err2) { res.writeHead(404); res.end('Introuvable.'); return; }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(data2);
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Fichier introuvable : ${urlPath}`);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  HydroPuits est lancé :  http://localhost:${PORT}\n`);
  console.log('  (Ctrl+C pour arrêter le serveur)\n');
});

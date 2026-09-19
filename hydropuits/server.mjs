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
 * ROUTES — état à l'étape 2 (squelette) :
 *   GET  /api/activation-status  -> { active, raison?, expiresAt?, machineId, ... }
 *   GET  /api/machine-id         -> { machineId }
 *   POST /api/activer  {code}    -> { ok:false, erreur } (modèle sans code)
 *   GET  /api/clipboard-read     -> { ok, texte }   (404 hors Electron)
 *   POST /api/clipboard-write    -> { ok }          (404 hors Electron)
 * Les routes de données (MNT, Overpass, NASA POWER, SoilGrids,
 * OpenTopography) et le cache disque arrivent à l'étape 4 — elles seront,
 * comme dans HydroCrue, réservées aux installations activées.
 *
 * Lancement :  npm run build && npm run server   →  http://localhost:3000
 * -----------------------------------------------------------------------
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { obtenirMachineId, activerAvecCode, verifierActivation } from './src/services/activationClient.js';

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

/**
 * electron-main.mjs — point d'entrée UNIQUE de l'application de bureau
 * HydroPuits (essai ET licence dans le même installeur).
 * -----------------------------------------------------------------------
 * Démarre le serveur local (server.mjs) et ouvre une fenêtre native pointée
 * dessus — comme un vrai logiciel installé (HEC-RAS, AutoCAD, Global
 * Mapper...), pas un site à ouvrir dans un navigateur. Le premier lancement
 * démarre automatiquement un essai gratuit (voir
 * src/services/activationClient.js, DUREE_ESSAI_HEURES) ; l'éditeur active
 * le poste à distance (par Identifiant Machine, depuis
 * admin/licences-admin.html) une fois le paiement reçu — aucune
 * réinstallation, aucun code à saisir.
 *
 * Repris de HydroCrue (electron-main.mjs), à une variable près :
 * HYDROPUITS_DATA_DIR remplace GRADEX_DATA_DIR, pour que les deux logiciels
 * installés sur le même poste ne partagent pas leur fichier d'état local.
 * -----------------------------------------------------------------------
 */
import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Doit être défini AVANT que server.mjs (et transitivement activationClient.js)
// ne s'exécute — voir src/services/activationClient.js, RACINE_ECRITURE :
// une fois l'app installée dans Program Files, son propre dossier n'est pas
// accessible en écriture, contrairement à app.getPath('userData').
process.env.HYDROPUITS_DATA_DIR = app.getPath('userData');
await import('./server.mjs'); // démarre l'écoute sur PORT (effet de bord, voir server.mjs)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const URL_APP = `http://localhost:${PORT}`;

Menu.setApplicationMenu(null); // pas de barre de menu générique Electron — le menu Fichier/Éditer est dans l'app elle-même

function creerFenetre() {
  const fenetre = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'HydroPuits',
    icon: path.join(__dirname, 'build-resources', 'icon.png'),
    backgroundColor: '#e8e8e8',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  fenetre.once('ready-to-show', () => fenetre.show());

  const charger = () => fenetre.loadURL(URL_APP);

  // Le serveur local peut n'être pas encore à l'écoute au tout premier
  // chargement : ces trois codes correspondent à « connexion refusée /
  // impossible de se connecter » — on réessaie au lieu d'afficher une page
  // d'erreur Chromium à l'utilisateur.
  fenetre.webContents.on('did-fail-load', (_e, code) => {
    if (code === -102 || code === -105 || code === -106) {
      setTimeout(charger, 300);
    }
  });

  charger();
}

// Nouveau / Ouvrir / Enregistrer un projet .hpu utilisent l'API navigateur
// File System Access (window.showSaveFilePicker / showOpenFilePicker),
// nativement disponible dans le moteur Chromium d'Electron — aucun pont IPC
// n'est nécessaire (voir src/App.js, enregistrerProjet / ouvrirProjet).

app.whenReady().then(() => {
  creerFenetre();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) creerFenetre();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * clesLocales.js
 * -----------------------------------------------------------------------
 * Stockage LOCAL des clés d'API que l'utilisateur colle lui-même après
 * s'être inscrit à une source de données tierce (§3.3, source
 * OpenTopography notamment).
 *
 * RÈGLE ABSOLUE (§3.3, reprise du cahier des charges mot pour mot) :
 * « le logiciel ne crée jamais de compte, ne se connecte jamais à un
 * compte Google/Gmail, n'automatise aucune inscription ». Ce module ne
 * fait QUE lire/écrire un fichier local — aucune requête réseau ici, y
 * compris pas de validation de la clé auprès du service (la validation
 * se fait naturellement au premier téléchargement réel, dont l'échec
 * éventuel est affiché tel quel).
 *
 * « la clé est stockée localement (même dossier que .activation-local.json),
 * jamais transmise ailleurs qu'au service concerné » : même
 * RACINE_ECRITURE que activationClient.js (HYDROPUITS_DATA_DIR, posé par
 * electron-main.mjs = app.getPath('userData')), fichier séparé pour ne
 * jamais mélanger état de licence et clés de sources tierces.
 * -----------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE_LECTURE = path.join(__dirname, '..', '..'); // src/services -> racine du projet
const RACINE_ECRITURE = process.env.HYDROPUITS_DATA_DIR || RACINE_LECTURE;
const FICHIER_CLES = path.join(RACINE_ECRITURE, '.cles-sources-donnees.json');

function lire() {
  try { return JSON.parse(fs.readFileSync(FICHIER_CLES, 'utf8')); }
  catch { return {}; }
}

function ecrire(donnees) {
  fs.mkdirSync(RACINE_ECRITURE, { recursive: true });
  // Permissions restreintes (lecture/écriture propriétaire uniquement) :
  // ce fichier contient des identifiants, même si ce sont des clés
  // gratuites à faible enjeu — même précaution que pour un fichier de
  // mots de passe. Sans effet sous Windows (ACL différentes), sans
  // conséquence négative non plus : ignoré silencieusement dans ce cas.
  fs.writeFileSync(FICHIER_CLES, JSON.stringify(donnees, null, 2), 'utf8', { mode: 0o600 });
}

/** Enregistre (ou remplace) la clé d'une source. Ne fait AUCUN appel réseau. */
export function enregistrerCle(idSource, cle) {
  if (!idSource || typeof idSource !== 'string') throw new Error('enregistrerCle : identifiant de source manquant.');
  if (!cle || typeof cle !== 'string' || cle.trim() === '') throw new Error('enregistrerCle : clé vide.');
  const donnees = lire();
  donnees[idSource] = { cle: cle.trim(), enregistreeLe: new Date().toISOString() };
  ecrire(donnees);
}

export function supprimerCle(idSource) {
  const donnees = lire();
  if (donnees[idSource]) {
    delete donnees[idSource];
    ecrire(donnees);
  }
}

/** Renvoie la clé en clair — usage interne (server.mjs, pour l'appel au service). */
export function obtenirCle(idSource) {
  return lire()[idSource]?.cle || null;
}

/**
 * État PUBLIC d'une clé (jamais la clé elle-même) — c'est ce que
 * server.mjs renvoie au client pour l'affichage : présente ou non, et
 * depuis quand, jamais la valeur. La clé ne quitte donc jamais le
 * processus serveur une fois saisie, y compris vers le renderer
 * Electron/le navigateur qui l'a pourtant envoyée une première fois pour
 * l'enregistrer.
 */
export function etatCle(idSource) {
  const entree = lire()[idSource];
  return entree ? { presente: true, enregistreeLe: entree.enregistreeLe } : { presente: false };
}

export function toutesLesClesPresentes() {
  const donnees = lire();
  const resultat = {};
  for (const id of Object.keys(donnees)) resultat[id] = etatCle(id);
  return resultat;
}

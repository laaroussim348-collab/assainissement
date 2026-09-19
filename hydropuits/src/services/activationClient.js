/**
 * activationClient.js
 * -----------------------------------------------------------------------
 * Gestion UNIFIÉE de l'activation HydroPuits — remplace à la fois l'ancien
 * licenseClient.js (licence par CODE, saisi manuellement) et trialClient.js
 * (essai purement local, invisible pour l'éditeur). Modèle demandé par
 * l'éditeur (façon AutoCAD) :
 *
 *  - UN SEUL build/installeur — plus de version d'essai séparée à
 *    construire/distribuer (voir scripts/build-essai.mjs, retiré).
 *  - Premier lancement : le poste s'enregistre automatiquement auprès du
 *    serveur de licence (Google Apps Script + Google Sheet, voir
 *    admin/licences-admin.html) par son Identifiant Machine — AUCUN code ni
 *    compte à saisir côté client.
 *  - Essai gratuit limité (DUREE_ESSAI_HEURES ci-dessous), décompté depuis
 *    le premier enregistrement CONNU DU SERVEUR (si le serveur est
 *    injoignable au tout premier lancement, repli sur l'horloge locale —
 *    redevient autoritaire dès que le serveur répond).
 *  - Passé ce délai : le poste passe "en attente de paiement", visible dans
 *    l'outil admin (Identifiant Machine + depuis quand). L'éditeur clique
 *    "Activer" en face de la ligne — AUCUN code à transmettre au client.
 *  - Contrôle serveur toutes les 60s (voir LicenceGate.js) : l'activation
 *    prend effet en direct, sans redémarrage ni saisie côté client.
 *  - Tolérance hors-ligne de PERIODE_GRACE_JOURS une fois DÉJÀ activé par
 *    l'éditeur, pour ne pas bloquer un client payant au moindre souci
 *    réseau ponctuel (même logique que l'ancien licenseClient.js).
 *
 * Fichier de configuration attendu : license-config.json (racine du projet,
 * embarqué dans l'app) — { "licenseServerUrl": "https://script.google.com/macros/s/XXXX/exec" }
 * Absent/incomplet : fonctionne comme un essai purement local (utile en dev
 * avant premier déploiement du script Apps Script).
 *
 * ⚠️ FEUILLE DE LICENCES PARTAGÉE AVEC HydroCrue — choix explicite de
 * l'éditeur (cahier des charges §2.4 : « conserve le même licenseServerUrl,
 * même Google Apps Script, même feuille de licences que HydroCrue »).
 * Conséquence assumée : l'Identifiant Machine étant calculé par le même
 * algorithme (machineId.js, repris à l'identique), un poste déjà activé
 * pour HydroCrue est reconnu comme activé pour HydroPuits, et
 * réciproquement — la licence est de fait attachée au POSTE, pas au
 * produit. Pour facturer les deux logiciels séparément il faudrait un
 * second déploiement Apps Script (donc un autre licenseServerUrl ici), ou
 * un champ "produit" ajouté côté script et côté URL de checkin.
 *
 * Seul le DOSSIER D'ÉTAT LOCAL diffère (HYDROPUITS_DATA_DIR, posé par
 * electron-main.mjs) : les deux logiciels ne se partagent pas leur fichier
 * .activation-local.json, donc pas leur date de premier lancement.
 * -----------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { genererMachineId } from './machineId.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE_LECTURE = path.join(__dirname, '..', '..'); // src/services -> racine du projet
const FICHIER_CONFIG = path.join(RACINE_LECTURE, 'license-config.json');

// Voir licenseClient.js (historique) : RACINE_ECRITURE doit pointer vers un
// dossier réellement accessible en écriture une fois l'app installée dans
// Program Files — electron-main.mjs définit HYDROPUITS_DATA_DIR = app.getPath('userData').
const RACINE_ECRITURE = process.env.HYDROPUITS_DATA_DIR || RACINE_LECTURE;
const FICHIER_ETAT = path.join(RACINE_ECRITURE, '.activation-local.json');

// Durée de l'essai gratuit avant blocage (heures) — 72h = 3 jours. Politique
// commerciale : un seul endroit à modifier (voir aussi le script Apps
// Script, TRIAL_HEURES, qui DOIT rester identique côté serveur).
export const DUREE_ESSAI_HEURES = 72;
const PERIODE_GRACE_JOURS = 7; // tolérance hors-ligne, une fois DÉJÀ activé par l'éditeur

function lireConfig() {
  try { return JSON.parse(fs.readFileSync(FICHIER_CONFIG, 'utf8')); }
  catch { return { licenseServerUrl: null }; }
}
function lireEtat() {
  try { return JSON.parse(fs.readFileSync(FICHIER_ETAT, 'utf8')); }
  catch { return null; }
}
function ecrireEtat(etat) {
  try {
    fs.mkdirSync(RACINE_ECRITURE, { recursive: true });
    fs.writeFileSync(FICHIER_ETAT, JSON.stringify(etat, null, 2), 'utf8');
  } catch {
    // Échec d'écriture (rarissime) : on ne bloque jamais l'utilisateur pour
    // ça — au pire l'état local n'est pas persisté cette fois-ci.
  }
}

function appelHttpJson(url, timeoutMs = 15000, redirectsRestants = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, (res) => {
      // Google Apps Script (/exec) répond TOUJOURS par une redirection HTTP
      // avant de renvoyer le vrai contenu JSON — voir licenseClient.js
      // (historique) pour le détail de cette contrainte.
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirectsRestants <= 0) {
          reject(new Error('Trop de redirections en contactant le serveur de licence.'));
          return;
        }
        resolve(appelHttpJson(res.headers.location, timeoutMs, redirectsRestants - 1));
        return;
      }
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Réponse du serveur de licence illisible.')); }
      });
    });
    req.on('error', (e) => reject(new Error(`Serveur de licence injoignable : ${e.message}`)));
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Délai dépassé en contactant le serveur de licence.')));
  });
}

export function obtenirMachineId() {
  return genererMachineId();
}

/**
 * Conservé UNIQUEMENT pour ne pas casser la forme d'API attendue par
 * server.mjs ({obtenirMachineId, activerAvecCode, verifierActivation}) —
 * le nouveau modèle n'utilise plus aucun code : l'éditeur active le poste
 * à distance, par Identifiant Machine, depuis l'outil admin.
 */
export async function activerAvecCode() {
  throw new Error(
    "HydroPuits n'utilise plus de code d'activation : communiquez votre Identifiant Machine à l'éditeur, " +
    'il active votre poste à distance (aucune saisie nécessaire ici — l\'application se débloque automatiquement).'
  );
}

/**
 * Vérifie l'état d'activation actuel — enregistrement automatique au tout
 * premier appel (côté serveur, via l'action "checkin"), contrôle serveur à
 * chaque appel suivant. Ne lève jamais d'exception — toujours exploitable
 * en toute sécurité par server.mjs.
 */
export async function verifierActivation() {
  const machineId = genererMachineId();
  const maintenant = Date.now();
  let etat = lireEtat();
  if (!etat) {
    etat = {
      machineId, premierLancement: maintenant,
      dernierControleOk: false, dernierControleLe: null,
      dernierStatut: null, dernierExpiresAt: null,
    };
    ecrireEtat(etat);
  }

  const config = lireConfig();
  if (!config.licenseServerUrl) {
    // Aucun serveur configuré : agit comme un essai purement local (dev, ou
    // avant premier déploiement du script Apps Script).
    return reponseHorsLigne(etat, machineId, maintenant);
  }

  try {
    const url = `${config.licenseServerUrl}?action=checkin&machineId=${encodeURIComponent(machineId)}`;
    const resultat = await appelHttpJson(url, 8000);
    etat = {
      ...etat,
      dernierControleOk: true,
      dernierControleLe: new Date(maintenant).toISOString(),
      dernierStatut: resultat.status || null,
      dernierExpiresAt: resultat.expiresAt || resultat.trialExpiresAt || null,
    };
    ecrireEtat(etat);

    if (resultat.active) {
      if (resultat.status === 'trial') {
        const heuresRestantes = Math.max(0, (new Date(resultat.trialExpiresAt).getTime() - maintenant) / 3600000);
        return { active: true, machineId, expiresAt: resultat.trialExpiresAt, source: 'essai', essai: true, heuresRestantes };
      }
      return { active: true, machineId, expiresAt: resultat.expiresAt || null, source: 'licence' };
    }
    return { active: false, raison: resultat.raison || 'essai_expire', machineId, expiresAt: resultat.expiresAt || resultat.trialExpiresAt || null };
  } catch {
    // Serveur injoignable : repli hors-ligne (tolérance limitée dans le temps).
    return reponseHorsLigne(etat, machineId, maintenant);
  }
}

function reponseHorsLigne(etat, machineId, maintenant) {
  // Déjà activé par le serveur lors d'un contrôle précédent : tolérance
  // hors-ligne classique (PERIODE_GRACE_JOURS depuis le dernier contrôle
  // réussi) — même logique que l'ancien licenseClient.js.
  if (etat.dernierStatut === 'active' && etat.dernierControleOk && etat.dernierControleLe) {
    // Licence à durée limitée déjà expirée au moment du dernier contrôle
    // réussi : la période de grâce hors-ligne ne doit pas prolonger l'accès
    // au-delà de cette date (sinon rester hors-ligne après expiration
    // suffirait à garder l'accès indéfiniment). Une licence permanente n'a
    // pas de dernierExpiresAt : non concernée par ce test.
    if (etat.dernierExpiresAt && new Date(etat.dernierExpiresAt).getTime() <= maintenant) {
      return { active: false, raison: 'licence_expiree', machineId, expiresAt: etat.dernierExpiresAt };
    }
    const joursDepuis = (maintenant - new Date(etat.dernierControleLe).getTime()) / 86400000;
    if (joursDepuis <= PERIODE_GRACE_JOURS) {
      return {
        active: true, machineId, expiresAt: etat.dernierExpiresAt, source: 'grace_hors_ligne',
        avertissement: `Serveur de licence injoignable — accès toléré ${Math.ceil(PERIODE_GRACE_JOURS - joursDepuis)} jour(s) de plus avant nouvelle vérification obligatoire.`,
      };
    }
    return { active: false, raison: 'serveur_injoignable_periode_grace_depassee', machineId };
  }

  // Jamais confirmé "actif" par le serveur (essai, ou serveur jamais
  // joignable) : applique l'essai purement local depuis le tout premier
  // lancement de CE poste — repli utile hors-ligne, redevient autoritaire
  // dès que le serveur répond.
  const heuresEcoulees = (maintenant - etat.premierLancement) / 3600000;
  const expiresAt = new Date(etat.premierLancement + DUREE_ESSAI_HEURES * 3600000).toISOString();
  if (heuresEcoulees >= DUREE_ESSAI_HEURES) {
    return { active: false, raison: 'essai_expire', machineId, expiresAt };
  }
  return {
    active: true, machineId, expiresAt, source: 'essai', essai: true,
    heuresRestantes: Math.max(0, DUREE_ESSAI_HEURES - heuresEcoulees),
  };
}

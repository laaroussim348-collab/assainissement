/**
 * reseauRobuste.js — couche réseau COMMUNE à tous les clients de données.
 * -----------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE (20/09/2026, après retour d'un utilisateur
 * réel) : jusqu'ici, chaque client faisait UN SEUL `fetch`, sans aucun
 * réessai. Conséquence mesurable sur le téléchargement d'altimétrie, qui
 * enchaîne jusqu'à 40 requêtes (4000 points / 100 par requête) : il
 * suffisait d'UN incident passager sur l'une des 40 — coupure d'une
 * seconde, 503 momentané, quota 429 — pour faire échouer la totalité du
 * téléchargement, sans rien conserver de ce qui avait déjà répondu. Sur
 * une connexion mobile ou lente, c'est le cas le plus probable, pas le
 * cas rare.
 *
 * Ce module ne fait qu'une chose : appeler le réseau CORRECTEMENT.
 *  - réessai avec temporisation exponentielle sur les échecs PASSAGERS ;
 *  - respect de l'en-tête `Retry-After` quand le serveur l'envoie ;
 *  - aucun réessai sur une erreur DÉFINITIVE (400, 401, 403, 404…) :
 *    réessayer une clé invalide ne la rendra pas valide, ça ne ferait
 *    qu'allonger l'attente avant d'afficher la vraie cause ;
 *  - annulation propre (bouton « Annuler » de l'onglet Données) à tout
 *    moment, y compris PENDANT une temporisation entre deux réessais.
 *
 * SÉPARATION PUR / RÉSEAU (cahier des charges) : les trois fonctions de
 * décision (`estStatutReessayable`, `estErreurReseauReessayable`,
 * `delaiAvantReessai`) sont PURES et testées hors ligne. Seule
 * `fetchRobuste` touche au réseau.
 * -----------------------------------------------------------------------
 */

/**
 * Codes HTTP considérés comme PASSAGERS, donc réessayables.
 *
 * ORIGINE (RFC 9110 pour la sémantique de chaque code) :
 *  - 408 Request Timeout      : le serveur a renoncé à attendre la requête
 *  - 425 Too Early            : rejeu refusé, retenter plus tard est prévu
 *  - 429 Too Many Requests    : quota — c'est LE cas où réessayer est la
 *                               conduite explicitement attendue
 *  - 500 / 502 / 503 / 504    : panne ou surcharge côté serveur, par
 *                               définition non imputable à notre requête
 * Tout le reste (400, 401, 403, 404, 422…) décrit un problème de NOTRE
 * requête : le réessayer donnerait exactement la même réponse.
 */
export const CODES_HTTP_REESSAYABLES = [408, 425, 429, 500, 502, 503, 504];

/**
 * Nombre de tentatives TOTAL (1 tentative initiale + réessais).
 *
 * ORIGINE : choix par défaut. Avec la temporisation ci-dessous (1s, 2s,
 * 4s), 3 tentatives couvrent l'incident passager typique — coupure de
 * quelques secondes, redémarrage d'un nœud derrière un répartiteur de
 * charge — sans transformer une panne franche en attente d'une minute
 * avant que l'utilisateur voie enfin le message d'erreur.
 */
export const TENTATIVES_DEFAUT = 3;

/**
 * Temporisation de base entre deux tentatives, en millisecondes.
 * ORIGINE : 1 s, doublée à chaque tentative (1 s, 2 s, 4 s…). Valeur
 * usuelle d'une temporisation exponentielle ; assez longue pour laisser
 * passer un incident réseau bref, assez courte pour rester supportable.
 */
export const DELAI_BASE_MS = 1000;

/**
 * Plafond de la temporisation, en millisecondes.
 * ORIGINE : 30 s. Au-delà, l'utilisateur croit le logiciel figé. Sert
 * aussi de garde-fou si un serveur renvoie un `Retry-After` très long
 * (certains renvoient plusieurs heures sur quota épuisé) : on préfère
 * échouer avec un message clair plutôt qu'attendre sans fin.
 */
export const DELAI_MAX_MS = 30000;

/**
 * En-tête `User-Agent` envoyé avec CHAQUE requête sortante.
 *
 * POURQUOI (corrigé le 20/09/2026 sur PREUVE) : le diagnostic réseau
 * exécuté depuis le poste d'un utilisateur réel a montré que les DEUX
 * instances Overpass refusaient nos requêtes, et pour la même raison —
 * l'absence d'un User-Agent identifiant l'application :
 *
 *   overpass.kumi.systems → HTTP 429, message explicite :
 *     « Please include a meaningful User-Agent string with your
 *       requests to avoid rate-limiting. »
 *   overpass-api.de       → HTTP 406 Not Acceptable (Apache)
 *
 * `fetch` de Node n'envoie qu'un User-Agent générique (« node » /
 * « undici »), que ces services traitent comme un client anonyme. Ce
 * n'est donc PAS un problème de délai dépassé, contrairement à ce qui
 * avait été supposé faute de pouvoir observer la réponse réelle.
 *
 * S'identifier est par ailleurs EXIGÉ par la politique d'usage d'OSM et
 * d'Overpass : un opérateur doit pouvoir savoir quel logiciel l'appelle.
 * La chaîne se limite au nom et à la version du logiciel — aucune
 * donnée personnelle, aucun identifiant de poste (§3.3).
 */
export const USER_AGENT = 'HydroPuits/0.1 (application de favorabilite hydrogeologique pour forage)';

/** Un code HTTP mérite-t-il un réessai ? (PURE) */
export function estStatutReessayable(statut) {
  return CODES_HTTP_REESSAYABLES.includes(statut);
}

/**
 * Une erreur de TRANSPORT (pas de réponse HTTP du tout) mérite-t-elle un
 * réessai ? (PURE)
 *
 * Oui par défaut — une erreur de transport est passagère par nature
 * (DNS, coupure, délai dépassé) — SAUF une annulation volontaire de
 * l'utilisateur, qu'il ne faut évidemment jamais « réessayer ».
 * L'annulation se distingue par `annuleParUtilisateur`, positionné par
 * fetchRobuste : le nom `AbortError` seul ne suffit pas à trancher,
 * puisque notre propre délai dépassé abandonne aussi la requête.
 */
export function estErreurReseauReessayable(erreur) {
  return !erreur?.annuleParUtilisateur;
}

/**
 * Temporisation avant la tentative n° `tentative` (1 = premier réessai).
 * PURE et déterministe : la part aléatoire (« jitter ») est ajoutée par
 * l'appelant, pour que cette fonction reste testable exactement.
 *
 * @param {number} tentative        1 pour le premier réessai, 2 pour le second…
 * @param {number|null} retryAfter_s en-tête `Retry-After` du serveur, si présent
 * @returns {number} millisecondes à attendre, plafonnées à DELAI_MAX_MS
 */
export function delaiAvantReessai(tentative, retryAfter_s = null) {
  // Un `Retry-After` explicite prime sur notre propre calcul : c'est le
  // serveur qui sait quand il redeviendra disponible.
  if (Number.isFinite(retryAfter_s) && retryAfter_s > 0) {
    return Math.min(retryAfter_s * 1000, DELAI_MAX_MS);
  }
  return Math.min(DELAI_BASE_MS * 2 ** (tentative - 1), DELAI_MAX_MS);
}

/**
 * Lit l'en-tête `Retry-After` sous ses DEUX formes documentées (RFC 9110
 * §10.2.3) : un nombre de secondes, ou une date HTTP. (PURE — la date de
 * référence est injectable pour rester testable.)
 *
 * @returns {number|null} secondes à attendre, ou null si absent/illisible
 */
export function lireRetryAfter(valeurEntete, maintenant_ms = Date.now()) {
  if (!valeurEntete) return null;
  const secondes = Number(valeurEntete);
  if (Number.isFinite(secondes)) return secondes >= 0 ? secondes : null;
  const date = Date.parse(valeurEntete);
  if (Number.isNaN(date)) return null;
  const delta_s = (date - maintenant_ms) / 1000;
  return delta_s > 0 ? delta_s : 0;
}

/** Attente annulable : rejette immédiatement si `signal` est abandonné. */
function attendre(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Annulé.')); return; }
    const minuteur = setTimeout(() => {
      signal?.removeEventListener('abort', surAbandon);
      resolve();
    }, ms);
    function surAbandon() {
      clearTimeout(minuteur);
      reject(new Error('Annulé.'));
    }
    signal?.addEventListener('abort', surAbandon, { once: true });
  });
}

/**
 * Un `fetch` avec délai propre à CETTE tentative et annulation externe.
 *
 * Chaque tentative a son PROPRE AbortController : sans cela, le
 * contrôleur abandonné par le délai de la tentative 1 abandonnerait aussi
 * la tentative 2 avant même qu'elle parte (c'est exactement le piège qui
 * cassait le repli d'Overpass sur son miroir).
 */
async function fetchUneTentative(url, { timeoutMs, signalExterne, headers, ...options }) {
  const controleur = new AbortController();
  let causeDelai = false;
  const surAbandonExterne = () => controleur.abort();
  signalExterne?.addEventListener('abort', surAbandonExterne, { once: true });
  const minuteur = setTimeout(() => { causeDelai = true; controleur.abort(); }, timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      // User-Agent d'abord, pour qu'un appelant puisse toujours le
      // remplacer explicitement s'il en a besoin.
      headers: { 'User-Agent': USER_AGENT, ...(headers || {}) },
      signal: controleur.signal,
    });
  } catch (e) {
    const erreur = new Error(
      causeDelai
        ? `délai de ${Math.round(timeoutMs / 1000)} s dépassé`
        : (e?.message || String(e)),
    );
    // Annulation VOLONTAIRE (bouton Annuler) : ne jamais réessayer.
    erreur.annuleParUtilisateur = Boolean(signalExterne?.aborted) && !causeDelai;
    erreur.delaiDepasse = causeDelai;
    throw erreur;
  } finally {
    clearTimeout(minuteur);
    signalExterne?.removeEventListener('abort', surAbandonExterne);
  }
}

/**
 * Appel réseau robuste : réessaie les échecs passagers, abandonne
 * immédiatement les échecs définitifs, reste annulable à tout instant.
 *
 * Renvoie la `Response` de la première tentative réussie (statut 2xx).
 * En cas d'échec, lève une Error enrichie :
 *   .statut       code HTTP de la dernière réponse (si une réponse a été reçue)
 *   .extraitCorps début du corps de la réponse d'erreur (diagnostic)
 *   .tentatives   nombre de tentatives réellement effectuées
 *   .hote         nom d'hôte visé
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]      délai par tentative
 * @param {number} [opts.tentatives]     nombre total de tentatives
 * @param {AbortSignal} [opts.signalExterne] annulation par l'utilisateur
 * @param {(info:{tentative:number, total:number, attente_ms:number, raison:string}) => void} [opts.surReessai]
 */
export async function fetchRobuste(url, opts = {}) {
  const {
    timeoutMs = 30000,
    tentatives = TENTATIVES_DEFAUT,
    signalExterne,
    surReessai,
    ...options
  } = opts;

  const hote = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  let derniereErreur = null;

  for (let essai = 1; essai <= tentatives; essai++) {
    let reponse = null;
    try {
      reponse = await fetchUneTentative(url, { timeoutMs, signalExterne, ...options });
    } catch (e) {
      derniereErreur = e;
      if (!estErreurReseauReessayable(e) || essai === tentatives) break;
      const attente_ms = delaiAvantReessai(essai);
      surReessai?.({ tentative: essai, total: tentatives, attente_ms, raison: e.message });
      await attendre(attente_ms, signalExterne);
      continue;
    }

    if (reponse.ok) return reponse;

    // Réponse reçue, mais en erreur : le corps porte souvent la vraie
    // cause (message JSON du service). On le lit TOUJOURS, y compris
    // quand on va réessayer, car c'est ce texte qui apparaîtra à l'écran
    // si toutes les tentatives échouent (§5 : jamais un « échec » nu).
    let extraitCorps = '';
    try { extraitCorps = (await reponse.text()).slice(0, 500); } catch { /* corps illisible : le code HTTP suffit */ }

    derniereErreur = new Error(`HTTP ${reponse.status}${extraitCorps ? ' — ' + extraitCorps : ''}`);
    derniereErreur.statut = reponse.status;
    derniereErreur.extraitCorps = extraitCorps;

    if (!estStatutReessayable(reponse.status) || essai === tentatives) break;

    const retryAfter_s = lireRetryAfter(reponse.headers.get('retry-after'));
    const attente_ms = delaiAvantReessai(essai, retryAfter_s);
    surReessai?.({ tentative: essai, total: tentatives, attente_ms, raison: `HTTP ${reponse.status}` });
    await attendre(attente_ms, signalExterne);
  }

  const erreur = new Error(`${hote} — ${derniereErreur?.message || 'échec réseau'}`);
  erreur.statut = derniereErreur?.statut ?? null;
  erreur.extraitCorps = derniereErreur?.extraitCorps ?? '';
  erreur.annuleParUtilisateur = Boolean(derniereErreur?.annuleParUtilisateur);
  erreur.tentatives = tentatives;
  erreur.hote = hote;
  throw erreur;
}

/** `fetchRobuste` + décodage JSON, avec un message clair si le corps n'est pas du JSON. */
export async function fetchJsonRobuste(url, opts = {}) {
  const reponse = await fetchRobuste(url, opts);
  const texte = await reponse.text();
  try {
    return JSON.parse(texte);
  } catch {
    const hote = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    throw new Error(
      `${hote} a répondu autre chose que du JSON (début de la réponse : « ${texte.slice(0, 200)} »).`,
    );
  }
}

/** `fetchRobuste` + corps en texte brut (grilles ASCII d'OpenTopography). */
export async function fetchTexteRobuste(url, opts = {}) {
  const reponse = await fetchRobuste(url, opts);
  return reponse.text();
}

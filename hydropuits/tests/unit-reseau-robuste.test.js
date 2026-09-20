/**
 * unit-reseau-robuste.test.js — décisions de réessai (§7).
 * -----------------------------------------------------------------------
 * Ce qui est testé ici est la PARTIE PURE de services/reseauRobuste.js :
 * « faut-il réessayer ? » et « après combien de temps ? ». C'est
 * exactement la logique dont l'absence a causé l'échec constaté en usage
 * réel le 20/09/2026 (un incident passager sur l'une des ~40 requêtes
 * d'altimétrie faisait échouer tout le téléchargement), donc celle qui
 * doit être vérifiée sans dépendre du réseau.
 *
 * Aucune de ces valeurs attendues n'est une approximation : ce sont des
 * puissances de deux exactes (temporisation) et des appartenances à une
 * liste close (codes HTTP), toutes calculables à la main.
 * -----------------------------------------------------------------------
 */
import {
  estStatutReessayable, estErreurReseauReessayable, delaiAvantReessai, lireRetryAfter,
  CODES_HTTP_REESSAYABLES, DELAI_BASE_MS, DELAI_MAX_MS,
} from '../src/services/reseauRobuste.js';

export const casReseauRobuste = [
  // ── Quels codes HTTP méritent un réessai ──
  {
    libelle: 'Réessai : 429 (quota dépassé) est réessayable — c’est LE cas où réessayer est attendu',
    attendu: true, source: 'RFC 9110 §15.5.30', executer: () => estStatutReessayable(429),
  },
  {
    libelle: 'Réessai : 503 (service indisponible) est réessayable',
    attendu: true, source: 'RFC 9110 §15.6.4', executer: () => estStatutReessayable(503),
  },
  {
    libelle: 'Réessai : 504 (délai de passerelle) est réessayable',
    attendu: true, source: 'RFC 9110 §15.6.5', executer: () => estStatutReessayable(504),
  },
  {
    libelle: 'Réessai : 401 (clé invalide) n’est PAS réessayable — réessayer ne la rendrait pas valide',
    attendu: false, source: 'RFC 9110 §15.5.2 — échec définitif', executer: () => estStatutReessayable(401),
  },
  {
    libelle: 'Réessai : 404 n’est PAS réessayable',
    attendu: false, source: 'RFC 9110 §15.5.5 — échec définitif', executer: () => estStatutReessayable(404),
  },
  {
    libelle: 'Réessai : 400 (requête mal formée) n’est PAS réessayable',
    attendu: false, source: 'RFC 9110 §15.5.1 — échec définitif', executer: () => estStatutReessayable(400),
  },
  {
    libelle: 'Réessai : aucun code 2xx/3xx ne figure dans la liste des réessayables',
    attendu: true, source: 'cohérence de la liste — un succès ne se réessaie pas',
    executer: () => CODES_HTTP_REESSAYABLES.every((c) => c >= 400),
  },

  // ── Erreurs de transport (pas de réponse HTTP du tout) ──
  {
    libelle: 'Réessai : un délai dépassé (erreur de transport) est réessayable',
    attendu: true, source: 'une erreur de transport est passagère par nature',
    executer: () => estErreurReseauReessayable({ message: 'délai de 20 s dépassé', delaiDepasse: true }),
  },
  {
    libelle: 'Réessai : une annulation PAR L’UTILISATEUR n’est jamais réessayée',
    attendu: false, source: '§3.3 — le bouton Annuler doit arrêter, pas relancer',
    executer: () => estErreurReseauReessayable({ message: 'Annulé.', annuleParUtilisateur: true }),
  },

  // ── Temporisation exponentielle (valeurs exactes, calculables à la main) ──
  {
    libelle: 'Temporisation : 1er réessai = 1000 ms (DELAI_BASE_MS × 2⁰)',
    attendu: 1000, source: 'calcul exact : 1000 × 2^0', executer: () => delaiAvantReessai(1),
  },
  {
    libelle: 'Temporisation : 2e réessai = 2000 ms (× 2¹)',
    attendu: 2000, source: 'calcul exact : 1000 × 2^1', executer: () => delaiAvantReessai(2),
  },
  {
    libelle: 'Temporisation : 3e réessai = 4000 ms (× 2²)',
    attendu: 4000, source: 'calcul exact : 1000 × 2^2', executer: () => delaiAvantReessai(3),
  },
  {
    libelle: 'Temporisation : croissance strictement doublante entre deux réessais consécutifs',
    attendu: true, source: 'propriété d’une temporisation exponentielle de raison 2',
    executer: () => [1, 2, 3, 4].every((n) => delaiAvantReessai(n + 1) === 2 * delaiAvantReessai(n)
      || delaiAvantReessai(n + 1) === DELAI_MAX_MS),
  },
  {
    libelle: 'Temporisation : plafonnée à DELAI_MAX_MS, jamais d’attente illimitée',
    attendu: DELAI_MAX_MS, source: 'garde-fou — au-delà, l’utilisateur croit le logiciel figé',
    executer: () => delaiAvantReessai(50),
  },
  {
    libelle: 'Temporisation : DELAI_BASE_MS vaut bien 1000 ms (non-régression sur la constante documentée)',
    attendu: 1000, source: 'voir l’en-tête de reseauRobuste.js', executer: () => DELAI_BASE_MS,
  },

  // ── Retry-After : le serveur sait mieux que nous ──
  {
    libelle: 'Retry-After : une valeur en secondes prime sur notre calcul (5 s ⇒ 5000 ms, pas 1000)',
    attendu: 5000, source: 'RFC 9110 §10.2.3 — forme « delay-seconds »',
    executer: () => delaiAvantReessai(1, lireRetryAfter('5')),
  },
  {
    libelle: 'Retry-After : une valeur ABERRANTE (2 h) reste plafonnée à DELAI_MAX_MS',
    attendu: DELAI_MAX_MS, source: 'garde-fou — certains services renvoient plusieurs heures sur quota épuisé',
    executer: () => delaiAvantReessai(1, lireRetryAfter('7200')),
  },
  {
    libelle: 'Retry-After : forme « date HTTP » lue correctement (+10 s ⇒ 10 s)',
    attendu: 10, source: 'RFC 9110 §10.2.3 — forme « HTTP-date »',
    executer: () => {
      const base = Date.parse('2026-09-20T12:00:00Z');
      return lireRetryAfter('Sun, 20 Sep 2026 12:00:10 GMT', base);
    },
  },
  {
    libelle: 'Retry-After : une date DÉJÀ PASSÉE donne 0, jamais une attente négative',
    attendu: 0, source: 'garde-fou',
    executer: () => {
      const base = Date.parse('2026-09-20T12:00:00Z');
      return lireRetryAfter('Sun, 20 Sep 2026 11:59:00 GMT', base);
    },
  },
  {
    libelle: 'Retry-After : en-tête absent ⇒ null (on retombe sur la temporisation exponentielle)',
    attendu: null, source: 'en-tête facultatif', executer: () => lireRetryAfter(null),
  },
  {
    libelle: 'Retry-After : en-tête illisible ⇒ null plutôt qu’une attente inventée',
    attendu: null, source: '§5 — jamais une valeur par défaut silencieuse',
    executer: () => lireRetryAfter('bientôt'),
  },
];

/**
 * unit-diagnostic-reseau.test.js — rapport de diagnostic (§7).
 * -----------------------------------------------------------------------
 * L'ESSENTIEL DE CE FICHIER porte sur `censurerCle`. Le rapport de
 * diagnostic est conçu pour être COPIÉ ET ENVOYÉ à un tiers : si une clé
 * d'API de l'utilisateur pouvait s'y glisser, le logiciel provoquerait
 * lui-même la fuite d'un secret que le cahier des charges (§3.3) lui
 * interdit même de créer. C'est le seul vrai danger de cette
 * fonctionnalité, donc il est testé sous plusieurs angles, y compris le
 * cas où la clé n'est PAS transmise à la fonction.
 * -----------------------------------------------------------------------
 */
import { censurerCle, formaterRapportTexte } from '../src/services/diagnosticRapport.js';
import { construireCibles, LAT_TEST, LON_TEST } from '../src/services/diagnosticReseau.js';

const CLE_FICTIVE = 'abcdef0123456789abcdef0123456789';

const RAPPORT_EXEMPLE = {
  dateIso: '2026-09-20T12:00:00.000Z',
  resultats: [
    { id: 'a', libelle: 'Service A', statut: 'ok', codeHttp: 200, duree_ms: 120, octets: 42, typeContenu: 'application/json', extrait: '{"elevation":[455]}' },
    { id: 'b', libelle: 'Service B', statut: 'echec', codeHttp: 503, duree_ms: 20000, erreur: 'HTTP 503', extrait: 'overloaded' },
    { id: 'c', libelle: 'Service C', statut: 'ignore', detail: 'Aucune clé enregistrée.' },
  ],
  resume: { nbTestees: 2, nbReussies: 1, nbEchecsEssentiels: 1, toutBloque: false },
};

export const casDiagnosticReseau = [
  // ── Censure des clés : le point critique ──
  {
    libelle: 'Censure : la clé transmise disparaît d’une URL complète',
    attendu: true, source: '§3.3 — un rapport destiné à être envoyé ne doit contenir aucun secret',
    executer: () => {
      const url = `https://portal.opentopography.org/API/globaldem?demtype=COP30&API_Key=${CLE_FICTIVE}`;
      return !censurerCle(url, CLE_FICTIVE).includes(CLE_FICTIVE);
    },
  },
  {
    libelle: 'Censure : la clé disparaît MÊME si elle n’est pas transmise à la fonction (2ᵉ filet)',
    attendu: true, source: 'filet de sécurité — la censure ne doit pas dépendre de l’appelant',
    executer: () => {
      const url = `https://portal.opentopography.org/API/globaldem?API_Key=${CLE_FICTIVE}&outputFormat=AAIGrid`;
      return !censurerCle(url, null).includes(CLE_FICTIVE);
    },
  },
  {
    libelle: 'Censure : variantes d’écriture du paramètre (api_key, apikey, key) également masquées',
    attendu: true, source: 'filet de sécurité — les services ne nomment pas tous ce paramètre pareil',
    executer: () => ['api_key', 'apikey', 'key', 'API_Key'].every(
      (nom) => !censurerCle(`https://ex.org/a?${nom}=${CLE_FICTIVE}&z=1`, null).includes(CLE_FICTIVE),
    ),
  },
  {
    libelle: 'Censure : la clé est masquée jusque dans un MESSAGE D’ERREUR qui la recopie',
    attendu: true, source: 'certains services renvoient l’URL appelée dans leur message d’erreur',
    executer: () => {
      const msg = `Invalid API key: ${CLE_FICTIVE}. Please check your account.`;
      return !censurerCle(msg, CLE_FICTIVE).includes(CLE_FICTIVE);
    },
  },
  {
    libelle: 'Censure : le reste de l’URL est préservé (on masque la clé, pas le diagnostic)',
    attendu: true, source: 'la censure ne doit pas rendre le rapport inutile',
    executer: () => {
      const sortie = censurerCle(`https://ex.org/API/globaldem?demtype=COP30&API_Key=${CLE_FICTIVE}&south=31`, CLE_FICTIVE);
      return sortie.includes('demtype=COP30') && sortie.includes('south=31') && sortie.includes('***');
    },
  },
  {
    libelle: 'Censure : un texte sans clé est renvoyé inchangé',
    attendu: 'HTTP 503 — service overloaded', source: 'aucun effet de bord sur le cas courant',
    executer: () => censurerCle('HTTP 503 — service overloaded', CLE_FICTIVE),
  },
  {
    libelle: 'Censure : une entrée vide ne fait pas échouer la fonction',
    attendu: '', source: 'garde-fou', executer: () => censurerCle('', CLE_FICTIVE),
  },

  // ── Cibles testées ──
  {
    libelle: 'Cibles : sans clé OpenTopography, la source est marquée « ignorée », jamais testée à vide',
    attendu: true, source: '§3.3 — jamais d’appel avec une clé inventée',
    executer: () => {
      const c = construireCibles(null).find((x) => x.id === 'opentopography-globaldem');
      return c.url === null && typeof c.ignore === 'string';
    },
  },
  {
    libelle: 'Cibles : avec une clé, l’emprise testée est minuscule (0,01° ≈ 1 km) — un appel de quota, pas un vrai MNT',
    attendu: true, source: 'quota OpenTopography : 50 appels/24 h en compte non académique',
    executer: () => {
      const c = construireCibles(CLE_FICTIVE).find((x) => x.id === 'opentopography-globaldem');
      const p = new URL(c.url).searchParams;
      return Math.abs(Number(p.get('north')) - Number(p.get('south')) - 0.01) < 1e-9;
    },
  },
  {
    libelle: 'Cibles : la cible OpenTopography porte sa clé, pour que la censure puisse s’appliquer au rapport',
    attendu: CLE_FICTIVE, source: 'voir testerCible() — c’est `cible.cle` qui alimente censurerCle',
    executer: () => construireCibles(CLE_FICTIVE).find((x) => x.id === 'opentopography-globaldem').cle,
  },
  {
    libelle: 'Cibles : les 5 sources du registre sont toutes couvertes par le diagnostic',
    attendu: true, source: '§3.3 — un diagnostic partiel laisserait un angle mort',
    executer: () => {
      const ids = construireCibles(null).map((c) => c.id);
      return ['elevation-open-meteo', 'nasa-power', 'soilgrids-isric', 'opentopography-globaldem'].every((i) => ids.includes(i))
        && ids.some((i) => i.startsWith('overpass'));
    },
  },
  {
    libelle: 'Cibles : le fond de carte est testé aussi — « la carte reste grise » et « les données ne descendent pas » sont deux pannes différentes',
    attendu: true, source: 'les deux symptômes se confondent à l’écran',
    executer: () => construireCibles(null).some((c) => c.id === 'fond-carte-esri'),
  },
  {
    libelle: 'Cibles : le point de test est bien au Maroc (zone d’usage réelle), pas un point arbitraire',
    attendu: true, source: 'tester en pleine mer donnerait un faux négatif sur un service sain',
    executer: () => LAT_TEST > 27 && LAT_TEST < 36 && LON_TEST > -14 && LON_TEST < -1,
  },
  {
    libelle: 'Cibles : la requête Overpass de test ne ramène qu’un COMPTEUR (out count), aucune géométrie',
    attendu: true, source: 'un diagnostic ne doit pas peser sur le quota Overpass',
    executer: () => {
      const c = construireCibles(null).find((x) => x.id === 'overpass-requete');
      return decodeURIComponent(c.url).includes('out count;');
    },
  },

  // ── Mise en forme du rapport ──
  {
    libelle: 'Rapport : chaque cible testée apparaît dans le texte copiable',
    attendu: true, source: 'c’est ce texte que l’utilisateur transmet',
    executer: () => {
      const txt = formaterRapportTexte(RAPPORT_EXEMPLE);
      return txt.includes('Service A') && txt.includes('Service B') && txt.includes('Service C');
    },
  },
  {
    libelle: 'Rapport : un échec est visiblement marqué comme tel (pas noyé dans le texte)',
    attendu: true, source: '§5 — un échec doit se voir',
    executer: () => formaterRapportTexte(RAPPORT_EXEMPLE).includes('[ÉCHEC] Service B'),
  },
  {
    libelle: 'Rapport : le code HTTP et le temps de réponse figurent — c’est la donnée qui permet de corriger',
    attendu: true, source: 'sans code ni durée, le rapport ne vaut pas mieux qu’une capture d’écran',
    executer: () => {
      const txt = formaterRapportTexte(RAPPORT_EXEMPLE);
      return txt.includes('HTTP 503') && txt.includes('20000 ms');
    },
  },
  {
    libelle: 'Rapport : « tout bloqué » ajoute la conclusion qui oriente vers la cause locale',
    attendu: true, source: '§5 — dire où chercher plutôt que laisser deviner',
    executer: () => formaterRapportTexte({
      ...RAPPORT_EXEMPLE,
      resume: { ...RAPPORT_EXEMPLE.resume, nbReussies: 0, toutBloque: true },
    }).includes('blocage est très probablement local'),
  },
  {
    libelle: 'Rapport : sans « tout bloqué », cette conclusion n’apparaît PAS (pas de diagnostic inventé)',
    attendu: false, source: '§5 — ne jamais affirmer une cause non constatée',
    executer: () => formaterRapportTexte(RAPPORT_EXEMPLE).includes('blocage est très probablement local'),
  },
];

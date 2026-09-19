// ============================================================
//  sourcesDonnees.js — Registre des sources de données externes.
//  ─────────────────────────────────────────────────────────────
//  POURQUOI CE FICHIER EXISTE : le cahier des charges (§3.3) impose un
//  registre EXPLICITE plutôt que des appels réseau dispersés dans le
//  code — chaque source déclare ce qu'elle est, ce qu'elle coûte, et ce
//  qu'il faut faire pour l'activer. C'est ce registre que l'onglet
//  « Données » parcourt pour afficher l'état de chaque couche, et c'est
//  lui qui porte la RÈGLE ABSOLUE du cahier des charges : le logiciel ne
//  crée jamais de compte, ne se connecte jamais à un compte Google/Gmail,
//  n'automatise aucune inscription. Une source à clé reste désactivée
//  tant que l'utilisateur n'a pas collé lui-même la clé qu'il aura
//  obtenue en s'inscrivant AILLEURS, dans son propre navigateur.
//
//  Ce module est PUR (aucun accès réseau ni disque) : c'est une
//  déclaration de données + quelques fonctions de consultation, lisible
//  aussi bien côté serveur (server.mjs) que côté interface (DonneesTab).
//  L'état réel (clé présente ? donnée en cache ?) est déterminé ailleurs
//  (clesLocales.js, cacheDonnees.js) et fusionné à l'affichage — ce
//  fichier ne sait dire que ce qu'une source EST, pas où elle en est.
//
//  Chaque URL, chaque limite d'usage et chaque condition de licence
//  ci-dessous a été vérifiée sur le web (pas recopiée de mémoire — §8) ;
//  la date de vérification figure sur chaque source.
// ============================================================

/**
 * @typedef {Object} SourceDonnees
 * @property {string} id
 * @property {string} nomCle         clé i18n du nom affiché
 * @property {string} descriptionCle clé i18n de la description courte
 * @property {string} url            URL de base du service (documentation ou racine de l'API)
 * @property {string} resolution     résolution native, texte libre ("≈ 90 m", "vecteur")
 * @property {string} couverture     couverture géographique
 * @property {boolean} cleRequise
 * @property {string|null} urlInscription   où obtenir la clé, si cleRequise
 * @property {boolean} gratuit
 * @property {string} licence        licence des données (texte + référence)
 * @property {string} verifieLe      date de vérification (AAAA-MM-JJ)
 * @property {string[]} facteurs     id des facteurs (favorabilite.js) qui en dépendent
 */

export const SOURCES = [
  {
    id: 'elevation-open-meteo',
    nomCle: 'srcNomElevation',
    descriptionCle: 'srcDescElevation',
    url: 'https://open-meteo.com/en/docs/elevation-api',
    resolution: '≈ 90 m (Copernicus GLO-90)',
    couverture: 'mondiale',
    cleRequise: false,
    urlInscription: null,
    gratuit: true,
    licence: 'Copernicus DEM — licence Copernicus (réutilisation libre, attribution requise). Service Open-Meteo : usage non commercial libre, CORS activé.',
    verifieLe: '2026-09-19',
    facteurs: ['pente', 'twi', 'courbure'],
  },
  {
    id: 'overpass-osm',
    nomCle: 'srcNomOverpass',
    descriptionCle: 'srcDescOverpass',
    url: 'https://overpass-api.de/api/interpreter',
    resolution: 'vecteur (précision du relevé OSM, variable)',
    couverture: 'mondiale (complétude variable selon la région)',
    cleRequise: false,
    urlInscription: null,
    gratuit: true,
    licence: 'OpenStreetMap — Open Database License (ODbL), attribution requise.',
    verifieLe: '2026-09-19',
    facteurs: ['densiteDrainage', 'distanceCoursEau', 'densiteLineaments'],
  },
  {
    id: 'nasa-power',
    nomCle: 'srcNomNasaPower',
    descriptionCle: 'srcDescNasaPower',
    url: 'https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
    resolution: '≈ 50-60 km (grille de réanalyse MERRA-2)',
    couverture: 'mondiale',
    cleRequise: false,
    urlInscription: null,
    gratuit: true,
    licence: 'Données publiques NASA POWER — usage libre.',
    verifieLe: '2026-09-19',
    facteurs: ['pluviometrie'],
  },
  {
    id: 'soilgrids-isric',
    nomCle: 'srcNomSoilGrids',
    descriptionCle: 'srcDescSoilGrids',
    url: 'https://rest.isric.org/soilgrids/v2.0/docs',
    resolution: '250 m',
    couverture: 'mondiale',
    cleRequise: false,
    urlInscription: null,
    gratuit: true,
    licence: 'ISRIC SoilGrids — CC-BY 4.0.',
    verifieLe: '2026-09-19',
    // ⚠️ Vérifié le 19/09/2026 : l'API REST (bêta) de l'ISRIC est en pause
    // ("temporarily paused", aucune date de rétablissement annoncée). Le
    // client est écrit et testé sur des réponses synthétiques (format
    // documenté), mais un téléchargement réel échouera tant que l'ISRIC
    // n'aura pas rétabli le service — l'échec est affiché tel quel à
    // l'écran (§5), jamais masqué.
    indisponibleTemporairement: true,
    facteurs: ['lithologieSol'],
  },
  {
    id: 'opentopography-globaldem',
    nomCle: 'srcNomOpenTopo',
    descriptionCle: 'srcDescOpenTopo',
    url: 'https://portal.opentopography.org/apidocs/',
    resolution: '30 m (Copernicus GLO-30) — choix par défaut ; SRTM 30 m et ALOS World 3D 30 m également disponibles',
    couverture: 'mondiale (SRTM : ±60° de latitude)',
    cleRequise: true,
    urlInscription: 'https://portal.opentopography.org/myopentopo',
    gratuit: true,
    licence: 'Copernicus DEM / SRTM / ALOS — licences respectives, réutilisation libre avec attribution. Clé personnelle OpenTopography requise (inscription gratuite, immédiate).',
    verifieLe: '2026-09-19',
    // Quota vérifié le 19/09/2026 : 250 appels/24h (usage académique) ou
    // 50 appels/24h (non académique) par clé — un log d'usage assez
    // sobre pour ne jamais être atteint sur un usage normal (un terrain
    // = un seul appel, voir cacheDonnees.js).
    facteurs: ['pente', 'twi', 'courbure'],
  },
];

export function obtenirSource(id) {
  const s = SOURCES.find((x) => x.id === id);
  if (!s) throw new Error(`Source de données inconnue : « ${id} ».`);
  return s;
}

export function sourcesSansCle() {
  return SOURCES.filter((s) => !s.cleRequise);
}

export function sourcesAvecCle() {
  return SOURCES.filter((s) => s.cleRequise);
}

/**
 * Facteurs (favorabilite.js, étape 5) rendus totalement indisponibles si
 * `idsSourcesIndisponibles` sont absentes. Un facteur peut dépendre de
 * PLUSIEURS sources (ex. la pente peut venir d'Open-Meteo OU
 * d'OpenTopography) : il n'est indisponible que si TOUTES ses sources le
 * sont — cette fonction sert à l'étape 5 pour décider quels facteurs
 * désactiver et renormaliser les poids en conséquence (§3.4).
 */
export function facteursIndisponibles(idsSourcesIndisponibles) {
  const indispo = new Set(idsSourcesIndisponibles);
  const parFacteur = new Map();
  for (const s of SOURCES) {
    for (const f of s.facteurs) {
      if (!parFacteur.has(f)) parFacteur.set(f, []);
      parFacteur.get(f).push(s.id);
    }
  }
  const resultat = [];
  for (const [facteur, sourcesDuFacteur] of parFacteur) {
    if (sourcesDuFacteur.every((id) => indispo.has(id))) resultat.push(facteur);
  }
  return resultat;
}

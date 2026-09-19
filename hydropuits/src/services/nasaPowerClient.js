/**
 * nasaPowerClient.js
 * -----------------------------------------------------------------------
 * Construction des requêtes vers l'API NASA POWER et analyse de ses
 * réponses JSON — pluviométrie annuelle moyenne, facteur de favorabilité
 * (cahier des charges §3.4 : « fort ⇒ favorable »).
 *
 * buildDailyPrecipitationUrl() et parseNasaPowerSeries() reprennent le
 * PATRON de src/services/nasaPowerClient.js de HydroCrue (§3.3 : « client
 * déjà écrit dans HydroCrue, à reprendre ») : même endpoint, même
 * paramètre PRECTOTCORR, même tolérance aux deux noms de paramètre
 * possibles. Ce qui n'est PAS repris : les fonctions propres au
 * dimensionnement de crue de HydroCrue (maximaAnnuels pour l'ajustement
 * de Gumbel, maximaAnnuelsGlissants pour les coefficients de Montana,
 * l'appel à l'API horaire) — HydroPuits n'a besoin que d'une moyenne
 * annuelle, pas d'une statistique d'extrêmes.
 *
 * Documentation officielle (vérifiée le 19/09/2026) :
 *  - https://power.larc.nasa.gov/docs/services/api/temporal/daily/
 *
 * Couverture temporelle : 1981-01-01 à quasi temps réel.
 * Résolution spatiale : grille de réanalyse MERRA-2, ≈ 0,5°×0,625°
 * (~50-60 km) — PAS une mesure de station ponctuelle. À utiliser comme
 * ordre de grandeur régional (affiché comme tel dans le rapport, §5).
 *
 * SÉPARATION PUR / RÉSEAU : buildDailyPrecipitationUrl(),
 * parseNasaPowerSeries() et moyenneAnnuellePrecipitation() sont pures.
 * L'appel fetch (fait côté serveur, voir server.mjs) ne l'est pas.
 * -----------------------------------------------------------------------
 */

const BASE_URL = 'https://power.larc.nasa.gov/api/temporal';
const VALEUR_MANQUANTE_NASA = -999; // valeur de remplissage documentée par la NASA pour donnée absente

export function buildDailyPrecipitationUrl(lat, lon, startYYYYMMDD, endYYYYMMDD) {
  const params = new URLSearchParams({
    parameters: 'PRECTOTCORR',
    community: 'AG',
    longitude: String(lon),
    latitude: String(lat),
    start: startYYYYMMDD,
    end: endYYYYMMDD,
    format: 'JSON',
  });
  return `${BASE_URL}/daily/point?${params.toString()}`;
}

/**
 * Analyse une réponse JSON de l'API NASA POWER (daily) et renvoie une
 * série propre [{dateKey, value}], en filtrant les valeurs manquantes
 * (-999) et en essayant plusieurs noms de paramètres possibles (l'API a
 * renommé PRECTOT -> PRECTOTCORR selon les endpoints/versions).
 */
export function parseNasaPowerSeries(json, candidats = ['PRECTOTCORR', 'PRECTOT']) {
  const parametre = json?.properties?.parameter;
  if (!parametre) {
    throw new Error("Réponse NASA POWER inattendue : bloc 'properties.parameter' absent.");
  }
  const cle = candidats.find((c) => parametre[c]);
  if (!cle) {
    throw new Error(`Aucun des paramètres attendus (${candidats.join(', ')}) n'est présent dans la réponse NASA POWER.`);
  }
  const brut = parametre[cle];
  return Object.entries(brut)
    .filter(([, v]) => v !== VALEUR_MANQUANTE_NASA && v !== null && v !== undefined && !Number.isNaN(v))
    .map(([dateKey, value]) => ({ dateKey, value: Number(value) }))
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
}

/** Extrait l'année (AAAA) d'une clé de date NASA POWER ("20230115"). */
export function anneeDeCle(dateKey) {
  return Number(dateKey.slice(0, 4));
}

/**
 * Cumul annuel de précipitation par année, à partir d'une série
 * journalière — une année INCOMPLÈTE (première/dernière année de la
 * couverture temporelle, souvent tronquée) est exclue du calcul de la
 * moyenne pour ne pas la sous-estimer artificiellement.
 *
 * @param {{dateKey:string, value:number}[]} serieJournaliere
 * @returns {{
 *   pma_mm_an: number, anneesUtilisees: number,
 *   premiereAnnee: number, derniereAnnee: number,
 *   cumulsAnnuels: {annee:number, cumul_mm:number, joursComptes:number}[],
 * }}
 */
export function moyenneAnnuellePrecipitation(serieJournaliere) {
  if (!Array.isArray(serieJournaliere) || serieJournaliere.length === 0) {
    throw new Error('moyenneAnnuellePrecipitation : série journalière vide.');
  }
  const parAnnee = new Map();
  for (const { dateKey, value } of serieJournaliere) {
    const annee = anneeDeCle(dateKey);
    if (!parAnnee.has(annee)) parAnnee.set(annee, { cumul_mm: 0, joursComptes: 0 });
    const acc = parAnnee.get(annee);
    acc.cumul_mm += value;
    acc.joursComptes += 1;
  }
  const annees = [...parAnnee.keys()].sort((a, b) => a - b);
  if (annees.length === 0) throw new Error('moyenneAnnuellePrecipitation : aucune année exploitable.');

  // Une année compte au moins 360 jours de données pour être retenue —
  // ORIGINE : seuil par défaut, choisi pour exclure les années de bord
  // (première/dernière) tronquées par la fenêtre de requête sans exclure
  // une année complète à qui il manquerait juste quelques jours isolés
  // (valeurs -999 filtrées en amont).
  const SEUIL_JOURS_ANNEE_COMPLETE = 360;
  const cumulsAnnuels = annees.map((annee) => ({
    annee,
    cumul_mm: parAnnee.get(annee).cumul_mm,
    joursComptes: parAnnee.get(annee).joursComptes,
  }));
  const completes = cumulsAnnuels.filter((c) => c.joursComptes >= SEUIL_JOURS_ANNEE_COMPLETE);
  if (completes.length === 0) {
    throw new Error("moyenneAnnuellePrecipitation : aucune année complète dans la série (toutes tronquées).");
  }
  const pma_mm_an = completes.reduce((s, c) => s + c.cumul_mm, 0) / completes.length;

  return {
    pma_mm_an,
    anneesUtilisees: completes.length,
    premiereAnnee: completes[0].annee,
    derniereAnnee: completes[completes.length - 1].annee,
    cumulsAnnuels,
  };
}

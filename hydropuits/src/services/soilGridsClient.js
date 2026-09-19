/**
 * soilGridsClient.js
 * -----------------------------------------------------------------------
 * Construction des requêtes vers l'API REST SoilGrids (ISRIC) et analyse
 * de ses réponses JSON — texture et profondeur de sol, facteur de
 * favorabilité (§3.4, colonne « Lithologie / sol »).
 *
 * Source vérifiée le 19/09/2026 :
 *  - https://rest.isric.org/soilgrids/v2.0/docs (API bêta, sans clé,
 *    limite d'usage équitable documentée : 5 appels/minute)
 *  - Licence : CC-BY 4.0 (ISRIC SoilGrids)
 *
 * ⚠️ SERVICE ACTUELLEMENT INDISPONIBLE — vérifié le 19/09/2026 : l'ISRIC
 * indique que l'API REST est « temporarily paused », sans date de
 * rétablissement annoncée. Ce client est écrit et testé sur des réponses
 * SYNTHÉTIQUES reproduisant le format documenté (tests/unit-soil-grids-
 * client.test.js), exactement comme nasaPowerClient.js l'était dans
 * HydroCrue faute d'accès réseau sortant en développement — mais ici la
 * cause est différente : le service lui-même est en pause côté ISRIC, pas
 * seulement inaccessible depuis cet environnement. src/services/
 * sourcesDonnees.js porte `indisponibleTemporairement: true` pour cette
 * source ; l'onglet Données l'affiche comme telle plutôt que comme une
 * simple erreur réseau, et le facteur « Lithologie / sol » est
 * désactivé avec les poids renormalisés en conséquence (§3.4) tant que
 * le service n'est pas rétabli.
 *
 * Propriétés demandées : `clay` (argile), `sand` (sable), `silt` (limon)
 * — pourcentages massiques (g/kg dans la réponse brute, convertis en %
 * par parseSoilGridsResponse), profondeur 0-30 cm (horizon de surface,
 * le plus pertinent pour l'infiltration).
 *
 * SÉPARATION PUR / RÉSEAU : buildSoilGridsUrl() et
 * parseSoilGridsResponse() sont pures. L'appel fetch (fait côté serveur)
 * ne l'est pas.
 * -----------------------------------------------------------------------
 */

const BASE_URL = 'https://rest.isric.org/soilgrids/v2.0/properties/query';
const PROPRIETES = ['clay', 'sand', 'silt'];
const PROFONDEUR = '0-30cm';

export function buildSoilGridsUrl(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error(`buildSoilGridsUrl : coordonnées invalides (${lat}, ${lon}).`);
  }
  const params = new URLSearchParams({ lon: String(lon), lat: String(lat) });
  for (const p of PROPRIETES) params.append('property', p);
  params.append('depth', PROFONDEUR);
  params.append('value', 'mean');
  return `${BASE_URL}?${params.toString()}`;
}

/**
 * Analyse la réponse JSON de SoilGrids v2.0 properties/query.
 * Format documenté : properties.layers[] , chaque layer a `name` (la
 * propriété) et `depths[]`, chaque depth a `label` et `values.mean` — les
 * valeurs sont en unités CONVENTIONNELLES SoilGrids (dixièmes de
 * pourcentage pour clay/sand/silt, cf. documentation officielle "mapped
 * units" — d_factor=10), d'où la division par 10 ci-dessous pour obtenir
 * un pourcentage direct.
 */
export function parseSoilGridsResponse(json) {
  const layers = json?.properties?.layers;
  if (!Array.isArray(layers)) {
    throw new Error("Réponse SoilGrids inattendue : le champ 'properties.layers' est absent ou invalide.");
  }
  const resultat = {};
  for (const p of PROPRIETES) {
    const layer = layers.find((l) => l.name === p);
    const depth = layer?.depths?.find((d) => d.label === PROFONDEUR);
    const brut = depth?.values?.mean;
    if (brut === undefined || brut === null) {
      throw new Error(`Réponse SoilGrids incomplète : propriété '${p}' absente pour la profondeur ${PROFONDEUR}.`);
    }
    resultat[p] = brut / 10; // d_factor=10 (documentation SoilGrids v2.0) -> pourcentage
  }
  const somme = resultat.clay + resultat.sand + resultat.silt;
  return {
    argile_pourcent: resultat.clay,
    sable_pourcent: resultat.sand,
    limon_pourcent: resultat.silt,
    // Les 3 fractions devraient sommer à 100% ; un écart notable signale
    // une réponse mal formée plutôt qu'un vrai sol (elles ne somment
    // jamais EXACTEMENT à 100 à cause des arrondis de la carte source).
    sommeIncoherente: Math.abs(somme - 100) > 5,
  };
}

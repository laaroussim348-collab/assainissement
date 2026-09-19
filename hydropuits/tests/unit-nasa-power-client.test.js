/**
 * unit-nasa-power-client.test.js — client NASA POWER, pluviométrie (§7).
 * -----------------------------------------------------------------------
 * moyenneAnnuellePrecipitation() est le calcul propre à HydroPuits (voir
 * l'en-tête de nasaPowerClient.js pour ce qui diffère de HydroCrue) : les
 * cas ci-dessous vérifient en particulier qu'une année tronquée (début ou
 * fin de série) est EXCLUE de la moyenne plutôt que de la biaiser vers le
 * bas.
 * -----------------------------------------------------------------------
 */
import {
  buildDailyPrecipitationUrl, parseNasaPowerSeries, anneeDeCle, moyenneAnnuellePrecipitation,
} from '../src/services/nasaPowerClient.js';

/** Construit une série journalière synthétique : `nbAnnees` années
 *  complètes à `mmParJour` mm/jour constant, plus une année tronquée à
 *  50 jours en fin de série (pour tester l'exclusion des années
 *  incomplètes). */
function serieSynthetique(anneeDebut, nbAnnees, mmParJour) {
  const serie = [];
  for (let a = 0; a < nbAnnees; a++) {
    const annee = anneeDebut + a;
    const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
    const nbJours = bissextile ? 366 : 365;
    for (let j = 1; j <= nbJours; j++) {
      serie.push({ dateKey: `${annee}${String(j).padStart(4, '0')}`, value: mmParJour });
    }
  }
  return serie;
}

const REPONSE_JSON_SYNTHETIQUE = {
  properties: {
    parameter: {
      PRECTOTCORR: {
        '20200101': 2.5, '20200102': 0, '20200103': -999, '20200104': 5.1,
      },
    },
  },
};

export const casNasaPowerClient = [
  // ── buildDailyPrecipitationUrl ──
  {
    libelle: 'URL : paramètres essentiels présents',
    attendu: true,
    source: '§7',
    executer: () => {
      const u = buildDailyPrecipitationUrl(31.6, -8.0, '19810101', '20260101');
      return ['parameters=PRECTOTCORR', 'latitude=31.6', 'longitude=-8', 'start=19810101', 'end=20260101', 'format=JSON'].every((f) => u.includes(f));
    },
  },
  {
    libelle: 'URL : pointe vers le service daily/point',
    attendu: true,
    source: '§7', executer: () => buildDailyPrecipitationUrl(31.6, -8.0, '19810101', '20260101').includes('/daily/point'),
  },

  // ── parseNasaPowerSeries ──
  {
    libelle: 'Série : valeur -999 filtrée',
    attendu: 3,
    source: '§7 — valeur de remplissage documentée par la NASA',
    executer: () => parseNasaPowerSeries(REPONSE_JSON_SYNTHETIQUE).length,
  },
  {
    libelle: 'Série : triée par date',
    attendu: '20200101,20200102,20200104',
    source: '§7', executer: () => parseNasaPowerSeries(REPONSE_JSON_SYNTHETIQUE).map((p) => p.dateKey).join(','),
  },
  {
    libelle: 'Série : bascule sur PRECTOT si PRECTOTCORR absent',
    attendu: 1,
    source: '§7 — robustesse au renommage documenté du paramètre',
    executer: () => parseNasaPowerSeries({ properties: { parameter: { PRECTOT: { '20200101': 3 } } } }).length,
  },
  {
    libelle: 'Série : refuse une réponse sans bloc parameter',
    attendu: 'refus',
    source: '§7', executer: () => { try { parseNasaPowerSeries({}); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'anneeDeCle : extraction correcte',
    attendu: 2020,
    source: 'unité', executer: () => anneeDeCle('20200115'),
  },

  // ── moyenneAnnuellePrecipitation ──
  {
    libelle: 'Moyenne annuelle : 3 années complètes à 2 mm/j',
    attendu: 730, // ~365.25 × 2, tolérance ci-dessous absorbe les années bissextiles
    tolerancePourcent: 0.5,
    source: '§3.4 (facteur pluviométrie)',
    executer: () => moyenneAnnuellePrecipitation(serieSynthetique(2018, 3, 2)).pma_mm_an,
  },
  {
    libelle: 'Moyenne annuelle : année tronquée exclue du calcul',
    attendu: 3,
    source: 'l’année tronquée ne doit pas polluer la moyenne ni le compte',
    executer: () => {
      const serie = [...serieSynthetique(2018, 3, 2), ...serieSynthetique(2021, 1, 2).slice(0, 50)];
      return moyenneAnnuellePrecipitation(serie).anneesUtilisees;
    },
  },
  {
    libelle: 'Moyenne annuelle : première/dernière année complète bien identifiées',
    attendu: '2018|2020',
    source: 'unité',
    executer: () => {
      const r = moyenneAnnuellePrecipitation(serieSynthetique(2018, 3, 2));
      return `${r.premiereAnnee}|${r.derniereAnnee}`;
    },
  },
  {
    libelle: 'Moyenne annuelle : refuse une série vide',
    attendu: 'refus',
    source: 'garde-fou', executer: () => { try { moyenneAnnuellePrecipitation([]); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'Moyenne annuelle : refuse quand aucune année n’est complète',
    attendu: 'refus',
    source: 'garde-fou — pas de moyenne calculée sur du bruit',
    executer: () => { try { moyenneAnnuellePrecipitation(serieSynthetique(2020, 1, 1).slice(0, 10)); return 'aucun refus'; } catch { return 'refus'; } },
  },
];

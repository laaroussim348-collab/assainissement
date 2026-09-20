/**
 * unit-soil-grids-client.test.js — client SoilGrids/ISRIC (§7).
 * -----------------------------------------------------------------------
 * Le service est intermittent côté ISRIC (voir l'en-tête de
 * soilGridsClient.js) — ces tests portent sur la construction d'URL et
 * l'analyse d'une réponse SYNTHÉTIQUE reproduisant le format documenté
 * (v2.0 properties/query), format CONFIRMÉ par une recherche croisée sur
 * le code source réel de clients tiers (ncss-tech/soilDB, R/CRAN) le
 * 20/09/2026 — voir l'en-tête du module pour le détail du bug réel que
 * ce fichier couvre désormais (absence de granule native 0-30cm).
 * -----------------------------------------------------------------------
 */
import { buildSoilGridsUrl, parseSoilGridsResponse, PROFONDEURS_NATIVES_0_30CM } from '../src/services/soilGridsClient.js';

/** Réponse synthétique conforme au format documenté SoilGrids v2.0 :
 *  properties.layers[].depths[].values.mean, en dixièmes de pourcentage
 *  (d_factor=10), sur les 3 granules natives 0-5/5-15/15-30cm — PAS une
 *  granule 0-30cm, qui n'existe pas nativement (voir en-tête du client).
 *  Valeurs CONSTANTES sur les 3 profondeurs : 350+450+200 = 1000
 *  (dixièmes) => 35%+45%+20% = 100%. */
function reponseConstante(clay, sand, silt) {
  const depths = (v) => PROFONDEURS_NATIVES_0_30CM.map((d) => ({ label: d.label, values: { mean: v } }));
  return {
    properties: {
      layers: [
        { name: 'clay', depths: depths(clay) },
        { name: 'sand', depths: depths(sand) },
        { name: 'silt', depths: depths(silt) },
      ],
    },
  };
}
const REPONSE_SYNTHETIQUE = reponseConstante(350, 450, 200);

export const casSoilGridsClient = [
  // ── buildSoilGridsUrl ──
  {
    libelle: 'URL : les 3 propriétés demandées (clay, sand, silt)',
    attendu: true,
    source: '§7', executer: () => {
      const u = buildSoilGridsUrl(31.6, -8.0);
      return ['property=clay', 'property=sand', 'property=silt'].every((f) => u.includes(f));
    },
  },
  {
    libelle: 'URL : les 3 granules natives 0-5/5-15/15-30cm (PAS 0-30cm, qui n’existe pas)',
    attendu: true,
    source: '§7 — voir en-tête du client (bug réel du 20/09/2026)',
    executer: () => {
      const u = buildSoilGridsUrl(31.6, -8.0);
      return ['depth=0-5cm', 'depth=5-15cm', 'depth=15-30cm'].every((f) => u.includes(f)) && !u.includes('depth=0-30cm');
    },
  },
  {
    libelle: 'URL : lon/lat dans le bon ordre (ISRIC attend lon puis lat)',
    attendu: true,
    source: '§7', executer: () => {
      const u = buildSoilGridsUrl(31.6, -8.0);
      return u.includes('lon=-8') && u.includes('lat=31.6');
    },
  },
  {
    libelle: 'URL : refuse une latitude hors bornes',
    attendu: 'refus',
    source: 'garde-fou', executer: () => { try { buildSoilGridsUrl(95, -8.0); return 'aucun refus'; } catch { return 'refus'; } },
  },

  // ── parseSoilGridsResponse ──
  {
    libelle: 'Réponse : conversion dixièmes → pourcentage (valeurs constantes sur les 3 profondeurs)',
    attendu: '35,45,20',
    source: '§7 — d_factor=10 documenté par ISRIC',
    executer: () => {
      const r = parseSoilGridsResponse(REPONSE_SYNTHETIQUE);
      return `${r.argile_pourcent},${r.sable_pourcent},${r.limon_pourcent}`;
    },
  },
  {
    libelle: 'Réponse : moyenne pondérée par épaisseur — clay 200(0-5)/300(5-15)/400(15-30) dixièmes = 33,3333...%',
    attendu: 100 / 3, tolerancePourcent: 1e-9,
    source: 'arithmétique élémentaire : (200×5+300×10+400×15)/30 = 10000/30 dixièmes',
    executer: () => {
      const rep = {
        properties: {
          layers: [
            { name: 'clay', depths: [
              { label: '0-5cm', values: { mean: 200 } },
              { label: '5-15cm', values: { mean: 300 } },
              { label: '15-30cm', values: { mean: 400 } },
            ] },
            { name: 'sand', depths: PROFONDEURS_NATIVES_0_30CM.map((d) => ({ label: d.label, values: { mean: 500 } })) },
            { name: 'silt', depths: PROFONDEURS_NATIVES_0_30CM.map((d) => ({ label: d.label, values: { mean: 100 } })) },
          ],
        },
      };
      return parseSoilGridsResponse(rep).argile_pourcent;
    },
  },
  {
    libelle: 'Réponse : les 3 fractions cohérentes (somme ≈ 100 %)',
    attendu: false,
    source: 'validation de sanité', executer: () => parseSoilGridsResponse(REPONSE_SYNTHETIQUE).sommeIncoherente,
  },
  {
    libelle: 'Réponse : détecte une somme incohérente',
    attendu: true,
    source: 'validation de sanité — réponse mal formée plutôt qu’un vrai sol',
    // 900+500+500 (dixièmes) = 90+50+50 = 190 % après conversion.
    executer: () => parseSoilGridsResponse(reponseConstante(900, 500, 500)).sommeIncoherente,
  },
  {
    libelle: 'Réponse : refuse un format inattendu',
    attendu: 'refus',
    source: '§7', executer: () => { try { parseSoilGridsResponse({}); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'Réponse : refuse une propriété manquante',
    attendu: 'refus',
    source: '§7 — réponse incomplète signalée, jamais complétée en silence',
    executer: () => {
      try {
        parseSoilGridsResponse({ properties: { layers: [
          { name: 'clay', depths: PROFONDEURS_NATIVES_0_30CM.map((d) => ({ label: d.label, values: { mean: 350 } })) },
        ] } });
        return 'aucun refus';
      } catch { return 'refus'; }
    },
  },
  {
    libelle: 'Réponse : refuse quand UNE SEULE des 3 granules natives manque (ex. 5-15cm absente)',
    attendu: 'refus',
    source: '§5 — jamais interpoler ou ignorer silencieusement une granule manquante',
    executer: () => {
      try {
        parseSoilGridsResponse({
          properties: {
            layers: [
              { name: 'clay', depths: [
                { label: '0-5cm', values: { mean: 300 } },
                { label: '15-30cm', values: { mean: 400 } },
              ] },
              { name: 'sand', depths: PROFONDEURS_NATIVES_0_30CM.map((d) => ({ label: d.label, values: { mean: 450 } })) },
              { name: 'silt', depths: PROFONDEURS_NATIVES_0_30CM.map((d) => ({ label: d.label, values: { mean: 200 } })) },
            ],
          },
        });
        return 'aucun refus';
      } catch { return 'refus'; }
    },
  },
];

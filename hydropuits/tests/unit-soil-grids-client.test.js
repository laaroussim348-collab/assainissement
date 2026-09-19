/**
 * unit-soil-grids-client.test.js — client SoilGrids/ISRIC (§7).
 * -----------------------------------------------------------------------
 * Le service est actuellement en pause côté ISRIC (voir l'en-tête de
 * soilGridsClient.js, vérifié le 19/09/2026) — ces tests portent
 * uniquement sur la construction d'URL et l'analyse d'une réponse
 * SYNTHÉTIQUE reproduisant le format documenté (v2.0 properties/query),
 * pour que le client soit prêt et fiable le jour où le service revient.
 * -----------------------------------------------------------------------
 */
import { buildSoilGridsUrl, parseSoilGridsResponse } from '../src/services/soilGridsClient.js';

/** Réponse synthétique conforme au format documenté SoilGrids v2.0 :
 *  properties.layers[].depths[].values.mean, en dixièmes de pourcentage
 *  (d_factor=10). 350+450+200 = 1000 (dixièmes) => 35% + 45% + 20% = 100%. */
const REPONSE_SYNTHETIQUE = {
  properties: {
    layers: [
      { name: 'clay', depths: [{ label: '0-30cm', values: { mean: 350 } }] },
      { name: 'sand', depths: [{ label: '0-30cm', values: { mean: 450 } }] },
      { name: 'silt', depths: [{ label: '0-30cm', values: { mean: 200 } }] },
    ],
  },
};

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
    libelle: 'URL : profondeur 0-30cm',
    attendu: true,
    source: '§7', executer: () => buildSoilGridsUrl(31.6, -8.0).includes('depth=0-30cm'),
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
    libelle: 'Réponse : conversion dixièmes → pourcentage',
    attendu: '35,45,20',
    source: '§7 — d_factor=10 documenté par ISRIC',
    executer: () => {
      const r = parseSoilGridsResponse(REPONSE_SYNTHETIQUE);
      return `${r.argile_pourcent},${r.sable_pourcent},${r.limon_pourcent}`;
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
    // 900+500+500 (dixièmes) = 90+50+50 = 190 % après conversion : très
    // loin de 100 %, contrairement au cas cohérent ci-dessus (350+450+200).
    executer: () => parseSoilGridsResponse({
      properties: { layers: [
        { name: 'clay', depths: [{ label: '0-30cm', values: { mean: 900 } }] },
        { name: 'sand', depths: [{ label: '0-30cm', values: { mean: 500 } }] },
        { name: 'silt', depths: [{ label: '0-30cm', values: { mean: 500 } }] },
      ] },
    }).sommeIncoherente,
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
          { name: 'clay', depths: [{ label: '0-30cm', values: { mean: 350 } }] },
        ] } });
        return 'aucun refus';
      } catch { return 'refus'; }
    },
  },
];

/**
 * unit-coordonnees.test.js — conversion WGS84 ↔ Lambert Maroc / UTM (§7).
 * -----------------------------------------------------------------------
 * MÊME MÉTHODOLOGIE que unit-ahp.test.js / unit-hydrologie-grille.test.js :
 * aucune valeur attendue ci-dessous n'est une approximation recopiée « à
 * vue d'œil ». Les valeurs numériques précises (round-trips, résidus)
 * viennent d'un script jetable exécutant CE module puis relues ici — et
 * surtout, la propriété centrale (rapport/k0 ≈ 1 le long du parallèle
 * standard) est vérifiée contre le moteur géodésique DÉJÀ validé de
 * calculations/geodesie.js (Karney), un oracle mathématique indépendant
 * de ce module, exactement comme les cross-validations de l'étape 3.
 * -----------------------------------------------------------------------
 */
import {
  versGeocentrique, depuisGeocentrique, merchichVersWgs84, wgs84VersMerchich,
  versLambert, versUtm, depuisUtm, versWgs84, depuisWgs84,
  fuseauUtmDepuisLongitude, ZONES_LAMBERT, WGS84, CLARKE_1880_IGN, SYSTEMES_IMPLEMENTES,
  FUSEAUX_UTM_MAROC,
} from '../src/calculations/coordonnees.js';
import { distanceGeodesique_m } from '../src/calculations/geodesie.js';

export const casCoordonnees = [
  // ── Ellipsoïde ↔ géocentrique : round-trip ──
  {
    libelle: 'Géocentrique : round-trip (lat,lon,h=0) sur WGS84, écart < 1e-8°',
    attendu: true, source: 'propriété : versGeocentrique puis depuisGeocentrique doit redonner le point',
    executer: () => {
      const g = versGeocentrique(31.6, -8.0, 0, WGS84);
      const r = depuisGeocentrique(g.X, g.Y, g.Z, WGS84);
      return Math.abs(r.lat - 31.6) < 1e-8 && Math.abs(r.lon - (-8.0)) < 1e-8 && Math.abs(r.h) < 1e-6;
    },
  },

  // ── Paramètres vérifiés des 4 zones Lambert Maroc (§8 — non-régression
  //    sur les valeurs sourcées, voir en-tête de coordonnees.js) ──
  {
    libelle: 'Zone Nord Maroc (EPSG:26191) : lat0=33,3° (37 grades)',
    attendu: 33.3, source: 'EPSG:26191, vérifié 20/09/2026', executer: () => ZONES_LAMBERT['merchich-nord'].lat0_deg,
  },
  {
    libelle: 'Zone Sud Maroc (EPSG:26192) : lat0=29,7° (33 grades)',
    attendu: 29.7, source: 'EPSG:26192, vérifié 20/09/2026', executer: () => ZONES_LAMBERT['merchich-sud'].lat0_deg,
  },
  {
    libelle: 'Zone Sahara Nord (EPSG:26194) : x0=1 200 000 m',
    attendu: 1200000, source: 'EPSG:26194, vérifié 20/09/2026', executer: () => ZONES_LAMBERT['merchich-sahara-nord'].x0,
  },
  {
    libelle: 'Zone Sahara Sud (EPSG:26195) : x0=1 500 000 m',
    attendu: 1500000, source: 'EPSG:26195, vérifié 20/09/2026', executer: () => ZONES_LAMBERT['merchich-sahara-sud'].x0,
  },
  {
    libelle: 'Toutes les zones Lambert : méridien central identique (-5,4°, commun aux 4 zones)',
    attendu: true, source: 'EPSG, vérifié 20/09/2026',
    executer: () => Object.values(ZONES_LAMBERT).every((z) => z.lon0_deg === -5.4),
  },
  {
    libelle: 'Ellipsoïde Clarke 1880 IGN : a = 6 378 249,2 m (EPSG:7011)',
    attendu: 6378249.2, source: 'EPSG:7011, vérifié 20/09/2026', executer: () => CLARKE_1880_IGN.a,
  },

  // ── Origine de chaque zone Lambert : doit reprojeter exactement sur (x0,y0) ──
  ...Object.entries({
    'merchich-nord': 500000, 'merchich-sud': 500000, 'merchich-sahara-nord': 1200000, 'merchich-sahara-sud': 1500000,
  }).map(([id, x0]) => ({
    libelle: `Origine de la zone « ${id} » : reprojetée (round-trip WGS84 complet) sur x0=${x0} à moins de 1 cm`,
    attendu: true, source: 'propriété de définition de la projection (à l’origine, ρ=ρ0, θ=0 ⇒ x=FE)',
    executer: () => {
      const zone = ZONES_LAMBERT[id];
      const origineWgs84 = merchichVersWgs84(zone.lat0_deg, zone.lon0_deg);
      const proj = depuisWgs84(id, origineWgs84.lat, origineWgs84.lon);
      return Math.abs(proj.x - zone.x0) < 0.01 && Math.abs(proj.y - zone.y0) < 0.01;
    },
  })),

  // ── Round-trip complet WGS84 → système → WGS84, pour chaque système implémenté ──
  ...SYSTEMES_IMPLEMENTES.map((id) => ({
    libelle: `Round-trip WGS84 ↔ ${id} (point Marrakech, 31,63°N -8,0°) — écart < 1e-6°`,
    attendu: true, source: 'valeur calculée par le module lui-même (script jetable), voir en-tête du fichier',
    executer: () => {
      const lat = 31.63, lon = -8.0;
      const opts = id === 'utm-wgs84' ? { fuseau: fuseauUtmDepuisLongitude(lon) } : {};
      const p = depuisWgs84(id, lat, lon, opts);
      const back = versWgs84(id, p.x, p.y, opts);
      return Math.abs(back.lat - lat) < 1e-6 && Math.abs(back.lon - lon) < 1e-6;
    },
  })),

  // ── Datum Merchich ↔ WGS84 : round-trip et décalage plausible ──
  {
    libelle: 'Datum : round-trip Merchich → WGS84 → Merchich, écart < 5e-8° (~5 mm — limite de convergence de l’itération géocentrique, calculé)',
    attendu: true, source: 'propriété de round-trip',
    executer: () => {
      const w = merchichVersWgs84(31.6, -8.0);
      const back = wgs84VersMerchich(w.lat, w.lon);
      return Math.abs(back.lat - 31.6) < 5e-8 && Math.abs(back.lon - (-8.0)) < 5e-8;
    },
  },
  {
    libelle: 'Datum : le décalage Merchich→WGS84 reste de l’ordre de quelques centaines de mètres (translation EPSG:1166 plausible)',
    attendu: true, source: 'ordre de grandeur attendu pour une translation à 3 paramètres de dizaines à centaines de mètres',
    executer: () => {
      const w = merchichVersWgs84(31.6, -8.0);
      const d = distanceGeodesique_m(31.6, -8.0, w.lat, w.lon);
      return d > 50 && d < 500;
    },
  },

  // ── Cross-validation : distance projetée / k0 ≈ distance géodésique
  //    le long du parallèle standard (propriété DÉFINITOIRE d’une
  //    projection conforme : l’échelle exacte au parallèle standard
  //    vaut k0) — vérifié contre le moteur géodésique déjà validé. ──
  {
    libelle: 'Lambert Nord Maroc : le long du parallèle standard, distance_projetée/(k0×distance_géodésique) ≈ 1 (< 0,01 %)',
    attendu: true, source: 'propriété définitoire d’une projection conforme au parallèle standard — cross-validée contre geodesie.js (Karney)',
    executer: () => {
      const zone = ZONES_LAMBERT['merchich-nord'];
      const latM = zone.lat0_deg;
      const lon1M = zone.lon0_deg - 0.05, lon2M = zone.lon0_deg + 0.05;
      const p1 = versLambert(latM, lon1M, zone, CLARKE_1880_IGN);
      const p2 = versLambert(latM, lon2M, zone, CLARKE_1880_IGN);
      const distPlan = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const w1 = merchichVersWgs84(latM, lon1M), w2 = merchichVersWgs84(latM, lon2M);
      const distGeo = distanceGeodesique_m(w1.lat, w1.lon, w2.lat, w2.lon);
      const rapport = distPlan / (zone.k0 * distGeo);
      return Math.abs(rapport - 1) < 1e-4;
    },
  },

  // ── UTM ──
  {
    libelle: 'Fuseau UTM : Marrakech (-8,0°) est en zone 29',
    attendu: 29, source: 'définition standard UTM (largeur 6°, fuseau 1 = -180°..-174°)',
    executer: () => fuseauUtmDepuisLongitude(-8.0),
  },
  {
    libelle: 'Fuseaux UTM couvrant le Maroc/Sahara : 28 à 31 (EPSG 32628-32631, vérifié 20/09/2026)',
    attendu: true, source: 'EPSG, vérifié 20/09/2026',
    executer: () => FUSEAUX_UTM_MAROC.length === 4 && FUSEAUX_UTM_MAROC[0] === 28 && FUSEAUX_UTM_MAROC[3] === 31,
  },
  {
    libelle: 'UTM : round-trip (E,N) → (lat,lon) → (E,N), écart < 1 mm',
    attendu: true, source: 'propriété de round-trip',
    executer: () => {
      const fuseau = fuseauUtmDepuisLongitude(-8.0);
      const p = versUtm(31.63, -8.0, fuseau);
      const back = depuisUtm(p.x, p.y, fuseau, true);
      const pBack = versUtm(back.lat, back.lon, fuseau);
      return Math.abs(pBack.x - p.x) < 0.001 && Math.abs(pBack.y - p.y) < 0.001;
    },
  },
  {
    libelle: 'UTM : easting proche de 500 000 m au méridien central du fuseau',
    attendu: true, source: 'définition UTM — FE=500000 exactement au méridien central',
    executer: () => {
      const fuseau = 29;
      const lon0 = fuseau * 6 - 183; // -9°, méridien central du fuseau 29
      const p = versUtm(31.6, lon0, fuseau);
      return Math.abs(p.x - 500000) < 1e-6;
    },
  },

  // ── Systèmes non implémentés : refus explicite, jamais un résultat inventé ──
  {
    libelle: 'versWgs84 : refuse un système non implémenté (utm-point58) plutôt que de deviner',
    attendu: 'refus', source: '§5, §8 — jamais un résultat inventé pour un datum non vérifié',
    executer: () => { try { versWgs84('utm-point58', 500000, 300000); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'depuisWgs84 : refuse un système non implémenté (utm-nordsahara59)',
    attendu: 'refus', source: '§5, §8',
    executer: () => { try { depuisWgs84('utm-nordsahara59', 31.6, -8.0); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'versWgs84 : refuse utm-wgs84 sans fuseau précisé (jamais un fuseau deviné en silence à la lecture)',
    attendu: 'refus', source: '§5',
    executer: () => { try { versWgs84('utm-wgs84', 500000, 3500000); return 'aucun refus'; } catch { return 'refus'; } },
  },
];

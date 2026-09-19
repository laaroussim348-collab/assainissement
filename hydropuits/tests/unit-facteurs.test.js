/**
 * unit-facteurs.test.js — assemblage des 8 facteurs (§3.4) à partir de
 * données brutes synthétiques, sur toutes les combinaisons de source
 * manquante (§5 : chaque absence doit être dite, jamais devinée).
 * -----------------------------------------------------------------------
 * Ce fichier teste le CÂBLAGE (facteurs.js sait appeler le bon module
 * pour la bonne source, et se tait honnêtement quand une source manque)
 * — pas la géométrie elle-même, déjà couverte analytiquement par
 * unit-derives-mnt.test.js, unit-hydrologie-grille.test.js et
 * unit-geometrie-ligneaire.test.js. Un MNT plan synthétique (même
 * patron que unit-grille-mnt.test.js) suffit donc ici.
 * -----------------------------------------------------------------------
 */
import { depuisElevationOpenMeteo } from '../src/calculations/grilleMnt.js';
import { construireFacteurs, toutesLesGrillesFacteurs, RAYON_DENSITE_M_DEFAUT } from '../src/calculations/facteurs.js';
import { IDS_FACTEURS } from '../src/calculations/ahp.js';

const A = 300, B = -150, C = 500;
const planZ = (lat, lon) => A * (lat - 31.6) + B * (lon - (-8)) + C;

function grilleOpenMeteoSynthetique(latMin, latMax, lonMin, lonMax, nbLignes, nbColonnes) {
  const points = [];
  for (let i = 0; i < nbLignes; i++) {
    const lat = latMin + (i / (nbLignes - 1)) * (latMax - latMin);
    for (let j = 0; j < nbColonnes; j++) {
      const lon = lonMin + (j / (nbColonnes - 1)) * (lonMax - lonMin);
      points.push({ lat, lon, altitude_m: planZ(lat, lon) });
    }
  }
  return { points, nbLignes, nbColonnes };
}

// Emprise généreusement plus grande que le carré, pour que la marge d'une
// cellule ajoutée par construireGrilleCalcul() reste couverte (pas de
// « trou » MNT accidentel dans les cas où le MNT EST disponible).
const SOURCE_PLAN = grilleOpenMeteoSynthetique(31.585, 31.615, -8.015, -7.985, 21, 21);
const GRILLE_SOURCE_MNT = depuisElevationOpenMeteo(SOURCE_PLAN);

const CARRE = [
  { lat: 31.598, lon: -8.004 }, { lat: 31.598, lon: -7.996 },
  { lat: 31.602, lon: -7.996 }, { lat: 31.602, lon: -8.004 },
];

const COURS_EAU = [[{ lat: 31.600, lon: -8.010 }, { lat: 31.600, lon: -7.990 }]];
const FAILLES = [[{ lat: 31.595, lon: -8.000 }, { lat: 31.605, lon: -8.000 }]];
const OVERPASS = { coursEau: COURS_EAU, failles: FAILLES };
const NASA_POWER = { pma_mm_an: 420 };
const SOIL_GRIDS = { argile_pourcent: 18, sable_pourcent: 62, limon_pourcent: 20 };

const OPTIONS = { espacement_m: 50, rayonDensite_m: RAYON_DENSITE_M_DEFAUT };

function tousDisponibles(sourcesBrutes = {}) {
  return construireFacteurs(CARRE, {
    grilleSourceMnt: GRILLE_SOURCE_MNT, overpass: OVERPASS, nasaPower: NASA_POWER, soilGrids: SOIL_GRIDS,
    ...sourcesBrutes,
  }, OPTIONS);
}

function auMoinsUneValeurFinieDansLeMasque(grille, tableau) {
  for (let idx = 0; idx < tableau.length; idx++) {
    if (grille.masque[idx] && Number.isFinite(tableau[idx])) return true;
  }
  return false;
}

export const casFacteurs = [
  // ── Toutes les sources présentes : les 8 facteurs sont disponibles ──
  {
    libelle: 'Toutes sources présentes : les 8 facteurs de IDS_FACTEURS sont disponibles',
    attendu: true, source: '§3.4',
    executer: () => {
      const c = tousDisponibles();
      return IDS_FACTEURS.every((id) => c.disponibilite[id] === true);
    },
  },
  {
    libelle: 'Toutes sources présentes : grille de pente non nulle et exploitable quelque part dans le masque',
    attendu: true, source: '§3.4',
    executer: () => {
      const c = tousDisponibles();
      return auMoinsUneValeurFinieDansLeMasque(c.grille, c.grillesBrutes.pente);
    },
  },
  {
    libelle: 'Toutes sources présentes : grille de TWI exploitable',
    attendu: true, source: '§3.4',
    executer: () => {
      const c = tousDisponibles();
      return auMoinsUneValeurFinieDansLeMasque(c.grille, c.grillesBrutes.twi);
    },
  },
  {
    libelle: 'Toutes sources présentes : densité de drainage exploitable (cours d’eau traverse le terrain)',
    attendu: true, source: '§3.4',
    executer: () => {
      const c = tousDisponibles();
      return auMoinsUneValeurFinieDansLeMasque(c.grille, c.grillesBrutes.densiteDrainage);
    },
  },
  {
    libelle: 'Toutes sources présentes : lithologie/sol = % de sable fourni (62)',
    attendu: 62, source: 'facteurs.js — % sable, voir en-tête',
    executer: () => tousDisponibles().valeursScalaires.lithologieSol,
  },
  {
    libelle: 'Toutes sources présentes : pluviométrie = pma_mm_an fourni (420)',
    attendu: 420, source: '§3.4',
    executer: () => tousDisponibles().valeursScalaires.pluviometrie,
  },

  // ── MNT manquant : AUCUN facteur grillé, avertissement explicite ──
  {
    libelle: 'MNT manquant : grille = null (rien de grillé n’est calculable)',
    attendu: true, source: '§5',
    executer: () => tousDisponibles({ grilleSourceMnt: null }).grille === null,
  },
  {
    libelle: 'MNT manquant : les 6 facteurs grillés sont indisponibles',
    attendu: true, source: '§5',
    executer: () => {
      const c = tousDisponibles({ grilleSourceMnt: null });
      return ['pente', 'twi', 'courbure', 'densiteDrainage', 'densiteLineaments', 'distanceCoursEau']
        .every((id) => c.disponibilite[id] === false);
    },
  },
  {
    libelle: 'MNT manquant : avertissement facAvtMntManquant présent',
    attendu: true, source: '§5',
    executer: () => tousDisponibles({ grilleSourceMnt: null }).avertissements.some((a) => a.cle === 'facAvtMntManquant'),
  },
  {
    libelle: 'MNT manquant : les facteurs scalaires restent, eux, disponibles (indépendants du MNT)',
    attendu: true, source: '§5 — ne pas invalider ce qui reste valide',
    executer: () => {
      const c = tousDisponibles({ grilleSourceMnt: null });
      return c.disponibilite.lithologieSol === true && c.disponibilite.pluviometrie === true;
    },
  },

  // ── Overpass manquant : MNT reste exploitable, densités/distance non ──
  {
    libelle: 'Overpass manquant : pente/TWI/courbure restent disponibles',
    attendu: true, source: '§5',
    executer: () => {
      const c = tousDisponibles({ overpass: null });
      return c.disponibilite.pente && c.disponibilite.twi && c.disponibilite.courbure;
    },
  },
  {
    libelle: 'Overpass manquant : densités et distance indisponibles + avertissement nommé',
    attendu: true, source: '§5',
    executer: () => {
      const c = tousDisponibles({ overpass: null });
      return !c.disponibilite.densiteDrainage && !c.disponibilite.densiteLineaments && !c.disponibilite.distanceCoursEau
        && c.avertissements.some((a) => a.cle === 'facAvtOverpassManquant');
    },
  },
  {
    libelle: 'Overpass présent mais SANS cours d’eau : avertissement facAvtAucunCoursEau, densité de drainage indisponible',
    attendu: true, source: '§5',
    executer: () => {
      const c = tousDisponibles({ overpass: { coursEau: [], failles: FAILLES } });
      return !c.disponibilite.densiteDrainage && !c.disponibilite.distanceCoursEau
        && c.avertissements.some((a) => a.cle === 'facAvtAucunCoursEau')
        && c.disponibilite.densiteLineaments === true;
    },
  },
  {
    libelle: 'Overpass présent mais SANS faille : avertissement facAvtAucuneFaille, densité de linéaments indisponible',
    attendu: true, source: '§5',
    executer: () => {
      const c = tousDisponibles({ overpass: { coursEau: COURS_EAU, failles: [] } });
      return !c.disponibilite.densiteLineaments
        && c.avertissements.some((a) => a.cle === 'facAvtAucuneFaille')
        && c.disponibilite.densiteDrainage === true;
    },
  },

  // ── SoilGrids / NASA POWER manquants ──
  {
    libelle: 'SoilGrids manquant : lithologieSol indisponible + avertissement nommé',
    attendu: true, source: '§5',
    executer: () => {
      const c = tousDisponibles({ soilGrids: null });
      return !c.disponibilite.lithologieSol && c.avertissements.some((a) => a.cle === 'facAvtSoilGridsManquant');
    },
  },
  {
    libelle: 'NASA POWER manquant : pluviometrie indisponible + avertissement nommé',
    attendu: true, source: '§5',
    executer: () => {
      const c = tousDisponibles({ nasaPower: null });
      return !c.disponibilite.pluviometrie && c.avertissements.some((a) => a.cle === 'facAvtNasaPowerManquant');
    },
  },

  // ── toutesLesGrillesFacteurs ──
  {
    libelle: 'toutesLesGrillesFacteurs : null si pas de grille (MNT manquant)',
    attendu: true, source: '§5',
    executer: () => toutesLesGrillesFacteurs(tousDisponibles({ grilleSourceMnt: null })) === null,
  },
  {
    libelle: 'toutesLesGrillesFacteurs : couvre exactement les 8 facteurs (IDS_FACTEURS)',
    attendu: true, source: '§3.4',
    executer: () => {
      const g = toutesLesGrillesFacteurs(tousDisponibles());
      return IDS_FACTEURS.every((id) => g[id] instanceof Float64Array) && Object.keys(g).length === IDS_FACTEURS.length;
    },
  },
  {
    libelle: 'toutesLesGrillesFacteurs : facteur grillé manquant (densité de linéaments, sans faille) devient une grille TOUT-NaN, pas absente',
    attendu: true, source: '§5 — uniformité de forme, voir en-tête de facteurs.js',
    executer: () => {
      const c = tousDisponibles({ overpass: { coursEau: COURS_EAU, failles: [] } });
      const g = toutesLesGrillesFacteurs(c);
      return g.densiteLineaments.length === c.grille.nbLignes * c.grille.nbColonnes
        && Array.from(g.densiteLineaments).every((v) => Number.isNaN(v));
    },
  },
  {
    libelle: 'toutesLesGrillesFacteurs : lithologieSol diffusé EXACTEMENT sur toutes les cellules du masque',
    attendu: true, source: 'facteurs.js — diffusion scalaire',
    executer: () => {
      const c = tousDisponibles();
      const g = toutesLesGrillesFacteurs(c);
      for (let idx = 0; idx < g.lithologieSol.length; idx++) {
        if (c.grille.masque[idx] && g.lithologieSol[idx] !== 62) return false;
        if (!c.grille.masque[idx] && !Number.isNaN(g.lithologieSol[idx])) return false;
      }
      return true;
    },
  },
  {
    libelle: 'toutesLesGrillesFacteurs : pluviométrie manquante ⇒ grille diffusée TOUT-NaN (pas 0, pas une moyenne)',
    attendu: true, source: '§5',
    executer: () => {
      const g = toutesLesGrillesFacteurs(tousDisponibles({ nasaPower: null }));
      return Array.from(g.pluviometrie).every((v) => Number.isNaN(v));
    },
  },
];

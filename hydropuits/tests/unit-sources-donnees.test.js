/**
 * unit-sources-donnees.test.js — registre des sources de données (§3.3).
 * -----------------------------------------------------------------------
 * Vérifie la STRUCTURE du registre (chaque source déclare bien les champs
 * imposés par le cahier des charges) et la règle de renormalisation des
 * facteurs (§3.4 : un facteur n'est indisponible que si TOUTES ses
 * sources le sont).
 * -----------------------------------------------------------------------
 */
import { SOURCES, obtenirSource, sourcesSansCle, sourcesAvecCle, facteursIndisponibles } from '../src/services/sourcesDonnees.js';

const CHAMPS_REQUIS = ['id', 'nomCle', 'descriptionCle', 'url', 'resolution', 'couverture', 'cleRequise', 'urlInscription', 'gratuit', 'licence', 'verifieLe', 'facteurs'];

export const casSourcesDonnees = [
  {
    libelle: 'Registre : au moins 5 sources déclarées',
    attendu: true,
    source: '§3.3 (Open-Meteo, Overpass, NASA POWER, SoilGrids, OpenTopography)',
    executer: () => SOURCES.length >= 5,
  },
  {
    libelle: 'Registre : identifiants tous uniques',
    attendu: SOURCES.length,
    source: 'intégrité', executer: () => new Set(SOURCES.map((s) => s.id)).size,
  },
  {
    libelle: 'Registre : chaque source a tous les champs requis',
    attendu: '',
    source: '§3.3 (« chaque source déclare {id, nom, description, url, resolution, couverture, cleRequise, urlInscription, licence} »)',
    executer: () => SOURCES
      .filter((s) => CHAMPS_REQUIS.some((c) => !(c in s)))
      .map((s) => s.id).join(','),
  },
  {
    libelle: 'Registre : verifieLe au format AAAA-MM-JJ pour toutes',
    attendu: '',
    source: '§8 (« vérifie sur le web, cite la date de vérification »)',
    executer: () => SOURCES.filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s.verifieLe)).map((s) => s.id).join(','),
  },
  {
    libelle: 'Registre : une source à clé requise a une URL d’inscription',
    attendu: '',
    source: '§3.3 (« l’écran affiche […] le lien d’inscription »)',
    executer: () => SOURCES.filter((s) => s.cleRequise && !s.urlInscription).map((s) => s.id).join(','),
  },
  {
    libelle: 'Registre : une source sans clé n’a pas d’URL d’inscription',
    attendu: '',
    source: 'cohérence — rien à afficher pour une source déjà utilisable',
    executer: () => SOURCES.filter((s) => !s.cleRequise && s.urlInscription).map((s) => s.id).join(','),
  },
  {
    libelle: 'Registre : chaque source dépend d’au moins un facteur',
    attendu: '',
    source: 'intégrité — une source sans facteur ne servirait jamais à rien',
    executer: () => SOURCES.filter((s) => !Array.isArray(s.facteurs) || s.facteurs.length === 0).map((s) => s.id).join(','),
  },
  {
    libelle: 'OpenTopography est bien à clé requise',
    attendu: true,
    source: '§3.3', executer: () => obtenirSource('opentopography-globaldem').cleRequise,
  },
  {
    libelle: 'Open-Meteo, Overpass et NASA POWER sont bien sans clé',
    attendu: true,
    source: '§3.3',
    executer: () => !obtenirSource('elevation-open-meteo').cleRequise
      && !obtenirSource('overpass-osm').cleRequise
      && !obtenirSource('nasa-power').cleRequise,
  },
  {
    libelle: 'obtenirSource : refuse un identifiant inconnu',
    attendu: 'refus',
    source: 'garde-fou', executer: () => { try { obtenirSource('inexistant'); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'sourcesSansCle() ∪ sourcesAvecCle() = SOURCES',
    attendu: SOURCES.length,
    source: 'partition complète',
    executer: () => sourcesSansCle().length + sourcesAvecCle().length,
  },

  // ── facteursIndisponibles : renormalisation (§3.4) ──
  {
    libelle: 'Aucune source indisponible ⇒ aucun facteur indisponible',
    attendu: 0,
    source: '§3.4', executer: () => facteursIndisponibles([]).length,
  },
  {
    libelle: 'Toutes les sources indisponibles ⇒ tous les facteurs indisponibles',
    attendu: true,
    source: '§3.4',
    executer: () => {
      const tous = facteursIndisponibles(SOURCES.map((s) => s.id));
      const attendus = new Set(SOURCES.flatMap((s) => s.facteurs));
      return tous.length === attendus.size && tous.every((f) => attendus.has(f));
    },
  },
  {
    libelle: 'Facteur porté par 2 sources : indisponible seulement si les DEUX manquent',
    attendu: false,
    source: '§3.4 (« un facteur peut dépendre de plusieurs sources »)',
    // la pente vient d'Open-Meteo ET d'OpenTopography (voir sourcesDonnees.js) :
    // Open-Meteo seul indisponible ne doit PAS désactiver le facteur pente.
    executer: () => facteursIndisponibles(['elevation-open-meteo']).includes('pente'),
  },
  {
    libelle: 'Facteur porté par 2 sources : indisponible quand les deux manquent',
    attendu: true,
    source: '§3.4',
    executer: () => facteursIndisponibles(['elevation-open-meteo', 'opentopography-globaldem']).includes('pente'),
  },
  {
    libelle: 'SoilGrids seul indisponible ⇒ seul le facteur sol est touché',
    attendu: 'lithologieSol',
    source: '§3.4', executer: () => facteursIndisponibles(['soilgrids-isric']).join(','),
  },
];

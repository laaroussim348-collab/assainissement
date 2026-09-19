/**
 * unit-reclassement.test.js — reclassement 1..5 sur seuils éditables,
 * cas limites de bornes, quantiles par défaut (§3.4, §7).
 * -----------------------------------------------------------------------
 * §7 impose explicitement des « tests de reclassement aux valeurs
 * limites (boundary-value) » : les seuils [10,20,30,40] ci-dessous sont
 * volontairement des nombres ronds pour que chaque cas limite (9,999 /
 * 10 / 20 / 39,999 / 40) soit vérifiable de tête, PAR CONVENTION DE
 * BORNE explicite (voir reclassement.js : [sᵢ₋₁,sᵢ[) — pas par calcul.
 * Les seuils de quantiles, eux, sont recalculés par un script jetable
 * puis relus ici (même méthodologie que unit-ahp.test.js).
 * -----------------------------------------------------------------------
 */
import {
  SENS, SENS_DEFAUT_PAR_FACTEUR, SEUILS_PENTE_POURCENT_DEFAUT,
  reclasserValeur, reclasserGrille, seuilsQuantiles,
} from '../src/calculations/reclassement.js';
import { IDS_FACTEURS } from '../src/calculations/ahp.js';

const SEUILS = [10, 20, 30, 40];

export const casReclassement = [
  // ── Bornes exactes, sens croissant ──
  { libelle: 'Borne : juste sous s1 (9,999) ⇒ classe 1', attendu: 1, source: '§7', executer: () => reclasserValeur(9.999, SEUILS, SENS.CROISSANT) },
  { libelle: 'Borne : exactement s1 (10) ⇒ classe 2 (borne fermée à gauche)', attendu: 2, source: '§7', executer: () => reclasserValeur(10, SEUILS, SENS.CROISSANT) },
  { libelle: 'Borne : juste sous s2 (19,999) ⇒ classe 2', attendu: 2, source: '§7', executer: () => reclasserValeur(19.999, SEUILS, SENS.CROISSANT) },
  { libelle: 'Borne : exactement s2 (20) ⇒ classe 3', attendu: 3, source: '§7', executer: () => reclasserValeur(20, SEUILS, SENS.CROISSANT) },
  { libelle: 'Borne : exactement s3 (30) ⇒ classe 4', attendu: 4, source: '§7', executer: () => reclasserValeur(30, SEUILS, SENS.CROISSANT) },
  { libelle: 'Borne : juste sous s4 (39,999) ⇒ classe 4', attendu: 4, source: '§7', executer: () => reclasserValeur(39.999, SEUILS, SENS.CROISSANT) },
  { libelle: 'Borne : exactement s4 (40) ⇒ classe 5', attendu: 5, source: '§7', executer: () => reclasserValeur(40, SEUILS, SENS.CROISSANT) },
  { libelle: 'Borne : très au-dessus (1000) ⇒ classe 5', attendu: 5, source: '§7', executer: () => reclasserValeur(1000, SEUILS, SENS.CROISSANT) },
  { libelle: 'Borne : très en dessous (-1000) ⇒ classe 1', attendu: 1, source: '§7', executer: () => reclasserValeur(-1000, SEUILS, SENS.CROISSANT) },

  // ── Même bornes, sens décroissant (miroir : classe = 6 − classeBrute) ──
  { libelle: 'Décroissant : sous s1 (valeur basse) ⇒ classe 5 (la plus favorable)', attendu: 5, source: '§3.4', executer: () => reclasserValeur(9.999, SEUILS, SENS.DECROISSANT) },
  { libelle: 'Décroissant : exactement s1 (10) ⇒ classe 4', attendu: 4, source: '§3.4', executer: () => reclasserValeur(10, SEUILS, SENS.DECROISSANT) },
  { libelle: 'Décroissant : exactement s4 (40) ⇒ classe 1 (la moins favorable)', attendu: 1, source: '§3.4', executer: () => reclasserValeur(40, SEUILS, SENS.DECROISSANT) },
  { libelle: 'Décroissant : valeur très élevée (1000) ⇒ classe 1', attendu: 1, source: '§3.4', executer: () => reclasserValeur(1000, SEUILS, SENS.DECROISSANT) },

  // ── Donnée manquante (§5 : jamais une classe par défaut inventée) ──
  { libelle: 'NaN ⇒ null (donnée manquante, pas une classe médiane par défaut)', attendu: true, source: '§5', executer: () => reclasserValeur(NaN, SEUILS) === null },
  { libelle: 'Infinity ⇒ null', attendu: true, source: '§5', executer: () => reclasserValeur(Infinity, SEUILS) === null },

  // ── Garde-fous sur les seuils ──
  { libelle: 'Refuse moins de 4 seuils', attendu: 'refus', source: 'garde-fou', executer: () => { try { reclasserValeur(15, [10, 20, 30]); return 'aucun refus'; } catch { return 'refus'; } } },
  { libelle: 'Refuse des seuils non strictement croissants (s2=s1)', attendu: 'refus', source: 'garde-fou', executer: () => { try { reclasserValeur(15, [10, 10, 30, 40]); return 'aucun refus'; } catch { return 'refus'; } } },
  { libelle: 'Refuse des seuils décroissants', attendu: 'refus', source: 'garde-fou', executer: () => { try { reclasserValeur(15, [40, 30, 20, 10]); return 'aucun refus'; } catch { return 'refus'; } } },

  // ── reclasserGrille : masque + données manquantes distingués (§5) ──
  {
    libelle: 'reclasserGrille : compte séparément « hors masque » et « donnée manquante »',
    attendu: true, source: '§5 — jamais confondre les deux',
    executer: () => {
      const valeurs = [5, NaN, 25, 45, NaN, 15];
      const masque = new Uint8Array([1, 1, 0, 1, 1, 0]); // index 2 et 5 hors terrain
      const r = reclasserGrille(valeurs, masque, SEUILS, SENS.CROISSANT);
      // index0=5(classe1) index1=NaN(manquante, dans le masque) index2=hors masque
      // index3=45(classe5) index4=NaN(manquante, dans le masque) index5=hors masque
      return r.nHorsMasque === 2 && r.nManquantes === 2
        && r.classes[0] === 1 && r.classes[3] === 5
        && Number.isNaN(r.classes[1]) && Number.isNaN(r.classes[2])
        && Number.isNaN(r.classes[4]) && Number.isNaN(r.classes[5]);
    },
  },
  {
    libelle: 'reclasserGrille : sans masque (null), toutes les cellules finies sont classées',
    attendu: true, source: 'cas d’usage sans polygone restrictif',
    executer: () => {
      const r = reclasserGrille([5, 45], null, SEUILS, SENS.CROISSANT);
      return r.nHorsMasque === 0 && r.nManquantes === 0 && r.classes[0] === 1 && r.classes[1] === 5;
    },
  },

  // ── seuilsQuantiles (défauts calculés sur les données réelles) ──
  {
    libelle: 'seuilsQuantiles([1..10]) : seuil 20% = 2,8 (interpolation linéaire, calculé — voir en-tête)',
    attendu: 2.8, tolerancePourcent: 1e-6,
    source: 'méthode usuelle des quantiles (interpolation linéaire entre rangs)',
    executer: () => seuilsQuantiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])[0],
  },
  {
    libelle: 'seuilsQuantiles([1..10]) : seuil 80% = 8,2',
    attendu: 8.2, tolerancePourcent: 1e-6, source: 'idem',
    executer: () => seuilsQuantiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])[3],
  },
  {
    libelle: 'seuilsQuantiles : ignore les valeurs non finies (NaN de cellules hors masque/manquantes)',
    attendu: 2.8, tolerancePourcent: 1e-6,
    source: '§5 — une donnée manquante ne doit pas fausser silencieusement les seuils',
    executer: () => seuilsQuantiles([NaN, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, NaN, Infinity])[0],
  },
  {
    libelle: 'seuilsQuantiles : les 4 seuils obtenus sont exploitables par reclasserValeur (strictement croissants)',
    attendu: true, source: 'contrat entre les deux fonctions',
    executer: () => {
      const s = seuilsQuantiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      return s[0] < s[1] && s[1] < s[2] && s[2] < s[3];
    },
  },
  {
    libelle: 'seuilsQuantiles : refuse moins de 5 valeurs valides (5 classes non significatives)',
    attendu: 'refus', source: 'garde-fou',
    executer: () => { try { seuilsQuantiles([1, 2, NaN, NaN]); return 'aucun refus'; } catch { return 'refus'; } },
  },
  {
    libelle: 'seuilsQuantiles : plateau de valeurs répétées ⇒ seuils tout de même strictement croissants (pas d’échec sur données réelles légitimes)',
    attendu: true, source: 'ex. TWI arrondi produisant des valeurs identiques',
    executer: () => {
      const s = seuilsQuantiles([1, 1, 1, 1, 1, 1, 1, 2, 3, 4]);
      return s[0] < s[1] && s[1] < s[2] && s[2] < s[3];
    },
  },

  // ── Défauts par facteur (§3.4) ──
  {
    libelle: 'SENS_DEFAUT_PAR_FACTEUR : couvre exactement les 8 facteurs (§3.4), ni plus ni moins',
    attendu: true, source: '§3.4',
    executer: () => IDS_FACTEURS.every((id) => id in SENS_DEFAUT_PAR_FACTEUR)
      && Object.keys(SENS_DEFAUT_PAR_FACTEUR).length === IDS_FACTEURS.length,
  },
  {
    libelle: 'SENS_DEFAUT_PAR_FACTEUR : pente décroissante (plat = favorable à l’infiltration)',
    attendu: SENS.DECROISSANT, source: 'Horton (1933) — genèse du ruissellement',
    executer: () => SENS_DEFAUT_PAR_FACTEUR.pente,
  },
  {
    libelle: 'SENS_DEFAUT_PAR_FACTEUR : TWI croissant (convergence/accumulation = favorable)',
    attendu: SENS.CROISSANT, source: 'Beven & Kirkby (1979)',
    executer: () => SENS_DEFAUT_PAR_FACTEUR.twi,
  },
  {
    libelle: 'SENS_DEFAUT_PAR_FACTEUR : densité de linéaments croissante (fractures = favorable en socle)',
    attendu: SENS.CROISSANT, source: '§3.4',
    executer: () => SENS_DEFAUT_PAR_FACTEUR.densiteLineaments,
  },
  {
    libelle: 'SENS_DEFAUT_PAR_FACTEUR : courbure décroissante (cuvette négative = favorable, voir derivesMnt.js)',
    attendu: SENS.DECROISSANT, source: 'signe vérifié analytiquement dans derivesMnt.js',
    executer: () => SENS_DEFAUT_PAR_FACTEUR.courbure,
  },
  {
    libelle: 'SEUILS_PENTE_POURCENT_DEFAUT : [2, 5, 10, 20] (classes de pente FAO fusionnées à 5 classes)',
    attendu: true, source: 'FAO — classes de pente usuelles en évaluation des terres',
    executer: () => JSON.stringify(SEUILS_PENTE_POURCENT_DEFAUT) === JSON.stringify([2, 5, 10, 20]),
  },
];

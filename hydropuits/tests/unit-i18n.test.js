/**
 * unit-i18n.test.js — garde-fou automatique sur le dictionnaire de traduction.
 * -----------------------------------------------------------------------
 * POURQUOI CE TEST EXISTE : le cahier des charges (§1) impose « traduire
 * les 4 langues à chaque ajout de clé, jamais une seule ». C'est une règle
 * qu'on oublie mécaniquement au bout de quelques itérations — HydroCrue en
 * porte la trace dans son propre README (section « Traduction — corrections
 * apportées à BV-Calc » : une vingtaine de messages étaient restés codés en
 * dur en français, et la clé `geoHint` existait dans les 4 langues sans
 * jamais être affichée autrement qu'en français).
 *
 * Ce test rend l'oubli impossible : toute clé présente dans une langue et
 * absente d'une autre fait échouer `npm test`, en nommant la clé et la
 * langue fautives. Il n'y a rien à maintenir — il se contente de comparer
 * les jeux de clés entre eux.
 *
 * Il vérifie aussi que le texte d'avertissement scientifique (§5) est bien
 * présent et non vide dans les 4 langues : c'est le seul texte du logiciel
 * dont l'absence serait une faute professionnelle, pas une gêne cosmétique.
 * -----------------------------------------------------------------------
 */
import { LANGUES, NOMS_LANGUES, RTL, TRADUCTIONS, t, definirLangue, langueActuelle } from '../src/i18n/index.js';

const REFERENCE = 'fr'; // le français fait foi : c'est la langue de rédaction

/** Clés présentes dans la langue de référence mais absentes de `langue`. */
function clesManquantes(langue) {
  const ref = Object.keys(TRADUCTIONS[REFERENCE]);
  const cibles = new Set(Object.keys(TRADUCTIONS[langue]));
  return ref.filter(c => !cibles.has(c));
}

/** Clés présentes dans `langue` mais inconnues de la langue de référence. */
function clesOrphelines(langue) {
  const ref = new Set(Object.keys(TRADUCTIONS[REFERENCE]));
  return Object.keys(TRADUCTIONS[langue]).filter(c => !ref.has(c));
}

/** Clés dont la valeur est vide ou n'est pas une chaîne, dans `langue`. */
function clesVides(langue) {
  return Object.entries(TRADUCTIONS[langue])
    .filter(([, v]) => typeof v !== 'string' || v.trim() === '')
    .map(([c]) => c);
}

export const casI18n = [
  {
    libelle: 'Langues déclarées',
    attendu: 'fr,ar,en,es',
    source: 'cahier des charges §1',
    executer: () => LANGUES.join(','),
  },
  {
    libelle: "L'arabe est la seule langue RTL",
    attendu: 'ar',
    source: 'cahier des charges §1 (RTL.ar = true)',
    executer: () => LANGUES.filter(lg => RTL[lg]).join(','),
  },
  {
    libelle: 'Chaque langue a un nom affichable',
    attendu: '',
    source: 'i18n.js NOMS_LANGUES',
    executer: () => LANGUES.filter(lg => !NOMS_LANGUES[lg]).join(','),
  },
  {
    libelle: 'Chaque langue a un dictionnaire',
    attendu: '',
    source: 'i18n.js TRADUCTIONS',
    executer: () => LANGUES.filter(lg => !TRADUCTIONS[lg]).join(','),
  },

  // ── Le cœur du garde-fou : parité stricte des clés entre les 4 langues ──
  ...LANGUES.filter(lg => lg !== REFERENCE).map(lg => ({
    libelle: `Aucune clé manquante en « ${lg} »`,
    attendu: '',
    source: `comparaison ${lg} vs ${REFERENCE}`,
    // La valeur obtenue est la LISTE des clés fautives : en cas d'échec, le
    // rapport de test affiche directement quoi corriger, pas juste "false".
    executer: () => clesManquantes(lg).join(','),
  })),
  ...LANGUES.filter(lg => lg !== REFERENCE).map(lg => ({
    libelle: `Aucune clé orpheline en « ${lg} »`,
    attendu: '',
    source: `comparaison ${lg} vs ${REFERENCE}`,
    executer: () => clesOrphelines(lg).join(','),
  })),
  ...LANGUES.map(lg => ({
    libelle: `Aucune traduction vide en « ${lg} »`,
    attendu: '',
    source: 'i18n.js',
    executer: () => clesVides(lg).join(','),
  })),

  // ── Avertissement scientifique : présent et substantiel partout (§5) ──
  ...LANGUES.map(lg => ({
    libelle: `Avertissement scientifique présent en « ${lg} »`,
    attendu: true,
    source: 'cahier des charges §5',
    // Seuil de 80 caractères : l'avertissement imposé fait 3 phrases dans
    // les 4 langues. Une valeur plus courte signalerait un texte tronqué
    // ou un copier-coller de titre à la place du paragraphe.
    executer: () => (TRADUCTIONS[lg].avertissementTexte || '').length > 80,
  })),
  {
    libelle: 'Aucune langue ne promet une probabilité de succès',
    attendu: '',
    source: 'cahier des charges §5 et §8 (interdit)',
    // Le cahier des charges bannit explicitement les formulations du type
    // « 87 % de chances ». Ce test attrape une telle formulation si elle
    // se glisse un jour dans une traduction.
    executer: () => LANGUES.filter(lg => {
      const textes = Object.values(TRADUCTIONS[lg]).join(' ').toLowerCase();
      return /probabilit|احتمال|probabilidad|chances de trouver/.test(textes);
    }).join(','),
  },

  // ── Comportement de t() ──
  {
    libelle: 't() renvoie la traduction française par défaut',
    attendu: 'Terrain',
    source: 'i18n.js t()',
    executer: () => { definirLangue('fr'); return t('tabTerrain'); },
  },
  {
    libelle: 't() suit la langue choisie',
    attendu: 'Criterios',
    source: 'i18n.js definirLangue()',
    executer: () => { definirLangue('es'); return t('tabCriteres'); },
  },
  {
    libelle: "t() renvoie la clé brute si elle n'existe pas",
    attendu: 'cleQuiNExistePas',
    source: 'i18n.js t() — repli visible plutôt que blanc silencieux',
    executer: () => t('cleQuiNExistePas'),
  },
  {
    libelle: 'definirLangue() refuse une langue inconnue',
    attendu: 'es',
    source: 'i18n.js definirLangue()',
    // 'de' n'est pas dans LANGUES : la langue courante doit rester 'es'
    // (posée par le cas précédent), pas basculer sur une langue sans
    // dictionnaire, ce qui afficherait toute l'interface en clés brutes.
    executer: () => { definirLangue('de'); return langueActuelle(); },
  },
];

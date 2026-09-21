/**
 * unit-facteurs-criteres.test.js — facteurs écartés et renormalisation (§7).
 * -----------------------------------------------------------------------
 * CE QUI EST VÉRIFIÉ ICI est la correction du 20/09/2026 la plus visible
 * pour l'utilisateur : jusque-là, un facteur actif dont la source n'avait
 * pas répondu invalidait TOUTES les cellules du calcul (règle voulue de
 * favorabilite.js : pas de moyenne partielle silencieuse), si bien qu'une
 * seule source en panne — Overpass surchargé, SoilGrids en pause — ne
 * dégradait pas le résultat mais le SUPPRIMAIT entièrement.
 *
 * Le facteur est désormais écarté et les poids renormalisés sur les
 * restants. Les deux propriétés qui rendent cela honnête sont testées
 * ici : la somme des poids reste exactement 1, et les rapports entre les
 * facteurs CONSERVÉS ne changent pas (c'est la même renormalisation
 * proportionnelle que celle déjà prévue au §3.4 pour un décochage
 * manuel, simplement déclenchée par une panne).
 * -----------------------------------------------------------------------
 */
import {
  actifsEffectifs, actifsDisponibles, poidsFinaux, poidsFinauxPourActifs,
  FACTEURS_ACTIFS_PAR_DEFAUT,
} from '../src/tabs/facteursCriteres.js';

// Les 3 facteurs qui dépendent d'Overpass (voir services/sourcesDonnees.js) :
// c'est exactement ce qui tombe quand Overpass dépasse son délai, la
// panne constatée en usage réel.
const PANNE_OVERPASS = {
  pente: true, twi: true, courbure: true, pluviometrie: true, lithologieSol: true,
  densiteDrainage: false, distanceCoursEau: false, densiteLineaments: false,
};

const etatVide = {};

export const casFacteursCriteres = [
  {
    libelle: 'Sans information de disponibilité, la liste des facteurs actifs est inchangée',
    attendu: true, source: 'non-régression — le comportement normal ne doit pas bouger',
    executer: () => actifsDisponibles(etatVide, null).join(',') === actifsEffectifs(etatVide).join(','),
  },
  {
    libelle: 'Panne Overpass : les 3 facteurs qui en dépendent sont écartés',
    attendu: true, source: 'services/sourcesDonnees.js — facteurs d’overpass-osm',
    executer: () => {
      const restants = actifsDisponibles(etatVide, PANNE_OVERPASS);
      return !restants.includes('densiteDrainage')
        && !restants.includes('distanceCoursEau')
        && !restants.includes('densiteLineaments');
    },
  },
  {
    libelle: 'Panne Overpass : les facteurs NON concernés sont conservés (pas de sur-suppression)',
    attendu: true, source: '§5 — n’écarter que ce qui manque réellement',
    executer: () => {
      const restants = actifsDisponibles(etatVide, PANNE_OVERPASS);
      return restants.includes('pente') && restants.includes('twi') && restants.includes('courbure');
    },
  },
  {
    libelle: 'Panne Overpass : il reste 5 facteurs calculables sur les 8 actifs par défaut',
    attendu: 5, source: '8 actifs par défaut moins les 3 qui dépendent d’Overpass',
    executer: () => actifsDisponibles(etatVide, PANNE_OVERPASS).length,
  },
  {
    libelle: 'Actifs par défaut : les 8 facteurs (SoilGrids rétablie, vérifiée le 20/09/2026)',
    attendu: 8,
    source: 'diagnostic réel du 20/09/2026 : rest.isric.org répond HTTP 200 — le facteur Lithologie/sol redevient actif',
    executer: () => FACTEURS_ACTIFS_PAR_DEFAUT.length,
  },

  // ── Renormalisation : les deux propriétés qui la rendent honnête ──
  {
    libelle: 'Renormalisation après panne : la somme des poids vaut EXACTEMENT 1',
    attendu: true, source: 'propriété de la renormalisation (§3.4)',
    executer: () => {
      const poids = poidsFinauxPourActifs(etatVide, actifsDisponibles(etatVide, PANNE_OVERPASS));
      const somme = Object.values(poids).reduce((a, b) => a + b, 0);
      return Math.abs(somme - 1) < 1e-12;
    },
  },
  {
    libelle: 'Renormalisation après panne : les RAPPORTS entre facteurs conservés sont inchangés',
    attendu: true,
    source: 'propriété caractéristique d’une renormalisation PROPORTIONNELLE — la panne ne doit pas réordonner les critères',
    executer: () => {
      const complet = poidsFinaux(etatVide);
      const reduit = poidsFinauxPourActifs(etatVide, actifsDisponibles(etatVide, PANNE_OVERPASS));
      const rapportAvant = complet.pente / complet.twi;
      const rapportApres = reduit.pente / reduit.twi;
      return Math.abs(rapportAvant - rapportApres) < 1e-12;
    },
  },
  {
    libelle: 'Renormalisation après panne : un facteur écarté pèse EXACTEMENT 0 (convention de renormaliserPoids)',
    attendu: true,
    source: 'ahp.renormaliserPoids conserve la clé au poids 0 ; favorabilite.js ignore tout facteur de poids nul',
    executer: () => {
      const reduit = poidsFinauxPourActifs(etatVide, actifsDisponibles(etatVide, PANNE_OVERPASS));
      return reduit.densiteDrainage === 0 && reduit.distanceCoursEau === 0 && reduit.densiteLineaments === 0;
    },
  },
  {
    libelle: 'Renormalisation après panne : chaque facteur CONSERVÉ voit son poids augmenter (la part des écartés est redistribuée)',
    attendu: true, source: 'conséquence arithmétique de la redistribution',
    executer: () => {
      const complet = poidsFinaux(etatVide);
      const restants = actifsDisponibles(etatVide, PANNE_OVERPASS);
      const reduit = poidsFinauxPourActifs(etatVide, restants);
      return restants.every((id) => reduit[id] > complet[id]);
    },
  },
  {
    libelle: 'Toutes les sources en panne : aucun poids calculable ⇒ null, jamais un résultat inventé',
    attendu: null, source: '§5 — refuser plutôt que produire une carte sans fondement',
    executer: () => poidsFinauxPourActifs(etatVide, []),
  },
];

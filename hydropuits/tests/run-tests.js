/**
 * run-tests.js — lanceur de tests maison de HydroPuits.
 * -----------------------------------------------------------------------
 * POURQUOI PAS JEST : le cahier des charges (§7) impose le même runner
 * qu'HydroCrue — aucune dépendance de test, aucun framework. Le logiciel
 * est distribué en poste isolé ; `npm install` doit rester minimal et
 * reproductible, et les tests doivent pouvoir tourner sur un simple Node
 * sans rien télécharger.
 *
 * Format de sortie imposé, identique à HydroCrue :
 *     Test | attendu | obtenu | écart | % écart | PASS/FAIL
 * Code de sortie non nul si au moins un test échoue.
 *
 * Chaque fichier tests/unit-*.test.js exporte un tableau de cas et est
 * enregistré dans SUITES ci-dessous. Un test est soit NUMÉRIQUE (comparé
 * avec une tolérance en %, pour les calculs flottants), soit EXACT (égalité
 * stricte, pour un booléen, un libellé, un refus attendu).
 *
 * Exécution :  npm test   (ou : node tests/run-tests.js)
 * -----------------------------------------------------------------------
 */
import { casI18n } from './unit-i18n.test.js';
import { casGeodesie } from './unit-geodesie.test.js';
import { casPolygone } from './unit-polygone.test.js';
import { casImportTerrain } from './unit-import-terrain.test.js';

// Tolérance par défaut sur les comparaisons numériques, en pourcentage.
// Valeur reprise d'HydroCrue (tests/run-tests.js) : couvre les écarts
// d'arrondi d'affichage sans laisser passer une erreur de formule.
const TOLERANCE_DEFAUT_POURCENT = 0.5;

// Ordre d'exécution des suites. Chaque étape du plan de construction
// ajoute la sienne ici.
const SUITES = [
  ['i18n — dictionnaire 4 langues', casI18n],
  ['Géodésie — ellipsoïde WGS84 (Karney)', casGeodesie],
  ['Polygone — validation et normalisation', casPolygone],
  ['Import — fichier de sommets', casImportTerrain],
];

let total = 0;
let reussis = 0;
const lignes = [];

/** Compare deux nombres avec une tolérance relative. */
function comparerNombre(libelle, attendu, obtenu, source, tolerancePourcent) {
  total++;
  const tol = tolerancePourcent ?? TOLERANCE_DEFAUT_POURCENT;
  const ecart = obtenu - attendu;
  const ecartPourcent = attendu !== 0
    ? Math.abs((ecart / attendu) * 100)
    : (Math.abs(ecart) < 1e-12 ? 0 : Infinity);
  const pass = Number.isFinite(obtenu) && ecartPourcent <= tol;
  if (pass) reussis++;
  lignes.push({ test: libelle, attendu, obtenu, ecart, ecartPourcent, source, statut: pass ? 'PASS' : 'FAIL' });
}

/** Compare deux valeurs non numériques (booléen, chaîne, refus attendu). */
function comparerExact(libelle, attendu, obtenu, source) {
  total++;
  const pass = Object.is(attendu, obtenu);
  if (pass) reussis++;
  lignes.push({ test: libelle, attendu, obtenu, ecart: pass ? 0 : '—', ecartPourcent: pass ? 0 : Infinity, source, statut: pass ? 'PASS' : 'FAIL' });
}

for (const [nomSuite, cas] of SUITES) {
  console.log(`\n--- ${nomSuite} ---`);
  for (const c of cas) {
    try {
      const obtenu = c.executer();
      if (typeof c.attendu === 'number' && typeof obtenu === 'number') {
        comparerNombre(c.libelle, c.attendu, obtenu, c.source, c.tolerancePourcent);
      } else {
        comparerExact(c.libelle, c.attendu, obtenu, c.source);
      }
    } catch (e) {
      total++;
      lignes.push({ test: c.libelle, statut: 'FAIL', erreur: e.message, source: c.source });
    }
  }
}

// --- Rapport ---
console.log('\n=== HydroPuits — résultats des tests ===\n');
const largeurTest = Math.max(...lignes.map(l => l.test.length), 30);
const fmt = v => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : String(v));

console.log(
  'Test'.padEnd(largeurTest) + '  Attendu'.padEnd(20) + 'Obtenu'.padEnd(20) +
  'Écart'.padEnd(14) + '% écart'.padEnd(12) + 'Statut'
);
console.log('-'.repeat(largeurTest + 20 + 20 + 14 + 12 + 8));

for (const l of lignes) {
  if (l.erreur) {
    console.log(l.test.padEnd(largeurTest) + `  ERREUR : ${l.erreur}`);
    continue;
  }
  const pct = Number.isFinite(l.ecartPourcent) ? l.ecartPourcent.toFixed(3) + ' %' : '—';
  console.log(
    l.test.padEnd(largeurTest) +
    fmt(l.attendu).padEnd(20) +
    fmt(l.obtenu).padEnd(20) +
    fmt(l.ecart).padEnd(14) +
    pct.padEnd(12) +
    l.statut +
    (l.source ? `   (${l.source})` : '')
  );
}

console.log(`\n${reussis} / ${total} tests réussis (tolérance numérique par défaut : ${TOLERANCE_DEFAUT_POURCENT} %).\n`);

if (reussis < total) {
  console.error('❌ Au moins un test a échoué — voir le détail ci-dessus avant de considérer le logiciel validé.');
  process.exit(1);
} else {
  console.log('✅ Tous les tests passent.');
}

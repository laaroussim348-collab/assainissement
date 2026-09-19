/**
 * unit-import-terrain.test.js — lecture d'un fichier de sommets.
 * -----------------------------------------------------------------------
 * Couvre ce que le cahier des charges §7 exige du parsing : « virgule
 * décimale, sexagésimal, ligne d'en-tête, ligne fautive » — plus le
 * regroupement de plusieurs terrains dans un même fichier (§3.2, mode 2)
 * et les pièges des exports de tableurs réels (BOM, point-virgule,
 * guillemets, espace insécable comme séparateur de milliers).
 *
 * Le cas le plus délicat, et celui qui a justement révélé un défaut à
 * l'écriture : « 234 567,89 ». Un relevé UTM en mètres s'écrit ainsi, et
 * une première version le lisait comme du sexagésimal (234° 567'), donc
 * le refusait. La règle retenue — un groupe de milliers fait exactement
 * 3 chiffres, des minutes en font 1 ou 2 — est vérifiée dans les deux
 * sens ci-dessous.
 * -----------------------------------------------------------------------
 */
import {
  analyserNombre, decouperLigneCsv, estLigneEnTete, analyserLignes, lireCsv, lireXlsx,
} from '../src/services/importTerrain.js';

const CSV_SIMPLE = [
  'Nom;X;Y',
  'Parcelle A;-8.000000;31.600000',
  'Parcelle A;-7.996000;31.600000',
  'Parcelle A;-7.996000;31.603000',
  'Parcelle A;-8.000000;31.603000',
].join('\n');

const CSV_DEUX_TERRAINS = [
  'Parcelle A;-8,000000;31,600000',
  'Parcelle A;-7,996000;31,600000',
  'Parcelle A;-7,996000;31,603000',
  'Parcelle B;-7,500000;31,200000',
  'Parcelle B;-7,490000;31,200000',
  'Parcelle B;-7,490000;31,210000',
].join('\n');

const CSV_LIGNE_FAUTIVE = [
  'Nom;X;Y',
  'Parcelle A;-8.000000;31.600000',
  'Parcelle A;;31.600000',          // coordonnée manquante
  'Parcelle A;-7.996000;31.603000',
  'total des surfaces',              // ligne parasite de bas de tableau
  'Parcelle A;-8.000000;31.603000',
].join('\n');

export const casImportTerrain = [
  // ── Nombres décimaux ──
  { libelle: 'Nombre : point décimal', attendu: -7.9811, tolerancePourcent: 1e-12,
    source: '§7', executer: () => analyserNombre('-7.9811') },
  { libelle: 'Nombre : virgule décimale', attendu: -7.9811, tolerancePourcent: 1e-12,
    source: '§7 (« virgule décimale »)', executer: () => analyserNombre('-7,9811') },
  { libelle: 'Nombre : déjà numérique', attendu: 31.6, tolerancePourcent: 1e-12,
    source: 'cellule xlsx typée', executer: () => analyserNombre(31.6) },
  { libelle: 'Nombre : signe + explicite', attendu: 31.6, tolerancePourcent: 1e-12,
    source: 'unité', executer: () => analyserNombre('+31,6') },
  { libelle: 'Nombre : espaces autour', attendu: 31.6, tolerancePourcent: 1e-12,
    source: 'unité', executer: () => analyserNombre('  31.6  ') },

  // ── Séparateurs de milliers (coordonnées projetées en mètres) ──
  { libelle: 'Milliers : espace « 234 567,89 »', attendu: 234567.89, tolerancePourcent: 1e-12,
    source: 'relevé UTM en mètres', executer: () => analyserNombre('234 567,89') },
  { libelle: 'Milliers : espace insécable', attendu: 234567.89, tolerancePourcent: 1e-12,
    source: 'export Excel français', executer: () => analyserNombre('234 567,89') },
  { libelle: 'Milliers : apostrophe (suisse)', attendu: 1234567.5, tolerancePourcent: 1e-12,
    source: 'unité', executer: () => analyserNombre("1'234'567.5") },
  { libelle: 'Milliers : virgule + point décimal', attendu: 1234567.89, tolerancePourcent: 1e-12,
    source: 'export anglophone', executer: () => analyserNombre('1,234,567.89') },
  { libelle: 'Milliers : point + virgule décimale', attendu: 1234567.89, tolerancePourcent: 1e-12,
    source: 'export français', executer: () => analyserNombre('1.234.567,89') },

  // ── Sexagésimal ──
  { libelle: 'Sexagésimal : 33°58\'17.8"N', attendu: 33 + 58 / 60 + 17.8 / 3600, tolerancePourcent: 1e-12,
    source: '§7 (« sexagésimal »)', executer: () => analyserNombre('33°58\'17.8"N') },
  { libelle: 'Sexagésimal : hémisphère S → négatif', attendu: -(33 + 58 / 60 + 17.8 / 3600), tolerancePourcent: 1e-12,
    source: '§7', executer: () => analyserNombre('33°58\'17.8"S') },
  { libelle: 'Sexagésimal : hémisphère W → négatif', attendu: -(7 + 58 / 60 + 51 / 3600), tolerancePourcent: 1e-12,
    source: '§7', executer: () => analyserNombre('7°58\'51"W') },
  { libelle: 'Sexagésimal : hémisphère O (Ouest) → négatif', attendu: -(7 + 58 / 60), tolerancePourcent: 1e-12,
    source: 'notation française', executer: () => analyserNombre("7°58'O") },
  { libelle: 'Sexagésimal : espaces et virgule décimale', attendu: 33 + 58 / 60 + 17.8 / 3600, tolerancePourcent: 1e-12,
    source: '§7', executer: () => analyserNombre('33° 58\' 17,8" N') },
  { libelle: 'Sexagésimal : sans symboles « 33 58 17.8 N »', attendu: 33 + 58 / 60 + 17.8 / 3600, tolerancePourcent: 1e-12,
    source: '§7', executer: () => analyserNombre('33 58 17.8 N') },
  { libelle: 'Sexagésimal : degrés-minutes décimales', attendu: 33 + 58.2967 / 60, tolerancePourcent: 1e-10,
    source: 'sortie de GPS de randonnée', executer: () => analyserNombre("33°58.2967'N") },
  { libelle: 'Sexagésimal : hémisphère en tête', attendu: 33 + 58 / 60, tolerancePourcent: 1e-12,
    source: 'unité', executer: () => analyserNombre("N33°58'") },
  { libelle: 'Sexagésimal : refus si minutes >= 60', attendu: null,
    source: 'relevé incohérent — refus plutôt qu’acceptation silencieuse',
    executer: () => analyserNombre("33°78'12\"N") },
  { libelle: 'Sexagésimal : refus si secondes >= 60', attendu: null,
    source: 'relevé incohérent', executer: () => analyserNombre("33°58'75\"N") },

  // ── Refus ──
  { libelle: 'Refus : cellule vide', attendu: null, source: 'unité', executer: () => analyserNombre('') },
  { libelle: 'Refus : null', attendu: null, source: 'unité', executer: () => analyserNombre(null) },
  { libelle: 'Refus : texte', attendu: null, source: 'unité', executer: () => analyserNombre('sans objet') },
  { libelle: 'Refus : nombre mêlé de texte', attendu: null, source: 'unité', executer: () => analyserNombre('12 m environ') },

  // ── Découpage CSV ──
  { libelle: 'CSV : séparateur point-virgule', attendu: 'A|1|2',
    source: 'export Excel français', executer: () => decouperLigneCsv('A;1;2').join('|') },
  { libelle: 'CSV : séparateur tabulation', attendu: 'A|1|2',
    source: 'copier-coller depuis un tableur', executer: () => decouperLigneCsv('A\t1\t2').join('|') },
  { libelle: 'CSV : séparateur virgule', attendu: 'A|1|2',
    source: 'export anglophone', executer: () => decouperLigneCsv('A,1,2').join('|') },
  { libelle: 'CSV : champs entre guillemets', attendu: 'Parcelle; A|1|2',
    source: 'nom contenant le séparateur', executer: () => decouperLigneCsv('"Parcelle; A";1;2').join('|') },
  { libelle: 'CSV : guillemet échappé', attendu: 'Dit "A"|1|2',
    source: 'convention CSV', executer: () => decouperLigneCsv('"Dit ""A""";1;2').join('|') },

  // ── En-tête ──
  { libelle: 'En-tête détecté sur colonnes non numériques', attendu: true,
    source: '§2.3 (« ligne d’en-tête détectée »)', executer: () => estLigneEnTete(['Nom', 'X', 'Y']) },
  { libelle: 'En-tête : ligne de données non confondue', attendu: false,
    source: '§2.3', executer: () => estLigneEnTete(['Parcelle A', '-8.0', '31.6']) },
  { libelle: 'En-tête ignoré à l’import', attendu: true,
    source: '§2.3', executer: () => lireCsv(CSV_SIMPLE).enTeteIgnoree },
  { libelle: 'En-tête : 4 sommets lus, pas 5', attendu: 4,
    source: '§2.3', executer: () => lireCsv(CSV_SIMPLE).terrains[0].sommets.length },

  // ── Terrains ──
  { libelle: 'Un seul terrain nommé', attendu: 'Parcelle A',
    source: '§3.2 mode 2', executer: () => lireCsv(CSV_SIMPLE).terrains[0].nom },
  { libelle: 'Deux terrains séparés par la colonne A', attendu: 2,
    source: '§3.2 (« plusieurs terrains dans le même fichier »)',
    executer: () => lireCsv(CSV_DEUX_TERRAINS).terrains.length },
  { libelle: 'Deuxième terrain : 3 sommets', attendu: 3,
    source: '§3.2', executer: () => lireCsv(CSV_DEUX_TERRAINS).terrains[1].sommets.length },
  { libelle: 'Coordonnées rendues telles quelles (x, y)', attendu: '-8|31.6',
    source: 'la conversion de système est faite par l’appelant',
    executer: () => { const s = lireCsv(CSV_SIMPLE).terrains[0].sommets[0]; return `${s.x}|${s.y}`; } },
  { libelle: 'Nom vide : continue le terrain précédent', attendu: 3,
    source: 'fichiers ne répétant le nom qu’une fois',
    executer: () => analyserLignes([['P1', '1', '1'], ['', '2', '2'], ['', '3', '3']]).terrains[0].sommets.length },

  // ── Lignes fautives : signalées, sans interrompre ──
  { libelle: 'Ligne fautive : import poursuivi', attendu: 3,
    source: '§2.3 (« ligne fautive signalée sans interrompre l’import »)',
    executer: () => lireCsv(CSV_LIGNE_FAUTIVE).terrains[0].sommets.length },
  { libelle: 'Ligne fautive : 2 anomalies signalées', attendu: 2,
    source: '§2.3', executer: () => lireCsv(CSV_LIGNE_FAUTIVE).anomalies.length },
  { libelle: 'Ligne fautive : numéro de ligne exact', attendu: 3,
    source: '§2.3 — l’utilisateur doit pouvoir la retrouver dans son fichier',
    executer: () => lireCsv(CSV_LIGNE_FAUTIVE).anomalies[0].ligne },
  { libelle: 'Ligne fautive : clé d’anomalie coordonnée illisible', attendu: 'impErrCoordonneeIllisible',
    source: '§2.3', executer: () => lireCsv(CSV_LIGNE_FAUTIVE).anomalies[0].cle },
  { libelle: 'Ligne parasite : clé colonnes manquantes', attendu: 'impErrColonnesManquantes',
    source: 'ligne « total des surfaces » en bas de tableau',
    executer: () => lireCsv(CSV_LIGNE_FAUTIVE).anomalies[1].cle },
  { libelle: 'Lignes vides ignorées sans anomalie', attendu: 0,
    source: 'fin de fichier',
    executer: () => lireCsv('P;1;1\nP;2;2\nP;3;3\n\n\n').anomalies.length },

  // ── Pièges des exports réels ──
  { libelle: 'BOM UTF-8 d’Excel retiré', attendu: 'Parcelle A',
    source: 'export CSV d’Excel',
    executer: () => lireCsv('﻿Parcelle A;-8.0;31.6\nParcelle A;-7.9;31.6\nParcelle A;-7.9;31.7').terrains[0].nom },
  { libelle: 'Fins de ligne Windows (CRLF)', attendu: 3,
    source: 'fichier produit sous Windows',
    executer: () => lireCsv('P;1;1\r\nP;2;2\r\nP;3;3').terrains[0].sommets.length },
  { libelle: 'Virgule décimale + séparateur point-virgule', attendu: -8,
    tolerancePourcent: 1e-12, source: 'export Excel français',
    executer: () => lireCsv(CSV_DEUX_TERRAINS).terrains[0].sommets[0].x },

  // ── XLSX : refus explicite tant que miniXlsx.js n’est pas fourni ──
  { libelle: 'XLSX : échec explicite, pas de repli silencieux', attendu: 'XLSX_NON_DISPONIBLE',
    source: '§2.3 et §5 — miniXlsx.js pas encore fourni',
    executer: () => { try { lireXlsx(); return 'aucune erreur'; } catch (e) { return e.message; } } },
];

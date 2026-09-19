// ============================================================
//  importTerrain.js — Lecture d'un fichier de sommets de terrain.
//  ─────────────────────────────────────────────────────────────
//  FORMAT ATTENDU (cahier des charges §3.2, mode 2) :
//    colonne A = nom du terrain, colonne B = x, colonne C = y,
//    une ligne par sommet, dans l'ordre du contour.
//    Plusieurs terrains peuvent cohabiter dans le même fichier, séparés
//    par le nom en colonne A.
//
//  PRINCIPE DIRECTEUR : une ligne fautive est SIGNALÉE, elle
//  n'interrompt pas l'import. C'est la règle de miniXlsx/importPoints
//  dans HydroCrue, et elle compte : un fichier de relevé de terrain
//  contient presque toujours une ligne de commentaire, un total en bas,
//  une cellule vide. Refuser tout le fichier pour une ligne obligerait
//  l'utilisateur à nettoyer son classeur à l'aveugle.
//
//  ⚠️ ÉTAT : ce module lit le CSV (et le texte collé). La lecture du
//  .xlsx passera par miniXlsx.js de HydroCrue, qui n'a pas encore été
//  fourni — voir lireXlsx() plus bas. La séparation est faite pour que
//  le branchement soit un simple remplacement de la fonction de
//  décodage : tout ce qui suit (analyse des nombres, détection de
//  l'en-tête, regroupement par terrain) est COMMUN aux deux formats et
//  déjà écrit.
//
//  CE MODULE EST PUR : aucun accès réseau, aucun accès disque. Il reçoit
//  du texte (ou, à terme, un ArrayBuffer) et rend une structure.
//  Couvert par tests/unit-import-terrain.test.js.
// ============================================================

/**
 * Analyse un nombre écrit « à la française », « à l'anglaise » ou en
 * sexagésimal, tel qu'on le trouve dans un relevé de terrain réel.
 *
 * Formats acceptés :
 *   - décimal point ou virgule      : -7.9811   /   -7,9811
 *   - séparateurs de milliers       : 1 234,56  /  1'234.56  /  1 234,56
 *   - sexagésimal avec hémisphère   : 33°58'17.8"N  /  33° 58' 17,8" N
 *   - sexagésimal sans symboles     : 33 58 17.8 N
 *   - degrés-minutes décimales      : 33°58.297'N
 *   - hémisphère avant ou après     : N33°58'17.8"  /  33°58'17.8"N
 *
 * L'hémisphère S ou W (ou O, pour « Ouest ») rend la valeur négative.
 *
 * @returns {number|null} la valeur en degrés décimaux, ou null si le
 *   texte n'est pas interprétable — l'appelant signale alors la ligne.
 */
export function analyserNombre(texte) {
  if (texte === null || texte === undefined) return null;
  if (typeof texte === 'number') return Number.isFinite(texte) ? texte : null;

  let s = String(texte).trim();
  if (s === '') return null;

  // Hémisphère : lettre isolée en tête ou en queue. On la retire avant
  // toute autre analyse, et on retient le signe qu'elle impose.
  let signeHemisphere = 1;
  const hemi = /(^[NSEWO])|([NSEWO]$)/i.exec(s.replace(/[\s.]*$/, ''));
  if (hemi) {
    const lettre = (hemi[1] || hemi[2]).toUpperCase();
    if (lettre === 'S' || lettre === 'W' || lettre === 'O') signeHemisphere = -1;
    s = s.replace(/^[NSEWO]\s*/i, '').replace(/\s*[NSEWO]\s*$/i, '').trim();
  }

  // Signe explicite (peut coexister avec un hémisphère : on multiplie).
  let signe = 1;
  if (s.startsWith('-')) { signe = -1; s = s.slice(1).trim(); }
  else if (s.startsWith('+')) { s = s.slice(1).trim(); }

  // Sexagésimal ou décimal à séparateurs de milliers ? Les deux s'écrivent
  // avec des groupes de chiffres séparés par des espaces, et il faut
  // trancher :
  //   « 33 58 17.8 »   → 33°58'17,8"  (sexagésimal)
  //   « 234 567,89 »   → 234567,89    (coordonnée UTM en mètres)
  // Critère : un groupe de milliers fait EXACTEMENT 3 chiffres entiers,
  // alors que des minutes ou des secondes en font 1 ou 2 (elles sont
  // inférieures à 60).
  //
  // La présence d'un symbole ne suffit PAS à trancher, contrairement à ce
  // qu'on croit d'abord : l'apostrophe est le symbole des minutes ET le
  // séparateur de milliers de la notation suisse. « 1'234'567.5 » est un
  // nombre, pas 1° 234' 567,5". Le critère des 3 chiffres s'applique donc
  // dans tous les cas ; il ne peut pas rejeter du sexagésimal légitime,
  // puisque des minutes et des secondes valides n'ont jamais 3 chiffres.
  const aSymbolesDMS = /[°'′"″]/.test(s);
  const groupes = s.split(/[°'′"″\s]+/).map(g => g.trim()).filter(g => g !== '');
  const tousNumeriques = groupes.length > 0 && groupes.every(g => /^\d+([.,]\d+)?$/.test(g));
  const suiteCompatibleDMS = groupes.slice(1).every(g => /^\d{1,2}([.,]\d+)?$/.test(g));

  if (tousNumeriques && groupes.length <= 3 && suiteCompatibleDMS
    && (aSymbolesDMS || groupes.length >= 2)) {
    const [d, m = '0', sec = '0'] = groupes;
    const deg = parseFloat(d.replace(',', '.'));
    const min = parseFloat(m.replace(',', '.'));
    const secondes = parseFloat(sec.replace(',', '.'));
    if (![deg, min, secondes].every(Number.isFinite)) return null;
    // Minutes et secondes hors de [0,60) : le relevé est incohérent, on
    // refuse plutôt que d'accepter une valeur qui « marche » quand même.
    if (min >= 60 || secondes >= 60) return null;
    return signe * signeHemisphere * (deg + min / 60 + secondes / 3600);
  }

  // Décimal. Il reste à décider si la virgule est un séparateur décimal
  // ou de milliers. Règle : si le texte contient à la fois des points et
  // des virgules, le DERNIER des deux est le séparateur décimal (c'est
  // la convention de tous les tableurs). Sinon, un séparateur unique
  // suivi d'exactement 3 chiffres et précédé d'au moins un chiffre est
  // ambigu — on le traite comme décimal, car une coordonnée
  // géographique n'atteint jamais le millier.
  let nettoye = s.replace(/[  \s'’]/g, ''); // espaces (y compris insécables) et apostrophes de milliers
  const dernierPoint = nettoye.lastIndexOf('.');
  const derniereVirgule = nettoye.lastIndexOf(',');
  if (dernierPoint >= 0 && derniereVirgule >= 0) {
    if (derniereVirgule > dernierPoint) {
      nettoye = nettoye.replace(/\./g, '').replace(',', '.');
    } else {
      nettoye = nettoye.replace(/,/g, '');
    }
  } else if (derniereVirgule >= 0) {
    nettoye = nettoye.replace(',', '.');
  }

  if (!/^\d*\.?\d+([eE][+-]?\d+)?$/.test(nettoye)) return null;
  const v = parseFloat(nettoye);
  return Number.isFinite(v) ? signe * signeHemisphere * v : null;
}

/**
 * Découpe une ligne CSV en cellules. Gère le séparateur point-virgule
 * (export français d'Excel), la virgule, la tabulation, et les champs
 * entre guillemets.
 *
 * Le séparateur est déterminé sur la LIGNE ENTIÈRE, pas globalement :
 * un fichier peut mêler les deux si on l'a édité à la main. La virgule
 * n'est retenue comme séparateur que si la ligne ne ressemble pas à des
 * décimales à la française (heuristique : au moins 3 champs obtenus).
 */
export function decouperLigneCsv(ligne) {
  const candidats = ['\t', ';', ','];
  let meilleur = '\t';
  let meilleurNb = 0;
  for (const sep of candidats) {
    const nb = decouperAvec(ligne, sep).length;
    if (nb > meilleurNb) { meilleurNb = nb; meilleur = sep; }
  }
  return decouperAvec(ligne, meilleur);
}

function decouperAvec(ligne, separateur) {
  const cellules = [];
  let courante = '';
  let entreGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      if (entreGuillemets && ligne[i + 1] === '"') { courante += '"'; i++; }
      else entreGuillemets = !entreGuillemets;
    } else if (c === separateur && !entreGuillemets) {
      cellules.push(courante.trim());
      courante = '';
    } else {
      courante += c;
    }
  }
  cellules.push(courante.trim());
  return cellules;
}

/**
 * Décide si une ligne est un en-tête plutôt qu'un sommet.
 *
 * Critère : ses colonnes B et C ne sont PAS analysables comme des
 * nombres, alors qu'elles devraient contenir des coordonnées. Pas de
 * liste de mots-clés (« lat », « x », « longitude »…) : elle serait
 * forcément incomplète, et dépendrait de la langue du fichier.
 */
export function estLigneEnTete(cellules) {
  if (cellules.length < 3) return false;
  return analyserNombre(cellules[1]) === null && analyserNombre(cellules[2]) === null;
}

/**
 * Transforme des lignes de cellules en terrains.
 *
 * C'est la partie COMMUNE au CSV et au futur .xlsx : quel que soit le
 * format d'origine, on arrive ici avec un tableau de tableaux de
 * chaînes, et on en ressort des terrains et une liste d'anomalies.
 *
 * @param {string[][]} lignes
 * @returns {{terrains: {nom:string, sommets:{x:number,y:number}[]}[],
 *            anomalies: {ligne:number, cle:string, params?:object}[],
 *            enTeteIgnoree: boolean}}
 *   Les coordonnées sont rendues telles qu'elles figurent au fichier
 *   (x, y), SANS interprétation : c'est l'appelant qui sait dans quel
 *   système elles sont exprimées et les convertit. Ce module ne suppose
 *   jamais que x est une longitude.
 */
export function analyserLignes(lignes) {
  const terrains = [];
  const anomalies = [];
  let enTeteIgnoree = false;
  let nomCourant = null;

  lignes.forEach((cellules, index) => {
    const numeroLigne = index + 1;

    // Ligne entièrement vide : sans intérêt et sans anomalie à signaler
    // (les fichiers en contiennent toujours, en fin de fichier notamment).
    if (cellules.every(c => String(c ?? '').trim() === '')) return;

    if (index === 0 && estLigneEnTete(cellules)) {
      enTeteIgnoree = true;
      return;
    }

    if (cellules.length < 3) {
      anomalies.push({ ligne: numeroLigne, cle: 'impErrColonnesManquantes', params: { trouvees: cellules.length } });
      return;
    }

    const nom = String(cellules[0] ?? '').trim();
    const x = analyserNombre(cellules[1]);
    const y = analyserNombre(cellules[2]);

    if (x === null || y === null) {
      anomalies.push({
        ligne: numeroLigne,
        cle: 'impErrCoordonneeIllisible',
        params: { x: String(cellules[1] ?? ''), y: String(cellules[2] ?? '') },
      });
      return;
    }

    // Un nom vide continue le terrain précédent : beaucoup de fichiers ne
    // répètent le nom que sur la première ligne de chaque terrain.
    if (nom !== '') nomCourant = nom;
    if (nomCourant === null) nomCourant = '';

    let terrain = terrains.find(t => t.nom === nomCourant);
    if (!terrain) {
      terrain = { nom: nomCourant, sommets: [] };
      terrains.push(terrain);
    }
    terrain.sommets.push({ x, y });
  });

  return { terrains, anomalies, enTeteIgnoree };
}

/**
 * Lit un fichier CSV (ou du texte collé) et en extrait les terrains.
 * @param {string} texte contenu du fichier
 */
export function lireCsv(texte) {
  if (typeof texte !== 'string') {
    return { terrains: [], anomalies: [{ ligne: 0, cle: 'impErrFichierIllisible' }], enTeteIgnoree: false };
  }
  // Retire le BOM UTF-8 qu'Excel place en tête de ses exports CSV : sans
  // cela, la première cellule de la première ligne commence par un
  // caractère invisible et le nom du terrain ne correspond plus.
  const propre = texte.replace(/^﻿/, '');
  const lignes = propre.split(/\r\n|\r|\n/).map(decouperLigneCsv);
  return analyserLignes(lignes);
}

/**
 * Lit un classeur .xlsx.
 *
 * ⚠️ NON IMPLÉMENTÉ : le cahier des charges (§2.3) impose de réutiliser
 * miniXlsx.js de HydroCrue (lecteur ZIP + DEFLATE écrit à la main) et
 * non d'ajouter une dépendance npm (§8) ni d'en réécrire un second, qui
 * divergerait du premier. Ce fichier n'a pas encore été fourni.
 *
 * Cette fonction échoue donc explicitement plutôt que de laisser croire
 * que le format est pris en charge — §5 : jamais de repli silencieux.
 * Le branchement se limitera à décoder le classeur en tableau de
 * cellules puis à appeler analyserLignes(), déjà écrite et testée.
 */
export function lireXlsx() {
  throw new Error('XLSX_NON_DISPONIBLE');
}

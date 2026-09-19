// ============================================================
//  hydrologieGrille.js — Remplissage des cuvettes, direction
//  d'écoulement, aire drainée et indice topographique d'humidité (TWI).
//  ─────────────────────────────────────────────────────────────
//  ALGORITHME CHOISI, EXPLICITEMENT (cahier des charges §4 : « TWI / aire
//  drainée : algorithme documenté — D8 ou D-infini au choix, mais dis
//  lequel — avec traitement des cuvettes ») :
//
//   - Remplissage des cuvettes : PLANCHON & DARBOUX (2001), « A fast,
//     simple and versatile algorithm to fill the depressions of digital
//     elevation models », Catena 46, 159-176 — relaxation itérative avec
//     incrément minimal epsilon, jusqu'à convergence.
//   - Direction d'écoulement et accumulation : D8 (plus forte pente parmi
//     les 8 voisins, O'Callaghan & Mark, 1984) — PAS D-infini (Tarboton,
//     1997). Choix assumé : D8 est plus simple à valider analytiquement
//     sur un MNT synthétique (§7), et suffisant à l'échelle d'une
//     parcelle (quelques dizaines à centaines de cellules) où les biais
//     directionnels de D8 (connus sur de grands bassins versants
//     allongés) ont un effet négligeable. À reconsidérer si une future
//     version travaille à l'échelle du bassin versant plutôt que de la
//     parcelle.
//   - TWI : TWI = ln(a / tanβ), a = aire drainée spécifique (aire
//     drainée ÷ largeur de cellule), tanβ = pente LOCALE de Horn (le
//     même module que pour le facteur « Pente », voir derivesMnt.js —
//     pas une seconde définition de pente rien que pour le TWI).
//
//  ⚠️ LE REMPLISSAGE NE TOUCHE QUE CE MODULE — jamais les altitudes
//  utilisées pour la pente et la courbure (derivesMnt.js), qui restent
//  celles interpolées du MNT BRUT. Une cuvette réelle du terrain est un
//  signal géomorphologique utile pour la courbure (concave ⇒ favorable,
//  §3.4) ; la remplir avant de calculer la courbure effacerait
//  précisément ce signal. Le remplissage n'existe que pour rendre le
//  ROUTAGE D8 possible (un vrai creux sans remplissage bloque tout
//  écoulement, ce qui n'a pas de sens hydrologique à l'échelle d'une
//  cellule de MNT).
//
//  CE MODULE EST PUR : opère sur la grille déjà construite (grilleMnt.js)
//  et sur la pente déjà calculée (derivesMnt.js), aucun accès réseau ni
//  disque.
// ============================================================

/**
 * Incrément minimal (mètres) entre une cellule et son point de
 * déversement après remplissage — garantit une pente strictement non
 * nulle partout, indispensable pour que la direction D8 soit toujours
 * définie de façon unique (un remplissage « à plat », epsilon=0,
 * laisserait des zones sans direction d'écoulement déterminable).
 *
 * ORIGINE : choix par défaut, ajustable — pratique courante dans la
 * littérature du remplissage de cuvettes (SAGA, GRASS r.fill.dir),
 * généralement un incrément très inférieur à la résolution verticale
 * réelle du MNT pour ne visiblement rien déformer. 1 mm est très en
 * dessous de la précision verticale d'un MNT satellitaire (de l'ordre du
 * mètre), donc sans effet perceptible sur les altitudes affichées.
 */
export const EPSILON_REMPLISSAGE_M = 0.001;

/**
 * Nombre maximal de passages de relaxation avant d'abandonner.
 * ORIGINE : choix par défaut — un passage complet de la grille par sens
 * suffit presque toujours à faire converger une cuvette réaliste en
 * quelques passages (la relaxation de Planchon-Darboux converge en au
 * plus O(nbCellules) passages dans le pire cas théorique ; ce plafond,
 * grand devant la taille des grilles visées ici (quelques milliers de
 * cellules au plus, §4 MAX_POINTS_GRILLE), sert de garde-fou contre une
 * boucle infinie en cas d'erreur de programmation, pas une limite
 * normalement atteinte.
 */
export const MAX_PASSAGES_REMPLISSAGE = 500;

const VOISINS_8 = [
  { di: -1, dj: -1 }, { di: -1, dj: 0 }, { di: -1, dj: 1 },
  { di: 0, dj: -1 }, /* centre */        { di: 0, dj: 1 },
  { di: 1, dj: -1 }, { di: 1, dj: 0 }, { di: 1, dj: 1 },
];

/**
 * Remplit les cuvettes fermées (Planchon & Darboux, 2001).
 *
 * Les cellules de BORD de grille et celles adjacentes à un trou (NaN)
 * sont traitées comme des points de sortie possibles (leur altitude de
 * remplissage = leur altitude brute) : on ne force jamais l'eau à
 * s'accumuler contre une limite de données dont on ignore ce qu'il y a
 * au-delà.
 *
 * @returns {Float64Array} altitudes remplies (NaN préservé où le MNT
 *   d'origine est un trou)
 * @throws {Error} si la relaxation ne converge pas sous
 *   MAX_PASSAGES_REMPLISSAGE (§4 : « échouent bruyamment »)
 */
export function remplirCuvettes(grille, epsilon = EPSILON_REMPLISSAGE_M) {
  const { nbLignes, nbColonnes, altitudes } = grille;
  const n = nbLignes * nbColonnes;
  const W = new Float64Array(n);
  const estBord = new Uint8Array(n);

  for (let i = 0; i < nbLignes; i++) {
    for (let j = 0; j < nbColonnes; j++) {
      const idx = i * nbColonnes + j;
      const z = altitudes[idx];
      if (!Number.isFinite(z)) { W[idx] = NaN; continue; }
      let bord = i === 0 || i === nbLignes - 1 || j === 0 || j === nbColonnes - 1;
      if (!bord) {
        for (const { di, dj } of VOISINS_8) {
          if (!Number.isFinite(altitudes[(i + di) * nbColonnes + (j + dj)])) { bord = true; break; }
        }
      }
      estBord[idx] = bord ? 1 : 0;
      W[idx] = bord ? z : Infinity;
    }
  }

  let passage = 0;
  let changement = true;
  while (changement && passage < MAX_PASSAGES_REMPLISSAGE) {
    changement = false;
    // Balayage alterné (aller / retour) : converge en bien moins de
    // passages qu'un balayage à sens unique (Planchon & Darboux, 2001,
    // §3 — optimisation de convergence, la correction elle-même ne
    // dépend pas de l'ordre de balayage).
    const ordreDirect = passage % 2 === 0;
    for (let ii = 0; ii < nbLignes; ii++) {
      const i = ordreDirect ? ii : nbLignes - 1 - ii;
      for (let jj = 0; jj < nbColonnes; jj++) {
        const j = ordreDirect ? jj : nbColonnes - 1 - jj;
        const idx = i * nbColonnes + j;
        if (estBord[idx] || Number.isNaN(W[idx])) continue;
        if (W[idx] <= altitudes[idx]) continue; // déjà résolue à son altitude naturelle
        const z = altitudes[idx];
        let meilleur = W[idx];
        for (const { di, dj } of VOISINS_8) {
          const widx = (i + di) * nbColonnes + (j + dj);
          const wv = W[widx];
          if (Number.isNaN(wv)) continue; // voisin = trou du MNT : ignoré, pas un point de déversement
          if (z >= wv + epsilon) { meilleur = z; break; } // s'écoule naturellement vers ce voisin
          if (wv + epsilon < meilleur) meilleur = wv + epsilon;
        }
        if (meilleur < W[idx]) { W[idx] = meilleur; changement = true; }
      }
    }
    passage++;
  }

  if (changement) {
    throw new Error(
      `remplirCuvettes : la relaxation n'a pas convergé en ${MAX_PASSAGES_REMPLISSAGE} passages — `
      + 'grille anormalement grande ou pathologique. Aucun résultat de remplissage n\'est renvoyé.'
    );
  }
  return W;
}

/**
 * Direction d'écoulement D8 : pour chaque cellule, l'indice linéaire du
 * voisin de plus forte pente descendante (distance orthogonale =
 * cellsize, diagonale = cellsize·√2). `-1` = pas de direction (cellule de
 * bord, trou, ou — ne devrait pas arriver après remplissage réussi —
 * minimum local résiduel).
 *
 * @param {Float64Array} altitudesRemplies  sortie de remplirCuvettes()
 * @returns {Int32Array}
 */
export function calculerDirectionsD8(grille, altitudesRemplies) {
  const { nbLignes, nbColonnes, cellsize_m } = grille;
  const directions = new Int32Array(nbLignes * nbColonnes).fill(-1);
  const distDiag = cellsize_m * Math.SQRT2;

  for (let i = 0; i < nbLignes; i++) {
    for (let j = 0; j < nbColonnes; j++) {
      const idx = i * nbColonnes + j;
      const z = altitudesRemplies[idx];
      if (!Number.isFinite(z)) continue;
      let meilleurePente = 0; // strictement positive requise : pas de direction "vers le haut ou plat"
      let meilleurIdx = -1;
      for (const { di, dj } of VOISINS_8) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || ni >= nbLignes || nj < 0 || nj >= nbColonnes) continue;
        const vidx = ni * nbColonnes + nj;
        const zv = altitudesRemplies[vidx];
        if (!Number.isFinite(zv)) continue;
        const dist = (di !== 0 && dj !== 0) ? distDiag : cellsize_m;
        const pente = (z - zv) / dist;
        if (pente > meilleurePente) { meilleurePente = pente; meilleurIdx = vidx; }
      }
      directions[idx] = meilleurIdx;
    }
  }
  return directions;
}

/**
 * Accumulation D8 : nombre de cellules amont (soi-même incluse) qui
 * drainent vers chaque cellule. Traite les cellules par altitude
 * DÉCROISSANTE (après remplissage, l'écoulement va toujours vers une
 * altitude égale ou inférieure) : quand une cellule est traitée, toutes
 * ses contributrices amont ont déjà été comptées — un seul passage
 * suffit, pas de récursion.
 *
 * ⚠️ LIMITE ASSUMÉE, À DIRE DANS LE RAPPORT (étape 8/9) : la grille est
 * bornée à l'emprise du terrain (+ une marge), pas au bassin versant
 * entier — l'aire drainée calculée ici est donc une SOUS-ESTIMATION de
 * l'aire drainée réelle pour toute cellule dont une partie du bassin
 * amont se trouve hors de la grille. C'est inhérent à un calcul à
 * l'échelle de la parcelle plutôt qu'à l'échelle du bassin versant.
 *
 * @returns {Int32Array} nombre de cellules amont par cellule
 */
export function calculerAccumulation(grille, altitudesRemplies, directions) {
  const n = grille.nbLignes * grille.nbColonnes;
  const accumulation = new Int32Array(n);
  const indicesValides = [];
  for (let idx = 0; idx < n; idx++) {
    if (Number.isFinite(altitudesRemplies[idx])) { accumulation[idx] = 1; indicesValides.push(idx); }
  }
  indicesValides.sort((a, b) => altitudesRemplies[b] - altitudesRemplies[a]); // décroissant
  for (const idx of indicesValides) {
    const cible = directions[idx];
    if (cible >= 0) accumulation[cible] += accumulation[idx];
  }
  return accumulation;
}

/**
 * Pente minimale utilisée au dénominateur du TWI, pour éviter une
 * division par zéro (donc un TWI infini) sur les cellules parfaitement
 * plates.
 *
 * ORIGINE : choix par défaut, ajustable — pratique courante dans la
 * littérature du TWI (Quinn et al., 1991 ; Sørensen et al., 2006)
 * consistant à plafonner la pente locale à une valeur minimale non nulle
 * plutôt que d'exclure les cellules plates du calcul. tan(0,057°) ≈
 * 0,001 : négligeable devant toute pente réelle mesurable, juste assez
 * pour rester fini.
 */
export const PENTE_MINIMALE_TWI = 0.001;

/**
 * Indice topographique d'humidité : TWI = ln(a / tanβ).
 * @param {Int32Array} accumulation  sortie de calculerAccumulation()
 * @param {Float64Array} pente_ratio  tan(pente locale) — PAS pente_pourcent ;
 *   réutiliser calculerPente(...).pente_ratio de derivesMnt.js (même
 *   grille, mêmes cellules), pour que « aire drainée + pente » (§3.4)
 *   désigne la même pente partout dans le logiciel.
 */
export function calculerTWI(grille, accumulation, pente_ratio) {
  const n = grille.nbLignes * grille.nbColonnes;
  const twi = new Float64Array(n).fill(NaN);
  const aireCellule_m2 = grille.cellsize_m * grille.cellsize_m;
  for (let idx = 0; idx < n; idx++) {
    if (accumulation[idx] === 0) continue;
    const p = pente_ratio[idx];
    if (!Number.isFinite(p)) continue; // pente non définie ici (bord/trou) : TWI non plus (§4)
    const aireSpecifique = (accumulation[idx] * aireCellule_m2) / grille.cellsize_m;
    twi[idx] = Math.log(aireSpecifique / Math.max(p, PENTE_MINIMALE_TWI));
  }
  return twi;
}

/**
 * Orchestration complète : remplissage, direction, accumulation, TWI.
 * @param {Float64Array} pente_ratio  déjà calculée (derivesMnt.js)
 */
export function calculerHydrologie(grille, pente_ratio, options = {}) {
  const altitudesRemplies = remplirCuvettes(grille, options.epsilon);
  const directions = calculerDirectionsD8(grille, altitudesRemplies);
  const accumulation = calculerAccumulation(grille, altitudesRemplies, directions);
  const twi = calculerTWI(grille, accumulation, pente_ratio);
  const aireDrainage_m2 = Float64Array.from(accumulation, (v) => v * grille.cellsize_m * grille.cellsize_m);
  return { altitudesRemplies, directions, accumulation, aireDrainage_m2, twi };
}

// ============================================================
//  derivesMnt.js — Dérivées de surface du MNT : pente (Horn) et
//  courbure (Zevenbergen & Thorne), sur la grille de calcul métrique.
//  ─────────────────────────────────────────────────────────────
//  MÉTHODES, VÉRIFIÉES SUR LE WEB LE 19/09/2026 :
//   - Pente : Horn, B.K.P. (1981), « Hillshading and the reflectance
//     map », Proceedings of the IEEE 69(1), 14-47 — fenêtre glissante
//     3×3, poids (1,2,1) sur les colonnes/rangées orthogonales, poids
//     nul sur les diagonales pures. C'est la méthode EXPLICITEMENT
//     imposée par le cahier des charges §3.4/§4.
//   - Courbure : Zevenbergen, L.W. & Thorne, C.R. (1987), « Quantitative
//     analysis of land surface topography », Earth Surface Processes and
//     Landforms 12(1), 47-56 — ajustement d'une surface quadratique
//     (quartique en degré, quadratique en x/y) sur les 9 points de la
//     fenêtre, dont les coefficients D,E,F,G,H se lisent directement sur
//     les altitudes voisines (pas de système à résoudre).
//
//  ⚠️ CONVENTION DE SIGNE — LA PARTIE LA PLUS FACILE À INVERSER PAR
//  ERREUR : les formules publiées de Horn et de Zevenbergen-Thorne sont
//  presque toujours écrites pour une grille « image » où la ligne 0 est
//  au NORD et l'indice de ligne CROÎT VERS LE SUD (comme un raster lu de
//  haut en bas). La grille de calcul de ce logiciel (grilleMnt.js) fait
//  l'INVERSE : la ligne i=0 est au SUD (ymin) et i croît VERS LE NORD
//  (cohérent avec y = northing croissant, voir grilleLocale.js). Recopier
//  une formule publiée telle quelle inverserait le signe de dz/dy et de H
//  sans qu'aucun test sur un MNT PARFAITEMENT PLAT ne le révèle (un plat
//  a un gradient nul dans les deux cas). Les formules ci-dessous sont
//  donc RE-DÉRIVÉES directement en (i,j) avec i+1 = NORD, j+1 = EST — pas
//  transcrites depuis une source qui suppose l'indexation inverse — et
//  validées par un test sur un plan incliné à pentes est/nord DIFFÉRENTES
//  (voir tests/unit-derives-mnt.test.js), qui détecterait immédiatement
//  une inversion nord/sud ou est/ouest.
//
//  GESTION DES BORDS ET DES TROUS (§4 : « gestion explicite des bords et
//  des trous du MNT — pas de remplissage silencieux par 0 ») : toute
//  cellule dont le voisinage 3×3 complet n'est pas disponible (bord de
//  grille OU l'un des 9 points est NaN, un trou du MNT) renvoie `null`,
//  jamais une valeur calculée avec un voisin manquant traité comme 0.
//
//  CE MODULE EST PUR : opère sur la structure de grille déjà construite
//  (grilleMnt.js), aucun accès réseau ni disque.
// ============================================================

/**
 * Lit les 9 altitudes de la fenêtre 3×3 centrée sur (i,j). Renvoie `null`
 * si la fenêtre déborde de la grille OU si l'une des 9 valeurs est NaN
 * (trou du MNT) — jamais une fenêtre partiellement remplie.
 */
function fenetre3x3(grille, i, j) {
  const { nbLignes, nbColonnes, altitudes } = grille;
  if (i < 1 || i > nbLignes - 2 || j < 1 || j > nbColonnes - 2) return null;
  // z[dLigne][dColonne], dLigne/dColonne ∈ {-1,0,1} — -1 = sud/ouest, +1 = nord/est.
  const z = {};
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const v = altitudes[(i + di) * nbColonnes + (j + dj)];
      if (!Number.isFinite(v)) return null;
      z[`${di},${dj}`] = v;
    }
  }
  return z;
}

/**
 * Pente au point de grille (i,j), méthode de Horn (1981).
 *
 * dz/dx (est) : colonne EST (j+1) moins colonne OUEST (j-1), pondérées
 * (1,2,1) selon la position en ligne — inchangé par rapport à la formule
 * publiée, la colonne ne dépend pas de la convention nord/sud.
 * dz/dy (nord) : ligne NORD (i+1) moins ligne SUD (i-1) — c'est ICI que
 * la re-dérivation compte (voir l'en-tête du fichier) : avec i croissant
 * vers le nord dans cette grille, « nord moins sud » est bien +∂z/∂y.
 *
 * @returns {{dzdx:number, dzdy:number, pente_ratio:number, pente_pourcent:number, pente_deg:number}|null}
 */
export function calculerPente(grille, i, j) {
  const z = fenetre3x3(grille, i, j);
  if (!z) return null;
  const h = grille.cellsize_m;

  const dzdx = ((z['-1,1'] + 2 * z['0,1'] + z['1,1']) - (z['-1,-1'] + 2 * z['0,-1'] + z['1,-1'])) / (8 * h);
  const dzdy = ((z['1,-1'] + 2 * z['1,0'] + z['1,1']) - (z['-1,-1'] + 2 * z['-1,0'] + z['-1,1'])) / (8 * h);

  const pente_ratio = Math.hypot(dzdx, dzdy); // tan(angle de pente)
  return {
    dzdx, dzdy, pente_ratio,
    pente_pourcent: pente_ratio * 100,
    pente_deg: Math.atan(pente_ratio) * (180 / Math.PI),
  };
}

/**
 * Courbure au point de grille (i,j), méthode de Zevenbergen & Thorne
 * (1987) : surface z ≈ D·x² + E·y² + F·xy + G·x + H·y + z(i,j) ajustée
 * exactement sur les 9 points (x,y en mètres, origine à la cellule
 * centrale, x=est, y=nord).
 *
 * SIGNE DE LA COURBURE (à respecter dans reclassement.js, étape 6, et
 * dans favorabilite.js, étape 7) :
 * `courbureTotale = -2(D+E)` est NÉGATIVE pour une cuvette (concave,
 * converge, favorable) et POSITIVE pour un dôme (convexe, diverge) —
 * vérifié analytiquement sur un paraboloïde synthétique z=a(x²+y²)
 * (a>0 = cuvette) qui donne exactement D=E=a, donc courbureTotale=-4a<0.
 * `courbureTotale` est TOUJOURS définie (pas de division par G²+H²),
 * contrairement aux courbures de profil/en plan ci-dessous, qui sont
 * indéfinies en terrain plat (gradient nul) — exposées en plus car
 * usuelles en géomorphologie, mais `courbureTotale` est celle utilisée
 * comme facteur de favorabilité (robuste sur une petite grille où le
 * plat est fréquent).
 *
 * @returns {{D,E,F,G,H, courbureTotale:number, courbureProfil:number|null, courburePlan:number|null}|null}
 */
export function calculerCourbure(grille, i, j) {
  const z = fenetre3x3(grille, i, j);
  if (!z) return null;
  const h = grille.cellsize_m;
  const h2 = h * h;

  const D = ((z['0,-1'] + z['0,1']) / 2 - z['0,0']) / h2;
  const E = ((z['-1,0'] + z['1,0']) / 2 - z['0,0']) / h2;
  const F = (z['1,1'] - z['1,-1'] - z['-1,1'] + z['-1,-1']) / (4 * h2);
  const G = (z['0,1'] - z['0,-1']) / (2 * h);   // ∂z/∂x (est)
  const H = (z['1,0'] - z['-1,0']) / (2 * h);   // ∂z/∂y (nord) — voir en-tête sur la convention i+1=nord

  const courbureTotale = -2 * (D + E);

  const p = G * G + H * H; // carré du gradient — indéfini si nul (terrain plat)
  const courbureProfil = p > 0 ? -2 * (D * G * G + E * H * H + F * G * H) / p : null;
  const courburePlan = p > 0 ? 2 * (D * H * H + E * G * G - F * G * H) / p : null;

  return { D, E, F, G, H, courbureTotale, courbureProfil, courburePlan };
}

/**
 * Applique calculerPente()/calculerCourbure() sur toute la grille.
 * Cellules sans voisinage complet (bord, trou) : NaN dans les tableaux de
 * sortie — PAS 0 (§4).
 */
export function calculerGrillesDerivees(grille) {
  const n = grille.nbLignes * grille.nbColonnes;
  const pente_pourcent = new Float64Array(n).fill(NaN);
  const courbureTotale = new Float64Array(n).fill(NaN);
  let cellulesValides = 0;

  for (let i = 0; i < grille.nbLignes; i++) {
    for (let j = 0; j < grille.nbColonnes; j++) {
      const idx = i * grille.nbColonnes + j;
      const p = calculerPente(grille, i, j);
      const c = calculerCourbure(grille, i, j);
      if (p) { pente_pourcent[idx] = p.pente_pourcent; cellulesValides++; }
      if (c) courbureTotale[idx] = c.courbureTotale;
    }
  }

  return { pente_pourcent, courbureTotale, cellulesValides };
}

// ============================================================
//  geodesie.js — Géodésie exacte sur l'ellipsoïde WGS84.
//  Distance, azimut et SURFACE d'un polygone géodésique.
//  ─────────────────────────────────────────────────────────────
//  POURQUOI CE MODULE EXISTE, et pourquoi il ne réutilise PAS le
//  geoMath.js de HydroCrue : celui-ci calcule les distances par la
//  formule de Haversine (sphère de rayon 6 371 km) et les surfaces
//  par une projection équirectangulaire locale « degrés × 111 320 m ».
//  C'est assumé et documenté là-bas comme un calcul de SECOURS, pour
//  vérifier un ordre de grandeur sur un bassin versant. Ici, l'objet
//  mesuré est une PARCELLE, comparée à une surface cadastrale, et le
//  cahier des charges (§4) exige explicitement une formule géodésique
//  sur l'ellipsoïde, « pas une approximation planaire, pas de
//  degrés × 111 km ». Les deux approches coexistent donc, chacune pour
//  son usage ; geoMath.js n'est pas modifié.
//
//  ORDRE DE GRANDEUR DE L'ENJEU : Haversine sur sphère se trompe
//  jusqu'à ~0,5 % sur une distance ; sur une parcelle d'un hectare,
//  cela représente plusieurs dizaines de m² — au-delà de ce qu'un
//  géomètre accepte, et bien au-delà de ce qu'un client accepte quand
//  le chiffre est comparé à son titre foncier.
//
//  MÉTHODE — Karney, C. F. F., « Algorithms for geodesics »,
//  Journal of Geodesy 87(1), 43-55, 2013, DOI 10.1007/s00190-012-0578-z
//  (référence vérifiée le 19/09/2026 ; préprint arXiv:1109.4448).
//  Les séries sont développées à l'ordre 6 en epsilon, ce qui donne
//  une précision d'environ 15 nanomètres sur une distance terrestre —
//  c'est-à-dire la limite de la double précision, très au-delà de tout
//  besoin pratique. La surface d'un polygone géodésique est obtenue
//  par l'intégrale I4 de l'article (§6), avec les coefficients C4.
//
//  PORTÉE : implémentation du problème INVERSE (deux points connus →
//  distance, azimuts, aire sous la géodésique). Le problème direct
//  n'est pas implémenté : HydroPuits n'en a pas l'usage. Si un jour il
//  en a besoin (tracé d'un cercle de rayon donné, par exemple), il
//  faudra l'ajouter — ne pas bricoler une approximation à la place.
//
//  CE MODULE EST PUR : aucun appel réseau, aucune dépendance, aucun
//  effet de bord. Entièrement couvert par tests/unit-geodesie.test.js,
//  dont les références sont ANALYTIQUES (arc de méridien par quadrature
//  de Gauss-Legendre, aire d'un octant de l'ellipsoïde en forme close)
//  et non recopiées d'une source externe.
// ============================================================

// ── Paramètres définissants du WGS84 ──────────────────────────
// Source : NGA.STND.0036 (ex-NIMA TR8350.2), « Department of Defense
// World Geodetic System 1984 » — a et 1/f sont deux des quatre
// paramètres DÉFINISSANTS du système (vérifié le 19/09/2026 sur
// earth-info.nga.mil). Ce ne sont donc pas des mesures arrondies : ce
// sont des constantes exactes par convention, à écrire telles quelles.
const A_WGS84 = 6378137.0;            // demi-grand axe, mètres (exact par définition)
const INV_F_WGS84 = 298.257223563;    // inverse de l'aplatissement (exact par définition)

const f = 1 / INV_F_WGS84;
const f1 = 1 - f;                     // b/a
const b = A_WGS84 * f1;               // demi-petit axe
const e2 = f * (2 - f);               // première excentricité au carré
const ep2 = e2 / (f1 * f1);           // seconde excentricité au carré (e'²)
const n = f / (2 - f);                // troisième aplatissement

// Rayon authalique au carré : c² tel que 4πc² soit EXACTEMENT la
// surface de l'ellipsoïde de révolution. Forme close classique
// (Karney 2013, éq. 65) ; pour une sphère (e→0) elle redonne bien a².
const c2 = (A_WGS84 * A_WGS84 + b * b * (Math.atanh(Math.sqrt(e2)) / Math.sqrt(e2))) / 2;

/** Surface totale de l'ellipsoïde WGS84, en m². Sert de module au calcul
 *  d'aire polygonale (une aire est définie modulo la surface totale). */
export const AIRE_ELLIPSOIDE_M2 = 4 * Math.PI * c2;

// ── Seuils numériques ─────────────────────────────────────────
// Repris des choix de Karney (implémentation de référence GeographicLib) :
// ce sont des seuils de convergence, pas des constantes physiques.
const EPS_MACHINE = Number.EPSILON;              // 2.22e-16
const TOL0 = EPS_MACHINE;
const TOL1 = 200 * TOL0;
const TOL2 = Math.sqrt(TOL0);                    // ~1.49e-8
const TOLB = TOL0 * TOL2;                        // critère d'arrêt du bracketing
const XTHRESH = 1000 * TOL2;
// Plus petit nombre positif normalisé, racine carrée : sert de « zéro
// non nul » là où une division par cos(latitude) au pôle exploserait.
const MINUSCULE = Math.sqrt(Number.MIN_VALUE);   // ~1.49e-154
const ETOL2 = 0.1 * TOL2 / Math.sqrt(Math.max(0.001, Math.abs(f)) * Math.min(1, 1 - f / 2) / 2);

// Nombre maximal d'itérations de Newton avant d'abandonner. MAXIT1 est le
// seuil au-delà duquel on bascule sur la dichotomie (plus lente mais sûre) ;
// MAXIT2 est l'abandon définitif. Dépasser MAXIT2 signifie que l'algorithme
// n'a PAS convergé : on lève une exception (§4 — « échouent bruyamment »),
// on ne renvoie jamais une valeur approchée silencieusement.
const MAXIT1 = 20;
const MAXIT2 = MAXIT1 + 53 + 10; // 53 = bits de mantisse d'un double

const DEG = Math.PI / 180;

// ── Petites fonctions utilitaires ─────────────────────────────

/** Évalue p[0]·x^N + p[1]·x^(N-1) + … + p[N] (schéma de Horner). */
function polyval(N, p, decalage, x) {
  let y = N < 0 ? 0 : p[decalage];
  for (let i = 1; i <= N; i++) y = y * x + p[decalage + i];
  return y;
}

/** Normalise le couple (sin, cos) pour que sin² + cos² = 1. */
function normaliser(s, c) {
  const h = Math.hypot(s, c);
  return [s / h, c / h];
}

/** Ramène un angle en degrés dans l'intervalle (-180, 180]. */
function angleNormalise(x) {
  const y = x % 360;
  if (y <= -180) return y + 360;
  if (y > 180) return y - 360;
  return y;
}

/** Différence d'angles y - x, ramenée dans (-180, 180]. */
function angleDifference(x, y) {
  return angleNormalise(angleNormalise(y) - angleNormalise(x));
}

/**
 * Arrondi « de sécurité » sur un angle : écrase les valeurs
 * ridiculement petites issues d'une soustraction de deux grands
 * nombres, qui feraient sinon diverger les branches spéciales
 * (méridien, équateur) sur un simple bruit de calcul.
 */
function angleArrondi(x) {
  const z = 1 / 16;
  if (x === 0) return 0;
  let y = Math.abs(x);
  if (y < z) y = z - (z - y);
  return x < 0 ? -y : y;
}

/**
 * sin et cos d'un angle exprimé en DEGRÉS, exacts aux multiples de 90°.
 * Indispensable : sin(180 × π/180) ne vaut pas 0 en virgule flottante,
 * et un polygone dont un sommet est au pôle ou sur l'équateur tomberait
 * alors à côté des branches spéciales de l'algorithme.
 */
function sinCosDeg(x) {
  const q = Math.round(x / 90);
  const r = (x - q * 90) * DEG; // |r| <= 45°, donc pas de perte de précision
  const s = Math.sin(r);
  const c = Math.cos(r);
  switch (((q % 4) + 4) % 4) {
    case 0: return [s, c];
    case 1: return [c, -s];
    case 2: return [-s, -c];
    default: return [-c, s];
  }
}

/**
 * Somme d'une série de Fourier :
 *   sinp vrai  → Σ c[i]·sin(2i·x),  i = 1..N
 *   sinp faux  → Σ c[i]·cos((2i+1)·x),  i = 0..N-1
 * Évaluée par récurrence de Clenshaw (stable, sans accumulation d'erreur).
 */
function sommeSinCos(sinp, sinx, cosx, c, N) {
  let k = N + (sinp ? 1 : 0); // un cran au-delà du dernier élément utilisé
  const ar = 2 * (cosx - sinx) * (cosx + sinx); // = 2·cos(2x)
  let y0 = (N & 1) ? c[--k] : 0;
  let y1 = 0;
  let m = N >> 1;
  while (m--) {
    y1 = ar * y0 - y1 + c[--k];
    y0 = ar * y1 - y0 + c[--k];
  }
  return sinp ? 2 * sinx * cosx * y0 : cosx * (y0 - y1);
}

// ── Séries de Karney à l'ordre 6 ──────────────────────────────
// Les tableaux de coefficients ci-dessous sont ceux de l'article de
// Karney 2013 (§3 et §6). Ils n'ont AUCUNE signification physique
// isolément : ce sont les coefficients des développements limités des
// intégrales elliptiques I1, I2, I3 et I4 en puissances de epsilon (et,
// pour I3 et I4, du troisième aplatissement n). Ne pas les « corriger »
// à vue : toute modification doit être validée par
// tests/unit-geodesie.test.js, dont les références sont analytiques.

/** A1 - 1 : facteur d'échelle de la distance le long de la géodésique. */
function A1m1f(eps) {
  const coeff = [1, 4, 64, 0];
  const t = polyval(3, coeff, 0, eps * eps) / 256;
  return (t + eps) / (1 - eps);
}

function C1f(eps) {
  const coeff = [
    -1, 6, -16, 32,
    -9, 64, -128, 2048,
    9, -16, 768,
    3, -5, 512,
    -7, 1280,
    -7, 2048,
  ];
  const c = new Array(7).fill(0);
  const eps2 = eps * eps;
  let d = eps;
  let o = 0;
  for (let l = 1; l <= 6; l++) {
    const m = (6 - l) >> 1;
    c[l] = d * polyval(m, coeff, o, eps2) / coeff[o + m + 1];
    o += m + 2;
    d *= eps;
  }
  return c;
}

/** A2 - 1 : facteur d'échelle de la longueur réduite. */
function A2m1f(eps) {
  const coeff = [-11, -28, -192, 0];
  const t = polyval(3, coeff, 0, eps * eps) / 256;
  return (t - eps) / (1 + eps);
}

function C2f(eps) {
  const coeff = [
    1, 2, 16, 32,
    35, 64, 384, 2048,
    15, 80, 768,
    7, 35, 512,
    63, 1280,
    77, 2048,
  ];
  const c = new Array(7).fill(0);
  const eps2 = eps * eps;
  let d = eps;
  let o = 0;
  for (let l = 1; l <= 6; l++) {
    const m = (6 - l) >> 1;
    c[l] = d * polyval(m, coeff, o, eps2) / coeff[o + m + 1];
    o += m + 2;
    d *= eps;
  }
  return c;
}

// A3 : coefficients précalculés une fois pour l'aplatissement du WGS84
// (ils ne dépendent que de n, pas des points considérés).
const A3x = (() => {
  const coeff = [
    -3, 128,
    -2, -3, 64,
    -1, -3, -1, 16,
    3, -1, -2, 8,
    1, -1, 2,
    1, 1,
  ];
  const x = new Array(6);
  let o = 0;
  let k = 0;
  for (let j = 5; j >= 0; j--) {
    const m = Math.min(5 - j, j);
    x[k++] = polyval(m, coeff, o, n) / coeff[o + m + 1];
    o += m + 2;
  }
  return x;
})();

function A3f(eps) {
  return polyval(5, A3x, 0, eps);
}

const C3x = (() => {
  const coeff = [
    3, 128,
    2, 5, 128,
    -1, 3, 3, 64,
    -1, 0, 1, 8,
    -1, 1, 4,
    5, 256,
    1, 3, 128,
    -3, -2, 3, 64,
    1, -3, 2, 32,
    7, 512,
    -10, 9, 384,
    5, -9, 5, 192,
    7, 512,
    -14, 7, 512,
    21, 2560,
  ];
  const x = new Array(15);
  let o = 0;
  let k = 0;
  for (let l = 1; l < 6; l++) {
    for (let j = 5; j >= l; j--) {
      const m = Math.min(5 - j, j);
      x[k++] = polyval(m, coeff, o, n) / coeff[o + m + 1];
      o += m + 2;
    }
  }
  return x;
})();

function C3f(eps) {
  const c = new Array(6).fill(0);
  let mult = 1;
  let o = 0;
  for (let l = 1; l < 6; l++) {
    const m = 6 - l - 1;
    mult *= eps;
    c[l] = mult * polyval(m, C3x, o, eps);
    o += m + 1;
  }
  return c;
}

const C4x = (() => {
  const coeff = [
    97, 15015,
    1088, 156, 45045,
    -224, -4784, 1573, 45045,
    -10656, 14144, -4576, -858, 45045,
    64, 624, -4576, 6864, -3003, 15015,
    100, 208, 572, 3432, -12012, 30030, 45045,
    1, 9009,
    -2944, 468, 135135,
    5792, 1040, -1287, 135135,
    5952, -11648, 9152, -2574, 135135,
    -64, -624, 4576, -6864, 3003, 135135,
    8, 10725,
    1856, -936, 225225,
    -8448, 4992, -1144, 225225,
    -1440, 4160, -4576, 1716, 225225,
    -136, 63063,
    1024, -208, 105105,
    3584, -3328, 1144, 315315,
    -128, 135135,
    -2560, 832, 405405,
    128, 99099,
  ];
  const x = new Array(21);
  let o = 0;
  let k = 0;
  for (let l = 0; l < 6; l++) {
    for (let j = 5; j >= l; j--) {
      const m = 5 - j;
      x[k++] = polyval(m, coeff, o, n) / coeff[o + m + 1];
      o += m + 2;
    }
  }
  return x;
})();

function C4f(eps) {
  const c = new Array(6).fill(0);
  let mult = 1;
  let o = 0;
  for (let l = 0; l < 6; l++) {
    const m = 6 - l - 1;
    c[l] = mult * polyval(m, C4x, o, eps);
    o += m + 1;
    mult *= eps;
  }
  return c;
}

// ── Longueurs le long de la géodésique ────────────────────────
/**
 * Calcule la distance s12 (en unités du demi-petit axe) et la longueur
 * réduite m12 entre deux points de la géodésique repérés par leur
 * latitude paramétrique sigma.
 * @returns {{s12b:number, m12b:number, m0:number}}
 */
function longueurs(eps, sig12, ssig1, csig1, dn1, ssig2, csig2, dn2, avecDistance, avecLongueurReduite) {
  let s12b = 0;
  let m12b = 0;
  let m0 = 0;
  let A1 = 0;
  let A2 = 0;
  let J12 = 0;
  let Ca = null;
  let Cb = null;

  A1 = A1m1f(eps);
  Ca = C1f(eps);
  if (avecLongueurReduite) {
    A2 = A2m1f(eps);
    Cb = C2f(eps);
    m0 = A1 - A2;
    A2 = 1 + A2;
  }
  A1 = 1 + A1;

  if (avecDistance) {
    const B1 = sommeSinCos(true, ssig2, csig2, Ca, 6) - sommeSinCos(true, ssig1, csig1, Ca, 6);
    s12b = A1 * (sig12 + B1);
    if (avecLongueurReduite) {
      const B2 = sommeSinCos(true, ssig2, csig2, Cb, 6) - sommeSinCos(true, ssig1, csig1, Cb, 6);
      J12 = m0 * sig12 + (A1 * B1 - A2 * B2);
    }
  } else if (avecLongueurReduite) {
    const Cc = new Array(7).fill(0);
    for (let l = 1; l <= 6; l++) Cc[l] = A1 * Ca[l] - A2 * Cb[l];
    J12 = m0 * sig12 + (sommeSinCos(true, ssig2, csig2, Cc, 6) - sommeSinCos(true, ssig1, csig1, Cc, 6));
  }

  if (avecLongueurReduite) {
    m12b = dn2 * (csig1 * ssig2) - dn1 * (ssig1 * csig2) - csig1 * csig2 * J12;
  }
  return { s12b, m12b, m0 };
}

// ── Résolution de l'astroïde (cas quasi-antipodal) ────────────
/**
 * Racine positive de k⁴ + 2k³ - (x²+y²-1)k² - 2y²k - y² = 0, utilisée
 * pour amorcer l'itération dans le cas quasi-antipodal. Un polygone de
 * parcelle n'atteint jamais ce cas ; il est implémenté quand même pour
 * que le module reste correct si on lui donne un très grand polygone
 * (et pour que les tests analytiques à l'échelle du globe passent).
 */
function astroide(x, y) {
  const p = x * x;
  const q = y * y;
  const r = (p + q - 1) / 6;
  let k;
  if (!(q === 0 && r <= 0)) {
    const S = p * q / 4;
    const r2 = r * r;
    const r3 = r * r2;
    const disc = S * (S + 2 * r3);
    let u = r;
    if (disc >= 0) {
      let T3 = S + r3;
      T3 += T3 < 0 ? -Math.sqrt(disc) : Math.sqrt(disc);
      const T = Math.cbrt(T3);
      u += T + (T !== 0 ? r2 / T : 0);
    } else {
      const ang = Math.atan2(Math.sqrt(-disc), -(S + r3));
      u += 2 * r * Math.cos(ang / 3);
    }
    const v = Math.sqrt(u * u + q);
    const uv = u < 0 ? q / (v - u) : u + v;
    const w = (uv - q) / (2 * v);
    k = uv / (Math.sqrt(uv + w * w) + w);
  } else {
    k = 0;
  }
  return k;
}

// ── Amorçage de l'itération ───────────────────────────────────
function amorcer(sbet1, cbet1, dn1, sbet2, cbet2, dn2, lam12, slam12, clam12) {
  let sig12 = -1; // -1 = « pas de solution directe, il faut itérer »
  let salp1;
  let calp1;
  let salp2 = 0;
  let calp2 = 0;
  let dnm = 0;

  const sbet12 = sbet2 * cbet1 - cbet2 * sbet1;
  const cbet12 = cbet2 * cbet1 + sbet2 * sbet1;
  const sbet12a = sbet2 * cbet1 + cbet2 * sbet1;

  const ligneCourte = cbet12 >= 0 && sbet12 < 0.5 && cbet2 * lam12 < 0.5;
  let somg12;
  let comg12;
  if (ligneCourte) {
    let sbetm2 = (sbet1 + sbet2) * (sbet1 + sbet2);
    sbetm2 /= sbetm2 + (cbet1 + cbet2) * (cbet1 + cbet2);
    dnm = Math.sqrt(1 + ep2 * sbetm2);
    const omg12 = lam12 / (f1 * dnm);
    somg12 = Math.sin(omg12);
    comg12 = Math.cos(omg12);
  } else {
    somg12 = slam12;
    comg12 = clam12;
  }

  salp1 = cbet2 * somg12;
  calp1 = comg12 >= 0
    ? sbet12 + cbet2 * sbet1 * (somg12 * somg12) / (1 + comg12)
    : sbet12a - cbet2 * sbet1 * (somg12 * somg12) / (1 - comg12);

  const ssig12 = Math.hypot(salp1, calp1);
  const csig12 = sbet1 * sbet2 + cbet1 * cbet2 * comg12;

  if (ligneCourte && ssig12 < ETOL2) {
    // Ligne assez courte pour que l'approximation sphérique suffise :
    // on a directement la solution, pas besoin d'itérer.
    salp2 = cbet1 * somg12;
    calp2 = sbet12 - cbet1 * sbet2 * (comg12 >= 0 ? (somg12 * somg12) / (1 + comg12) : 1 - comg12);
    [salp2, calp2] = normaliser(salp2, calp2);
    sig12 = Math.atan2(ssig12, csig12);
  } else if (Math.abs(n) > 0.1 || csig12 >= 0 || ssig12 >= 6 * Math.abs(n) * Math.PI * cbet1 * cbet1) {
    // Amorçage sphérique d'ordre zéro : suffisant, rien à faire de plus.
  } else {
    // Cas quasi-antipodal : l'amorçage sphérique est trop mauvais pour
    // que Newton converge. On passe par l'astroïde (Karney 2013, §5).
    let y;
    let lamscale;
    let betscale;
    const lam12x = Math.atan2(-slam12, -clam12);
    let x;
    if (f >= 0) {
      const k2 = sbet1 * sbet1 * ep2;
      const eps = k2 / (2 * (1 + Math.sqrt(1 + k2)) + k2);
      lamscale = f * cbet1 * A3f(eps) * Math.PI;
      betscale = lamscale * cbet1;
      x = lam12x / lamscale;
      y = sbet12a / betscale;
    } else {
      const cbet12a = cbet2 * cbet1 - sbet2 * sbet1;
      const bet12a = Math.atan2(sbet12a, cbet12a);
      const { m12b, m0 } = longueurs(n, Math.PI + bet12a, sbet1, -cbet1, dn1, sbet2, cbet2, dn2, false, true);
      x = -1 + m12b / (cbet1 * cbet2 * m0 * Math.PI);
      betscale = x < -0.01 ? sbet12a / x : -f * cbet1 * cbet1 * Math.PI;
      lamscale = betscale / cbet1;
      y = lam12x / lamscale;
    }

    if (y > -TOL1 && x > -1 - XTHRESH) {
      if (f >= 0) {
        salp1 = Math.min(1, -x);
        calp1 = -Math.sqrt(1 - salp1 * salp1);
      } else {
        calp1 = Math.max(x > -TOL1 ? 0 : -1, x);
        salp1 = Math.sqrt(1 - calp1 * calp1);
      }
    } else {
      const k = astroide(x, y);
      const omg12a = lamscale * (f >= 0 ? -x * k / (1 + k) : -y * (1 + k) / k);
      somg12 = Math.sin(omg12a);
      comg12 = -Math.cos(omg12a);
      salp1 = cbet2 * somg12;
      calp1 = sbet12a - cbet2 * sbet1 * (somg12 * somg12) / (1 - comg12);
    }
  }

  if (!(salp1 <= 0)) {
    [salp1, calp1] = normaliser(salp1, calp1);
  } else {
    salp1 = 1;
    calp1 = 0;
  }
  return { sig12, salp1, calp1, salp2, calp2, dnm };
}

// ── Fonction dont Newton cherche le zéro ──────────────────────
function lambda12(sbet1, cbet1, dn1, sbet2, cbet2, dn2, salp1, calp1, slam120, clam120, derivee) {
  if (sbet1 === 0 && calp1 === 0) calp1 = -MINUSCULE;

  const salp0 = salp1 * cbet1;
  const calp0 = Math.hypot(calp1, salp1 * sbet1); // > 0

  let ssig1 = sbet1;
  let somg1 = salp0 * sbet1;
  let csig1 = calp1 * cbet1;
  const comg1 = csig1;
  [ssig1, csig1] = normaliser(ssig1, csig1);

  let salp2 = cbet2 !== cbet1 ? salp0 / cbet2 : salp1;
  let calp2 = (cbet2 !== cbet1 || Math.abs(sbet2) !== -sbet1)
    ? Math.sqrt((calp1 * cbet1) * (calp1 * cbet1) +
        (cbet1 < -sbet1 ? (cbet2 - cbet1) * (cbet1 + cbet2) : (sbet1 - sbet2) * (sbet1 + sbet2))) / cbet2
    : Math.abs(calp1);

  let ssig2 = sbet2;
  const somg2 = salp0 * sbet2;
  let csig2 = calp2 * cbet2;
  const comg2 = csig2;
  [ssig2, csig2] = normaliser(ssig2, csig2);

  const sig12 = Math.atan2(Math.max(0, csig1 * ssig2 - ssig1 * csig2), csig1 * csig2 + ssig1 * ssig2);
  const somg12 = Math.max(0, comg1 * somg2 - somg1 * comg2);
  const comg12 = comg1 * comg2 + somg1 * somg2;

  const eta = Math.atan2(somg12 * clam120 - comg12 * slam120, comg12 * clam120 + somg12 * slam120);

  const k2 = calp0 * calp0 * ep2;
  const eps = k2 / (2 * (1 + Math.sqrt(1 + k2)) + k2);
  const Ca = C3f(eps);
  const B312 = sommeSinCos(true, ssig2, csig2, Ca, 5) - sommeSinCos(true, ssig1, csig1, Ca, 5);
  const domg12 = -f * A3f(eps) * salp0 * (sig12 + B312);
  const lam12 = eta + domg12;

  let dlam12 = 0;
  if (derivee) {
    if (calp2 === 0) {
      dlam12 = -2 * f1 * dn1 / sbet1;
    } else {
      const { m12b } = longueurs(eps, sig12, ssig1, csig1, dn1, ssig2, csig2, dn2, false, true);
      dlam12 = m12b * f1 / (calp2 * cbet2);
    }
  }
  return { lam12, salp2, calp2, sig12, ssig1, csig1, ssig2, csig2, eps, domg12, dlam12 };
}

// ── Problème inverse ──────────────────────────────────────────
/**
 * Résout le problème géodésique INVERSE sur l'ellipsoïde WGS84.
 *
 * @param {number} lat1 latitude du point 1, en degrés décimaux
 * @param {number} lon1 longitude du point 1, en degrés décimaux
 * @param {number} lat2 latitude du point 2
 * @param {number} lon2 longitude du point 2
 * @returns {{distance_m:number, azimut1_deg:number, azimut2_deg:number, aireSousGeodesique_m2:number}}
 *   `aireSousGeodesique_m2` est l'aire S12 de Karney : l'aire du
 *   quadrilatère délimité par la géodésique, les deux méridiens des
 *   extrémités et l'équateur. C'est la brique à sommer pour obtenir
 *   l'aire d'un polygone — elle n'a pas de sens géographique isolément.
 * @throws {Error} si l'itération ne converge pas (jamais silencieux).
 */
export function geodesiqueInverse(lat1, lon1, lat2, lon2) {
  for (const [nom, v] of [['lat1', lat1], ['lon1', lon1], ['lat2', lat2], ['lon2', lon2]]) {
    if (!Number.isFinite(v)) throw new Error(`geodesiqueInverse : ${nom} n'est pas un nombre fini (${v}).`);
  }
  if (Math.abs(lat1) > 90 || Math.abs(lat2) > 90) {
    throw new Error('geodesiqueInverse : latitude hors de [-90, 90].');
  }

  let lon12 = angleDifference(lon1, lon2);
  let lonsign = lon12 >= 0 ? 1 : -1;
  lon12 *= lonsign;
  const lon12s = 180 - lon12;
  const lam12 = lon12 * DEG;
  let [slam12, clam12] = sinCosDeg(lon12);

  // On échange les points pour que le point 1 soit celui de plus haute
  // latitude en valeur absolue, puis on ramène lat1 <= 0. L'algorithme
  // n'est écrit que pour ce cas de figure ; les signes sont rétablis à
  // la fin.
  let swapp = Math.abs(lat1) < Math.abs(lat2) ? -1 : 1;
  if (swapp < 0) {
    lonsign *= -1;
    const t = lat1; lat1 = lat2; lat2 = t;
  }
  const latsign = lat1 < 0 ? 1 : -1;
  lat1 *= latsign;
  lat2 *= latsign;

  let [sbet1, cbet1] = sinCosDeg(angleArrondi(lat1));
  sbet1 *= f1;
  [sbet1, cbet1] = normaliser(sbet1, cbet1);
  cbet1 = Math.max(MINUSCULE, cbet1); // jamais 0 : on divise par cbet plus bas

  let [sbet2, cbet2] = sinCosDeg(angleArrondi(lat2));
  sbet2 *= f1;
  [sbet2, cbet2] = normaliser(sbet2, cbet2);
  cbet2 = Math.max(MINUSCULE, cbet2);

  // Force l'égalité exacte quand |lat2| == |lat1| : sans cela, deux
  // points symétriques par rapport à l'équateur donneraient une distance
  // légèrement asymétrique selon l'ordre des arguments.
  if (cbet1 < -sbet1) {
    if (cbet2 === cbet1) sbet2 = sbet2 < 0 ? -Math.abs(sbet1) : Math.abs(sbet1);
  } else if (Math.abs(sbet2) === -sbet1) {
    cbet2 = cbet1;
  }

  const dn1 = Math.sqrt(1 + ep2 * sbet1 * sbet1);
  const dn2 = Math.sqrt(1 + ep2 * sbet2 * sbet2);

  let s12x;
  let sig12;
  let salp1;
  let calp1;
  let salp2;
  let calp2;
  let somg12 = 2; // 2 = « pas encore calculé » (valeur impossible pour un sinus)
  let comg12 = 0;
  let omg12 = 0;

  let meridien = lat1 === -90 || slam12 === 0;

  if (meridien) {
    // Les deux points sont sur un même méridien complet : la géodésique
    // est (presque toujours) ce méridien.
    calp1 = clam12; salp1 = slam12;
    calp2 = 1; salp2 = 0;
    const ssig1 = sbet1;
    const csig1 = calp1 * cbet1;
    const ssig2 = sbet2;
    const csig2 = calp2 * cbet2;
    sig12 = Math.atan2(Math.max(0, csig1 * ssig2 - ssig1 * csig2), csig1 * csig2 + ssig1 * ssig2);
    const L = longueurs(n, sig12, ssig1, csig1, dn1, ssig2, csig2, dn2, true, true);
    s12x = L.s12b;
    const m12x = L.m12b;
    if (sig12 < 1 || m12x >= 0) {
      if (sig12 < 3 * MINUSCULE || (sig12 < TOL0 && (s12x < 0 || m12x < 0))) {
        sig12 = 0; s12x = 0;
      }
      s12x *= b;
    } else {
      // m12 < 0 : les points sont trop proches de l'antipode pour que le
      // méridien soit la géodésique. On repasse par le cas général.
      meridien = false;
    }
  }

  let eps = 0;
  let ssig1g = 0;
  let csig1g = 0;
  let ssig2g = 0;
  let csig2g = 0;

  if (!meridien && sbet1 === 0 && (f <= 0 || lon12s >= f * 180)) {
    // La géodésique longe l'équateur.
    calp1 = 0; calp2 = 0; salp1 = 1; salp2 = 1;
    s12x = A_WGS84 * lam12;
    sig12 = lam12 / f1;
    omg12 = sig12;
  } else if (!meridien) {
    // Cas général : méthode de Newton sur l'azimut de départ alpha1.
    const amorce = amorcer(sbet1, cbet1, dn1, sbet2, cbet2, dn2, lam12, slam12, clam12);
    sig12 = amorce.sig12;
    salp1 = amorce.salp1;
    calp1 = amorce.calp1;

    if (sig12 >= 0) {
      // Ligne courte : l'amorçage a donné directement la solution.
      s12x = sig12 * b * amorce.dnm;
      omg12 = lam12 / (f1 * amorce.dnm);
    } else {
      let salp1a = MINUSCULE;
      let calp1a = 1;
      let salp1b = MINUSCULE;
      let calp1b = -1;
      let tripn = false;
      let tripb = false;
      let numit = 0;
      let domg12 = 0;
      let converge = false;

      for (; numit < MAXIT2; numit++) {
        const r = lambda12(sbet1, cbet1, dn1, sbet2, cbet2, dn2, salp1, calp1,
          slam12, clam12, numit < MAXIT1);
        const v = r.lam12;
        salp2 = r.salp2; calp2 = r.calp2;
        sig12 = r.sig12;
        ssig1g = r.ssig1; csig1g = r.csig1; ssig2g = r.ssig2; csig2g = r.csig2;
        eps = r.eps;
        domg12 = r.domg12;

        if (tripb || !(Math.abs(v) >= (tripn ? 8 : 1) * TOL0)) { converge = true; break; }

        // Encadrement : garde une borne de chaque côté du zéro, pour
        // pouvoir retomber sur une dichotomie si Newton s'égare.
        if (v > 0 && (numit > MAXIT1 || calp1 / salp1 > calp1b / salp1b)) {
          salp1b = salp1; calp1b = calp1;
        } else if (v < 0 && (numit > MAXIT1 || calp1 / salp1 < calp1a / salp1a)) {
          salp1a = salp1; calp1a = calp1;
        }

        if (numit < MAXIT1 && r.dlam12 > 0) {
          const dalp1 = -v / r.dlam12;
          if (Math.abs(dalp1) < Math.PI) {
            const sdalp1 = Math.sin(dalp1);
            const cdalp1 = Math.cos(dalp1);
            const nsalp1 = salp1 * cdalp1 + calp1 * sdalp1;
            if (nsalp1 > 0) {
              calp1 = calp1 * cdalp1 - salp1 * sdalp1;
              salp1 = nsalp1;
              [salp1, calp1] = normaliser(salp1, calp1);
              tripn = Math.abs(v) <= 16 * TOL0;
              continue;
            }
          }
        }
        // Newton a échoué (dérivée nulle ou pas hors domaine) : dichotomie.
        salp1 = (salp1a + salp1b) / 2;
        calp1 = (calp1a + calp1b) / 2;
        [salp1, calp1] = normaliser(salp1, calp1);
        tripn = false;
        tripb = (Math.abs(salp1a - salp1) + (calp1a - calp1) < TOLB ||
                 Math.abs(salp1 - salp1b) + (calp1 - calp1b) < TOLB);
      }

      if (!converge) {
        // §4 : « échouent bruyamment s'ils ne convergent pas ». Jamais de
        // valeur approchée rendue en douce.
        throw new Error(
          `geodesiqueInverse : l'itération de Newton n'a pas convergé en ${MAXIT2} itérations ` +
          `pour (${lat1}, ${lon1}) → (${lat2}, ${lon2}). Aucune distance n'est renvoyée.`
        );
      }

      const L = longueurs(eps, sig12, ssig1g, csig1g, dn1, ssig2g, csig2g, dn2, true, false);
      s12x = L.s12b * b;

      const sdomg12 = Math.sin(domg12);
      const cdomg12 = Math.cos(domg12);
      somg12 = slam12 * cdomg12 - clam12 * sdomg12;
      comg12 = clam12 * cdomg12 + slam12 * sdomg12;
    }
  }

  // ── Aire sous la géodésique (S12 de Karney 2013, §6) ──
  const salp0 = salp1 * cbet1;
  const calp0 = Math.hypot(calp1, salp1 * sbet1);
  let S12;
  if (calp0 !== 0 && salp0 !== 0) {
    let ssig1 = sbet1;
    let csig1 = calp1 * cbet1;
    let ssig2 = sbet2;
    let csig2 = calp2 * cbet2;
    const k2 = calp0 * calp0 * ep2;
    const epsA = k2 / (2 * (1 + Math.sqrt(1 + k2)) + k2);
    // A4 = a²·e²·cos(alpha0)·sin(alpha0)
    const A4 = A_WGS84 * A_WGS84 * calp0 * salp0 * e2;
    [ssig1, csig1] = normaliser(ssig1, csig1);
    [ssig2, csig2] = normaliser(ssig2, csig2);
    const Ca = C4f(epsA);
    const B41 = sommeSinCos(false, ssig1, csig1, Ca, 6);
    const B42 = sommeSinCos(false, ssig2, csig2, Ca, 6);
    S12 = A4 * (B42 - B41);
  } else {
    // Géodésique équatoriale : sigma est indéterminé, mais l'aire sous
    // l'équateur est nulle par construction.
    S12 = 0;
  }

  let alp12;
  if (!meridien && somg12 === 2) {
    somg12 = Math.sin(omg12);
    comg12 = Math.cos(omg12);
  }
  if (!meridien && comg12 > -0.7071 && sbet2 - sbet1 < 1.75) {
    // Forme numériquement stable pour les cas courants (écart de
    // longitude modéré, écart de latitude modéré) — c'est-à-dire
    // toujours, pour un polygone de parcelle.
    const domg = 1 + comg12;
    const dbet1 = 1 + cbet1;
    const dbet2 = 1 + cbet2;
    alp12 = 2 * Math.atan2(somg12 * (sbet1 * dbet2 + sbet2 * dbet1),
      domg * (sbet1 * sbet2 + dbet1 * dbet2));
  } else {
    let salp12 = salp2 * calp1 - calp2 * salp1;
    let calp12 = calp2 * calp1 + salp2 * salp1;
    if (salp12 === 0 && calp12 < 0) {
      salp12 = MINUSCULE * calp1;
      calp12 = -1;
    }
    alp12 = Math.atan2(salp12, calp12);
  }
  S12 += c2 * alp12;
  S12 *= swapp * lonsign * latsign;

  if (swapp < 0) {
    let t = salp1; salp1 = salp2; salp2 = t;
    t = calp1; calp1 = calp2; calp2 = t;
  }
  salp1 *= swapp * lonsign; calp1 *= swapp * latsign;
  salp2 *= swapp * lonsign; calp2 *= swapp * latsign;

  return {
    distance_m: s12x,
    azimut1_deg: Math.atan2(salp1, calp1) / DEG,
    azimut2_deg: Math.atan2(salp2, calp2) / DEG,
    aireSousGeodesique_m2: S12,
  };
}

/** Distance géodésique entre deux points WGS84, en mètres. */
export function distanceGeodesique_m(lat1, lon1, lat2, lon2) {
  return geodesiqueInverse(lat1, lon1, lat2, lon2).distance_m;
}

// ── Périmètre et surface d'un polygone géodésique ─────────────

/** Somme compensée (Neumaier) : additionne une longue liste de termes de
 *  signes opposés sans perdre les bits de poids faible. Utile ici parce
 *  que les aires S12 successives se compensent largement entre elles. */
function sommeCompensee(valeurs) {
  let somme = 0;
  let correction = 0;
  for (const v of valeurs) {
    const t = somme + v;
    correction += Math.abs(somme) >= Math.abs(v) ? (somme - t) + v : (v - t) + somme;
    somme = t;
  }
  return somme + correction;
}

/** Reste de la division euclidienne au plus proche (comme remainder en C). */
function resteAuPlusProche(x, y) {
  const q = Math.round(x / y);
  return x - q * y;
}

/**
 * Compte les traversées du méridien origine, pour savoir si le polygone
 * enferme un pôle. Sans cela, un polygone entourant le pôle Nord se
 * verrait attribuer l'aire de son complémentaire.
 */
function traversee(lon1, lon2) {
  const lon12 = angleDifference(lon1, lon2);
  const l1 = angleNormalise(lon1);
  const l2 = angleNormalise(lon2);
  if (lon12 > 0 && ((l1 < 0 && l2 >= 0) || (l1 > 0 && l2 === 0))) return 1;
  if (lon12 < 0 && l1 >= 0 && l2 < 0) return -1;
  return 0;
}

/**
 * Périmètre et surface d'un polygone dont les côtés sont des GÉODÉSIQUES
 * sur l'ellipsoïde WGS84.
 *
 * @param {{lat:number, lon:number}[]} sommets  sommets dans l'ordre du
 *   contour, en degrés décimaux. Le polygone est refermé automatiquement
 *   (ne pas répéter le premier sommet à la fin — si c'est le cas, le
 *   côté de longueur nulle est simplement sans effet).
 * @returns {{aire_m2:number, aire_ha:number, perimetre_m:number, sensHoraire:boolean}}
 *   `aire_m2` est toujours POSITIVE ; `sensHoraire` indique le sens de
 *   parcours des sommets fournis (l'aire signée était négative en sens
 *   trigonométrique inverse).
 * @throws {Error} si moins de 3 sommets, ou coordonnées non finies.
 */
export function airePerimetreGeodesiques(sommets) {
  if (!Array.isArray(sommets) || sommets.length < 3) {
    throw new Error(`airePerimetreGeodesiques : il faut au moins 3 sommets (reçu ${sommets?.length ?? 0}).`);
  }
  sommets.forEach((s, i) => {
    if (!Number.isFinite(s?.lat) || !Number.isFinite(s?.lon)) {
      throw new Error(`airePerimetreGeodesiques : sommet ${i + 1} invalide (lat=${s?.lat}, lon=${s?.lon}).`);
    }
  });

  const longueurs_m = [];
  const aires_m2 = [];
  let croisements = 0;

  for (let i = 0; i < sommets.length; i++) {
    const a = sommets[i];
    const z = sommets[(i + 1) % sommets.length];
    const r = geodesiqueInverse(a.lat, a.lon, z.lat, z.lon);
    longueurs_m.push(r.distance_m);
    aires_m2.push(r.aireSousGeodesique_m2);
    croisements += traversee(a.lon, z.lon);
  }

  const perimetre_m = sommeCompensee(longueurs_m);
  let aire = sommeCompensee(aires_m2);

  // L'aire n'est définie que modulo la surface totale de l'ellipsoïde :
  // on la ramène dans (-S/2, S/2].
  aire = resteAuPlusProche(aire, AIRE_ELLIPSOIDE_M2);
  // Nombre impair de traversées du méridien origine ⇒ le polygone
  // enferme un pôle ; il faut ajouter une demi-surface.
  if (croisements & 1) aire += (aire < 0 ? 1 : -1) * AIRE_ELLIPSOIDE_M2 / 2;
  // Convention de Karney : l'aire ci-dessus est comptée en sens horaire.
  // On la retourne pour que le sens trigonométrique direct soit positif.
  aire = -aire;
  if (aire > AIRE_ELLIPSOIDE_M2 / 2) aire -= AIRE_ELLIPSOIDE_M2;
  else if (aire <= -AIRE_ELLIPSOIDE_M2 / 2) aire += AIRE_ELLIPSOIDE_M2;

  return {
    aire_m2: Math.abs(aire),
    aire_ha: Math.abs(aire) / 10000,
    perimetre_m,
    sensHoraire: aire < 0,
  };
}

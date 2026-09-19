// ============================================================
//  polygone.js — Validation et normalisation du polygone de terrain.
//  ─────────────────────────────────────────────────────────────
//  POURQUOI CE MODULE EXISTE : le terrain est saisi de trois façons
//  (tracé à la carte, import Excel/CSV, saisie au clavier — cahier des
//  charges §3.2) qui alimentent toutes la MÊME structure de données.
//  Les trois peuvent produire un polygone invalide, et chacune à sa
//  manière : un clic de trop qui croise le contour, un fichier dont
//  les sommets ne sont pas dans l'ordre du contour, une faute de
//  frappe qui duplique un sommet. Plutôt que de laisser chaque mode
//  refaire ses propres contrôles (et en oublier), tout converge ici.
//
//  RÈGLE DE FOND (§5) : un polygone croisé ne donne PAS un résultat
//  approché, il donne un refus explicite. Une surface calculée sur un
//  contour en nœud papillon est un nombre qui a l'air correct et qui
//  ne veut rien dire — exactement le genre de chiffre qui fait creuser
//  un forage au mauvais endroit.
//
//  CE MODULE EST PUR : aucun appel réseau, aucun état.
//  Couvert par tests/unit-polygone.test.js.
// ============================================================
import { airePerimetreGeodesiques, distanceGeodesique_m } from './geodesie.js';

/**
 * Distance en dessous de laquelle deux sommets sont considérés comme
 * un doublon de saisie, en mètres.
 *
 * ORIGINE DE LA VALEUR : choix par défaut, ajustable par l'appelant.
 * Calé sur la résolution du MNT utilisé par le logiciel (Copernicus
 * GLO-90, ≈ 90 m) divisée par ~100 : deux sommets distants de moins
 * d'un mètre ne peuvent pas décrire deux points distincts du contour à
 * l'échelle où HydroPuits travaille, et proviennent donc d'un double
 * clic ou d'une ligne dupliquée dans un fichier. Ce n'est PAS un seuil
 * normatif : un géomètre travaillant au centimètre doit pouvoir le
 * baisser, d'où le paramètre.
 */
export const TOLERANCE_DOUBLON_M_DEFAUT = 1.0;

/** Nombre minimal de sommets d'un polygone (§3.2 : « 3 sommets ou plus »). */
export const SOMMETS_MINIMUM = 3;

/**
 * Seuil de dégénérescence, exprimé en COMPACITÉ ISOPÉRIMÉTRIQUE
 * 4π·A/P² — grandeur sans dimension qui vaut 1 pour un disque et tend
 * vers 0 pour une forme aplatie en lame de couteau.
 *
 * POURQUOI PAS UN SEUIL DE SURFACE ABSOLU : trois points saisis sur une
 * ligne droite ne donnent PAS une surface nulle sur l'ellipsoïde. Une
 * droite en latitude/longitude n'est pas une géodésique, donc le
 * contour enferme une lamelle très fine mais réelle — mesurée à
 * 0,154 m² sur le cas de test de tests/unit-polygone.test.js. Un seuil
 * en m² ne distinguerait donc pas « contour dégénéré » de « petite
 * parcelle », alors que la compacité les sépare franchement.
 *
 * ORIGINE DE LA VALEUR : choix par défaut, calé sur des mesures faites
 * avec ce même code (voir le commentaire ci-dessus) —
 *   - trois sommets alignés            : 5,7·10⁻⁶
 *   - bande de 10 m × 2 km (légitime)  : 1,55·10⁻²
 *   - parcelle carrée                  : 0,78
 * Le seuil de 10⁻³ est ~180 fois au-dessus du cas dégénéré et ~15 fois
 * en dessous du cas légitime le plus défavorable. Il correspond à un
 * rectangle d'élongation 1:3140 (une bande de 10 m devrait faire 31 km
 * de long pour être rejetée). Ce n'est pas une norme : c'est un réglage
 * assumé, à revoir si un utilisateur rencontre un faux rejet.
 */
export const COMPACITE_MINIMALE = 1e-3;

/**
 * Surface en dessous de laquelle le terrain est trop petit pour que
 * l'analyse ait un sens, en m².
 *
 * ORIGINE : c'est l'aire d'UNE maille du MNT le plus fin utilisé sans
 * clé par HydroPuits (Copernicus GLO-90, ≈ 90 m de côté — voir
 * src/services/delineationClient.js) : 90 × 90 = 8100 m². En dessous,
 * tous les facteurs dérivés du relief (pente, TWI, courbure) seraient
 * lus dans un seul et même pixel, donc constants sur tout le terrain :
 * la carte de favorabilité serait uniforme et ne voudrait rien dire.
 *
 * C'est un AVERTISSEMENT, pas un refus : l'utilisateur reste libre de
 * poursuivre, mais il doit le savoir (§5 — jamais de substitution
 * silencieuse, jamais de résultat présenté sans ses limites).
 */
export const AIRE_MINIMALE_ANALYSABLE_M2 = 8100;

// ── Projection locale, POUR LA TOPOLOGIE SEULEMENT ────────────
/**
 * Projette les sommets dans un plan local approché (équirectangulaire
 * centré sur le terrain), en unités arbitraires.
 *
 * ⚠️ CE N'EST PAS UNE PROJECTION DE MESURE. Le cahier des charges (§4,
 * §8) interdit « degrés × 111 km » pour calculer une surface ou une
 * longueur — et c'est respecté : toute MESURE passe par geodesie.js
 * (Karney, ellipsoïde WGS84). Ici, la projection ne sert qu'à répondre
 * à une question TOPOLOGIQUE : « ces deux segments se croisent-ils ? ».
 * Le fait que deux segments se croisent ou non ne dépend pas de
 * l'échelle des axes, et un facteur cos(latitude) suffit à garder les
 * angles raisonnables pour que les tests d'orientation soient fiables
 * à l'échelle d'une parcelle. Aucun nombre issu d'ici n'est montré à
 * l'utilisateur ni utilisé dans un calcul de favorabilité.
 */
function projeterPourTopologie(sommets) {
  const latMoyenne = sommets.reduce((s, p) => s + p.lat, 0) / sommets.length;
  const cosLat = Math.cos(latMoyenne * Math.PI / 180);
  return sommets.map(p => ({ x: p.lon * cosLat, y: p.lat }));
}

/** Signe du produit vectoriel (b-a)×(c-a) : orientation du triplet. */
function orientation(a, b, c) {
  const d = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  // Le seuil absorbe le bruit de calcul sur des points quasi alignés :
  // sans lui, trois sommets colinéaires seraient classés tantôt à
  // gauche tantôt à droite selon l'ordre des opérations flottantes.
  if (d > 1e-14) return 1;
  if (d < -1e-14) return -1;
  return 0;
}

/** Vrai si c appartient au segment [a,b], sachant a, b et c alignés. */
function surSegment(a, b, c) {
  return Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x)
      && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);
}

/** Vrai si les segments [p1,p2] et [p3,p4] se coupent (cas alignés inclus). */
function segmentsSeCroisent(p1, p2, p3, p4) {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && surSegment(p1, p2, p3)) return true;
  if (o2 === 0 && surSegment(p1, p2, p4)) return true;
  if (o3 === 0 && surSegment(p3, p4, p1)) return true;
  if (o4 === 0 && surSegment(p3, p4, p2)) return true;
  return false;
}

/**
 * Cherche les auto-intersections du contour.
 *
 * Les côtés CONSÉCUTIFS partagent un sommet : c'est normal, ils ne
 * comptent pas. Tous les autres couples sont testés (algorithme en
 * O(n²) — pour quelques centaines de sommets c'est instantané, et un
 * balayage de Bentley-Ottmann serait une complexité gratuite ici).
 *
 * @returns {{cote1:number, cote2:number}[]} couples de côtés fautifs,
 *   numérotés à partir de 1 pour être affichables tels quels.
 */
export function detecterAutoIntersections(sommets) {
  const n = sommets.length;
  if (n < 4) return []; // un triangle ne peut pas se croiser lui-même
  const p = projeterPourTopologie(sommets);
  const croisements = [];
  for (let i = 0; i < n; i++) {
    const a1 = p[i];
    const a2 = p[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Côtés consécutifs (y compris le dernier avec le premier) : exclus.
      if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue;
      const b1 = p[j];
      const b2 = p[(j + 1) % n];
      if (segmentsSeCroisent(a1, a2, b1, b2)) {
        croisements.push({ cote1: i + 1, cote2: j + 1 });
      }
    }
  }
  return croisements;
}

/**
 * Cherche les sommets confondus (doublons de saisie).
 *
 * Utilise la VRAIE distance géodésique, pas la projection topologique :
 * le seuil est exprimé en mètres, il doit donc être comparé à des
 * mètres réels.
 *
 * @returns {{sommet1:number, sommet2:number, distance_m:number}[]}
 *   numérotés à partir de 1.
 */
export function detecterDoublons(sommets, tolerance_m = TOLERANCE_DOUBLON_M_DEFAUT) {
  const doublons = [];
  for (let i = 0; i < sommets.length; i++) {
    for (let j = i + 1; j < sommets.length; j++) {
      const d = distanceGeodesique_m(sommets[i].lat, sommets[i].lon, sommets[j].lat, sommets[j].lon);
      if (d <= tolerance_m) {
        doublons.push({ sommet1: i + 1, sommet2: j + 1, distance_m: d });
      }
    }
  }
  return doublons;
}

/**
 * Retire les doublons CONSÉCUTIFS (y compris un dernier sommet répétant
 * le premier, fréquent dans les fichiers exportés d'un SIG qui ferment
 * explicitement le contour). Les doublons NON consécutifs ne sont pas
 * touchés : ce sont de vraies anomalies de contour, à signaler et non à
 * corriger en silence.
 */
export function retirerDoublonsConsecutifs(sommets, tolerance_m = TOLERANCE_DOUBLON_M_DEFAUT) {
  if (sommets.length === 0) return [];
  const propres = [sommets[0]];
  for (let i = 1; i < sommets.length; i++) {
    const p = propres[propres.length - 1];
    if (distanceGeodesique_m(p.lat, p.lon, sommets[i].lat, sommets[i].lon) > tolerance_m) {
      propres.push(sommets[i]);
    }
  }
  // Fermeture explicite : le dernier point répète le premier.
  while (propres.length > 1) {
    const premier = propres[0];
    const dernier = propres[propres.length - 1];
    if (distanceGeodesique_m(premier.lat, premier.lon, dernier.lat, dernier.lon) <= tolerance_m) {
      propres.pop();
    } else break;
  }
  return propres;
}

/**
 * Normalise le sens de parcours en sens TRIGONOMÉTRIQUE DIRECT
 * (anti-horaire), qui est la convention de stockage de HydroPuits.
 *
 * Pourquoi normaliser : la maille de calcul (étape 5) et le test
 * « ce point est-il dans le terrain ? » sont plus simples et moins
 * sujets aux erreurs de signe si le sens est garanti. Le sens est
 * déterminé par l'aire géodésique SIGNÉE, pas par une formule du
 * lacet planaire : c'est la même mesure que celle affichée, donc
 * impossible qu'elles se contredisent.
 *
 * @returns {{sommets:Array, inverse:boolean}} `inverse` dit si l'ordre
 *   fourni a dû être retourné — l'UI le signale pour que l'utilisateur
 *   ne s'étonne pas de voir la numérotation de ses sommets changer.
 */
export function normaliserSens(sommets) {
  const { sensHoraire } = airePerimetreGeodesiques(sommets);
  if (!sensHoraire) return { sommets: [...sommets], inverse: false };
  // Le premier sommet est conservé en tête : seul l'ordre de parcours
  // change, pas le point de départ, pour que la numérotation reste
  // reconnaissable pour l'utilisateur.
  return { sommets: [sommets[0], ...sommets.slice(1).reverse()], inverse: true };
}

/**
 * Valide un polygone de terrain et, s'il est valide, en donne la
 * surface et le périmètre géodésiques.
 *
 * Ne lève JAMAIS d'exception pour un polygone invalide : elle renvoie
 * la liste des problèmes, que l'UI affiche telle quelle. Le cahier des
 * charges (§3.2) demande « un message clair, pas de calcul » — donc
 * `mesures` vaut null tant qu'il reste une erreur.
 *
 * @param {{lat:number, lon:number}[]} sommets
 * @param {{toleranceDoublon_m?:number, normaliser?:boolean}} [options]
 * @returns {{valide:boolean, erreurs:string[], avertissements:string[],
 *            sommets:Array, mesures:object|null, sensInverse:boolean}}
 *   Les messages sont des CLÉS de traduction accompagnées de leurs
 *   paramètres, pas du texte : l'UI les passe à t(). C'est ce qui
 *   permet de respecter « aucune chaîne visible en dur » (§1) depuis un
 *   module de calcul qui, lui, ne connaît pas la langue courante.
 */
export function validerPolygone(sommets, options = {}) {
  const tolerance_m = options.toleranceDoublon_m ?? TOLERANCE_DOUBLON_M_DEFAUT;
  const erreurs = [];
  const avertissements = [];

  if (!Array.isArray(sommets)) {
    return { valide: false, erreurs: [{ cle: 'polyErrTypeInvalide' }], avertissements: [], sommets: [], mesures: null, sensInverse: false };
  }

  // 1. Coordonnées exploitables
  const invalides = [];
  sommets.forEach((s, i) => {
    if (!Number.isFinite(s?.lat) || !Number.isFinite(s?.lon)
      || Math.abs(s.lat) > 90 || Math.abs(s.lon) > 180) {
      invalides.push(i + 1);
    }
  });
  if (invalides.length > 0) {
    erreurs.push({ cle: 'polyErrCoordonneesInvalides', params: { sommets: invalides.join(', ') } });
    return { valide: false, erreurs, avertissements, sommets, mesures: null, sensInverse: false };
  }

  // 2. Fermeture explicite et doublons consécutifs : corrigés, mais dits.
  let propres = retirerDoublonsConsecutifs(sommets, tolerance_m);
  if (propres.length !== sommets.length) {
    avertissements.push({
      cle: 'polyAvtDoublonsConsecutifs',
      params: { retires: sommets.length - propres.length, tolerance: tolerance_m },
    });
  }

  // 3. Nombre de sommets
  if (propres.length < SOMMETS_MINIMUM) {
    erreurs.push({ cle: 'polyErrTropPeuDeSommets', params: { nombre: propres.length, minimum: SOMMETS_MINIMUM } });
    return { valide: false, erreurs, avertissements, sommets: propres, mesures: null, sensInverse: false };
  }

  // 4. Doublons NON consécutifs : le contour repasse par un point déjà
  //    visité. Ce n'est pas rattrapable automatiquement (on ne sait pas
  //    lequel des deux est de trop) → erreur.
  const doublons = detecterDoublons(propres, tolerance_m);
  if (doublons.length > 0) {
    erreurs.push({
      cle: 'polyErrSommetsConfondus',
      params: { couples: doublons.map(d => `${d.sommet1}/${d.sommet2}`).join(', ') },
    });
  }

  // 5. Auto-intersections
  const croisements = detecterAutoIntersections(propres);
  if (croisements.length > 0) {
    erreurs.push({
      cle: 'polyErrAutoIntersection',
      params: { couples: croisements.map(c => `${c.cote1}/${c.cote2}`).join(', ') },
    });
  }

  if (erreurs.length > 0) {
    return { valide: false, erreurs, avertissements, sommets: propres, mesures: null, sensInverse: false };
  }

  // 6. Normalisation du sens de parcours
  let sensInverse = false;
  if (options.normaliser !== false) {
    const r = normaliserSens(propres);
    propres = r.sommets;
    sensInverse = r.inverse;
    if (sensInverse) avertissements.push({ cle: 'polyAvtSensInverse' });
  }

  // 7. Mesures géodésiques
  const mesures = airePerimetreGeodesiques(propres);

  // 8. Contour dégénéré : sommets alignés ou contour replié en lamelle.
  //    Le polygone n'est pas « croisé », mais il n'enferme rien
  //    d'exploitable. Voir COMPACITE_MINIMALE pour le choix du critère.
  const compacite = mesures.perimetre_m > 0
    ? 4 * Math.PI * mesures.aire_m2 / (mesures.perimetre_m * mesures.perimetre_m)
    : 0;
  if (compacite < COMPACITE_MINIMALE) {
    erreurs.push({
      cle: 'polyErrDegenere',
      params: { compacite: compacite.toExponential(2), seuil: COMPACITE_MINIMALE.toExponential(0) },
    });
    return { valide: false, erreurs, avertissements, sommets: propres, mesures: null, sensInverse };
  }

  // 9. Terrain plus petit qu'une maille du MNT : analysable en théorie,
  //    dénué de sens en pratique. On le dit, on ne bloque pas.
  if (mesures.aire_m2 < AIRE_MINIMALE_ANALYSABLE_M2) {
    avertissements.push({
      cle: 'polyAvtTerrainTresPetit',
      params: { aire: Math.round(mesures.aire_m2), maille: AIRE_MINIMALE_ANALYSABLE_M2 },
    });
  }

  return { valide: true, erreurs, avertissements, sommets: propres, mesures: { ...mesures, compacite }, sensInverse };
}

/**
 * Teste si un point est à l'intérieur du polygone (lancer de rayon,
 * règle pair/impair). Sert dès l'étape 5 : le cahier des charges impose
 * « pas de calcul hors polygone ».
 *
 * Utilise la projection topologique, pour la même raison que
 * detecterAutoIntersections : l'appartenance est une propriété
 * topologique, pas une mesure.
 */
export function pointDansPolygone(point, sommets) {
  const tous = projeterPourTopologie([...sommets, point]);
  const p = tous[tous.length - 1];
  const contour = tous.slice(0, -1);
  let dedans = false;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const a = contour[i];
    const b = contour[j];
    // `(a.y > p.y) !== (b.y > p.y)` : le côté enjambe l'ordonnée du point.
    // L'inégalité stricte d'un côté et large de l'autre évite de compter
    // deux fois un sommet situé exactement à la hauteur du point.
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) {
      dedans = !dedans;
    }
  }
  return dedans;
}

/**
 * Insère un sommet sur le côté `indexCote` (0-based : le côté reliant
 * le sommet indexCote au suivant). Utilisé par la carte, où l'on clique
 * sur un segment pour y ajouter un point (§3.2, mode 1).
 */
export function insererSommetSurCote(sommets, indexCote, nouveauSommet) {
  const copie = [...sommets];
  copie.splice(indexCote + 1, 0, nouveauSommet);
  return copie;
}

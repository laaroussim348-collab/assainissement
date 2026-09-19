// ============================================================
//  CarteTerrain.js — Carte interactive de saisie du terrain.
//  ─────────────────────────────────────────────────────────────
//  Aperçu réduit (dans l'onglet) + bouton « agrandir » ouvrant une
//  carte plein écran : l'utilisateur clique pour poser les sommets du
//  terrain, les déplace à la souris, en insère ou en supprime, et voit
//  la surface et le périmètre se recalculer en direct. Export en PNG
//  avec cartouche (titre, nord, échelle, légende, coordonnées).
//
//  HÉRITAGE : structure, fond de carte et cartouche repris de
//  DelimitationCarte.js de HydroCrue (cahier des charges §2.1 —
//  « identique au pixel près »). Ce qui change, c'est l'objet saisi :
//  HydroCrue demande UN point (l'exutoire), HydroPuits demande un
//  POLYGONE éditable. Les commentaires d'origine expliquant POURQUOI
//  chaque choix a été fait (CORS, plafond de zoom, tuiles grises) sont
//  conservés : ce sont des décisions payées par des retours
//  utilisateurs, pas des détails d'implémentation.
//
//  Fond de carte : imagerie satellite Esri World Imagery uniquement (CORS
//  activé, ce qui permet l'export image — contrairement aux tuiles
//  OpenStreetMap standard, qui ne renvoient pas d'en-têtes CORS et
//  empêcheraient la lecture du canevas). Un calque de noms de lieux (CARTO
//  Voyager Labels, transparent) est superposé par-dessus pour identifier
//  facilement l'endroit voulu.
//
//  Couverture Esri incomplète par endroits (zones rurales/éloignées) : au
//  lieu d'afficher la tuile de remplacement « Map data not yet available »
//  qu'Esri renvoie pour ces cas, chaque tuile chargée est examinée et
//  masquée si elle correspond à ce visuel (voir estTuilePlaceholder) — le
//  fond reste alors simplement vide à cet endroit, sans texte.
// ============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useI18n } from './useI18n';
import { t } from './i18n';
import { C_BLUE, C_TEAL, C_BORDER, C_RED, downloadChartCanvas } from './ui';
import { airePerimetreGeodesiques } from './calculations/geodesie.js';
import { exporterAvertissementTexte } from './Avertissement';
import { ZOOM_MAX, creerCarte, palierEchelle, creerCanvasExport } from './carteBase.js';

// Couleurs du tracé. Reprises de la charte de HydroCrue (contour ambre sur
// satellite : c'est la teinte qui reste lisible aussi bien sur un sol nu
// clair que sur une végétation sombre).
const C_CONTOUR = '#ffb300';
const C_SOMMET = '#d32f2f';
const C_MILIEU = '#ffffff';

function iconePoint(couleur, taille = 16) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${taille}px;height:${taille}px;border-radius:50%;background:${couleur};border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.6)"></div>`,
    iconSize: [taille, taille],
    iconAnchor: [taille / 2, taille / 2],
  });
}

/** Sommet numéroté : le numéro est le lien visuel entre la carte et le
 *  tableau de saisie au clavier, et entre la carte et les messages
 *  d'erreur (« les côtés 2 et 5 se croisent »). */
function iconeNumero(numero, couleur = C_SOMMET, taille = 22) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${taille}px;height:${taille}px;border-radius:50%;background:${couleur};`
      + `border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.6);color:#fff;font:700 ${Math.round(taille * 0.5)}px Arial,sans-serif;`
      + `display:flex;align-items:center;justify-content:center;line-height:1">${numero}</div>`,
    iconSize: [taille, taille],
    iconAnchor: [taille / 2, taille / 2],
  });
}


/** Palier « rond » (mètres) juste inférieur ou égal à la distance mesurée — même logique que L.control.scale. */
// ── Grille de coordonnées (graticule) ──────────────────────────
// Pas « rond » (degrés), même logique que palierEchelle mais visant ~5
// lignes sur l'étendue visible. Les paliers descendent plus bas que dans
// HydroCrue (jusqu'à 0,0001°, soit ~11 m) : une parcelle tient dans une
// fenêtre bien plus petite qu'un bassin versant, et sans ces paliers fins
// la grille disparaîtrait complètement au zoom maximal.
const PALIERS_GRILLE_DEG = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];
function pasGrille(etendueDeg) {
  const cible = etendueDeg / 5;
  const eligibles = PALIERS_GRILLE_DEG.filter((p) => p <= cible);
  return eligibles.length ? eligibles[eligibles.length - 1] : PALIERS_GRILLE_DEG[0];
}
function formatDegGrille(v, pas) {
  const dec = pas < 0.001 ? 4 : pas < 0.01 ? 3 : pas < 1 ? 2 : 0;
  return `${v.toFixed(dec)}°`;
}
function lignesGrille(bounds) {
  const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
  const pasLat = pasGrille(ne.lat - sw.lat) || PALIERS_GRILLE_DEG[0];
  const pasLon = pasGrille(ne.lng - sw.lng) || PALIERS_GRILLE_DEG[0];
  const lats = [];
  for (let l = Math.ceil(sw.lat / pasLat) * pasLat; l <= ne.lat + 1e-9; l += pasLat) lats.push(Math.round(l / pasLat) * pasLat);
  const lons = [];
  for (let l = Math.ceil(sw.lng / pasLon) * pasLon; l <= ne.lng + 1e-9; l += pasLon) lons.push(Math.round(l / pasLon) * pasLon);
  return { lats, lons, pasLat, pasLon };
}

/** Grille interactive (carte plein écran) : lignes + étiquettes de degrés, recalculées à chaque déplacement/zoom. */
function dessinerGrille(map, groupeRef) {
  if (groupeRef.current) { groupeRef.current.remove(); groupeRef.current = null; }
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
  const { lats, lons, pasLat, pasLon } = lignesGrille(bounds);
  const groupe = L.layerGroup();
  const styleLigne = { color: '#ffffff', weight: 1, opacity: 0.55, dashArray: '3,5', interactive: false };
  const styleLabel = 'background:rgba(0,0,0,.55);color:#fff;font-size:9.5px;line-height:14px;padding:0 4px;border-radius:2px;white-space:nowrap;font-family:Arial,sans-serif;';
  const icone = (texte, ancre) => L.divIcon({ className: '', html: `<span style="${styleLabel}">${texte}</span>`, iconSize: [0, 14], iconAnchor: ancre });
  lats.forEach((la) => {
    groupe.addLayer(L.polyline([[la, sw.lng], [la, ne.lng]], styleLigne));
    groupe.addLayer(L.marker([la, sw.lng], { icon: icone(formatDegGrille(la, pasLat), [-2, 7]), interactive: false }));
  });
  lons.forEach((lo) => {
    groupe.addLayer(L.polyline([[sw.lat, lo], [ne.lat, lo]], styleLigne));
    groupe.addLayer(L.marker([sw.lat, lo], { icon: icone(formatDegGrille(lo, pasLon), [-8, 14]), interactive: false }));
  });
  groupe.addTo(map);
  groupeRef.current = groupe;
}

/** Même grille, dessinée directement sur le canevas d'export (image PNG). */
function dessinerGrilleCanvas(ctx, map, rect) {
  const bounds = map.getBounds();
  const { lats, lons, pasLat, pasLon } = lignesGrille(bounds);
  const ouest = bounds.getWest(), est = bounds.getEast(), sud = bounds.getSouth(), nord = bounds.getNorth();
  ctx.save();
  ctx.font = '10px Arial';
  lats.forEach((la) => {
    const p1 = map.latLngToContainerPoint([la, ouest]);
    const p2 = map.latLngToContainerPoint([la, est]);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(0, p1.y); ctx.lineTo(rect.width, p2.y); ctx.stroke();
    ctx.setLineDash([]);
    const texte = formatDegGrille(la, pasLat);
    const w = ctx.measureText(texte).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(2, p1.y - 7, w + 6, 14);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(texte, 5, p1.y);
  });
  lons.forEach((lo) => {
    const p1 = map.latLngToContainerPoint([sud, lo]);
    const p2 = map.latLngToContainerPoint([nord, lo]);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(p1.x, rect.height); ctx.lineTo(p2.x, 0); ctx.stroke();
    ctx.setLineDash([]);
    const texte = formatDegGrille(lo, pasLon);
    const w = ctx.measureText(texte).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(p1.x - w / 2 - 3, rect.height - 16, w + 6, 14);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(texte, p1.x, rect.height - 9);
  });
  ctx.restore();
}

/**
 * Cartouche professionnelle dessinée par-dessus la carte exportée :
 * titre, flèche du nord, échelle graphique, légende, surface/périmètre,
 * et l'AVERTISSEMENT SCIENTIFIQUE (§5).
 *
 * L'avertissement figure sur l'image elle-même, et pas seulement dans le
 * rapport : une carte exportée circule seule (envoyée par WhatsApp,
 * collée dans un e-mail), détachée du document qui la nuance. Sans lui,
 * l'image la plus affirmative du logiciel serait aussi la seule à ne
 * porter aucune réserve.
 */
function dessinerCartouche(ctx, map, rect, { titre, mesures, nbSommets }) {
  // ── Titre ──
  ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const texteTitre = titre || t('carteTitreTerrainGenerique');
  const largeurTitre = ctx.measureText(texteTitre).width;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillRect(rect.width / 2 - largeurTitre / 2 - 10, 8, largeurTitre + 20, 26);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillText(texteTitre, rect.width / 2, 14);

  // ── Flèche du nord (haut-droite) ──
  const nx = rect.width - 40, ny = 55;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.beginPath(); ctx.arc(nx, ny, 24, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(nx, ny - 16); ctx.lineTo(nx - 6, ny + 6); ctx.lineTo(nx, ny + 1); ctx.lineTo(nx + 6, ny + 6);
  ctx.closePath();
  ctx.fillStyle = '#c0392b'; ctx.fill();
  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('N', nx, ny - 18);
  ctx.restore();

  // ── Avertissement scientifique (bas de l'image, pleine largeur) ──
  const avert = exporterAvertissementTexte();
  ctx.font = '10.5px Arial';
  const motsAvert = avert.split(' ');
  const lignesAvert = [];
  let ligne = '';
  const largeurMax = rect.width - 32;
  for (const mot of motsAvert) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (ctx.measureText(essai).width > largeurMax && ligne) { lignesAvert.push(ligne); ligne = mot; }
    else ligne = essai;
  }
  if (ligne) lignesAvert.push(ligne);
  const hAvert = lignesAvert.length * 13 + 10;
  const yAvert = rect.height - hAvert;
  ctx.fillStyle = 'rgba(255,248,224,0.94)';
  ctx.fillRect(0, yAvert, rect.width, hAvert);
  ctx.strokeStyle = '#d0a020'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, yAvert); ctx.lineTo(rect.width, yAvert); ctx.stroke();
  ctx.fillStyle = '#7a5000'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  lignesAvert.forEach((l, i) => ctx.fillText(l, 16, yAvert + 6 + i * 13));

  // ── Échelle graphique (juste au-dessus de l'avertissement) ──
  const yEchelle = yAvert - 14;
  const xDepart = 16, xRefPx = 100;
  let barrePx = 80, texteEchelle = '—';
  try {
    const p1 = map.containerPointToLatLng(L.point(xDepart, yEchelle));
    const p2 = map.containerPointToLatLng(L.point(xDepart + xRefPx, yEchelle));
    const metresRef = map.distance(p1, p2);
    if (metresRef > 0) {
      const metresJolis = palierEchelle(metresRef);
      barrePx = xRefPx * (metresJolis / metresRef);
      texteEchelle = metresJolis >= 1000 ? `${metresJolis / 1000} km` : `${metresJolis} m`;
    }
  } catch { /* carte non disponible : échelle non tracée précisément */ }
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillRect(xDepart - 6, yEchelle - 24, Math.max(barrePx, 90) + 20, 34);
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(xDepart, yEchelle); ctx.lineTo(xDepart + barrePx, yEchelle);
  ctx.moveTo(xDepart, yEchelle - 4); ctx.lineTo(xDepart, yEchelle + 4);
  ctx.moveTo(xDepart + barrePx, yEchelle - 4); ctx.lineTo(xDepart + barrePx, yEchelle + 4);
  ctx.stroke();
  ctx.fillStyle = '#1a1a1a'; ctx.font = '10px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(texteEchelle, xDepart, yEchelle - 6);

  // ── Légende + mesures (bas-droite) ──
  const items = [
    [C_CONTOUR, 'polygone', t('carteLegendeTerrain')],
    [C_SOMMET, 'point', `${t('carteLegendeSommet')} (${nbSommets})`],
  ];
  const lignesMesure = mesures ? [
    `${t('carteSurface')} : ${mesures.aire_ha.toFixed(4)} ha (${Math.round(mesures.aire_m2)} m²)`,
    `${t('cartePerimetre')} : ${mesures.perimetre_m.toFixed(2)} m`,
  ] : [];
  const hBloc = items.length * 18 + lignesMesure.length * 15 + 16;
  const lx = rect.width - 300, ly = yEchelle - hBloc + 4;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillRect(lx - 10, ly - 8, 290, hBloc);
  items.forEach(([couleur, forme, texte], i) => {
    const iy = ly + i * 18;
    if (forme === 'point') {
      ctx.beginPath(); ctx.arc(lx + 6, iy + 5, 5, 0, 2 * Math.PI);
      ctx.fillStyle = couleur; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      ctx.fillStyle = couleur; ctx.globalAlpha = 0.35; ctx.fillRect(lx, iy, 14, 10); ctx.globalAlpha = 1;
      ctx.strokeStyle = couleur; ctx.lineWidth = 1.5; ctx.strokeRect(lx, iy, 14, 10);
    }
    ctx.fillStyle = '#1a1a1a'; ctx.font = '10.5px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(texte, lx + 22, iy + 5);
  });
  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 10.5px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  lignesMesure.forEach((texte, i) => {
    ctx.fillText(texte, lx, ly + items.length * 18 + 6 + i * 15);
  });
}

/**
 * Composite tuiles + contour + sommets en une image PNG, sans dépendre
 * d'une bibliothèque externe. Fonctionne uniquement si les tuiles ont été
 * chargées en CORS (cf. ajouterFond) — sinon le canevas est « taché » et
 * toDataURL() lève une exception, interceptée plus bas avec un message
 * explicite.
 */
function exporterCarteEnImage(map, container, { sommets, titre, grille, mesures }) {
  const { canvas, ctx, rect } = creerCanvasExport(container);

  const versPoint = (s) => map.latLngToContainerPoint([s.lat, s.lon]);

  if (sommets.length > 2) {
    ctx.beginPath();
    sommets.forEach((s, i) => { const c = versPoint(s); if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y); });
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,179,0,0.15)'; ctx.fill();
    ctx.strokeStyle = C_CONTOUR; ctx.lineWidth = 2.5; ctx.stroke();
  } else if (sommets.length === 2) {
    ctx.beginPath();
    sommets.forEach((s, i) => { const c = versPoint(s); if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y); });
    ctx.strokeStyle = C_CONTOUR; ctx.lineWidth = 2.5; ctx.stroke();
  }
  sommets.forEach((s, i) => {
    const c = versPoint(s);
    ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0, 2 * Math.PI);
    ctx.fillStyle = C_SOMMET; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), c.x, c.y);
  });

  if (grille) dessinerGrilleCanvas(ctx, map, rect);
  dessinerCartouche(ctx, map, rect, { titre, mesures, nbSommets: sommets.length });
  return canvas;
}

/** Point milieu approché d'un côté, pour y placer la poignée d'insertion.
 *  Une interpolation linéaire en degrés suffit : ce point n'est qu'une
 *  POIGNÉE d'interface, il est remplacé dès que l'utilisateur la déplace,
 *  et aucune mesure n'en dépend. */
function milieuCote(a, z) {
  return { lat: (a.lat + z.lat) / 2, lon: (a.lon + z.lon) / 2 };
}

export default function CarteTerrain({ sommets, onChangerSommets, nomTerrain, mesures, onImageExportee }) {
  const { t: tr } = useI18n();
  const apercuDivRef = useRef(null);
  const apercuMapRef = useRef(null);
  const apercuGroupeRef = useRef(null);

  const pleinDivRef = useRef(null);
  const pleinMapRef = useRef(null);
  const pleinGroupeRef = useRef(null);
  const grilleGroupeRef = useRef(null);

  // Les gestionnaires Leaflet sont attachés une fois pour toutes, mais ils
  // doivent lire les sommets ACTUELS. Un ref évite de reconstruire toute
  // la carte (et de perdre le zoom de l'utilisateur) à chaque sommet posé.
  const sommetsRef = useRef(sommets);
  sommetsRef.current = sommets;
  const onChangerRef = useRef(onChangerSommets);
  onChangerRef.current = onChangerSommets;

  const [plein, setPlein] = useState(false);
  const [exportMsg, setExportMsg] = useState(null);
  const [grilleActive, setGrilleActive] = useState(true);
  // Mesures « à chaud » pendant un glisser : recalculées en O(n) seulement
  // (surface + périmètre), sans la validation complète qui est en O(n²).
  const [mesuresDirect, setMesuresDirect] = useState(null);

  const mesuresAffichees = mesuresDirect || mesures;

  const titreCarte = nomTerrain
    ? `${tr('carteTitreTerrainDe')} ${nomTerrain}`
    : tr('carteTitreTerrainGenerique');

  // ── Dessin du contour, des sommets et des poignées ──
  const dessinerTerrain = useCallback((map, groupeRef, { editable }) => {
    if (groupeRef.current) { groupeRef.current.remove(); groupeRef.current = null; }
    const pts = sommetsRef.current;
    // L.featureGroup (et non layerGroup) : nécessaire pour .getBounds(),
    // utilisé par zoomEtendue() afin de recadrer la vue à la demande.
    const groupe = L.featureGroup();

    const latlngs = pts.map((s) => [s.lat, s.lon]);
    if (pts.length > 2) {
      groupe.addLayer(L.polygon(latlngs, {
        color: C_CONTOUR, weight: 2.5, fillColor: C_CONTOUR, fillOpacity: 0.12, interactive: false,
      }));
    } else if (pts.length === 2) {
      groupe.addLayer(L.polyline(latlngs, { color: C_CONTOUR, weight: 2.5, dashArray: '6,4', interactive: false }));
    }

    pts.forEach((s, i) => {
      const marqueur = L.marker([s.lat, s.lon], {
        icon: iconeNumero(i + 1),
        draggable: editable,
        // Les sommets passent au-dessus du contour : on doit pouvoir les
        // attraper même quand deux côtés se rejoignent dessus.
        zIndexOffset: 1000,
      });
      if (editable) {
        marqueur.on('drag', (e) => {
          // Retour en direct pendant le glisser, sans valider (trop coûteux).
          const copie = [...sommetsRef.current];
          copie[i] = { lat: e.latlng.lat, lon: e.latlng.lng };
          try {
            setMesuresDirect(copie.length > 2 ? airePerimetreGeodesiques(copie) : null);
          } catch { setMesuresDirect(null); }
        });
        marqueur.on('dragend', (e) => {
          const copie = [...sommetsRef.current];
          copie[i] = { lat: e.target.getLatLng().lat, lon: e.target.getLatLng().lng };
          setMesuresDirect(null);
          onChangerRef.current(copie);
        });
        // Clic droit = supprimer ce sommet (§3.2, mode 1).
        marqueur.on('contextmenu', (e) => {
          L.DomEvent.stop(e);
          const copie = sommetsRef.current.filter((_, k) => k !== i);
          onChangerRef.current(copie);
        });
        marqueur.bindTooltip(`${tr('carteSupprimerSommet')}`, { direction: 'top', opacity: 0.85 });
      }
      groupe.addLayer(marqueur);
    });

    // Poignées d'insertion au milieu de chaque côté. Le cahier des charges
    // demande « insertion d'un sommet par clic sur un segment » ; une
    // poignée visible est la forme la plus découvrable de ce geste (c'est
    // aussi celle de tous les éditeurs SIG), et elle évite d'avoir à
    // deviner sur quel côté l'utilisateur a cliqué.
    if (editable && pts.length >= 2) {
      const nbCotes = pts.length > 2 ? pts.length : 1;
      for (let i = 0; i < nbCotes; i++) {
        const a = pts[i];
        const z = pts[(i + 1) % pts.length];
        const m = milieuCote(a, z);
        const poignee = L.marker([m.lat, m.lon], {
          icon: iconePoint(C_MILIEU, 11),
          draggable: false,
          zIndexOffset: 500,
        });
        poignee.on('click', (e) => {
          L.DomEvent.stop(e);
          const copie = [...sommetsRef.current];
          copie.splice(i + 1, 0, m);
          onChangerRef.current(copie);
        });
        poignee.bindTooltip(tr('carteHintInserer'), { direction: 'top', opacity: 0.85 });
        groupe.addLayer(poignee);
      }
    }

    groupe.addTo(map);
    groupeRef.current = groupe;
    return groupe.getLayers().length > 0 ? groupe.getBounds() : null;
  }, [tr]);

  // ── Carte miniature (aperçu, non interactive) ──
  useEffect(() => {
    if (!apercuDivRef.current || apercuMapRef.current) return undefined;
    const { map } = creerCarte(apercuDivRef.current, { interactive: false });
    apercuMapRef.current = map;
    return () => { map.remove(); apercuMapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = apercuMapRef.current;
    if (!map) return;
    const bounds = dessinerTerrain(map, apercuGroupeRef, { editable: false });
    if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20], maxZoom: ZOOM_MAX });
  }, [sommets, dessinerTerrain]);

  // ── Carte plein écran (montée seulement quand ouverte) ──
  useEffect(() => {
    if (!plein) return undefined;
    const div = pleinDivRef.current;
    if (!div) return undefined;
    const { map } = creerCarte(div, { interactive: true });
    pleinMapRef.current = map;
    setExportMsg(null);

    const bounds = dessinerTerrain(map, pleinGroupeRef, { editable: true });
    if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: ZOOM_MAX });

    // Un clic sur le fond ajoute un sommet à la fin du contour. Les clics
    // sur un sommet ou une poignée sont interceptés par leurs propres
    // gestionnaires (L.DomEvent.stop), ils n'arrivent pas ici.
    map.on('click', (e) => {
      onChangerRef.current([...sommetsRef.current, { lat: e.latlng.lat, lon: e.latlng.lng }]);
    });

    setTimeout(() => map.invalidateSize(), 50);
    return () => {
      map.remove(); pleinMapRef.current = null; pleinGroupeRef.current = null; grilleGroupeRef.current = null;
    };
  }, [plein, dessinerTerrain]);

  // Redessine le contour quand les sommets changent, SANS reconstruire la
  // carte : le zoom et le centrage de l'utilisateur sont préservés.
  useEffect(() => {
    const map = pleinMapRef.current;
    if (!map || !plein) return;
    dessinerTerrain(map, pleinGroupeRef, { editable: true });
  }, [sommets, plein, dessinerTerrain]);

  // ── Grille de coordonnées (carte plein écran) ──
  useEffect(() => {
    const map = pleinMapRef.current;
    if (!map || !plein) return undefined;
    if (!grilleActive) {
      if (grilleGroupeRef.current) { grilleGroupeRef.current.remove(); grilleGroupeRef.current = null; }
      return undefined;
    }
    const redessiner = () => dessinerGrille(map, grilleGroupeRef);
    redessiner();
    map.on('moveend zoomend', redessiner);
    return () => {
      map.off('moveend zoomend', redessiner);
      if (grilleGroupeRef.current) { grilleGroupeRef.current.remove(); grilleGroupeRef.current = null; }
    };
  }, [plein, grilleActive]);

  // « Zoom étendue » (comme AutoCAD) : recadre sur l'ensemble du tracé à
  // tout moment, pas seulement à l'ouverture de la carte.
  function zoomEtendue() {
    const map = pleinMapRef.current;
    if (!map) return;
    const bounds = pleinGroupeRef.current?.getBounds?.();
    if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: ZOOM_MAX });
  }

  function annulerDernier() {
    onChangerRef.current(sommetsRef.current.slice(0, -1));
  }

  function toutEffacer() {
    onChangerRef.current([]);
  }

  function telechargerImage() {
    const map = pleinMapRef.current;
    const div = pleinDivRef.current;
    if (!map || !div) return;
    try {
      const canvas = exporterCarteEnImage(map, div, {
        sommets: sommetsRef.current, titre: titreCarte, grille: grilleActive, mesures: mesuresAffichees,
      });
      downloadChartCanvas(canvas, `terrain${nomTerrain ? '-' + nomTerrain.replace(/\s+/g, '_') : ''}.png`,
        (msg) => setExportMsg(msg));
      // Conserve aussi l'image pour le rapport, sans action supplémentaire.
      onImageExportee?.(canvas.toDataURL('image/png'));
    } catch {
      setExportMsg(tr('carteExportErreur'));
    }
  }

  const BoutonCarte = ({ onClick, actif, titre, children, disabled }) => (
    <button onClick={onClick} title={titre} disabled={disabled}
      style={{ padding: '6px 10px', fontSize: 12, borderRadius: 3,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        background: actif ? C_TEAL : '#fff', color: actif ? '#fff' : '#1a1a1a',
        border: `1px solid ${actif ? C_TEAL : C_BORDER}` }}>
      {children}
    </button>
  );

  return (
    <div>
      <div style={{ position: 'relative', height: 380, border: `1px solid ${C_BORDER}`, borderRadius: 4,
        overflow: 'hidden', marginTop: 6, marginBottom: 4, background: '#eee', boxShadow: '0 1px 4px rgba(0,0,0,.12)' }}>
        <div ref={apercuDivRef} style={{ width: '100%', height: '100%' }} />
        <button onClick={() => setPlein(true)} title={tr('carteAgrandir')}
          style={{ position: 'absolute', top: 6, right: 6, zIndex: 500, background: '#fff',
            border: `1px solid ${C_BORDER}`, borderRadius: 3, padding: '4px 9px', fontSize: 16,
            cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }}>
          🔍
        </button>
      </div>
      <p style={{ fontSize: 10, color: '#888', margin: '0 0 6px' }}>{tr('carteApercuHint')}</p>

      {plein && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#000' }}>
          <div ref={pleinDivRef} style={{ width: '100%', height: '100%' }} />

          <div style={{ position: 'absolute', top: 10, left: 10, right: 10, zIndex: 500, display: 'flex',
            justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', pointerEvents: 'none' }}>
            <div style={{ background: 'rgba(255,255,255,.95)', border: `1px solid ${C_BORDER}`, borderRadius: 3,
              padding: '8px 12px', fontSize: 12, maxWidth: 440, pointerEvents: 'auto', lineHeight: 1.6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>{titreCarte}</div>
              <b style={{ color: C_BLUE }}>{tr('carteTitrePlein')}</b>
              <div style={{ color: '#555', marginTop: 3 }}>{tr('carteInstructions')}</div>
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C_BORDER}` }}>
                <b>{tr('carteSommets')} :</b> {sommets.length}
                {mesuresAffichees && (
                  <>
                    <br /><b>{tr('carteSurface')} :</b> {mesuresAffichees.aire_ha.toFixed(4)} ha
                    {' '}({Math.round(mesuresAffichees.aire_m2)} m²)
                    <br /><b>{tr('cartePerimetre')} :</b> {mesuresAffichees.perimetre_m.toFixed(2)} m
                  </>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <BoutonCarte onClick={annulerDernier} disabled={sommets.length === 0} titre={tr('carteAnnulerDernierHint')}>
                ↶ {tr('carteAnnulerDernier')}
              </BoutonCarte>
              <BoutonCarte onClick={toutEffacer} disabled={sommets.length === 0} titre={tr('carteToutEffacerHint')}>
                ✕ {tr('carteToutEffacer')}
              </BoutonCarte>
              <BoutonCarte onClick={zoomEtendue} titre={tr('carteZoomEtendueHint')}>
                ⛶ {tr('carteZoomEtendueBtn')}
              </BoutonCarte>
              <BoutonCarte onClick={() => setGrilleActive(g => !g)} actif={grilleActive} titre={tr('carteGrilleHint')}>
                # {tr('carteGrilleBtn')}
              </BoutonCarte>
              <BoutonCarte onClick={() => setPlein(false)} titre={tr('carteFermer')}>✕</BoutonCarte>
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 500,
            display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            {sommets.length >= 3 && (
              <button onClick={telechargerImage}
                style={{ padding: '8px 16px', fontSize: 13, color: C_BLUE, background: '#fff',
                  border: `1px solid ${C_BLUE}`, borderRadius: 3, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.4)' }}>
                {tr('carteTelechargerBtn')}
              </button>
            )}
            <button onClick={() => setPlein(false)}
              style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700, color: '#fff', background: C_TEAL,
                border: 'none', borderRadius: 3, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.4)' }}>
              {tr('carteTerminerBtn')}
            </button>
            {exportMsg && <span style={{ background: 'rgba(255,255,255,.95)', padding: '4px 10px', fontSize: 11, borderRadius: 3 }}>{exportMsg}</span>}
          </div>

          {sommets.length > 0 && sommets.length < 3 && (
            <div style={{ position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 500,
              background: 'rgba(255,248,224,.96)', border: `1px solid #d0a020`, color: '#7a5000',
              padding: '5px 12px', fontSize: 11.5, borderRadius: 3 }}>
              ⚠️ {tr('carteEncoreDesSommets')}
            </div>
          )}

          <div style={{ position: 'absolute', bottom: 64, right: 16, zIndex: 500, color: C_RED, display: 'none' }} />
        </div>
      )}
    </div>
  );
}

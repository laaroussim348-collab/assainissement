// ============================================================
//  CarteFavorabilite.js — Carte de la grille de favorabilité (étape 7) :
//  cellules colorées par classe (1..5) + points classés numérotés, avec
//  export PNG (cartouche : titre, échelle, légende, avertissement §5).
//  ─────────────────────────────────────────────────────────────
//  RÉUTILISE le même fond de carte ET le même compositeur d'export que
//  CarteTerrain.js (carteBase.js) — §2/§8 : jamais un second fond ni une
//  seconde logique d'export qui pourraient diverger du premier.
//
//  L'échelle de 5 couleurs (rouge → vert) est une convention SIG
//  ORDINALE usuelle, purement visuelle — elle ne prétend décrire aucune
//  probabilité (§5, voir l'encadré Avertissement affiché par App.js
//  au-dessus de tout onglet de résultat).
//
//  L'AVERTISSEMENT SCIENTIFIQUE EST BAKÉ DANS L'IMAGE ELLE-MÊME (comme
//  pour la carte du terrain) : une image exportée circule seule (message,
//  e-mail), détachée de l'application qui la nuance.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useI18n } from './useI18n';
import { creerCarte, creerCanvasExport, palierEchelle } from './carteBase.js';
import { versGeographique } from './calculations/grilleLocale.js';
import { exporterAvertissementTexte } from './Avertissement';
import { downloadChartCanvas, C_BLUE, C_BORDER } from './ui';

const COULEURS_CLASSE = { 1: '#c0392b', 2: '#e08030', 3: '#e0c030', 4: '#8ec020', 5: '#2a8f4a' };

function couleurDeScore(score) {
  const c = Math.round(Math.min(5, Math.max(1, score)));
  return COULEURS_CLASSE[c];
}

function iconeRang(rang) {
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50%;background:#1a4a8a;border:2px solid #fff;`
      + `box-shadow:0 0 3px rgba(0,0,0,.6);color:#fff;font:700 11px Arial,sans-serif;`
      + `display:flex;align-items:center;justify-content:center;line-height:1">${rang}</div>`,
    iconSize: [22, 22], iconAnchor: [11, 11],
  });
}

/**
 * Cartouche dessinée par-dessus l'export : titre, légende des 5 classes,
 * échelle graphique, et l'avertissement scientifique (§5) — même
 * disposition générale que dessinerCartouche() de CarteTerrain.js.
 */
function dessinerCartoucheFavorabilite(ctx, map, rect, { titre, legendeTitre }) {
  // ── Titre ──
  ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const largeurTitre = ctx.measureText(titre).width;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillRect(rect.width / 2 - largeurTitre / 2 - 10, 8, largeurTitre + 20, 26);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillText(titre, rect.width / 2, 14);

  // ── Avertissement scientifique (bas de l'image, pleine largeur, §5) ──
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

  // ── Légende des 5 classes (bas-droite) ──
  const classes = [5, 4, 3, 2, 1];
  const hBloc = classes.length * 16 + 16 + 16;
  const lx = rect.width - 190, ly = yEchelle - hBloc + 4;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillRect(lx - 10, ly - 8, 180, hBloc);
  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  wrapText(ctx, legendeTitre, lx, ly - 6, 170, 12);
  classes.forEach((classe, i) => {
    const iy = ly + 22 + i * 16;
    ctx.fillStyle = COULEURS_CLASSE[classe]; ctx.fillRect(lx, iy, 14, 10);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.strokeRect(lx, iy, 14, 10);
    ctx.fillStyle = '#1a1a1a'; ctx.font = '10.5px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(String(classe), lx + 20, iy + 5);
  });
}

/** Texte multi-lignes borné en largeur — utilisé pour le titre de légende,
 *  potentiellement long selon la langue (ex. arabe, espagnol). */
function wrapText(ctx, texte, x, y, largeurMax, hauteurLigne) {
  const mots = texte.split(' ');
  let ligne = '';
  let ligneY = y;
  for (const mot of mots) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (ctx.measureText(essai).width > largeurMax && ligne) {
      ctx.fillText(ligne, x, ligneY);
      ligne = mot;
      ligneY += hauteurLigne;
    } else {
      ligne = essai;
    }
  }
  if (ligne) ctx.fillText(ligne, x, ligneY);
}

/**
 * @param {object} grille  grille de calcul (grilleMnt.js)
 * @param {Float64Array} score  sortie de favorabilite.combinerFavorabilite
 * @param {{rang:number, lat:number, lon:number, score:number}[]} meilleursPoints
 * @param {string} [titre]  titre affiché dans la cartouche d'export
 */
export default function CarteFavorabilite({ grille, score, meilleursPoints, titre }) {
  const { t } = useI18n();
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const [exportMsg, setExportMsg] = useState(null);

  useEffect(() => {
    if (!divRef.current || !grille) return undefined;
    const { map } = creerCarte(divRef.current, { interactive: true });
    mapRef.current = map;
    const groupe = L.featureGroup().addTo(map);

    const demiCell = grille.cellsize_m / 2;
    for (let i = 0; i < grille.nbLignes; i++) {
      const y = grille.ymin + i * grille.cellsize_m;
      for (let j = 0; j < grille.nbColonnes; j++) {
        const idx = i * grille.nbColonnes + j;
        const s = score[idx];
        if (!Number.isFinite(s)) continue;
        const x = grille.xmin + j * grille.cellsize_m;
        const coin1 = versGeographique(x - demiCell, y - demiCell, grille.origine);
        const coin2 = versGeographique(x + demiCell, y + demiCell, grille.origine);
        L.rectangle([[coin1.lat, coin1.lon], [coin2.lat, coin2.lon]], {
          stroke: false, fillColor: couleurDeScore(s), fillOpacity: 0.55,
        }).addTo(groupe).bindTooltip(s.toFixed(2), { direction: 'top', sticky: true });
      }
    }

    meilleursPoints.forEach((p) => {
      L.marker([p.lat, p.lon], { icon: iconeRang(p.rang) }).addTo(groupe)
        .bindTooltip(`#${p.rang} — ${p.score.toFixed(2)}`);
    });

    const bounds = groupe.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });

    return () => { map.remove(); mapRef.current = null; };
  }, [grille, score, meilleursPoints]);

  function exporterImage() {
    const map = mapRef.current;
    const div = divRef.current;
    if (!map || !div) return;
    try {
      const { canvas, ctx, rect } = creerCanvasExport(div);
      dessinerCartoucheFavorabilite(ctx, map, rect, {
        titre: titre || t('mSansTitre'),
        legendeTitre: t('resultatsLegendeTitre'),
      });
      downloadChartCanvas(canvas, `favorabilite${titre ? '-' + titre.replace(/\s+/g, '_') : ''}.png`,
        (msg) => setExportMsg(msg));
    } catch {
      setExportMsg(t('carteExportErreur'));
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={divRef} style={{ width: '100%', height: 420, border: '1px solid #bbb' }} />
      <button onClick={exporterImage}
        style={{ position: 'absolute', top: 8, right: 8, zIndex: 500, padding: '5px 10px', fontSize: 11,
          cursor: 'pointer', background: '#fff', border: `1px solid ${C_BORDER}`, borderRadius: 3, color: C_BLUE,
          display: 'flex', alignItems: 'center', gap: 5 }}>
        <i className="ti ti-download" style={{ fontSize: 13 }} />{t('resultatsExporterPng')}
      </button>
      {exportMsg && (
        <div style={{ position: 'absolute', top: 40, right: 8, zIndex: 500, fontSize: 10.5,
          background: '#fff', border: `1px solid ${C_BORDER}`, padding: '3px 8px', borderRadius: 3 }}>
          {exportMsg}
        </div>
      )}
    </div>
  );
}

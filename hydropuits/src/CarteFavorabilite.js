// ============================================================
//  CarteFavorabilite.js — Carte de la grille de favorabilité (étape 7) :
//  cellules colorées par classe (1..5) + points classés numérotés.
//  ─────────────────────────────────────────────────────────────
//  RÉUTILISE le même fond de carte que CarteTerrain.js (carteBase.js) —
//  §2/§8 : jamais un second fond qui pourrait diverger du premier.
//
//  L'échelle de 5 couleurs (rouge → vert) est une convention SIG
//  ORDINALE usuelle, purement visuelle — elle ne prétend décrire aucune
//  probabilité (§5, voir l'encadré Avertissement affiché par App.js
//  au-dessus de cet onglet).
// ============================================================
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { creerCarte } from './carteBase.js';
import { versGeographique } from './calculations/grilleLocale.js';

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
 * @param {object} grille  grille de calcul (grilleMnt.js)
 * @param {Float64Array} score  sortie de favorabilite.combinerFavorabilite
 * @param {{rang:number, lat:number, lon:number, score:number}[]} meilleursPoints
 */
export default function CarteFavorabilite({ grille, score, meilleursPoints }) {
  const divRef = useRef(null);

  useEffect(() => {
    if (!divRef.current || !grille) return undefined;
    const { map } = creerCarte(divRef.current, { interactive: true });
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

    return () => map.remove();
  }, [grille, score, meilleursPoints]);

  return <div ref={divRef} style={{ width: '100%', height: 420, border: '1px solid #bbb' }} />;
}

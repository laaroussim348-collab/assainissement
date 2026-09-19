// ============================================================
//  RapportTab.js — Onglet « Rapport » : synthèse imprimable du terrain,
//  des critères utilisés, des meilleurs emplacements et du facteur le
//  plus influent, avec carte exportable en PNG (§6, §8).
//  ─────────────────────────────────────────────────────────────
//  Réutilise le DERNIER résultat calculé dans l'onglet Résultats
//  (resultatCalcul, remonté à App.js) — même donnée que Résultats et
//  Sensibilité, jamais un recalcul indépendant qui pourrait diverger.
//
//  Impression : le bouton « Imprimer » de la barre d'outils (déjà
//  présent, window.print()) s'applique à l'onglet affiché — pas de
//  mécanisme d'export séparé à maintenir en double.
// ============================================================
import { useI18n } from '../useI18n';
import { validerPolygone } from '../calculations/polygone.js';
import { airePerimetreGeodesiques } from '../calculations/geodesie.js';
import { analyserSensibilite } from '../calculations/sensibilite.js';
import { NOM_CLE_FACTEUR } from './CriteresTab.js';
import CarteFavorabilite from '../CarteFavorabilite.js';
import { C_BLUE, C_BORDER, Panel, NoData } from '../ui';

export default function RapportTab({ etat, majEtat, resultatCalcul }) {
  const { t, tp } = useI18n();

  const sommets = etat.sommets || [];
  const validation = sommets.length >= 3 ? validerPolygone(sommets, { normaliser: false }) : null;
  const terrainPret = !!validation?.valide;

  if (!terrainPret || !resultatCalcul) {
    return <NoData title={t('videRapportTitre')} hint={t('videRapportHint')} />;
  }

  const titre = etat.nomTerrain || t('mSansTitre');
  const mesures = airePerimetreGeodesiques(validation.sommets);
  const idsActifs = Object.keys(resultatCalcul.poids).filter((id) => resultatCalcul.poids[id] > 0)
    .sort((a, b) => resultatCalcul.poids[b] - resultatCalcul.poids[a]);
  const meilleur = resultatCalcul.meilleursPoints[0];

  const analyse = analyserSensibilite(resultatCalcul.grille, resultatCalcul.grillesClasses, resultatCalcul.poids, resultatCalcul.grille.masque);
  const facteurLePlusInfluent = !analyse.insuffisant ? analyse.resultats[0] : null;

  return (
    <div>
      <Panel title={titre} icon="file-text" accent={C_BLUE}>
        <p style={{ fontSize: 11.5, lineHeight: 1.7 }}>
          {tp('rapportResumeTerrain', { aire: mesures.aire_ha.toFixed(2), perimetre: Math.round(mesures.perimetre_m), sommets: validation.sommets.length })}
        </p>
        {meilleur && (
          <p style={{ fontSize: 11.5, lineHeight: 1.7 }}>
            {tp('rapportResumeMeilleurPoint', { score: meilleur.score.toFixed(2), lat: meilleur.lat.toFixed(6), lon: meilleur.lon.toFixed(6) })}
          </p>
        )}
        {facteurLePlusInfluent && (
          <p style={{ fontSize: 11.5, lineHeight: 1.7 }}>
            {tp('rapportResumeSensibilite', { facteur: t(NOM_CLE_FACTEUR[facteurLePlusInfluent.id]) })}
          </p>
        )}
      </Panel>

      <Panel title={t('resultatsLegendeTitre')} icon="map" accent={C_BLUE} noPad>
        <CarteFavorabilite grille={resultatCalcul.grille} score={resultatCalcul.score}
          meilleursPoints={resultatCalcul.meilleursPoints} titre={titre} />
      </Panel>

      <Panel title={t('criteresPoidsTitre')} icon="scale" accent={C_BLUE}>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={{ padding: '4px 6px' }}>{t('sensibiliteColFacteur')}</th>
              <th style={{ padding: '4px 6px' }}>{t('sensibiliteColPoids')}</th>
            </tr>
          </thead>
          <tbody>
            {idsActifs.map((id) => (
              <tr key={id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 6px' }}>{t(NOM_CLE_FACTEUR[id])}</td>
                <td style={{ padding: '4px 6px' }}>{(resultatCalcul.poids[id] * 100).toFixed(1)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title={t('resultatsMeilleursPointsTitre')} icon="list-numbers" accent={C_BLUE}>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={{ padding: '4px 6px' }}>{t('resultatsColRang')}</th>
              <th style={{ padding: '4px 6px' }}>{t('resultatsColScore')}</th>
              <th style={{ padding: '4px 6px' }}>{t('resultatsColCoordonnees')}</th>
            </tr>
          </thead>
          <tbody>
            {resultatCalcul.meilleursPoints.map((p) => (
              <tr key={p.rang} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 6px' }}>{p.rang}</td>
                <td style={{ padding: '4px 6px' }}>{p.score.toFixed(2)}</td>
                <td style={{ padding: '4px 6px' }}>{p.lat.toFixed(6)}, {p.lon.toFixed(6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title={t('rapportObservationsTitre')} icon="notes" accent={C_BLUE}>
        <textarea value={etat.observations || ''} onChange={(e) => majEtat({ observations: e.target.value })}
          placeholder={t('rapportObservationsPlaceholder')}
          style={{ width: '100%', minHeight: 100, fontSize: 12, padding: 8, boxSizing: 'border-box',
            border: `1px solid ${C_BORDER}`, fontFamily: 'Arial,sans-serif', resize: 'vertical' }} />
      </Panel>
    </div>
  );
}

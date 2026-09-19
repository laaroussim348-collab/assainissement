// ============================================================
//  SensibiliteTab.js — Onglet « Sensibilité » : impact d'une variation
//  de ±20 % de chaque poids AHP sur le résultat (§3.4 : « analyse de
//  sensibilité obligatoire »).
//  ─────────────────────────────────────────────────────────────
//  Réutilise le DERNIER résultat calculé dans l'onglet Résultats
//  (resultatCalcul, remonté à App.js) — pas de second calcul indépendant
//  qui pourrait en venir à afficher un résultat différent. Si aucun
//  calcul n'a encore été lancé, le dit explicitement (§5) plutôt que
//  d'afficher un graphique vide.
// ============================================================
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useI18n } from '../useI18n';
import { validerPolygone } from '../calculations/polygone.js';
import { analyserSensibilite } from '../calculations/sensibilite.js';
import { NOM_CLE_FACTEUR } from './CriteresTab.js';
import { C_BLUE, C_TEAL, C_RED, Panel, Alert, NoData } from '../ui';

export default function SensibiliteTab({ etat, resultatCalcul }) {
  const { t, tp } = useI18n();

  const sommets = etat.sommets || [];
  const validation = sommets.length >= 3 ? validerPolygone(sommets, { normaliser: false }) : null;
  const terrainPret = !!validation?.valide;

  if (!terrainPret || !resultatCalcul) {
    return <NoData title={t('videSensibiliteTitre')} hint={t('videSensibiliteHint')} />;
  }

  const analyse = analyserSensibilite(resultatCalcul.grille, resultatCalcul.grillesClasses, resultatCalcul.poids, resultatCalcul.grille.masque);
  const amplitudePourcent = (analyse.amplitude * 100).toFixed(0);

  if (analyse.insuffisant) {
    return <Alert tone="warn">{t('sensibiliteInsuffisant')}</Alert>;
  }

  const donneesGraphique = analyse.resultats.map((r) => ({
    nom: t(NOM_CLE_FACTEUR[r.id]),
    ecart: Number(r.ecartMoyenMax.toFixed(4)),
  }));

  return (
    <div>
      <Alert tone="info">{tp('sensibiliteIntro', { amplitude: amplitudePourcent })}</Alert>

      <Panel title={t('sensibiliteGraphiqueTitre')} icon="chart-bar" accent={C_BLUE}>
        <div style={{ width: '100%', height: Math.max(180, donneesGraphique.length * 42) }}>
          <ResponsiveContainer>
            <BarChart data={donneesGraphique} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10.5 }} />
              <YAxis type="category" dataKey="nom" width={170} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [v, t('sensibiliteEcartMoyenLabel')]} />
              <Bar dataKey="ecart" fill={C_BLUE} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title={t('sensibiliteTableauTitre')} icon="table" accent={C_BLUE}>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={{ padding: '4px 6px' }}>{t('sensibiliteColFacteur')}</th>
              <th style={{ padding: '4px 6px' }}>{t('sensibiliteColPoids')}</th>
              <th style={{ padding: '4px 6px' }}>{tp('sensibiliteColHausse', { amplitude: amplitudePourcent })}</th>
              <th style={{ padding: '4px 6px' }}>{tp('sensibiliteColBaisse', { amplitude: amplitudePourcent })}</th>
              <th style={{ padding: '4px 6px' }}>{t('sensibiliteColMeilleurPoint')}</th>
            </tr>
          </thead>
          <tbody>
            {analyse.resultats.map((r) => {
              const stable = r.hausse.meilleurPointIdentique && r.baisse.meilleurPointIdentique;
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '4px 6px' }}>{t(NOM_CLE_FACTEUR[r.id])}</td>
                  <td style={{ padding: '4px 6px' }}>{(r.poidsReference * 100).toFixed(1)} %</td>
                  <td style={{ padding: '4px 6px' }}>{r.hausse.ecartMoyenAbsolu.toFixed(3)}</td>
                  <td style={{ padding: '4px 6px' }}>{r.baisse.ecartMoyenAbsolu.toFixed(3)}</td>
                  <td style={{ padding: '4px 6px', color: stable ? C_TEAL : C_RED, fontWeight: 600 }}>
                    {stable ? t('sensibiliteStable') : t('sensibiliteInstable')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

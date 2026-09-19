// ============================================================
//  CriteresTab.js — Onglet « Critères » : activation des facteurs,
//  seuils de reclassement éditables, matrice de comparaisons AHP avec
//  ratio de cohérence (CR) recalculé en direct (§3.4, §6).
//  ─────────────────────────────────────────────────────────────
//  Récupère les données déjà téléchargées (étape 4, via le cache
//  serveur — voir services/pipelineClient.js) pour proposer des seuils
//  par défaut CALCULÉS sur le terrain réel (quantiles), jamais inventés
//  — voir tabs/facteursCriteres.js pour l'ordre de priorité exact.
// ============================================================
import { useState } from 'react';
import { useI18n } from '../useI18n';
import { validerPolygone } from '../calculations/polygone.js';
import { executerPipelineFacteurs } from '../services/pipelineClient.js';
import { IDS_FACTEURS, evaluerCoherence, pairesLesPlusIncoherentes, SEUIL_CR_MAX } from '../calculations/ahp.js';
import { RAYON_DENSITE_M_DEFAUT } from '../calculations/facteurs.js';
import { actifsEffectifs, sensEffectif, seuilsEffectifs, matriceEffective } from './facteursCriteres.js';
import { C_BLUE, C_TEAL, C_AMBER, C_RED, Panel, Alert, NoData, Field } from '../ui';

export const NOM_CLE_FACTEUR = {
  pente: 'criteresNomFacteurPente',
  twi: 'criteresNomFacteurTwi',
  densiteDrainage: 'criteresNomFacteurDensiteDrainage',
  densiteLineaments: 'criteresNomFacteurDensiteLineaments',
  distanceCoursEau: 'criteresNomFacteurDistanceCoursEau',
  courbure: 'criteresNomFacteurCourbure',
  lithologieSol: 'criteresNomFacteurLithologieSol',
  pluviometrie: 'criteresNomFacteurPluviometrie',
};

const UNITE_FACTEUR = {
  pente: '%', twi: '', densiteDrainage: 'km/km²', densiteLineaments: 'km/km²',
  distanceCoursEau: 'm', courbure: '1/m', lithologieSol: '% sable', pluviometrie: 'mm/an',
};

// Échelle de Saaty encodée en un seul entier signé pour un <select> par
// paire : positif = le facteur de GAUCHE est le plus important, négatif
// = celui de DROITE (valeur réelle = 1/|code|), jamais 0 (l'égalité est
// le code +1 par convention, comme sur l'échelle de Saaty elle-même).
const OPTIONS_SAATY = [-9, -8, -7, -6, -5, -4, -3, -2, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function CriteresTab({ etat, majEtat }) {
  const { t, tp } = useI18n();
  const [construction, setConstruction] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(null);

  const sommets = etat.sommets || [];
  const validation = sommets.length >= 3 ? validerPolygone(sommets, { normaliser: false }) : null;
  const terrainPret = !!validation?.valide;

  if (!terrainPret) {
    return <NoData title={t('videCriteresTitre')} hint={t('videCriteresHint')} />;
  }

  function lancerRecuperation() {
    setChargement(true);
    setErreur(null);
    executerPipelineFacteurs(validation.sommets, {
      rayonDensite_m: etat.facteurs?.rayonDensite_m || RAYON_DENSITE_M_DEFAUT,
    }).then((c) => { setConstruction(c); setChargement(false); })
      .catch((e) => { setErreur(e.message); setChargement(false); });
  }

  const actifs = actifsEffectifs(etat);
  const matrice = matriceEffective(etat);
  const { poids, cr, coherent } = evaluerCoherence(matrice);
  const paires = !coherent ? pairesLesPlusIncoherentes(matrice, poids) : [];

  function activerFacteur(id, actif) {
    const nouveaux = actif ? [...new Set([...actifs, id])] : actifs.filter((x) => x !== id);
    majEtat({ facteurs: { ...etat.facteurs, actifs: nouveaux } });
  }

  function definirSeuil(id, index, valeurTexte) {
    const base = seuilsEffectifs(etat, id, construction?.grillesFacteurs, construction?.grille?.masque) || [0, 0, 0, 0];
    const nouveaux = [...base];
    nouveaux[index] = Number(valeurTexte);
    majEtat({ facteurs: { ...etat.facteurs, seuils: { ...(etat.facteurs?.seuils || {}), [id]: nouveaux } } });
  }

  function definirSens(id, sens) {
    majEtat({ facteurs: { ...etat.facteurs, sens: { ...(etat.facteurs?.sens || {}), [id]: sens } } });
  }

  function definirValeurPaire(i, j, code) {
    const valeur = code > 0 ? code : 1 / (-code);
    const nouvelle = matrice.map((l) => [...l]);
    nouvelle[i][j] = valeur;
    nouvelle[j][i] = 1 / valeur;
    majEtat({ matriceAhp: nouvelle });
  }

  return (
    <div>
      <Alert tone="info">{t('criteresIntro')}</Alert>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={lancerRecuperation} disabled={chargement}
          style={{ padding: '6px 14px', fontSize: 12, cursor: chargement ? 'not-allowed' : 'pointer',
            background: chargement ? '#ccc' : C_BLUE, color: '#fff', border: 'none', borderRadius: 3, height: 28 }}>
          {chargement ? t('criteresChargementDonnees') : t('criteresBoutonRecalculer')}
        </button>
        <div style={{ width: 160 }}>
          <Field label={t('criteresRayonDensiteLabel')} unite="m" type="number"
            value={etat.facteurs?.rayonDensite_m || RAYON_DENSITE_M_DEFAUT}
            onChange={(v) => majEtat({ facteurs: { ...etat.facteurs, rayonDensite_m: Number(v) } })} />
        </div>
      </div>

      {erreur && <Alert tone="error">{erreur}</Alert>}

      {construction?.avertissements?.length > 0 && (
        <Panel title={t('criteresAvertissementsTitre')} icon="alert-triangle" accent={C_AMBER}>
          {construction.avertissements.map((a, i) => <Alert key={i} tone="warn">{tp(a.cle, a.params || {})}</Alert>)}
        </Panel>
      )}

      <Panel title={t('criteresPoidsTitre')} icon="scale" accent={coherent ? C_TEAL : C_RED}
        headerRight={
          <span style={{ fontSize: 11, fontWeight: 700, color: coherent ? C_TEAL : C_RED }}>
            {coherent ? t('criteresCrCoherent') : t('criteresCrIncoherent')}
            {' — '}{tp('criteresCrDetail', { cr: cr.toFixed(3), seuil: SEUIL_CR_MAX.toFixed(2) })}
          </span>
        }>
        {!coherent && paires.length > 0 && (
          <Alert tone="error">
            {tp('criteresPairesProblematiques', {
              paires: paires.map((p) => `${t(NOM_CLE_FACTEUR[IDS_FACTEURS[p.i - 1]])} / ${t(NOM_CLE_FACTEUR[IDS_FACTEURS[p.j - 1]])}`).join(', '),
            })}
          </Alert>
        )}
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <tbody>
            {IDS_FACTEURS.map((id, i) => (
              <tr key={id} style={{ opacity: actifs.includes(id) ? 1 : 0.4 }}>
                <td style={{ padding: '3px 6px' }}>{t(NOM_CLE_FACTEUR[id])}</td>
                <td style={{ padding: '3px 6px', width: 70, textAlign: 'right' }}>{(poids[i] * 100).toFixed(1)} %</td>
                <td style={{ padding: '3px 6px', width: 140 }}>
                  <div style={{ height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, poids[i] * 100 * 2)}%`, height: '100%', background: coherent ? C_BLUE : '#c99' }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title={t('criteresMatriceTitre')} icon="grid-dots" accent={C_BLUE}>
        <table style={{ width: '100%', fontSize: 10.5, borderCollapse: 'collapse' }}>
          <tbody>
            {IDS_FACTEURS.map((idA, i) => IDS_FACTEURS.slice(i + 1).map((idB, k) => {
              const j = i + 1 + k;
              const valeur = matrice[i][j];
              const code = valeur >= 1 ? Math.round(valeur) : -Math.round(1 / valeur);
              return (
                <tr key={`${i}-${j}`}>
                  <td style={{ padding: '2px 6px', textAlign: 'right', width: '42%' }}>{t(NOM_CLE_FACTEUR[idA])}</td>
                  <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                    <select value={code} onChange={(e) => definirValeurPaire(i, j, Number(e.target.value))}
                      style={{ fontSize: 10.5, padding: '1px 2px' }}>
                      {OPTIONS_SAATY.map((c) => <option key={c} value={c}>{c > 0 ? c : `1/${-c}`}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '2px 6px', width: '42%' }}>{t(NOM_CLE_FACTEUR[idB])}</td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </Panel>

      {IDS_FACTEURS.map((id) => {
        const disponible = construction ? construction.disponibilite[id] : true;
        const actif = actifs.includes(id);
        const seuils = seuilsEffectifs(etat, id, construction?.grillesFacteurs, construction?.grille?.masque) || [null, null, null, null];
        const sens = sensEffectif(etat, id);
        return (
          <Panel key={id} title={t(NOM_CLE_FACTEUR[id])} icon="adjustments" accent={actif ? C_BLUE : '#999'}
            headerRight={
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                <input type="checkbox" checked={actif} disabled={construction ? !disponible : false}
                  onChange={(e) => activerFacteur(id, e.target.checked)} />
                {t('criteresActifLabel')}
                {construction && !disponible && <span style={{ color: C_RED }}> ({t('criteresIndisponibleBadge')})</span>}
              </label>
            }>
            <div style={{ fontSize: 10.5, color: '#666', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              {sens === 'croissant' ? t('criteresSensCroissant') : t('criteresSensDecroissant')}
              <button onClick={() => definirSens(id, sens === 'croissant' ? 'decroissant' : 'croissant')}
                style={{ fontSize: 10, padding: '1px 6px', cursor: 'pointer' }}>⇅</button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[0, 1, 2, 3].map((idx) => (
                <div key={idx} style={{ width: 90 }}>
                  <Field label={tp('criteresSeuilN', { n: idx + 1 })} unite={UNITE_FACTEUR[id]} type="number"
                    value={seuils[idx] ?? ''} onChange={(v) => definirSeuil(id, idx, v)} />
                </div>
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

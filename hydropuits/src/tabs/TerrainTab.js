// ============================================================
//  TerrainTab.js — Onglet « Terrain » : saisie du polygone.
//  ─────────────────────────────────────────────────────────────
//  Les TROIS modes de saisie du cahier des charges §3.2 —
//  tracé à la carte, import de fichier, saisie au clavier — alimentent
//  la MÊME structure de données (`etat.sommets`) et sont donc
//  totalement interchangeables : un polygone importé reste modifiable à
//  la souris, un polygone tracé reste corrigeable au clavier. C'est
//  volontairement le même tableau qui est édité, jamais une copie par
//  mode, pour qu'aucune conversion ne puisse se perdre en route.
//
//  Le choix du mode n'est donc qu'un choix d'OUTIL, pas de format : on
//  peut en changer à tout moment sans rien perdre. L'UI le dit
//  explicitement, parce que la disposition en onglets fait spontanément
//  croire le contraire.
// ============================================================
import { useMemo, useRef, useState } from 'react';
import { useI18n } from '../useI18n';
import CarteTerrain from '../CarteTerrain';
import { validerPolygone } from '../calculations/polygone.js';
import { lireCsv, lireXlsx } from '../services/importTerrain.js';
import {
  C_BLUE, C_TEAL, C_AMBER, C_RED, C_BORDER, C_HEADER,
  TH, TD, Panel, Field, Alert, f6,
} from '../ui';

/**
 * Systèmes de coordonnées proposés à la saisie et à l'import.
 *
 * ⚠️ ÉTAT : seul le WGS84 est opérationnel. Les sept autres systèmes
 * (UTM WGS84, les quatre zones Merchich, UTM Point 58, UTM Nord Sahara
 * 59) sont ceux de src/calculations/coordonnees.js de HydroCrue, que le
 * cahier des charges §2.2 impose de réutiliser SANS LE MODIFIER et qui
 * n'a pas encore été fourni. Ils apparaissent donc désactivés, avec la
 * raison affichée — plutôt que d'être masqués (l'utilisateur croirait
 * qu'ils n'existent pas) ou, pire, réimplémentés à la hâte (ils
 * divergeraient de HydroCrue, qui est la référence).
 */
const SYSTEMES = [
  { id: 'wgs84', cle: 'sysWgs84', disponible: true },
  { id: 'utm-wgs84', cle: 'sysUtmWgs84', disponible: false },
  { id: 'merchich-nord', cle: 'sysMerchichNord', disponible: false },
  { id: 'merchich-sud', cle: 'sysMerchichSud', disponible: false },
  { id: 'merchich-sahara-nord', cle: 'sysMerchichSaharaNord', disponible: false },
  { id: 'merchich-sahara-sud', cle: 'sysMerchichSaharaSud', disponible: false },
  { id: 'utm-point58', cle: 'sysUtmPoint58', disponible: false },
  { id: 'utm-nordsahara59', cle: 'sysUtmNordSahara59', disponible: false },
];

const MODES = [
  { id: 'carte', icone: 'map-pin', cle: 'terrainModeCarte' },
  { id: 'import', icone: 'file-import', cle: 'terrainModeImport' },
  { id: 'clavier', icone: 'keyboard', cle: 'terrainModeClavier' },
];

export default function TerrainTab({ etat, majEtat, afficherToast }) {
  const { t, tp } = useI18n();
  const [mode, setMode] = useState('carte');
  const [importResultat, setImportResultat] = useState(null);
  const [importErreur, setImportErreur] = useState(null);
  const fichierRef = useRef(null);

  const sommets = etat.sommets || [];

  // La validation complète est en O(n²) (détection des doublons) : on ne
  // la relance que quand les sommets changent réellement, pas à chaque
  // rendu. Pendant un glisser de sommet, la carte affiche sa propre
  // mesure en O(n) et n'appelle ceci qu'au relâchement.
  const validation = useMemo(
    () => (sommets.length > 0 ? validerPolygone(sommets, { normaliser: false }) : null),
    [sommets],
  );

  function changerSommets(nouveaux) {
    majEtat({ sommets: nouveaux });
  }

  function modifierSommet(index, champ, valeur) {
    const v = parseFloat(String(valeur).replace(',', '.'));
    const copie = [...sommets];
    copie[index] = { ...copie[index], [champ]: Number.isFinite(v) ? v : valeur };
    changerSommets(copie);
  }

  function ajouterSommet() {
    // Le nouveau sommet reprend les coordonnées du dernier : on le
    // déplace ensuite, ce qui est plus rapide que de tout retaper, et
    // évite un sommet à (0,0) au milieu de l'Atlantique.
    const dernier = sommets[sommets.length - 1] || { lat: 31.6, lon: -8.0 };
    changerSommets([...sommets, { lat: dernier.lat, lon: dernier.lon }]);
  }

  function supprimerSommet(index) {
    changerSommets(sommets.filter((_, i) => i !== index));
  }

  function normaliser() {
    const r = validerPolygone(sommets, { normaliser: true });
    if (r.sommets.length > 0) changerSommets(r.sommets);
    afficherToast?.(t('terrainNormalise'));
  }

  async function choisirFichier(e) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setImportErreur(null);
    setImportResultat(null);
    const nom = fichier.name.toLowerCase();
    try {
      if (nom.endsWith('.xlsx') || nom.endsWith('.xls')) {
        // Refus explicite plutôt que repli silencieux (§5) : voir
        // services/importTerrain.js, lireXlsx().
        lireXlsx();
        return;
      }
      const texte = await fichier.text();
      const r = lireCsv(texte);
      if (r.terrains.length === 0) {
        setImportErreur({ cle: 'impErrAucunTerrain' });
        return;
      }
      setImportResultat({ ...r, nomFichier: fichier.name });
    } catch (err) {
      setImportErreur(err.message === 'XLSX_NON_DISPONIBLE'
        ? { cle: 'impErrXlsxIndisponible' }
        : { cle: 'impErrFichierIllisible', params: { detail: err.message } });
    } finally {
      // Permet de re-sélectionner le même fichier après correction.
      if (fichierRef.current) fichierRef.current.value = '';
    }
  }

  function appliquerTerrainImporte(terrain) {
    // Le système de coordonnées choisi décide de l'interprétation de
    // (x, y). Tant que coordonnees.js n'est pas fourni, seul le WGS84
    // est proposé, et la convention est x = longitude, y = latitude —
    // affichée dans l'aide de l'onglet pour lever toute ambiguïté.
    const nouveaux = terrain.sommets.map(s => ({ lat: s.y, lon: s.x }));
    majEtat({ sommets: nouveaux, nomTerrain: terrain.nom || etat.nomTerrain });
    setImportResultat(null);
    afficherToast?.(tp('terrainImporteToast', { nombre: nouveaux.length }));
  }

  /** Rend une liste de messages {cle, params} produits par les modules de calcul. */
  const Messages = ({ liste, tonalite }) => (
    <>
      {liste.map((m, i) => (
        <Alert key={`${m.cle}-${i}`} tone={tonalite}>{tp(m.cle, m.params)}</Alert>
      ))}
    </>
  );

  const mesures = validation?.mesures;

  return (
    <div>
      <Panel title={t('terrainPanelTitre')} icon="polygon">
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 260px', minWidth: 220 }}>
            <Field label={t('terrainNom')} value={etat.nomTerrain || ''}
              onChange={v => majEtat({ nomTerrain: v })}
              placeholder={t('terrainNomPlaceholder')} />
          </div>
          <div style={{ flex: '1 1 260px', minWidth: 220, marginBottom: 6 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#333', marginBottom: 2, fontWeight: 500 }}>
              {t('terrainSysteme')}
            </label>
            <select value={etat.systemeCoordonnees || 'wgs84'}
              onChange={e => majEtat({ systemeCoordonnees: e.target.value })}
              style={{ width: '100%', boxSizing: 'border-box', height: 24, padding: '0 4px',
                border: `1px solid ${C_BORDER}`, borderRadius: 1, fontSize: 12, background: '#fff' }}>
              {SYSTEMES.map(s => (
                <option key={s.id} value={s.id} disabled={!s.disponible}>
                  {t(s.cle)}{s.disponible ? '' : ` — ${t('sysIndisponible')}`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Alert tone="info">{t('sysSeulWgs84')}</Alert>
      </Panel>

      {/* ── Choix du mode de saisie ── */}
      <Panel title={t('terrainModesTitre')} icon="edit">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{ padding: '7px 14px', fontSize: 12, cursor: 'pointer', borderRadius: 3,
                fontWeight: mode === m.id ? 700 : 400,
                background: mode === m.id ? C_BLUE : '#fff',
                color: mode === m.id ? '#fff' : '#333',
                border: `1px solid ${mode === m.id ? C_BLUE : C_BORDER}`,
                display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className={`ti ti-${m.icone}`} style={{ fontSize: 14 }} />{t(m.cle)}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: '#666', margin: '0 0 4px', lineHeight: 1.6 }}>
          {t('terrainModesInterchangeables')}
        </p>

        {/* ── Mode 1 : tracé à la carte ── */}
        {mode === 'carte' && (
          <>
            <p style={{ fontSize: 11.5, color: '#444', margin: '8px 0 0', lineHeight: 1.6 }}>
              {t('terrainModeCarteHint')}
            </p>
            <CarteTerrain
              sommets={sommets}
              onChangerSommets={changerSommets}
              nomTerrain={etat.nomTerrain}
              mesures={mesures}
              onImageExportee={(dataUrl) => majEtat({ imageCarte: dataUrl })}
            />
          </>
        )}

        {/* ── Mode 2 : import de fichier ── */}
        {mode === 'import' && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 11.5, color: '#444', margin: '0 0 8px', lineHeight: 1.6 }}>
              {t('terrainModeImportHint')}
            </p>
            <div style={{ background: C_HEADER, border: `1px solid ${C_BORDER}`, padding: '8px 12px',
              fontSize: 11, marginBottom: 10, lineHeight: 1.7 }}>
              <b>{t('terrainImportFormatTitre')}</b><br />
              {t('terrainImportFormatA')}<br />
              {t('terrainImportFormatB')}<br />
              {t('terrainImportFormatC')}<br />
              <span style={{ color: '#666' }}>{t('terrainImportFormatNote')}</span>
            </div>
            <input ref={fichierRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls"
              onChange={choisirFichier}
              style={{ fontSize: 12, marginBottom: 8 }} />

            {importErreur && <Alert tone="error">{tp(importErreur.cle, importErreur.params)}</Alert>}

            {importResultat && (
              <div style={{ border: `1px solid ${C_BORDER}`, padding: 10, marginTop: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C_BLUE, marginBottom: 6 }}>
                  {tp('terrainImportLu', { fichier: importResultat.nomFichier, nombre: importResultat.terrains.length })}
                </div>
                {importResultat.enTeteIgnoree && <Alert tone="info">{t('impAvtEnTeteIgnoree')}</Alert>}
                {importResultat.anomalies.length > 0 && (
                  <Alert tone="warn">
                    <b>{tp('impAvtAnomalies', { nombre: importResultat.anomalies.length })}</b>
                    <ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
                      {importResultat.anomalies.slice(0, 12).map((a, i) => (
                        <li key={i}>{tp('impLigne', { ligne: a.ligne })} — {tp(a.cle, a.params)}</li>
                      ))}
                      {importResultat.anomalies.length > 12 && <li>…</li>}
                    </ul>
                  </Alert>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                  <thead>
                    <tr>
                      <th style={TH}>{t('terrainImportNom')}</th>
                      <th style={TH}>{t('terrainNbSommets')}</th>
                      <th style={TH}>{t('terrainImportAction')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResultat.terrains.map((ter, i) => (
                      <tr key={i}>
                        <td style={TD}>{ter.nom || <i style={{ color: '#888' }}>{t('terrainImportSansNom')}</i>}</td>
                        <td style={TD}>{ter.sommets.length}</td>
                        <td style={TD}>
                          <button onClick={() => appliquerTerrainImporte(ter)}
                            disabled={ter.sommets.length < 3}
                            style={{ padding: '2px 10px', fontSize: 11, cursor: ter.sommets.length < 3 ? 'not-allowed' : 'pointer',
                              background: ter.sommets.length < 3 ? '#eee' : C_TEAL, color: ter.sommets.length < 3 ? '#999' : '#fff',
                              border: 'none', borderRadius: 2 }}>
                            {t('terrainImportUtiliser')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Mode 3 : saisie au clavier ── */}
        {mode === 'clavier' && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 11.5, color: '#444', margin: '0 0 8px', lineHeight: 1.6 }}>
              {t('terrainModeClavierHint')}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: 50 }}>{t('terrainTabSommet')}</th>
                  <th style={TH}>{t('terrainTabLat')}</th>
                  <th style={TH}>{t('terrainTabLon')}</th>
                  <th style={TH}>{t('terrainTabWgs84')}</th>
                  <th style={{ ...TH, width: 60 }}>{t('terrainTabAction')}</th>
                </tr>
              </thead>
              <tbody>
                {sommets.map((s, i) => (
                  <tr key={i}>
                    <td style={{ ...TD, fontWeight: 700, color: C_BLUE }}>{i + 1}</td>
                    <td style={TD}>
                      <input type="text" value={s.lat} step="0.000001"
                        onChange={e => modifierSommet(i, 'lat', e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', height: 22, padding: '0 4px',
                          border: `1px solid ${C_BORDER}`, fontSize: 11.5, textAlign: 'right' }} />
                    </td>
                    <td style={TD}>
                      <input type="text" value={s.lon} step="0.000001"
                        onChange={e => modifierSommet(i, 'lon', e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', height: 22, padding: '0 4px',
                          border: `1px solid ${C_BORDER}`, fontSize: 11.5, textAlign: 'right' }} />
                    </td>
                    {/* Conversion affichée en direct. En WGS84 elle est
                        l'identité ; la colonne existe déjà pour que le
                        branchement de coordonnees.js n'oblige pas à
                        redessiner le tableau. */}
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 10.5, color: '#555' }}>
                      {Number.isFinite(parseFloat(s.lat)) && Number.isFinite(parseFloat(s.lon))
                        ? `${f6(parseFloat(s.lat))}, ${f6(parseFloat(s.lon))}`
                        : <span style={{ color: C_RED }}>{t('terrainTabInvalide')}</span>}
                    </td>
                    <td style={TD}>
                      <button onClick={() => supprimerSommet(i)} title={t('terrainSupprimerSommet')}
                        style={{ padding: '1px 8px', fontSize: 11, cursor: 'pointer', background: '#fff',
                          border: `1px solid ${C_BORDER}`, borderRadius: 2, color: C_RED }}>✕</button>
                    </td>
                  </tr>
                ))}
                {sommets.length === 0 && (
                  <tr><td style={{ ...TD, color: '#888' }} colSpan={5}>{t('terrainAucunSommet')}</td></tr>
                )}
              </tbody>
            </table>
            <button onClick={ajouterSommet}
              style={{ marginTop: 8, padding: '5px 14px', fontSize: 12, cursor: 'pointer',
                background: C_TEAL, color: '#fff', border: 'none', borderRadius: 3 }}>
              + {t('terrainAjouterSommet')}
            </button>
          </div>
        )}
      </Panel>

      {/* ── Mesures et validation — visibles quel que soit le mode ── */}
      <Panel title={t('terrainMesuresTitre')} icon="ruler-measure"
        accent={validation && !validation.valide ? C_RED : C_TEAL}>
        {sommets.length === 0 && <p style={{ fontSize: 12, color: '#888', margin: 0 }}>{t('terrainAucunSommet')}</p>}

        {validation && validation.erreurs.length > 0 && <Messages liste={validation.erreurs} tonalite="error" />}
        {validation && validation.avertissements.length > 0 && <Messages liste={validation.avertissements} tonalite="warn" />}

        {mesures && (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12 }}>
            <div>
              <div style={{ fontSize: 10.5, color: '#666' }}>{t('terrainSurface')}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C_TEAL }}>
                {mesures.aire_ha.toFixed(4)} <span style={{ fontSize: 12, fontWeight: 400 }}>ha</span>
              </div>
              <div style={{ fontSize: 10.5, color: '#666' }}>{Math.round(mesures.aire_m2).toLocaleString('fr-FR')} m²</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: '#666' }}>{t('terrainPerimetre')}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C_BLUE }}>
                {mesures.perimetre_m.toFixed(2)} <span style={{ fontSize: 12, fontWeight: 400 }}>m</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: '#666' }}>{t('terrainNbSommets')}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#333' }}>{validation.sommets.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: '#666' }}>{t('terrainSens')}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: mesures.sensHoraire ? C_AMBER : C_TEAL, paddingTop: 4 }}>
                {mesures.sensHoraire ? t('terrainSensHoraire') : t('terrainSensDirect')}
              </div>
              {mesures.sensHoraire && (
                <button onClick={normaliser}
                  style={{ marginTop: 4, padding: '2px 8px', fontSize: 10.5, cursor: 'pointer',
                    background: '#fff', border: `1px solid ${C_BORDER}`, borderRadius: 2 }}>
                  {t('terrainNormaliserBtn')}
                </button>
              )}
            </div>
          </div>
        )}

        {mesures && (
          <p style={{ fontSize: 10.5, color: '#888', margin: '10px 0 0', lineHeight: 1.6 }}>
            {t('terrainMethodeMesure')}
          </p>
        )}
      </Panel>
    </div>
  );
}

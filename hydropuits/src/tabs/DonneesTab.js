// ============================================================
//  DonneesTab.js — Onglet « Données » : état de chaque source,
//  téléchargement, gestion des clés.
//  ─────────────────────────────────────────────────────────────
//  RÈGLE ABSOLUE affichée à l'écran (§3.3, reprise mot pour mot) :
//  « le logiciel ne crée jamais de compte, ne se connecte jamais à un
//  compte Google/Gmail, n'automatise aucune inscription ». Ce rappel est
//  visible en permanence en tête d'onglet, pas seulement documenté dans
//  le code — c'est une garantie faite à l'utilisateur, elle doit être
//  lisible par lui.
//
//  CE QUE CE MODULE NE FAIT PAS : les données téléchargées ne sont PAS
//  recopiées dans l'état du projet (.hpu) — seules leurs MÉTADONNÉES le
//  sont (résolution obtenue, date). Les données elles-mêmes restent dans
//  le cache disque du serveur (cacheDonnees.js), tenu par le CONTOUR du
//  terrain : rouvrir un projet redemande le téléchargement, qui répond
//  alors instantanément depuis le cache si le contour n'a pas changé
//  (§3.3 : « re-jouable hors ligne »). Sans ce choix, chaque projet
//  .hpu grossirait de plusieurs Mo à chaque grille d'altimétrie
//  enregistrée en double, une fois dans le cache et une fois dans le
//  fichier projet.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../useI18n';
import { validerPolygone } from '../calculations/polygone.js';
import {
  C_BLUE, C_TEAL, C_AMBER, C_RED, C_BORDER, C_HEADER, TH, TD,
  Panel, Alert, NoData, ecrirePressePapiers,
} from '../ui';
import { formaterRapportTexte } from '../services/diagnosticRapport.js';

const ICONES_SOURCE = {
  'elevation-open-meteo': 'mountain',
  'overpass-osm': 'droplet',
  'nasa-power': 'cloud-rain',
  'soilgrids-isric': 'layers-intersect',
  'opentopography-globaldem': 'relation-mount',
};

// Intervalle de sondage de la progression d'un téléchargement, en ms.
// ORIGINE : choix par défaut — assez court pour que la barre de
// progression paraisse fluide, assez long pour ne pas surcharger le
// serveur local de requêtes (un sondage par seconde reste négligeable
// même pour 5 sources téléchargées en parallèle).
const INTERVALLE_SONDAGE_MS = 900;

async function appelJson(url, options) {
  const r = await fetch(url, options);
  const d = await r.json().catch(() => ({}));
  if (!r.ok && !('statut' in d)) throw new Error(d.erreur || `HTTP ${r.status}`);
  return d;
}

export default function DonneesTab({ etat, majEtat, afficherToast }) {
  const { t, tp } = useI18n();
  const [registre, setRegistre] = useState(null);
  const [erreurRegistre, setErreurRegistre] = useState(null);
  // { [idSource]: { statut, progres, erreur, erreurCode, resultat, jobId } }
  const [jobs, setJobs] = useState({});
  const [saisieCle, setSaisieCle] = useState({}); // { [idSource]: texte en cours de saisie }
  const [diagnostic, setDiagnostic] = useState(null);
  const [diagEnCours, setDiagEnCours] = useState(false);
  const [diagErreur, setDiagErreur] = useState(null);
  const minuteurs = useRef({});

  const sommets = etat.sommets || [];
  const validation = sommets.length >= 3 ? validerPolygone(sommets, { normaliser: false }) : null;
  const terrainPret = !!validation?.valide;

  const chargerRegistre = useCallback(async () => {
    try {
      const d = await appelJson('/api/sources');
      setRegistre(d.sources);
      setErreurRegistre(null);
    } catch (e) {
      setErreurRegistre(e.message);
    }
  }, []);

  useEffect(() => { chargerRegistre(); }, [chargerRegistre]);

  // Arrête tous les sondages en cours au démontage de l'onglet.
  useEffect(() => () => {
    Object.values(minuteurs.current).forEach(clearInterval);
  }, []);

  function sonder(idSource, jobId) {
    clearInterval(minuteurs.current[idSource]);
    minuteurs.current[idSource] = setInterval(async () => {
      try {
        const d = await appelJson(`/api/telechargement/etat/${jobId}`);
        setJobs((prec) => ({ ...prec, [idSource]: { ...prec[idSource], ...d } }));
        if (d.statut !== 'en_cours') {
          clearInterval(minuteurs.current[idSource]);
          if (d.statut === 'termine' && d.resultat) {
            majEtat({
              sources: { ...(etat.sources || {}), [idSource]: { meta: d.resultat.meta, depuisCache: d.resultat.depuisCache } },
            });
            afficherToast?.(d.resultat.depuisCache ? t('srcToastDepuisCache') : t('srcToastTermine'));
            chargerRegistre();
          }
        }
      } catch (e) {
        clearInterval(minuteurs.current[idSource]);
        setJobs((prec) => ({ ...prec, [idSource]: { statut: 'erreur', erreur: e.message } }));
      }
    }, INTERVALLE_SONDAGE_MS);
  }

  async function demarrerTelechargement(idSource) {
    setJobs((prec) => ({ ...prec, [idSource]: { statut: 'en_cours', progres: 0 } }));
    try {
      const d = await appelJson(`/api/telechargement/${idSource}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sommets: validation.sommets, parametres: {} }),
      });
      if (!d.ok) {
        setJobs((prec) => ({ ...prec, [idSource]: { statut: 'erreur', erreur: d.erreur } }));
        return;
      }
      setJobs((prec) => ({ ...prec, [idSource]: { statut: 'en_cours', progres: 0, jobId: d.jobId } }));
      sonder(idSource, d.jobId);
    } catch (e) {
      setJobs((prec) => ({ ...prec, [idSource]: { statut: 'erreur', erreur: e.message } }));
    }
  }

  async function annuler(idSource) {
    const job = jobs[idSource];
    if (!job?.jobId) return;
    clearInterval(minuteurs.current[idSource]);
    try { await appelJson(`/api/telechargement/annuler/${job.jobId}`, { method: 'POST' }); } catch { /* déjà terminé côté serveur : sans conséquence */ }
    setJobs((prec) => ({ ...prec, [idSource]: { statut: 'annule' } }));
  }

  async function enregistrerCle(idSource) {
    const cle = (saisieCle[idSource] || '').trim();
    if (!cle) return;
    try {
      const d = await appelJson(`/api/cles/${idSource}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cle }),
      });
      if (!d.ok) { afficherToast?.(`${t('erreur')} ${d.erreur}`); return; }
      setSaisieCle((prec) => ({ ...prec, [idSource]: '' }));
      afficherToast?.(t('srcCleEnregistree'));
      chargerRegistre();
    } catch (e) {
      afficherToast?.(`${t('erreur')} ${e.message}`);
    }
  }

  async function supprimerCle(idSource) {
    try {
      await appelJson(`/api/cles/${idSource}`, { method: 'DELETE' });
      afficherToast?.(t('srcCleSupprimee'));
      chargerRegistre();
    } catch (e) {
      afficherToast?.(`${t('erreur')} ${e.message}`);
    }
  }

  /** Teste chaque service depuis CE poste et affiche un rapport factuel.
   *  Voir services/diagnosticReseau.js : c'est le seul moyen de connaître
   *  la vraie cause d'un échec, le réseau sortant étant inaccessible
   *  depuis l'environnement de développement. */
  async function lancerDiagnostic() {
    setDiagEnCours(true);
    setDiagErreur(null);
    setDiagnostic(null);
    try {
      const d = await appelJson('/api/diagnostic', { method: 'POST' });
      if (!d.ok) throw new Error(d.erreur || 'Diagnostic impossible.');
      setDiagnostic(d.rapport);
    } catch (e) {
      setDiagErreur(tp('diagErreur', { detail: e.message }));
    } finally {
      setDiagEnCours(false);
    }
  }

  async function copierDiagnostic() {
    try {
      await ecrirePressePapiers(formaterRapportTexte(diagnostic));
      afficherToast?.(t('diagCopie'));
    } catch (e) {
      afficherToast?.(`${t('erreur')} ${e.message}`);
    }
  }

  // Le diagnostic est rendu dans TOUS les états de l'onglet, y compris
  // avant qu'un terrain soit tracé : c'est précisément quand rien ne
  // marche qu'on doit pouvoir savoir pourquoi, sans devoir d'abord
  // dessiner un polygone.
  const panneauDiagnostic = (
    <Panel title={t('diagTitre')} icon="stethoscope" accent={C_AMBER}>
        <p style={{ fontSize: 11.5, color: '#444', margin: '0 0 8px', lineHeight: 1.6 }}>{t('diagExplication')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <button onClick={lancerDiagnostic} disabled={diagEnCours}
            style={{ padding: '5px 12px', fontSize: 11.5, cursor: diagEnCours ? 'not-allowed' : 'pointer',
              background: diagEnCours ? '#ccc' : C_AMBER, color: '#fff', border: 'none', borderRadius: 3 }}>
            {diagEnCours ? t('diagEnCours') : t('diagBouton')}
          </button>
          {diagnostic && (
            <button onClick={copierDiagnostic}
              style={{ padding: '5px 12px', fontSize: 11.5, cursor: 'pointer',
                background: '#fff', color: C_BLUE, border: `1px solid ${C_BORDER}`, borderRadius: 3 }}>
              {t('diagCopier')}
            </button>
          )}
        </div>

        {diagErreur && <Alert tone="error">{diagErreur}</Alert>}

        {diagnostic && (
          <>
            {diagnostic.resume.toutBloque && <Alert tone="error">{t('diagToutBloque')}</Alert>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
              <thead>
                <tr style={{ background: C_HEADER }}>
                  <th style={{ ...TH, textAlign: 'left' }}>{t('diagColService')}</th>
                  <th style={TH}>{t('diagColEtat')}</th>
                  <th style={TH}>HTTP</th>
                  <th style={TH}>{t('diagColTemps')}</th>
                  <th style={{ ...TH, textAlign: 'left' }}>{t('diagColDetail')}</th>
                </tr>
              </thead>
              <tbody>
                {diagnostic.resultats.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C_BORDER}` }}>
                    <td style={{ ...TD, textAlign: 'left' }}>{r.libelle}</td>
                    <td style={{ ...TD, textAlign: 'center', fontWeight: 'bold',
                      color: r.statut === 'ok' ? C_TEAL : (r.statut === 'ignore' ? '#888' : C_RED) }}>
                      {r.statut === 'ok' ? '✓' : (r.statut === 'ignore' ? '—' : '✕')}
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }}>{r.codeHttp ?? '—'}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{r.duree_ms != null ? `${r.duree_ms} ms` : '—'}</td>
                    <td style={{ ...TD, textAlign: 'left', wordBreak: 'break-word', color: r.statut === 'echec' ? C_RED : '#555' }}>
                      {r.erreur || r.detail || (r.extrait || '').replace(/\s+/g, ' ').slice(0, 140)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </>
      )}
    </Panel>
  );

  if (!terrainPret) {
    return (
      <div>
        <NoData title={t('videDonneesTitre')} hint={t('videDonneesHint')} />
        {panneauDiagnostic}
      </div>
    );
  }

  if (erreurRegistre) {
    return (
      <div>
        <Alert tone="error">{tp('srcErreurRegistre', { detail: erreurRegistre })}</Alert>
        {panneauDiagnostic}
      </div>
    );
  }
  if (!registre) {
    return <p style={{ fontSize: 12, color: '#888' }}>{t('chargement')}</p>;
  }

  return (
    <div>
      <Alert tone="info">
        <b>{t('srcReglePasDeCompteTitre')}</b><br />
        {t('srcReglePasDeCompteTexte')}
      </Alert>

      {panneauDiagnostic}

      {registre.map((s) => {
        const job = jobs[s.id];
        const dejaTelecharge = etat.sources?.[s.id];
        const enCours = job?.statut === 'en_cours';
        const clePresente = s.cleRequise ? s.cle?.presente : true;
        const peutTelecharger = clePresente && !enCours;

        return (
          <Panel key={s.id} title={t(s.nomCle)} icon={ICONES_SOURCE[s.id] || 'database'}
            accent={job?.statut === 'erreur' ? C_RED : (dejaTelecharge ? C_TEAL : C_BLUE)}>
            <p style={{ fontSize: 11.5, color: '#444', margin: '0 0 8px', lineHeight: 1.6 }}>{t(s.descriptionCle)}</p>

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 10.5, color: '#666', marginBottom: 8 }}>
              <span><b>{t('srcResolution')} :</b> {s.resolution}</span>
              <span><b>{t('srcCouverture')} :</b> {s.couverture}</span>
              <span><b>{t('srcLicence')} :</b> {s.licence}</span>
              <span><b>{t('srcVerifieLe')} :</b> {s.verifieLe}</span>
            </div>

            {s.indisponibleTemporairement && (
              <Alert tone="warn">{tp('srcAvtIndisponibleTemporairement', { date: s.verifieLe })}</Alert>
            )}

            {s.cleRequise && (
              <div style={{ background: C_HEADER, border: `1px solid ${C_BORDER}`, padding: '8px 12px', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                  🔑 {t('srcCleTitre')} {clePresente && <span style={{ color: C_TEAL }}>— {t('srcCleActive')}</span>}
                </div>
                <p style={{ fontSize: 10.5, color: '#555', margin: '0 0 6px', lineHeight: 1.6 }}>
                  {tp('srcCleHint', { service: t(s.nomCle) })}
                  {' '}
                  <a href={s.urlInscription} target="_blank" rel="noreferrer" style={{ color: C_BLUE }}>
                    {t('srcCleLienInscription')}
                  </a>
                  {' — '}{s.gratuit ? t('srcGratuit') : t('srcPayant')}.
                </p>
                {clePresente ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
                    <span style={{ color: '#666' }}>
                      {tp('srcCleEnregistreeLe', { date: new Date(s.cle.enregistreeLe).toLocaleDateString() })}
                    </span>
                    <button onClick={() => supprimerCle(s.id)}
                      style={{ padding: '2px 8px', fontSize: 10.5, cursor: 'pointer', background: '#fff', border: `1px solid ${C_BORDER}`, borderRadius: 2, color: C_RED }}>
                      {t('srcCleSupprimerBtn')}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="password" value={saisieCle[s.id] || ''} placeholder={t('srcCleColler')}
                      onChange={(e) => setSaisieCle((prec) => ({ ...prec, [s.id]: e.target.value }))}
                      style={{ flex: 1, height: 24, padding: '0 6px', border: `1px solid ${C_BORDER}`, fontSize: 11.5 }} />
                    <button onClick={() => enregistrerCle(s.id)} disabled={!(saisieCle[s.id] || '').trim()}
                      style={{ padding: '3px 12px', fontSize: 11, cursor: 'pointer', background: C_TEAL, color: '#fff', border: 'none', borderRadius: 2 }}>
                      {t('srcCleEnregistrerBtn')}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => demarrerTelechargement(s.id)} disabled={!peutTelecharger}
                style={{ padding: '6px 14px', fontSize: 12, cursor: peutTelecharger ? 'pointer' : 'not-allowed',
                  background: peutTelecharger ? C_BLUE : '#ccc', color: '#fff', border: 'none', borderRadius: 3 }}>
                {dejaTelecharge ? t('srcActualiserBtn') : t('srcTelechargerBtn')}
              </button>

              {enCours && (
                <>
                  <div style={{ flex: '1 1 140px', maxWidth: 220, height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round((job.progres || 0) * 100)}%`, height: '100%', background: C_BLUE, transition: 'width .3s' }} />
                  </div>
                  <span style={{ fontSize: 10.5, color: '#666' }}>{Math.round((job.progres || 0) * 100)}%</span>
                  <button onClick={() => annuler(s.id)}
                    style={{ padding: '3px 10px', fontSize: 10.5, cursor: 'pointer', background: '#fff', border: `1px solid ${C_BORDER}`, borderRadius: 2 }}>
                    {t('srcAnnulerBtn')}
                  </button>
                </>
              )}

              {s.cleRequise && !clePresente && (
                <span style={{ fontSize: 10.5, color: C_AMBER }}>{t('srcAvtCleRequisePourTelecharger')}</span>
              )}
            </div>

            {job?.statut === 'erreur' && (
              <Alert tone="error">
                {job.erreurCode === 'CLE_MANQUANTE' ? t('srcErrCleManquante') : tp('srcErrTelechargement', { detail: job.erreur })}
              </Alert>
            )}
            {job?.statut === 'annule' && <Alert tone="warn">{t('srcAnnuleMsg')}</Alert>}

            {dejaTelecharge && (
              <div style={{ marginTop: 8, fontSize: 11, color: C_TEAL, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-circle-check" style={{ fontSize: 14 }} />
                {tp('srcResolutionObtenue', { resolution: dejaTelecharge.meta?.resolutionObtenue || '—' })}
                {dejaTelecharge.depuisCache && <span style={{ color: '#888' }}> · {t('srcDepuisCacheEtiquette')}</span>}
              </div>
            )}

            <ResultatSource id={s.id} resultat={job?.resultat || (dejaTelecharge && { donnees: undefined })} t={t} tp={tp} />
          </Panel>
        );
      })}
    </div>
  );
}

/** Résumé du contenu téléchargé, propre à chaque source — affiché une
 *  fois le job terminé (pas de résumé générique « ça a marché », on
 *  montre CE QUI a été récupéré, pour que l'utilisateur puisse juger). */
function ResultatSource({ id, resultat, t, tp }) {
  const d = resultat?.donnees;
  if (!d) return null;
  if (id === 'overpass-osm') {
    return (
      <div style={{ marginTop: 6, fontSize: 10.5, color: '#555' }}>
        {tp('srcResumeOverpass', {
          coursEau: d.coursEau.length, sources: d.sources.length, puits: d.puitsExistants.length, failles: d.failles.length,
        })}
        {(d.avertissements || []).map((a, i) => <Alert key={i} tone="warn">{t(a.cle)}</Alert>)}
      </div>
    );
  }
  if (id === 'nasa-power') {
    return (
      <div style={{ marginTop: 6, fontSize: 10.5, color: '#555' }}>
        {tp('srcResumeNasaPower', { pma: d.pma_mm_an.toFixed(0), annees: d.anneesUtilisees, debut: d.premiereAnnee, fin: d.derniereAnnee })}
      </div>
    );
  }
  if (id === 'soilgrids-isric') {
    return (
      <div style={{ marginTop: 6, fontSize: 10.5, color: '#555' }}>
        {tp('srcResumeSoilGrids', { argile: d.argile_pourcent.toFixed(0), sable: d.sable_pourcent.toFixed(0), limon: d.limon_pourcent.toFixed(0) })}
        {d.sommeIncoherente && <Alert tone="warn">{t('srcAvtSommeSolIncoherente')}</Alert>}
      </div>
    );
  }
  if (id === 'elevation-open-meteo') {
    return (
      <div style={{ marginTop: 6, fontSize: 10.5, color: '#555' }}>
        {tp('srcResumeElevation', { nb: d.points.length, lignes: d.nbLignes, colonnes: d.nbColonnes })}
      </div>
    );
  }
  if (id === 'opentopography-globaldem') {
    return (
      <div style={{ marginTop: 6, fontSize: 10.5, color: '#555' }}>
        {tp('srcResumeOpenTopo', { nb: d.ncols * d.nrows, lignes: d.nrows, colonnes: d.ncols })}
      </div>
    );
  }
  return null;
}

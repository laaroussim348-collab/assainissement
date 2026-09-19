// ============================================================
//  LicenceGate.js — Écran d'activation de HydroPuits.
//  ─────────────────────────────────────────────────────────────
//  Visuellement : repris de l'écran d'activation original de GRADEX
//  (dégradé bleu #185FA5/#0C447C, carte centrée, secousse sur erreur).
//  Fonctionnellement : modèle UNIFIÉ essai + licence (façon AutoCAD,
//  voir src/services/activationClient.js) — AUCUN code à saisir ici.
//  Le premier lancement démarre un essai gratuit automatiquement ;
//  passé ce délai, l'écran affiche l'Identifiant Machine et invite à
//  contacter l'éditeur, qui active le poste À DISTANCE depuis
//  admin/licences-admin.html (clic "Activer" en face de l'Identifiant
//  Machine — le client n'a jamais besoin d'entrer quoi que ce soit).
//  La vérification se répète toutes les 60s : l'activation (ou une
//  révocation) prend effet en direct, sans redémarrage.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../useI18n';

async function fetchActivationStatus() {
  const r = await fetch('/api/activation-status', { cache: 'no-store' });
  return r.json();
}
async function fetchMachineId() {
  const r = await fetch('/api/machine-id', { cache: 'no-store' });
  const d = await r.json();
  return d.machineId || '';
}

// Les symboles d'unité passent par t() : dans HydroCrue ils étaient codés
// en dur ('j', 'h', 'min'), si bien que le bandeau d'essai affichait
// « نسخة تجريبية — 3 j متبقٍ » en arabe, soit une unité française au milieu
// d'une phrase arabe (constaté à l'écran). Voir i18n, clés unite*.
function formaterRestant(heures, t) {
  if (heures == null || Number.isNaN(heures)) return '';
  if (heures < 1) return `${Math.max(1, Math.round(heures * 60))} ${t('uniteMinutes')}`;
  // Math.ceil (pas floor) : un essai qui vient de démarrer affiche bien la
  // durée pleine (ex. "3 j" / "24 h") et non une unité déjà entamée, ce qui
  // donnerait l'impression trompeuse que l'essai a démarré plus tôt.
  if (heures >= 24) return `${Math.ceil(heures / 24)} ${t('uniteJours')}`;
  return `${Math.ceil(heures)} ${t('uniteHeures')}`;
}

export default function LicenceGate({ children }) {
  const { t, langue, changerLangue, LANGUES } = useI18n();
  const [phase, setPhase] = useState('init'); // init -> checking -> blocked | valid
  const [machineId, setMachineId] = useState('');
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [statut, setStatut] = useState(null);
  const [showLogout, setShowLogout] = useState(false);
  const [recheck, setRecheck] = useState(false);

  const messagesBlocage = {
    refuse_par_serveur: t('refuseParServeur'),
    serveur_injoignable_periode_grace_depassee: t('injoignableGrace'),
    essai_expire: t('essaiExpire'),
    licence_expiree: t('licenceExpiree'),
  };

  const verifier = useCallback(async () => {
    try {
      const s = await fetchActivationStatus();
      setStatut(s);
      if (s.machineId) setMachineId(s.machineId);
      if (s.active) {
        setPhase('valid');
      } else {
        setMsg({ text: messagesBlocage[s.raison] || s.raisonDetail || t('activationRequise'), ok: false });
        setPhase('blocked');
      }
    } catch (e) {
      setPhase('blocked');
      setStatut({ raison: 'erreur' });
      setMsg({ text: t('erreur') + ' ' + e.message, ok: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langue]);

  useEffect(() => {
    (async () => {
      try { setMachineId(await fetchMachineId()); } catch { /* affiché plus bas via statut */ }
      await verifier();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revérification périodique (60s) : verrouille l'essai en direct, tient
  // le badge à jour, ET détecte une activation à distance par l'éditeur
  // (ou une révocation) sans attendre un redémarrage côté client.
  useEffect(() => {
    const id = setInterval(verifier, 60000);
    return () => clearInterval(id);
  }, [verifier]);

  async function handleRecheck() {
    setRecheck(true);
    await verifier();
    setRecheck(false);
  }

  function copierId() {
    navigator.clipboard?.writeText(machineId).catch(() => {});
  }

  // ── Rendu : chargement ───────────────────────────────────
  if (phase === 'init') return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#f0f4f8', fontFamily:'Arial,sans-serif', gap:16 }}>
      <div style={{ width:44, height:44, border:'4px solid #d0d8e8', borderTop:'4px solid #185FA5',
        borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ fontSize:14, color:'#555', fontWeight:500 }}>{t('gxLicInitialisation')}</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Rendu : valide → app + bandeau essai / bouton licence flottant ──
  if (phase === 'valid') return (
    <>
      {children}
      {statut?.essai && (
        <div style={{ position:'fixed', top:8, left:'50%', transform:'translateX(-50%)', zIndex:8000,
          background:'#8B5000', color:'#fff', fontSize:11, fontWeight:700, padding:'4px 14px',
          borderRadius:20, boxShadow:'0 2px 8px rgba(0,0,0,0.2)' }}>
          ⏱ {t('essaiBadge')} — {formaterRestant(statut.heuresRestantes, t)} {t('gxLicRestant')}
        </div>
      )}
      <div style={{ position:'fixed', bottom:28, left:14, zIndex:8000 }}>
        {showLogout ? (
          <div style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:6, padding:'14px 16px',
            boxShadow:'0 4px 16px rgba(0,0,0,0.15)', width:260, fontFamily:'Arial,sans-serif' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#1a1a1a', marginBottom:6 }}>{t('gxLicSeDeconnecterConfirm')}</div>
            <div style={{ fontSize:11, color:'#555', marginBottom:10, lineHeight:1.6 }}>
              <div>{t('gxLicStatutActif')} — {machineId}</div>
            </div>
            <div style={{ fontSize:11, color:'#888', marginBottom:12, lineHeight:1.5 }}>{t('gxLicSeDeconnecterHint')}</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowLogout(false)}
                style={{ flex:1, padding:'7px', background:'#f3f4f6', color:'#333', border:'1px solid #d1d5db',
                  borderRadius:4, cursor:'pointer', fontSize:12 }}>{t('gxLicAnnuler')}</button>
              <button onClick={() => setShowLogout(false)}
                title={t('gxLicSeDeconnecterHint')}
                style={{ flex:1, padding:'7px', background:'#8B1a1a', color:'#fff', border:'none',
                  borderRadius:4, cursor:'pointer', fontSize:12, fontWeight:600 }}>{t('gxLicSeDeconnecter')}</button>
            </div>
          </div>
        ) : !statut?.essai && (
          <button onClick={() => setShowLogout(true)} title={t('gxLicGererLicence')}
            style={{ background:'rgba(255,255,255,0.92)', border:'1px solid #d1d5db', borderRadius:20,
              padding:'5px 12px', fontSize:11, color:'#555', cursor:'pointer',
              boxShadow:'0 1px 4px rgba(0,0,0,0.12)', display:'flex', alignItems:'center', gap:5 }}>
            🔑 {t('gxLicGererLicence')}
          </button>
        )}
      </div>
    </>
  );

  // ── Rendu : bloqué (essai terminé / révoqué / grâce dépassée) ──
  // Plus de formulaire de code : l'Identifiant Machine suffit — l'éditeur
  // active le poste à distance depuis l'outil admin, sans rien à saisir ici.
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh',
      background:'#f0f4f8', fontFamily:'Arial,sans-serif' }}>
      <div style={{ background:'#fff', width:440, borderRadius:6, boxShadow:'0 4px 24px rgba(0,0,0,0.13)', overflow:'hidden' }}>

        <div style={{ background:'linear-gradient(135deg,#185FA5 0%,#0C447C 100%)', padding:'22px 24px', textAlign:'center' }}>
          <div style={{ display:'flex', gap:6, justifyContent:'center', marginBottom:12 }}>
            {LANGUES.map(lg => (
              <button key={lg} onClick={() => changerLangue(lg)} type="button"
                style={{ padding:'3px 9px', fontSize:11, borderRadius:3, cursor:'pointer',
                  background: langue===lg ? 'rgba(255,255,255,0.28)' : 'transparent',
                  border:'1px solid rgba(255,255,255,0.4)', color:'#fff',
                  fontWeight: langue===lg ? 700 : 400 }}>
                {lg.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{ fontSize:26, fontWeight:700, color:'#fff', letterSpacing:1 }}>⛔ HydroPuits</div>
          <div style={{ fontSize:11, color:'#a0d0ff', marginTop:4 }}>{t('gxLicAccesRefuse')}</div>
        </div>

        <div style={{ padding:'24px' }}>
          {msg.text && (
            <div style={{ padding:'10px 14px', borderRadius:5, marginBottom:16, fontSize:12.5, lineHeight:1.7,
              background:'#fff5f5', color:'#991b1b', border:'1px solid #fecaca', textAlign:'center' }}>
              {msg.text}
            </div>
          )}

          <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:5, padding:'12px 14px', marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#1e40af', marginBottom:6 }}>
              🖥️ {t('identifiantTitre')}
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
              <span style={{ fontFamily:"'Courier New',monospace", fontSize:15, color:'#185FA5', fontWeight:700,
                letterSpacing:1, wordBreak:'break-all' }}>
                {machineId || '…'}
              </span>
              {machineId && (
                <button onClick={copierId}
                  style={{ padding:'3px 10px', fontSize:10, background:'#185FA5', color:'#fff', border:'none',
                    borderRadius:3, cursor:'pointer', flexShrink:0, whiteSpace:'nowrap' }}>
                  {t('copier')}
                </button>
              )}
            </div>
            <div style={{ fontSize:10, color:'#6b7280', marginTop:6, lineHeight:1.5 }}>{t('gxLicContacterHint')}</div>
          </div>

          <button onClick={handleRecheck} disabled={recheck}
            style={{ width:'100%', padding:'11px', fontWeight:700, fontSize:13, border:'none', borderRadius:5,
              cursor: recheck ? 'not-allowed' : 'pointer',
              background: recheck ? '#9ca3af' : '#185FA5', color:'#fff',
              transition:'background 0.2s', marginBottom:14 }}>
            {recheck ? t('verifEnCours') : t('gxLicVerifierMaintenant')}
          </button>

          <div style={{ textAlign:'center', fontSize:10, color:'#9ca3af', borderTop:'1px solid #f3f4f6', paddingTop:10 }}>
            {t('gxLicNonTransferable')}
          </div>
        </div>
      </div>
    </div>
  );
}

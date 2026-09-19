// ============================================================
//  HydroPuits — Favorabilité hydrogéologique d'un terrain pour
//  l'implantation d'un forage d'eau.
//  ─────────────────────────────────────────────────────────────
//  Coquille de l'application : barre de titre, menus Fichier/Éditer,
//  barre d'outils, onglets, projet .hpu. L'habillage est celui de
//  HydroCrue (src/App.js + src/ui.js), repris volontairement à
//  l'identique : les deux logiciels sont des frères jumeaux
//  techniques, un utilisateur de l'un doit retrouver ses repères
//  dans l'autre.
//
//  CE QUE FAIT CE LOGICIEL, et ce qu'il ne fait pas : il produit une
//  FAVORABILITÉ RELATIVE (échelle ordinale, par analyse multicritère
//  AHP sur données satellitaires ≈ 90 m), jamais une probabilité de
//  trouver de l'eau ni un débit prévu. Voir src/Avertissement.js.
//
//  ÉTAT D'AVANCEMENT — étape 7 du plan de construction. Terrain,
//  Données, Critères et Résultats sont branchés ; Sensibilité et
//  Rapport (étape 8) restent en chantier — voir README.md.
//  Licence — voir src/licence/LicenceGate.js et src/services/*.
// ============================================================

import { useState, useCallback, useEffect, useRef } from "react";
import { useI18n } from "./useI18n";
import LicenceGate from "./licence/LicenceGate";
import Avertissement from "./Avertissement";
import TerrainTab from "./tabs/TerrainTab";
import DonneesTab from "./tabs/DonneesTab";
import CriteresTab from "./tabs/CriteresTab";
import ResultatsTab from "./tabs/ResultatsTab";
import {
  C_BLUE,
  TBtn, TSep, MItem, NoData,
  copierChampActif, couperChampActif, collerChampActif,
} from "./ui";

// ─── Gestion des fichiers projet .hpu ─────────────────────────
// Reprise de la gestion .hyd de HydroCrue : API navigateur File System
// Access quand elle existe (c'est le cas dans Chromium/Electron, donc dans
// le logiciel installé), repli sur téléchargement + <input type=file> en
// navigateur classique pendant le développement.
// L'extension change (.hpu au lieu de .hyd) pour que Windows n'associe pas
// les projets des deux logiciels au même programme.
let _handleFichierCourant = null;

async function _ecrireHandle(handle, donnees) {
  const flux = await handle.createWritable();
  await flux.write(JSON.stringify(donnees, null, 2));
  await flux.close();
  return handle.name;
}

function _nomFichier(donnees, parDefaut) {
  return `${(donnees?.nomTerrain || parDefaut).replace(/\s+/g, "_")}.hpu`;
}

async function enregistrerProjet(donnees, forcerNouveau, libelleFiltre, nomParDefaut) {
  if (window.showSaveFilePicker) {
    if (_handleFichierCourant && !forcerNouveau) {
      try { return await _ecrireHandle(_handleFichierCourant, donnees); }
      catch { _handleFichierCourant = null; } // handle périmé (fichier déplacé/supprimé) : on redemande
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: _nomFichier(donnees, nomParDefaut),
        types: [{ description: libelleFiltre, accept: { "application/json": [".hpu"] } }],
      });
      _handleFichierCourant = handle;
      return await _ecrireHandle(handle, donnees);
    } catch {
      return null; // l'utilisateur a annulé la boîte de dialogue : ce n'est pas une erreur
    }
  }

  const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = _nomFichier(donnees, nomParDefaut);
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return a.download;
}

async function ouvrirProjet(libelleFiltre) {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: libelleFiltre, accept: { "application/json": [".hpu", ".json"] } }],
      });
      _handleFichierCourant = handle;
      const fichier = await handle.getFile();
      return { donnees: JSON.parse(await fichier.text()), nom: fichier.name };
    } catch {
      return null; // annulation
    }
  }
  return new Promise((resoudre, rejeter) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".hpu,.json";
    input.onchange = async (e) => {
      const fichier = e.target.files[0];
      if (!fichier) { resoudre(null); return; }
      try { resoudre({ donnees: JSON.parse(await fichier.text()), nom: fichier.name }); }
      catch (err) { rejeter(err); }
    };
    input.click();
  });
}

// ─── État initial d'un projet ─────────────────────────────────
// Un seul endroit décrit la forme complète d'un projet : getEtat/chargerEtat
// et le fichier .hpu s'y conforment, donc un onglet ne peut pas perdre ses
// données au passage par un autre (exigence §6, « sans perte entre onglets »).
// Chaque étape du plan de construction ajoute ses champs ICI, et nulle part
// ailleurs, avec sa version pour pouvoir relire un projet plus ancien.
export const ETAT_INITIAL = {
  versionFormat: 1,
  nomTerrain: "",
  // Étape 3 — polygone du terrain : sommets [{lat, lon}], système de
  // coordonnées de saisie, mode utilisé (carte / import / clavier).
  sommets: [],
  systemeCoordonnees: "wgs84",
  // Étape 4 — sources de données activées et état du cache.
  sources: {},
  // Étape 5/6 — facteurs actifs, seuils de reclassement, matrice AHP.
  facteurs: {},
  matriceAhp: null,
  // Étape 8 — notes libres de l'ingénieur, reprises dans le rapport.
  observations: "",
};

// ─── Sélecteur de langue (barre de titre) ─────────────────────
function SelecteurLangue({ langue, changerLangue, LANGUES, NOMS_LANGUES }) {
  return (
    <select value={langue} onChange={e => changerLangue(e.target.value)}
      style={{ fontSize: 11, padding: "2px 4px", border: "1px solid rgba(255,255,255,0.4)",
        background: "rgba(255,255,255,0.12)", color: "#fff", borderRadius: 2 }}>
      {LANGUES.map(lg => <option key={lg} value={lg} style={{ color: "#000" }}>{NOMS_LANGUES[lg]}</option>)}
    </select>
  );
}

// ─── Application principale ───────────────────────────────────
function ApplicationPrincipale() {
  const { t, langue, changerLangue, rtl, LANGUES, NOMS_LANGUES } = useI18n();

  const [etat, setEtat] = useState(ETAT_INITIAL);
  const [onglet, setOnglet] = useState("terrain");
  const [fichierCourant, setFichierCourant] = useState(null);
  const [modifie, setModifie] = useState(false);
  const [menuFichier, setMenuFichier] = useState(false);
  const [menuEdition, setMenuEdition] = useState(false);
  const [toast, setToast] = useState(null);

  const afficherToast = useCallback(msg => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }, []);

  // Marque le projet comme « non enregistré » dès que son état change —
  // SAUF quand le changement vient du logiciel lui-même (montage initial,
  // Nouveau, Ouvrir) et non d'une saisie de l'utilisateur.
  //
  // Deux pièges, tous deux constatés à l'écran avant correction :
  //  1. Sans garde, l'effet se déclenche au montage et un projet vierge
  //     jamais touché affiche d'emblée « ● non enregistré ».
  //  2. Un simple `setModifie(false)` à la fin de actionOuvrir ne suffit
  //     pas : React regroupe les mises à jour d'un même gestionnaire, puis
  //     exécute cet effet APRÈS le rendu — il repasserait donc le projet
  //     à « modifié » juste après l'avoir ouvert.
  // D'où un drapeau porté par un ref (donc lu/écrit hors cycle de rendu),
  // armé par chargerEtat et consommé ici.
  const changementInterne = useRef(true); // armé pour le montage initial
  useEffect(() => {
    if (changementInterne.current) { changementInterne.current = false; return; }
    setModifie(true);
  }, [etat]);

  // Un clic n'importe où referme les menus déroulants ouverts.
  useEffect(() => {
    const h = () => { setMenuFichier(false); setMenuEdition(false); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  function getEtat() {
    return { ...etat };
  }

  /**
   * Fusionne une modification partielle dans l'état du projet. C'est le
   * SEUL point d'entrée donné aux onglets : ils ne reçoivent jamais
   * setEtat directement, ce qui garantit qu'aucun onglet ne peut écraser
   * les champs d'un autre en remplaçant l'état entier (exigence §6 :
   * « sans perte entre onglets »).
   */
  const majEtat = useCallback((partiel) => {
    setEtat(precedent => ({ ...precedent, ...partiel }));
  }, []);

  function chargerEtat(donnees) {
    // Ce changement d'état est d'origine interne (Nouveau / Ouvrir) : il ne
    // doit pas marquer le projet comme modifié. Voir l'effet plus haut.
    changementInterne.current = true;
    // Fusion sur ETAT_INITIAL : un projet enregistré par une version
    // antérieure (donc sans les champs ajoutés depuis) s'ouvre quand même,
    // les champs manquants prenant leur valeur par défaut.
    setEtat({ ...ETAT_INITIAL, ...(donnees || {}) });
  }

  async function actionNouveau() {
    chargerEtat(ETAT_INITIAL);
    setFichierCourant(null);
    setOnglet("terrain");
    setModifie(false);
    afficherToast(t('toastNouveauProjetCree'));
  }

  async function actionOuvrir() {
    try {
      const resultat = await ouvrirProjet(t('projFiltreNom'));
      if (!resultat) return;
      chargerEtat(resultat.donnees);
      setFichierCourant(resultat.nom);
      setModifie(false);
      afficherToast(`${t('toastOuvert')} ${resultat.nom}`);
    } catch (e) {
      afficherToast(`${t('toastErreurFichier')} ${e.message}`);
    }
  }

  async function actionEnregistrer(forcerNouveau) {
    try {
      const nom = await enregistrerProjet(getEtat(), forcerNouveau, t('projFiltreNom'), t('projNomDefaut'));
      if (!nom) return; // annulé
      setFichierCourant(nom);
      setModifie(false);
      afficherToast(`${t('toastEnregistre')} ${nom}`);
    } catch (e) {
      afficherToast(`${t('erreur')} ${e.message}`);
    }
  }

  // Onglets — l'ordre suit le déroulé de travail imposé par le cahier des
  // charges §6 : on définit un terrain, on récupère les données, on règle
  // les critères, on lit les résultats, on vérifie leur robustesse, on
  // édite le rapport.
  const ONGLETS = [
    { id: "terrain",     icon: "polygon",      label: t('tabTerrain')     },
    { id: "donnees",     icon: "database",     label: t('tabDonnees')     },
    { id: "criteres",    icon: "adjustments",  label: t('tabCriteres')    },
    { id: "resultats",   icon: "map-2",        label: t('tabResultats')   },
    { id: "sensibilite", icon: "chart-line",   label: t('tabSensibilite') },
    { id: "rapport",     icon: "file-text",    label: t('tabRapport')     },
  ];

  // Onglets qui présentent un RÉSULTAT à l'utilisateur : ils portent
  // l'encadré d'honnêteté scientifique (§5 — « chaque écran de résultat »).
  const ONGLETS_RESULTAT = ["resultats", "sensibilite", "rapport"];

  // Contenu provisoire de l'étape 2 : chaque onglet annonce ce qu'il
  // attend, plutôt que d'afficher une page blanche.
  const VIDES = {
    terrain:     [t('videTerrainTitre'),     t('videTerrainHint')],
    donnees:     [t('videDonneesTitre'),     t('videDonneesHint')],
    criteres:    [t('videCriteresTitre'),    t('videCriteresHint')],
    resultats:   [t('videResultatsTitre'),   t('videResultatsHint')],
    sensibilite: [t('videSensibiliteTitre'), t('videSensibiliteHint')],
    rapport:     [t('videRapportTitre'),     t('videRapportHint')],
  };

  return (
    <div dir={rtl ? "rtl" : "ltr"} style={{ fontFamily: "Arial,sans-serif", minHeight: "100vh",
      background: "#e8e8e8", display: "flex", flexDirection: "column", fontSize: 12 }}>

      {/* ── BARRE TITRE + MENUS + BARRE D'OUTILS + ONGLETS : figés en haut
          au défilement (position:sticky), comme dans HydroCrue — Copier/
          Coller doivent rester accessibles sans remonter en haut de page. */}
      <div style={{ position: "sticky", top: 0, zIndex: 200 }}>

        {/* ── BARRE TITRE ── */}
        <div style={{ background: "linear-gradient(180deg,#2a6cc0 0%,#1a4a8a 100%)",
          color: "#fff", display: "flex", alignItems: "center", height: 40,
          borderBottom: "1px solid #0a3060", userSelect: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8,
            padding: "0 14px", borderRight: "1px solid rgba(255,255,255,0.15)", height: "100%" }}>
            <i className="ti ti-droplet-search" style={{ fontSize: 20, color: "#a0d8ff" }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: 0.5 }}>{t('appNom')}</div>
              <div style={{ fontSize: 9, opacity: 0.7 }}>{t('appSousTitre')}</div>
            </div>
          </div>

          <div style={{ display: "flex", height: "100%", alignItems: "stretch" }}>
            <div style={{ position: "relative", height: "100%" }}>
              <button onClick={e => { e.stopPropagation(); setMenuFichier(v => !v); setMenuEdition(false); }}
                style={{ height: "100%", padding: "0 14px", background: menuFichier ? "rgba(255,255,255,0.18)" : "transparent",
                  border: "none", color: "#fff", cursor: "pointer", fontSize: 13 }}
                onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.12)"}
                onMouseLeave={e => { if (!menuFichier) e.target.style.background = "transparent"; }}>
                {t('mFichier')}
              </button>
              {menuFichier && (
                <div onClick={e => e.stopPropagation()} style={{
                  position: "absolute", top: "100%", left: 0, background: "#f5f5f5",
                  border: "1px solid #999", boxShadow: "2px 2px 8px rgba(0,0,0,0.2)",
                  minWidth: 220, zIndex: 1000, padding: "2px 0", color: "#1a1a1a" }}>
                  <MItem icon="file-plus" label={t('mNouveau')} shortcut="Ctrl+N"
                    onClick={() => { actionNouveau(); setMenuFichier(false); }} />
                  <MItem icon="folder-open" label={t('mOuvrir')} shortcut="Ctrl+O"
                    onClick={() => { actionOuvrir(); setMenuFichier(false); }} />
                  <div style={{ height: 1, background: "#ccc", margin: "2px 6px" }} />
                  <MItem icon="device-floppy" label={t('mEnregistrer')} shortcut="Ctrl+S"
                    onClick={() => { actionEnregistrer(false); setMenuFichier(false); }} />
                  <MItem icon="device-floppy" label={t('mEnregistrerSous')}
                    onClick={() => { actionEnregistrer(true); setMenuFichier(false); }} />
                </div>
              )}
            </div>

            <div style={{ position: "relative", height: "100%" }}>
              <button onClick={e => { e.stopPropagation(); setMenuEdition(v => !v); setMenuFichier(false); }}
                style={{ height: "100%", padding: "0 14px", background: menuEdition ? "rgba(255,255,255,0.18)" : "transparent",
                  border: "none", color: "#fff", cursor: "pointer", fontSize: 13 }}
                onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.12)"}
                onMouseLeave={e => { if (!menuEdition) e.target.style.background = "transparent"; }}>
                {t('mEditer')}
              </button>
              {menuEdition && (
                <div onClick={e => e.stopPropagation()} style={{
                  position: "absolute", top: "100%", left: 0, background: "#f5f5f5",
                  border: "1px solid #999", boxShadow: "2px 2px 8px rgba(0,0,0,0.2)",
                  minWidth: 200, zIndex: 1000, padding: "2px 0" }}>
                  {/* onMouseDown={preventDefault} : garde le focus dans le champ
                      actif, sans quoi copierChampActif ne trouverait plus rien. */}
                  <MItem icon="copy" label={t('mCopier')} shortcut="Ctrl+C"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { copierChampActif(afficherToast); setMenuEdition(false); }} />
                  <MItem icon="scissors" label={t('mCouper')} shortcut="Ctrl+X"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { couperChampActif(afficherToast); setMenuEdition(false); }} />
                  <MItem icon="clipboard" label={t('mColler')} shortcut="Ctrl+V"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { collerChampActif(afficherToast); setMenuEdition(false); }} />
                </div>
              )}
            </div>
          </div>

          <div style={{ marginLeft: "auto", paddingRight: 16, fontSize: 12, opacity: 0.85,
            display: "flex", alignItems: "center", gap: 10 }}>
            <SelecteurLangue langue={langue} changerLangue={changerLangue}
              LANGUES={LANGUES} NOMS_LANGUES={NOMS_LANGUES} />
            {modifie && <span style={{ color: "#ffd060", fontSize: 10 }}>{t('mNonSauvegarde')}</span>}
            <span>{fichierCourant || t('mSansTitre')}</span>
          </div>
        </div>

        {/* ── BARRE D'OUTILS ── */}
        <div style={{ background: "#f0f0f0", borderBottom: "1px solid #b0b0b0",
          padding: "2px 8px", display: "flex", alignItems: "center", gap: 0 }}>
          <TBtn icon="file-plus" label={t('tbNouveau')} onClick={actionNouveau} />
          <TBtn icon="folder-open" label={t('tbOuvrir')} onClick={actionOuvrir} />
          <TBtn icon="device-floppy" label={t('tbSauvegarder')} onClick={() => actionEnregistrer(false)} />
          <TSep />
          <TBtn icon="printer" label={t('tbImprimer')} onClick={() => window.print()} />
          <TSep />
          <TBtn icon="copy" label={t('tbCopier')} onMouseDown={e => e.preventDefault()}
            onClick={() => copierChampActif(afficherToast)} />
          <TBtn icon="scissors" label={t('tbCouper')} onMouseDown={e => e.preventDefault()}
            onClick={() => couperChampActif(afficherToast)} />
          <TBtn icon="clipboard" label={t('tbColler')} onMouseDown={e => e.preventDefault()}
            onClick={() => collerChampActif(afficherToast)} />
          <div style={{ flex: 1 }} />
        </div>

        {/* ── ONGLETS ── */}
        <div style={{ background: "#e0e8f0", borderBottom: "1px solid #a0a8b0",
          display: "flex", padding: "3px 10px 0", flexWrap: "wrap" }}>
          {ONGLETS.map(og => (
            <button key={og.id} onClick={() => setOnglet(og.id)}
              style={{ padding: "5px 14px", background: onglet === og.id ? "#fff" : "transparent",
                border: onglet === og.id ? "1px solid #a0a8b0" : "1px solid transparent",
                borderBottom: onglet === og.id ? "1px solid #fff" : "1px solid transparent",
                marginRight: 2, cursor: "pointer", fontSize: 12, fontWeight: onglet === og.id ? 700 : 400,
                color: onglet === og.id ? C_BLUE : "#333", borderRadius: "3px 3px 0 0",
                marginBottom: onglet === og.id ? -1 : 0,
                display: "flex", alignItems: "center", gap: 5 }}>
              <i className={`ti ti-${og.icon}`} style={{ fontSize: 13 }} />{og.label}
            </button>
          ))}
        </div>

      </div>

      {/* ── CONTENU ── */}
      <div style={{ flex: 1, overflow: "auto", background: "#fff", padding: "14px 18px" }}>
        {/* L'encadré d'honnêteté scientifique (§5) est rendu AVANT le contenu
            de tout onglet qui présente un résultat — y compris quand cet
            onglet est encore vide, pour qu'il ne puisse pas être oublié
            lorsque le contenu arrivera. */}
        {ONGLETS_RESULTAT.includes(onglet) && <Avertissement />}

        {onglet === "terrain" && <TerrainTab etat={etat} majEtat={majEtat} afficherToast={afficherToast} />}
        {onglet === "donnees" && <DonneesTab etat={etat} majEtat={majEtat} afficherToast={afficherToast} />}
        {onglet === "criteres" && <CriteresTab etat={etat} majEtat={majEtat} afficherToast={afficherToast} />}
        {onglet === "resultats" && <ResultatsTab etat={etat} majEtat={majEtat} afficherToast={afficherToast} />}
        {!["terrain", "donnees", "criteres", "resultats"].includes(onglet) && (
          <>
            <NoData title={VIDES[onglet][0]} hint={VIDES[onglet][1]} />
            <p style={{ textAlign: "center", fontSize: 11, color: "#aaa", marginTop: -30 }}>
              {t('enChantier')}
            </p>
          </>
        )}
      </div>

      {/* ── TOAST ── */}
      {toast && (
        <div style={{ position: "fixed", bottom: 20, right: 20, background: "#1a2a3a",
          color: "#fff", padding: "8px 18px", fontSize: 12,
          boxShadow: "2px 2px 8px rgba(0,0,0,0.3)", zIndex: 9999, border: "1px solid #4a6a9a" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// L'application entière est derrière l'écran d'activation : rien n'est
// accessible tant que la licence (ou l'essai) n'est pas valide.
export default function App() {
  return (
    <LicenceGate>
      <ApplicationPrincipale />
    </LicenceGate>
  );
}

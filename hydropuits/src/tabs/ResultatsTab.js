// ============================================================
//  ResultatsTab.js — Onglet « Résultats » : carte de favorabilité et
//  classement des meilleurs emplacements (§3.4, §6).
//  ─────────────────────────────────────────────────────────────
//  Récupère les données déjà téléchargées (via pipelineClient.js,
//  cache serveur de l'étape 4), reclasse les facteurs ACTIFS avec LEURS
//  seuils/sens effectifs (facteursCriteres.js — mêmes règles que
//  l'onglet Critères, jamais recalculées différemment ici), combine par
//  les poids AHP (favorabilite.js) et classe les meilleurs points.
//
//  Refuse d'afficher un résultat si la matrice AHP est incohérente
//  (CR ≥ 0,10) ou si un facteur actif n'a pas de seuil calculable — les
//  deux cas renvoient un message explicite plutôt qu'un résultat qui
//  aurait l'air valide (§5).
//
//  Le résultat calculé est REMONTÉ à App.js (resultatCalcul/
//  setResultatCalcul) : Sensibilité et Rapport le réutilisent tel quel,
//  plutôt que de relancer chacun leur propre pipeline — un seul calcul,
//  jamais trois qui pourraient en venir à se contredire. App.js
//  l'invalide automatiquement dès que le terrain ou les critères
//  changent (§5 : jamais un résultat obsolète affiché comme à jour).
// ============================================================
import { useState } from 'react';
import { useI18n } from '../useI18n';
import { validerPolygone } from '../calculations/polygone.js';
import { executerPipelineFacteurs } from '../services/pipelineClient.js';
import { reclasserTousLesFacteurs, combinerFavorabilite, classerMeilleursPoints } from '../calculations/favorabilite.js';
import { RAYON_DENSITE_M_DEFAUT } from '../calculations/facteurs.js';
import { actifsEffectifs, actifsDisponibles, sensEffectif, seuilsEffectifs, poidsFinaux, poidsFinauxPourActifs } from './facteursCriteres.js';
import { NOM_CLE_FACTEUR } from './CriteresTab.js';
import CarteFavorabilite from '../CarteFavorabilite.js';
import { C_BLUE, C_AMBER, Panel, Alert, NoData } from '../ui';

/**
 * Nombre de meilleurs points affichés.
 * ORIGINE : choix par défaut, ajustable — assez pour comparer plusieurs
 * candidats sans noyer l'utilisateur sous une liste trop longue pour une
 * parcelle de quelques hectares.
 */
const NOMBRE_MEILLEURS_POINTS_DEFAUT = 10;

export default function ResultatsTab({ etat, resultatCalcul, setResultatCalcul }) {
  const { t, tp } = useI18n();
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(null);

  const sommets = etat.sommets || [];
  const validation = sommets.length >= 3 ? validerPolygone(sommets, { normaliser: false }) : null;
  const terrainPret = !!validation?.valide;

  if (!terrainPret) {
    return <NoData title={t('videResultatsTitre')} hint={t('videResultatsHint')} />;
  }

  const poids = poidsFinaux(etat);

  function lancerCalcul() {
    setChargement(true);
    setErreur(null);
    setResultatCalcul(null);
    executerPipelineFacteurs(validation.sommets, {
      rayonDensite_m: etat.facteurs?.rayonDensite_m || RAYON_DENSITE_M_DEFAUT,
    }).then((construction) => {
      if (!construction.grille || !construction.grillesFacteurs) {
        setErreur(t('facAvtMntManquant'));
        setChargement(false);
        return;
      }
      // Un facteur demandé mais dont la source est tombée (ou dont les
      // seuils ne sont pas calculables faute de cellules valides) est
      // ÉCARTÉ, pas bloquant : sans cela, une seule source en panne
      // supprimait tout le résultat au lieu de le réduire. Chaque
      // abandon est listé à l'écran juste en dessous (§5).
      const demandes = actifsEffectifs(etat);
      const seuilsParFacteur = {};
      const sensParFacteur = {};
      for (const id of actifsDisponibles(etat, construction.disponibilite)) {
        const seuils = seuilsEffectifs(etat, id, construction.grillesFacteurs, construction.grille.masque);
        if (!seuils) continue; // écarté : seuils non calculables
        seuilsParFacteur[id] = seuils;
        sensParFacteur[id] = sensEffectif(etat, id);
      }
      const actifs = Object.keys(seuilsParFacteur);
      const abandonnes = demandes.filter((id) => !actifs.includes(id));

      if (actifs.length === 0) {
        setErreur(tp('resultatsAucunFacteur', {
          facteurs: demandes.map((id) => t(NOM_CLE_FACTEUR[id])).join(', '),
        }));
        setChargement(false);
        return;
      }

      const poidsActuels = poidsFinauxPourActifs(etat, actifs);
      if (!poidsActuels) {
        setErreur(t('resultatsErreurCoherence'));
        setChargement(false);
        return;
      }
      const grillesBrutesActives = Object.fromEntries(actifs.map((id) => [id, construction.grillesFacteurs[id]]));
      const { grillesClasses } = reclasserTousLesFacteurs(grillesBrutesActives, construction.grille.masque, seuilsParFacteur, sensParFacteur);
      const { score, nManquantes } = combinerFavorabilite(grillesClasses, poidsActuels, construction.grille.masque);
      const meilleursPoints = classerMeilleursPoints(construction.grille, score, NOMBRE_MEILLEURS_POINTS_DEFAUT);
      setResultatCalcul({
        grille: construction.grille, grillesClasses, poids: poidsActuels, score, nManquantes, meilleursPoints,
        avertissements: [
          ...construction.avertissements,
          ...(abandonnes.length > 0
            ? [{
              cle: 'resultatsFacteursEcartes',
              params: {
                facteurs: abandonnes.map((id) => t(NOM_CLE_FACTEUR[id])).join(', '),
                restants: actifs.length,
              },
            }]
            : []),
        ],
      });
      setChargement(false);
    }).catch((e) => { setErreur(e.message); setChargement(false); });
  }

  const titreCarte = etat.nomTerrain || t('mSansTitre');

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <button onClick={lancerCalcul} disabled={chargement}
          style={{ padding: '6px 14px', fontSize: 12, cursor: chargement ? 'not-allowed' : 'pointer',
            background: chargement ? '#ccc' : C_BLUE, color: '#fff', border: 'none', borderRadius: 3 }}>
          {chargement ? t('resultatsChargement') : t('resultatsBoutonLancer')}
        </button>
      </div>

      {!poids && <Alert tone="error">{t('resultatsErreurCoherence')}</Alert>}
      {erreur && <Alert tone="error">{erreur}</Alert>}

      {resultatCalcul && (
        <>
          {resultatCalcul.avertissements.length > 0 && (
            <Panel title={t('resultatsAvertissementsTitre')} icon="alert-triangle" accent={C_AMBER}>
              {resultatCalcul.avertissements.map((a, i) => <Alert key={i} tone="warn">{tp(a.cle, a.params || {})}</Alert>)}
            </Panel>
          )}

          {resultatCalcul.nManquantes > 0 && (
            <Alert tone="warn">
              {tp('resultatsSansResultatCellules', { n: resultatCalcul.nManquantes, total: resultatCalcul.grille.nbLignes * resultatCalcul.grille.nbColonnes })}
            </Alert>
          )}

          {resultatCalcul.meilleursPoints.length === 0 ? (
            <Alert tone="error">{t('resultatsAucuneCelluleValide')}</Alert>
          ) : (
            <>
              <Panel title={t('resultatsLegendeTitre')} icon="map" accent={C_BLUE} noPad>
                <CarteFavorabilite grille={resultatCalcul.grille} score={resultatCalcul.score}
                  meilleursPoints={resultatCalcul.meilleursPoints} titre={titreCarte} />
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
            </>
          )}
        </>
      )}
    </div>
  );
}

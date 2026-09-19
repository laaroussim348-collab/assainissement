// ============================================================
//  pipelineClient.js — Redemande les sources déjà téléchargées (via
//  l'API de l'étape 4, cache serveur) et construit les 8 facteurs
//  (calculations/facteurs.js) pour les onglets Critères et Résultats.
//  ─────────────────────────────────────────────────────────────
//  POURQUOI CE MODULE EXISTE : DonneesTab.js (étape 4) télécharge déjà
//  chaque source, mais NE CONSERVE PAS les données elles-mêmes dans
//  l'état du projet — seules leurs métadonnées le sont (voir l'en-tête
//  de DonneesTab.js) ; les données réelles restent dans le cache disque
//  du SERVEUR, tenu par le contour du terrain. Critères et Résultats ont
//  besoin des données elles-mêmes pour calculer les grilles de
//  facteurs — ce module les redemande via EXACTEMENT la même API que
//  DonneesTab.js (POST puis sondage), ce qui répond quasi instantanément
//  depuis le cache si rien n'a changé (§3.3 : « re-jouable hors ligne »),
//  sans dupliquer la logique de téléchargement.
//
//  CE MODULE N'EST PAS PUR (fetch réseau) — c'est la couche services/,
//  pas calculations/. Le calcul lui-même (construireFacteurs) reste pur.
//
//  CHAQUE SOURCE EST INDÉPENDANTE : l'échec d'une source (réseau, clé
//  manquante, service en pause) n'interrompt pas les autres — c'est
//  facteurs.js (§5) qui dit explicitement ce qui manque, jamais ce
//  module qui bloque tout sur la première panne.
// ============================================================
import { depuisElevationOpenMeteo } from '../calculations/grilleMnt.js';
import { construireFacteurs, toutesLesGrillesFacteurs } from '../calculations/facteurs.js';

// Intervalle de sondage — même valeur que DonneesTab.js (voir sa
// justification) : assez court pour une progression fluide, assez long
// pour ne pas surcharger le serveur local.
const INTERVALLE_SONDAGE_MS = 900;

async function appelJson(url, options) {
  const r = await fetch(url, options);
  const d = await r.json().catch(() => ({}));
  if (!r.ok && !('statut' in d)) throw new Error(d.erreur || `HTTP ${r.status}`);
  return d;
}

/**
 * Démarre (ou récupère depuis le cache) une source jusqu'à son terme.
 * @returns {Promise<{donnees:object, meta:object, depuisCache:boolean}>}
 */
function telechargerSource(idSource, sommets, parametres, { signal, onProgres } = {}) {
  return new Promise((resolve, reject) => {
    let minuteur = null;
    const surAnnulation = () => { clearInterval(minuteur); reject(new Error('Annulé.')); };
    signal?.addEventListener('abort', surAnnulation, { once: true });

    appelJson(`/api/telechargement/${idSource}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sommets, parametres: parametres || {} }),
    }).then((d) => {
      if (signal?.aborted) return;
      if (!d.ok) { reject(new Error(d.erreur || `Échec du démarrage (${idSource}).`)); return; }
      minuteur = setInterval(async () => {
        try {
          const e = await appelJson(`/api/telechargement/etat/${d.jobId}`);
          onProgres?.(idSource, e);
          if (e.statut === 'termine') {
            clearInterval(minuteur);
            signal?.removeEventListener('abort', surAnnulation);
            resolve(e.resultat);
          } else if (e.statut === 'erreur' || e.statut === 'annule') {
            clearInterval(minuteur);
            signal?.removeEventListener('abort', surAnnulation);
            reject(new Error(e.erreur || `Téléchargement ${idSource} : ${e.statut}.`));
          }
        } catch (err) {
          clearInterval(minuteur);
          signal?.removeEventListener('abort', surAnnulation);
          reject(err);
        }
      }, INTERVALLE_SONDAGE_MS);
    }).catch(reject);
  });
}

/** Récupère une source sans jamais rejeter : une panne devient un
 *  avertissement {cle:'facAvtEchecSource', params:{source, detail}},
 *  pour que Promise.all() ci-dessous ne s'arrête jamais sur UNE source
 *  en panne (§5 — chaque absence est dite, aucune n'est bloquante). */
async function telechargerSansEchouer(idSource, sommets, parametres, opts, avertissements) {
  try {
    return await telechargerSource(idSource, sommets, parametres, opts);
  } catch (e) {
    avertissements.push({ cle: 'facAvtEchecSource', params: { source: idSource, detail: e.message } });
    return null;
  }
}

/**
 * Récupère les 4 sources nécessaires aux 8 facteurs et construit ces
 * derniers (calculations/facteurs.js).
 *
 * @param {{lat:number, lon:number}[]} sommets
 * @param {{espacement_m?:number, rayonDensite_m?:number, onProgres?:function, signal?:AbortSignal}} [options]
 * @returns {Promise<ReturnType<typeof construireFacteurs> & {grillesFacteurs: object|null}>}
 */
export async function executerPipelineFacteurs(sommets, options = {}) {
  const { onProgres, signal, espacement_m, rayonDensite_m } = options;
  const avertissementsSources = [];
  const opts = { signal, onProgres };

  const [elevation, overpass, nasaPower, soilGrids] = await Promise.all([
    telechargerSansEchouer('elevation-open-meteo', sommets, {}, opts, avertissementsSources),
    telechargerSansEchouer('overpass-osm', sommets, {}, opts, avertissementsSources),
    telechargerSansEchouer('nasa-power', sommets, {}, opts, avertissementsSources),
    telechargerSansEchouer('soilgrids-isric', sommets, {}, opts, avertissementsSources),
  ]);

  const grilleSourceMnt = elevation ? depuisElevationOpenMeteo(elevation.donnees) : null;
  const construction = construireFacteurs(sommets, {
    grilleSourceMnt,
    overpass: overpass?.donnees || null,
    nasaPower: nasaPower?.donnees || null,
    soilGrids: soilGrids?.donnees || null,
  }, { espacement_m, rayonDensite_m });

  return {
    ...construction,
    avertissements: [...avertissementsSources, ...construction.avertissements],
    grillesFacteurs: toutesLesGrillesFacteurs(construction),
  };
}

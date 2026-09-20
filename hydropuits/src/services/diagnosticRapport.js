/**
 * diagnosticRapport.js — partie PURE du diagnostic réseau.
 * -----------------------------------------------------------------------
 * POURQUOI CE FICHIER EST SÉPARÉ de diagnosticReseau.js : ce dernier lit
 * la clé OpenTopography enregistrée, donc importe clesLocales.js, donc
 * `node:fs` — impossible à embarquer dans le bundle React. L'interface a
 * pourtant besoin de mettre le rapport en forme pour le bouton « copier ».
 * Les deux fonctions ci-dessous n'ont aucune dépendance : elles sont
 * importables des DEUX côtés, et testables hors ligne.
 * -----------------------------------------------------------------------
 */

/**
 * Longueur de l'extrait de réponse conservé dans le rapport.
 * ORIGINE : 300 caractères — assez pour un message d'erreur JSON complet
 * ou les 6 lignes d'en-tête d'une grille ASCII (exactement ce qu'il faut
 * pour diagnostiquer l'échec OpenTopography constaté le 20/09/2026),
 * assez court pour rester lisible dans un rapport copié-collé.
 */
export const LONGUEUR_EXTRAIT = 300;

/**
 * Remplace toute clé d'API par «***».
 *
 * RÈGLE DE CONFIDENTIALITÉ : le rapport de diagnostic est FAIT pour être
 * copié et envoyé à un tiers. Une clé qui s'y retrouverait serait une
 * fuite causée par le logiciel lui-même. Deux filets successifs :
 *  1. la clé connue est remplacée telle quelle ;
 *  2. par sécurité, tout paramètre d'URL nommé API_Key/key/apikey voit sa
 *     valeur masquée, même si la clé n'a pas été transmise à la fonction.
 */
export function censurerCle(texte, cle) {
  if (!texte) return texte;
  let sortie = String(texte);
  if (cle) sortie = sortie.split(cle).join('***');
  return sortie.replace(/([?&](?:API_Key|api_key|apikey|key)=)[^&\s]+/gi, '$1***');
}

/**
 * Met le rapport en texte brut, prêt à coller dans un message — c'est ce
 * texte que l'utilisateur transmet pour qu'on corrige la vraie cause d'un
 * échec sans avoir à la deviner.
 */
export function formaterRapportTexte(rapport) {
  const lignes = [
    '=== HydroPuits — diagnostic réseau ===',
    `Date : ${rapport.dateIso}`,
    `Cibles testées : ${rapport.resume.nbTestees} — réussies : ${rapport.resume.nbReussies}`,
    '',
  ];
  for (const r of rapport.resultats) {
    if (r.statut === 'ignore') {
      lignes.push(`[ -- ] ${r.libelle}`, `       ${r.detail}`, '');
      continue;
    }
    lignes.push(`[${r.statut === 'ok' ? ' OK ' : 'ÉCHEC'}] ${r.libelle}`);
    lignes.push(
      `       HTTP ${r.codeHttp ?? '—'} · ${r.duree_ms} ms`
      + (r.octets != null ? ` · ${r.octets} octets` : '')
      + (r.typeContenu ? ` · ${r.typeContenu}` : ''),
    );
    if (r.erreur) lignes.push(`       Erreur : ${r.erreur}`);
    if (r.extrait) lignes.push(`       Réponse : ${r.extrait.replace(/\s+/g, ' ').trim()}`);
    lignes.push('');
  }
  if (rapport.resume.toutBloque) {
    lignes.push(
      'AUCUNE cible n’a répondu : le blocage est très probablement local',
      '(coupure, pare-feu, antivirus ou proxy d’entreprise), pas côté services.',
    );
  }
  return lignes.join('\n');
}

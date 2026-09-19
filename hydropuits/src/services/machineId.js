/**
 * machineId.js
 * -----------------------------------------------------------------------
 * Génère un identifiant machine stable, dérivé des adresses MAC des
 * interfaces réseau (bien plus fiable qu'une adresse IP, qui change et
 * n'identifie pas une machine précise derrière un routeur/NAT de bureau).
 *
 * Ceci s'exécute côté SERVEUR de BV-Calc (module Node "os", indisponible
 * dans un navigateur) — voir server.js pour la route qui l'expose au
 * front-end.
 * -----------------------------------------------------------------------
 */
import os from 'node:os';
import crypto from 'node:crypto';

export function genererMachineId() {
  const interfaces = os.networkInterfaces();
  const macs = [];
  for (const nom of Object.keys(interfaces).sort()) {
    for (const iface of interfaces[nom] || []) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        macs.push(iface.mac);
      }
    }
  }
  // Repli sur le nom de machine si aucune interface réseau physique n'est trouvée
  // (rare, mais possible sur certaines configurations virtualisées).
  const base = macs.length > 0 ? macs.sort().join(',') : `hostname:${os.hostname()}`;
  const empreinte = crypto.createHash('sha256').update(base + '|' + os.platform() + '|' + os.arch()).digest('hex');
  const court = empreinte.slice(0, 16).toUpperCase();
  return court.match(/.{1,4}/g).join('-'); // format XXXX-XXXX-XXXX-XXXX, lisible/copiable
}

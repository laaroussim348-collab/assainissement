// ============================================================
//  useI18n.js — petit hook React autour de i18n.js : redéclenche
//  le rendu quand la langue change, et applique le sens RTL/LTR
//  sur <html>.
//  ─────────────────────────────────────────────────────────────
//  Repris tel quel de HydroCrue (src/useI18n.js) — seule la liste
//  des exports diffère : HydroPuits n'a pas de metaMethode() (pas
//  de catalogue de méthodes de calcul à décrire), la favorabilité
//  étant produite par un moteur AHP unique.
// ============================================================
import { useState, useCallback, useEffect } from 'react';
import { t, langueActuelle, definirLangue, RTL, LANGUES, NOMS_LANGUES } from './i18n';

export function useI18n() {
  const [langue, setLangueState] = useState(langueActuelle());

  useEffect(() => {
    document.documentElement.lang = langue;
    document.documentElement.dir = RTL[langue] ? 'rtl' : 'ltr';
  }, [langue]);

  const changerLangue = useCallback((code) => {
    definirLangue(code);
    setLangueState(code);
  }, []);

  return {
    langue,
    changerLangue,
    rtl: !!RTL[langue],
    t,
    LANGUES,
    NOMS_LANGUES,
  };
}

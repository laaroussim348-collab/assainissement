// ============================================================
//  Avertissement.js — encadré d'honnêteté scientifique.
//  ─────────────────────────────────────────────────────────────
//  POURQUOI CE MODULE EXISTE, et pourquoi il est isolé ici plutôt
//  que recopié dans chaque onglet : le cahier des charges (§5) en
//  fait une exigence de PREMIER ORDRE. « Un résultat trop affirmatif
//  ici coûte de l'argent réel : un forage sec se chiffre en dizaines
//  de milliers de dirhams. »
//
//  Règle : CHAQUE écran de résultat et CHAQUE rapport exporté doit
//  porter cet encadré. Un composant unique, importé partout, garantit
//  que le texte ne peut pas diverger d'un écran à l'autre ni être
//  oublié sur un nouvel onglet — et que le corriger une fois le
//  corrige partout.
//
//  Le texte lui-même est imposé mot pour mot par le cahier des
//  charges ; il vit dans i18n.js (clé `avertissementTexte`) et est
//  traduit dans les 4 langues. NE PAS l'adoucir, et ne jamais
//  présenter la sortie du logiciel comme une probabilité de trouver
//  de l'eau ou comme un débit prévu : l'échelle produite est
//  ORDINALE (ce point est plus favorable que celui-là), pas
//  probabiliste.
//
//  `exporterAvertissementTexte()` sert aux exports non-React (PNG,
//  rapport) : même source de vérité, même texte.
// ============================================================
import { t } from './i18n';

// Palette d'alerte "avertissement" — reprise à l'identique de la tonalité
// `warn` de ui.js (Alert), pour rester dans le langage visuel de HydroCrue.
const FOND = '#fff8e0';
const BORDURE = '#d0a020';
const ENCRE = '#7a5000';

export default function Avertissement({ compact = false, style }) {
  return (
    <div
      role="note"
      style={{
        background: FOND,
        border: `1px solid ${BORDURE}`,
        color: ENCRE,
        padding: compact ? '6px 10px' : '9px 13px',
        fontSize: compact ? 10.5 : 11.5,
        lineHeight: 1.65,
        marginBottom: 10,
        display: 'flex',
        gap: 9,
        alignItems: 'flex-start',
        ...style,
      }}
    >
      <i className="ti ti-alert-triangle" style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }} />
      <div>
        {!compact && (
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{t('avertissementTitre')}</div>
        )}
        <div>{t('avertissementTexte')}</div>
      </div>
    </div>
  );
}

/**
 * Même texte, en clair — pour les sorties qui ne passent pas par React :
 * cartouche de la carte exportée en PNG, rapport exporté. Passe par t(),
 * donc suit la langue choisie, exactement comme l'encadré à l'écran.
 */
export function exporterAvertissementTexte() {
  return t('avertissementTexte');
}

// ============================================================
//  i18n.js — dictionnaire de traduction complet (FR/AR/EN/ES) de
//  HydroPuits.
//  ─────────────────────────────────────────────────────────────
//  POURQUOI CE FICHIER : le logiciel est distribué au Maroc, à des
//  bureaux d'études et à des particuliers dont la langue de travail
//  n'est pas uniformément le français. Le système est repris tel quel
//  de HydroCrue (src/i18n.js) : mêmes 4 langues, même RTL pour
//  l'arabe, même fonction t() avec repli sur le français, même
//  persistance par localStorage.
//
//  RÈGLE ABSOLUE (cahier des charges §1) : AUCUNE chaîne visible en
//  dur dans les composants — tout passe par t(). Et toute clé ajoutée
//  est traduite dans LES QUATRE LANGUES en même temps, jamais une
//  seule. Le test tests/unit-i18n.test.js échoue si une clé manque
//  dans une langue : c'est le garde-fou automatique de cette règle,
//  et la raison pour laquelle HydroCrue avait fini par accumuler des
//  messages jamais traduits (voir son README, section « Traduction —
//  corrections apportées à BV-Calc »).
//
//  Clé de persistance : 'hydropuits_langue' — VOLONTAIREMENT
//  différente du 'gradex_langue' de HydroCrue, pour que les deux
//  logiciels installés sur le même poste gardent chacun leur langue.
// ============================================================
export const LANGUES = ['fr', 'ar', 'en', 'es'];
export const NOMS_LANGUES = { fr: 'Français', ar: 'العربية', en: 'English', es: 'Español' };
export const RTL = { fr: false, ar: true, en: false, es: false };

const DICO = {
  // ═══════════════════════════════════════════════════════════
  fr: {
    // ── Identité du produit ──
    appNom: 'HydroPuits',
    appSousTitre: "Favorabilité hydrogéologique d'un terrain pour l'implantation d'un forage",

    // ── Écran d'activation (licence) ──
    gxLicInitialisation: 'Initialisation…',
    gxLicAccesRefuse: 'Accès non activé',
    activationRequise: 'Activation requise.',
    refuseParServeur: 'Licence refusée par le serveur (désactivée ou expirée).',
    injoignableGrace: "Le serveur de licence n'a pas pu être contacté depuis trop longtemps. Reconnectez ce poste à internet.",
    essaiExpire: "La période d'essai (3 jours) est terminée. Contactez-nous pour obtenir une licence complète.",
    licenceExpiree: 'Votre licence est arrivée à expiration. Contactez-nous pour la renouveler.',
    essaiBadge: "Version d'essai",
    gxLicRestant: 'restant',
    uniteJours: 'j',
    uniteHeures: 'h',
    uniteMinutes: 'min',
    identifiantTitre: 'Identifiant de ce poste',
    gxLicContacterHint: "Communiquez cet identifiant à l'éditeur : il active votre poste à distance. Vous n'avez aucun code à saisir ici — l'application se débloque automatiquement.",
    copier: 'Copier',
    verifEnCours: 'Vérification en cours…',
    gxLicVerifierMaintenant: 'Vérifier maintenant',
    gxLicNonTransferable: "Licence liée à cet ordinateur, non transférable.",
    gxLicGererLicence: 'Gérer la licence',
    gxLicSeDeconnecterConfirm: 'Libérer ce poste ?',
    gxLicSeDeconnecterHint: "Pour désactiver ce poste, utilisez le bouton Révoquer de l'outil d'administration.",
    gxLicStatutActif: 'Poste activé',
    gxLicAnnuler: 'Annuler',
    gxLicSeDeconnecter: 'Libérer',
    erreur: 'Erreur :',

    // ── Barre de titre, menus, barre d'outils ──
    mFichier: 'Fichier',
    mEditer: 'Éditer',
    mNouveau: 'Nouveau projet',
    mOuvrir: 'Ouvrir…',
    mEnregistrer: 'Enregistrer',
    mEnregistrerSous: 'Enregistrer sous…',
    mCopier: 'Copier',
    mCouper: 'Couper',
    mColler: 'Coller',
    mNonSauvegarde: '● non enregistré',
    mSansTitre: 'Sans titre',
    tbNouveau: 'Nouveau',
    tbOuvrir: 'Ouvrir',
    tbSauvegarder: 'Enregistrer',
    tbImprimer: 'Imprimer',
    tbCopier: 'Copier',
    tbCouper: 'Couper',
    tbColler: 'Coller',

    // ── Onglets ──
    tabTerrain: 'Terrain',
    tabDonnees: 'Données',
    tabCriteres: 'Critères',
    tabResultats: 'Résultats',
    tabSensibilite: 'Sensibilité',
    tabRapport: 'Rapport',

    // ── Projet ──
    projNouveau: 'Nouveau projet',
    projFiltreNom: 'Fichier HydroPuits (.hpu)',
    projNomDefaut: 'Nouveau terrain',
    toastNouveauProjet: 'Nouveau projet :',
    toastNouveauProjetCree: 'Nouveau projet créé.',
    toastEnregistre: 'Projet enregistré :',
    toastOuvert: 'Projet ouvert :',
    toastErreurFichier: 'Fichier illisible :',

    // ── États vides (onglets pas encore alimentés) ──
    videTerrainTitre: 'Aucun terrain défini',
    videTerrainHint: "Tracez le terrain sur la carte, importez-le depuis un fichier Excel/CSV, ou saisissez ses sommets au clavier.",
    videDonneesTitre: 'Aucune donnée téléchargée',
    videDonneesHint: 'Définissez d\'abord un terrain dans l\'onglet « Terrain », puis téléchargez les couches nécessaires.',
    videCriteresTitre: 'Critères indisponibles',
    videCriteresHint: 'Les facteurs se configurent une fois les données téléchargées.',
    videResultatsTitre: 'Aucun résultat',
    videResultatsHint: 'Lancez le calcul depuis l\'onglet « Critères » une fois la matrice AHP cohérente (CR < 0,10).',
    videSensibiliteTitre: 'Analyse de sensibilité non disponible',
    videSensibiliteHint: "L'analyse ±20 % est calculée automatiquement avec les résultats.",
    videRapportTitre: 'Rapport non disponible',
    videRapportHint: 'Le rapport est constitué à partir des résultats du calcul.',
    enChantier: 'Cette partie du logiciel est en cours de construction.',

    // ── Avertissement scientifique (cahier des charges §5) ──
    // Texte imposé mot pour mot par le cahier des charges — il figure sur
    // CHAQUE écran de résultat et dans CHAQUE rapport exporté.
    avertissementTitre: 'Portée et limites de ce résultat',
    avertissementTexte: "Résultat d'une analyse multicritère sur données satellitaires (≈ 90 m de résolution). Il ne remplace pas une reconnaissance de terrain. Toute implantation doit être confirmée par une prospection géophysique (VES/ERT) et validée par un hydrogéologue.",

    // ── Divers ──
    chargement: 'Chargement…',
    langue: 'Langue',
    choisirLangue: 'Choisissez votre langue',
  },

  // ═══════════════════════════════════════════════════════════
  ar: {
    appNom: 'هيدروبويتس',
    appSousTitre: 'الملاءمة الهيدروجيولوجية لأرض من أجل إنجاز ثقب مائي',

    gxLicInitialisation: 'جارٍ التهيئة…',
    gxLicAccesRefuse: 'الوصول غير مُفعَّل',
    activationRequise: 'التفعيل مطلوب.',
    refuseParServeur: 'رُفض الترخيص من الخادم (مُعطَّل أو منتهي الصلاحية).',
    injoignableGrace: 'تعذّر الاتصال بخادم التراخيص منذ مدة طويلة. أعِد ربط هذا الجهاز بالإنترنت.',
    essaiExpire: 'انتهت فترة التجربة (3 أيام). اتصل بنا للحصول على ترخيص كامل.',
    licenceExpiree: 'انتهت صلاحية ترخيصك. اتصل بنا لتجديده.',
    essaiBadge: 'نسخة تجريبية',
    gxLicRestant: 'متبقٍ',
    uniteJours: 'ي',
    uniteHeures: 'س',
    uniteMinutes: 'د',
    identifiantTitre: 'معرّف هذا الجهاز',
    gxLicContacterHint: 'أرسل هذا المعرّف إلى الناشر: سيقوم بتفعيل جهازك عن بُعد. لا حاجة لإدخال أي رمز هنا — سيُفتح البرنامج تلقائيًا.',
    copier: 'نسخ',
    verifEnCours: 'جارٍ التحقق…',
    gxLicVerifierMaintenant: 'تحقّق الآن',
    gxLicNonTransferable: 'الترخيص مرتبط بهذا الحاسوب وغير قابل للنقل.',
    gxLicGererLicence: 'إدارة الترخيص',
    gxLicSeDeconnecterConfirm: 'تحرير هذا الجهاز؟',
    gxLicSeDeconnecterHint: 'لإلغاء تفعيل هذا الجهاز، استعمل زر «إلغاء» في أداة الإدارة.',
    gxLicStatutActif: 'جهاز مُفعَّل',
    gxLicAnnuler: 'إلغاء',
    gxLicSeDeconnecter: 'تحرير',
    erreur: 'خطأ:',

    mFichier: 'ملف',
    mEditer: 'تحرير',
    mNouveau: 'مشروع جديد',
    mOuvrir: 'فتح…',
    mEnregistrer: 'حفظ',
    mEnregistrerSous: 'حفظ باسم…',
    mCopier: 'نسخ',
    mCouper: 'قص',
    mColler: 'لصق',
    mNonSauvegarde: '● غير محفوظ',
    mSansTitre: 'بدون عنوان',
    tbNouveau: 'جديد',
    tbOuvrir: 'فتح',
    tbSauvegarder: 'حفظ',
    tbImprimer: 'طباعة',
    tbCopier: 'نسخ',
    tbCouper: 'قص',
    tbColler: 'لصق',

    tabTerrain: 'الأرض',
    tabDonnees: 'المعطيات',
    tabCriteres: 'المعايير',
    tabResultats: 'النتائج',
    tabSensibilite: 'الحساسية',
    tabRapport: 'التقرير',

    projNouveau: 'مشروع جديد',
    projFiltreNom: 'ملف HydroPuits ‏(.hpu)',
    projNomDefaut: 'أرض جديدة',
    toastNouveauProjet: 'مشروع جديد:',
    toastNouveauProjetCree: 'تم إنشاء مشروع جديد.',
    toastEnregistre: 'تم حفظ المشروع:',
    toastOuvert: 'تم فتح المشروع:',
    toastErreurFichier: 'ملف غير قابل للقراءة:',

    videTerrainTitre: 'لم تُحدَّد أي أرض',
    videTerrainHint: 'ارسم الأرض على الخريطة، أو استوردها من ملف Excel/CSV، أو أدخل رؤوسها يدويًا.',
    videDonneesTitre: 'لم يتم تنزيل أي معطيات',
    videDonneesHint: 'حدِّد أولًا أرضًا في تبويب «الأرض»، ثم نزِّل الطبقات اللازمة.',
    videCriteresTitre: 'المعايير غير متاحة',
    videCriteresHint: 'تُضبط العوامل بعد تنزيل المعطيات.',
    videResultatsTitre: 'لا توجد نتائج',
    videResultatsHint: 'شغِّل الحساب من تبويب «المعايير» بعد أن تصبح مصفوفة AHP متسقة (CR < 0,10).',
    videSensibiliteTitre: 'تحليل الحساسية غير متاح',
    videSensibiliteHint: 'يُحسب تحليل ‎±20 %‎ تلقائيًا مع النتائج.',
    videRapportTitre: 'التقرير غير متاح',
    videRapportHint: 'يُبنى التقرير انطلاقًا من نتائج الحساب.',
    enChantier: 'هذا الجزء من البرنامج قيد الإنجاز.',

    avertissementTitre: 'نطاق هذه النتيجة وحدودها',
    avertissementTexte: 'نتيجة تحليل متعدد المعايير اعتمادًا على معطيات ساتلية (دقة ≈ 90 م). لا تُغني عن الاستطلاع الميداني. يجب تأكيد أي موقع بواسطة استكشاف جيوفيزيائي (VES/ERT) والمصادقة عليه من طرف مختص في الهيدروجيولوجيا.',

    chargement: 'جارٍ التحميل…',
    langue: 'اللغة',
    choisirLangue: 'اختر لغتك',
  },

  // ═══════════════════════════════════════════════════════════
  en: {
    appNom: 'HydroPuits',
    appSousTitre: 'Hydrogeological favourability of a site for water-well siting',

    gxLicInitialisation: 'Initialising…',
    gxLicAccesRefuse: 'Not activated',
    activationRequise: 'Activation required.',
    refuseParServeur: 'Licence refused by the server (disabled or expired).',
    injoignableGrace: 'The licence server has been unreachable for too long. Reconnect this workstation to the internet.',
    essaiExpire: 'The trial period (3 days) has ended. Contact us to obtain a full licence.',
    licenceExpiree: 'Your licence has expired. Contact us to renew it.',
    essaiBadge: 'Trial version',
    gxLicRestant: 'left',
    uniteJours: 'd',
    uniteHeures: 'h',
    uniteMinutes: 'min',
    identifiantTitre: 'Machine ID of this workstation',
    gxLicContacterHint: 'Send this ID to the publisher: they activate your workstation remotely. There is no code to enter here — the software unlocks automatically.',
    copier: 'Copy',
    verifEnCours: 'Checking…',
    gxLicVerifierMaintenant: 'Check now',
    gxLicNonTransferable: 'Licence tied to this computer, non-transferable.',
    gxLicGererLicence: 'Manage licence',
    gxLicSeDeconnecterConfirm: 'Release this workstation?',
    gxLicSeDeconnecterHint: 'To deactivate this workstation, use the Revoke button in the administration tool.',
    gxLicStatutActif: 'Workstation activated',
    gxLicAnnuler: 'Cancel',
    gxLicSeDeconnecter: 'Release',
    erreur: 'Error:',

    mFichier: 'File',
    mEditer: 'Edit',
    mNouveau: 'New project',
    mOuvrir: 'Open…',
    mEnregistrer: 'Save',
    mEnregistrerSous: 'Save as…',
    mCopier: 'Copy',
    mCouper: 'Cut',
    mColler: 'Paste',
    mNonSauvegarde: '● unsaved',
    mSansTitre: 'Untitled',
    tbNouveau: 'New',
    tbOuvrir: 'Open',
    tbSauvegarder: 'Save',
    tbImprimer: 'Print',
    tbCopier: 'Copy',
    tbCouper: 'Cut',
    tbColler: 'Paste',

    tabTerrain: 'Site',
    tabDonnees: 'Data',
    tabCriteres: 'Criteria',
    tabResultats: 'Results',
    tabSensibilite: 'Sensitivity',
    tabRapport: 'Report',

    projNouveau: 'New project',
    projFiltreNom: 'HydroPuits file (.hpu)',
    projNomDefaut: 'New site',
    toastNouveauProjet: 'New project:',
    toastNouveauProjetCree: 'New project created.',
    toastEnregistre: 'Project saved:',
    toastOuvert: 'Project opened:',
    toastErreurFichier: 'Unreadable file:',

    videTerrainTitre: 'No site defined',
    videTerrainHint: 'Draw the site on the map, import it from an Excel/CSV file, or type its vertices in.',
    videDonneesTitre: 'No data downloaded',
    videDonneesHint: 'First define a site in the "Site" tab, then download the required layers.',
    videCriteresTitre: 'Criteria unavailable',
    videCriteresHint: 'Factors are configured once the data has been downloaded.',
    videResultatsTitre: 'No results',
    videResultatsHint: 'Run the computation from the "Criteria" tab once the AHP matrix is consistent (CR < 0.10).',
    videSensibiliteTitre: 'Sensitivity analysis unavailable',
    videSensibiliteHint: 'The ±20 % analysis is computed automatically together with the results.',
    videRapportTitre: 'Report unavailable',
    videRapportHint: 'The report is built from the computation results.',
    enChantier: 'This part of the software is still under construction.',

    avertissementTitre: 'Scope and limits of this result',
    avertissementTexte: 'Result of a multi-criteria analysis on satellite data (≈ 90 m resolution). It does not replace a field survey. Any siting must be confirmed by geophysical prospecting (VES/ERT) and validated by a hydrogeologist.',

    chargement: 'Loading…',
    langue: 'Language',
    choisirLangue: 'Choose your language',
  },

  // ═══════════════════════════════════════════════════════════
  es: {
    appNom: 'HydroPuits',
    appSousTitre: 'Favorabilidad hidrogeológica de un terreno para la implantación de un sondeo',

    gxLicInitialisation: 'Inicializando…',
    gxLicAccesRefuse: 'Acceso no activado',
    activationRequise: 'Se requiere activación.',
    refuseParServeur: 'Licencia rechazada por el servidor (desactivada o caducada).',
    injoignableGrace: 'No se ha podido contactar con el servidor de licencias desde hace demasiado tiempo. Reconecte este equipo a internet.',
    essaiExpire: 'El período de prueba (3 días) ha terminado. Contáctenos para obtener una licencia completa.',
    licenceExpiree: 'Su licencia ha caducado. Contáctenos para renovarla.',
    essaiBadge: 'Versión de prueba',
    gxLicRestant: 'restante',
    uniteJours: 'd',
    uniteHeures: 'h',
    uniteMinutes: 'min',
    identifiantTitre: 'Identificador de este equipo',
    gxLicContacterHint: 'Envíe este identificador al editor: activará su equipo de forma remota. No hay ningún código que introducir aquí — el programa se desbloquea automáticamente.',
    copier: 'Copiar',
    verifEnCours: 'Verificando…',
    gxLicVerifierMaintenant: 'Verificar ahora',
    gxLicNonTransferable: 'Licencia vinculada a este ordenador, no transferible.',
    gxLicGererLicence: 'Gestionar la licencia',
    gxLicSeDeconnecterConfirm: '¿Liberar este equipo?',
    gxLicSeDeconnecterHint: 'Para desactivar este equipo, utilice el botón Revocar de la herramienta de administración.',
    gxLicStatutActif: 'Equipo activado',
    gxLicAnnuler: 'Cancelar',
    gxLicSeDeconnecter: 'Liberar',
    erreur: 'Error:',

    mFichier: 'Archivo',
    mEditer: 'Editar',
    mNouveau: 'Nuevo proyecto',
    mOuvrir: 'Abrir…',
    mEnregistrer: 'Guardar',
    mEnregistrerSous: 'Guardar como…',
    mCopier: 'Copiar',
    mCouper: 'Cortar',
    mColler: 'Pegar',
    mNonSauvegarde: '● sin guardar',
    mSansTitre: 'Sin título',
    tbNouveau: 'Nuevo',
    tbOuvrir: 'Abrir',
    tbSauvegarder: 'Guardar',
    tbImprimer: 'Imprimir',
    tbCopier: 'Copiar',
    tbCouper: 'Cortar',
    tbColler: 'Pegar',

    tabTerrain: 'Terreno',
    tabDonnees: 'Datos',
    tabCriteres: 'Criterios',
    tabResultats: 'Resultados',
    tabSensibilite: 'Sensibilidad',
    tabRapport: 'Informe',

    projNouveau: 'Nuevo proyecto',
    projFiltreNom: 'Archivo HydroPuits (.hpu)',
    projNomDefaut: 'Nuevo terreno',
    toastNouveauProjet: 'Nuevo proyecto:',
    toastNouveauProjetCree: 'Nuevo proyecto creado.',
    toastEnregistre: 'Proyecto guardado:',
    toastOuvert: 'Proyecto abierto:',
    toastErreurFichier: 'Archivo ilegible:',

    videTerrainTitre: 'Ningún terreno definido',
    videTerrainHint: 'Dibuje el terreno en el mapa, impórtelo desde un archivo Excel/CSV, o introduzca sus vértices con el teclado.',
    videDonneesTitre: 'Ningún dato descargado',
    videDonneesHint: 'Defina primero un terreno en la pestaña «Terreno», y descargue después las capas necesarias.',
    videCriteresTitre: 'Criterios no disponibles',
    videCriteresHint: 'Los factores se configuran una vez descargados los datos.',
    videResultatsTitre: 'Ningún resultado',
    videResultatsHint: 'Ejecute el cálculo desde la pestaña «Criterios» cuando la matriz AHP sea coherente (CR < 0,10).',
    videSensibiliteTitre: 'Análisis de sensibilidad no disponible',
    videSensibiliteHint: 'El análisis ±20 % se calcula automáticamente junto con los resultados.',
    videRapportTitre: 'Informe no disponible',
    videRapportHint: 'El informe se construye a partir de los resultados del cálculo.',
    enChantier: 'Esta parte del programa está en construcción.',

    avertissementTitre: 'Alcance y límites de este resultado',
    avertissementTexte: 'Resultado de un análisis multicriterio sobre datos satelitales (≈ 90 m de resolución). No sustituye a un reconocimiento de campo. Toda implantación debe ser confirmada mediante prospección geofísica (VES/ERT) y validada por un hidrogeólogo.',

    chargement: 'Cargando…',
    langue: 'Idioma',
    choisirLangue: 'Elija su idioma',
  },
};

export const TRADUCTIONS = DICO;

const CLE_STOCKAGE = 'hydropuits_langue';
const LANGUE_DEFAUT = 'fr';

/**
 * La langue courante est tenue EN MÉMOIRE, et seulement recopiée dans
 * localStorage pour survivre au redémarrage du logiciel. Ce n'est pas un
 * détail : localStorage n'existe pas sous Node (tests, server.mjs) et peut
 * lever une exception dans un navigateur en navigation privée ou avec les
 * données de site bloquées. Si la langue vivait uniquement dans
 * localStorage, le simple fait d'importer ce module hors navigateur
 * figerait l'interface en français et rendrait definirLangue() sans effet
 * — c'est-à-dire intestable.
 */
let _langueCourante = LANGUE_DEFAUT;
let _choixExplicite = false;

function lireStockage() {
  try { return localStorage.getItem(CLE_STOCKAGE); }
  catch { return null; }
}
function ecrireStockage(code) {
  try { localStorage.setItem(CLE_STOCKAGE, code); }
  catch { /* stockage indisponible : la langue reste valable pour la session */ }
}

// Restauration au chargement du module, si un choix a déjà été fait.
const _memorisee = lireStockage();
if (_memorisee && LANGUES.includes(_memorisee)) {
  _langueCourante = _memorisee;
  _choixExplicite = true;
}

export function langueActuelle() {
  return _langueCourante;
}

/** Ignore silencieusement une langue inconnue : basculer sur un code sans
 *  dictionnaire afficherait toute l'interface en clés brutes. */
export function definirLangue(code) {
  if (!LANGUES.includes(code)) return;
  _langueCourante = code;
  _choixExplicite = true;
  ecrireStockage(code);
}

export function aChoisiUneLangue() {
  return _choixExplicite;
}

/**
 * Traduit une clé dans la langue courante. Repli sur le français si la clé
 * manque dans la langue choisie, puis sur la clé elle-même — ainsi une clé
 * oubliée se voit à l'écran (elle s'affiche brute) au lieu de laisser un
 * blanc silencieux.
 */
export function t(cle) {
  const dico = DICO[langueActuelle()] || DICO.fr;
  return dico[cle] ?? DICO.fr[cle] ?? cle;
}

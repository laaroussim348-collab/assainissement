# HydroPuits — Favorabilité hydrogéologique pour l'implantation d'un forage


HydroPuits évalue la **favorabilité hydrogéologique relative** d'un terrain
pour l'implantation d'un forage d'eau, par analyse multicritère (AHP de
Saaty) sur données satellitaires libres.

> **Ce que le logiciel ne dit pas.** Il produit une favorabilité **relative**
> (échelle ordinale : ce point est *plus favorable que* celui-là), **jamais**
> une probabilité de trouver de l'eau ni un débit prévu. Résultat d'une
> analyse sur données ≈ 90 m de résolution : il ne remplace pas une
> reconnaissance de terrain. Toute implantation doit être confirmée par une
> prospection géophysique (VES/ERT) et validée par un hydrogéologue.

Frère jumeau technique de **HydroCrue** : même pile (React 19 +
react-scripts, Leaflet sans react-leaflet, recharts, Electron, serveur Node
natif sans framework), mêmes conventions de code (français, commentaires
expliquant le *pourquoi*), même habillage, même système de licence.

## État d'avancement

| Étape | Contenu | État |
|---|---|---|
| 1 | Lecture du projet de référence + plan | ✅ |
| 2 | Squelette : build, serveur, licence, i18n 4 langues, coquille UI | ✅ |
| 3 | Carte + saisie du polygone (3 modes) + géométrie géodésique | ✅ (partiel) |
| 4 | Registre des sources + téléchargement MNT + cache + clés | ✅ |
| 5 | Facteurs (pente, TWI, densités, courbure…) | ✅ |
| 6 | Moteur AHP + ratio de cohérence + reclassement | ✅ |
| 7 | Carte de favorabilité + classement des emplacements | ✅ |
| 8 | Analyse de sensibilité + rapport + export PNG | ✅ |
| 9 | README complet + build `npm run dist` | ✅ (voir « Limites connues » — le stub NSIS final requiert Wine, absent de cet environnement) |

À l'étape 3, l'onglet **Terrain** est complet : les trois modes de saisie
(tracé à la carte, import CSV, saisie au clavier) alimentent le même
contour, la surface et le périmètre sont calculés sur l'ellipsoïde WGS84
par la méthode géodésique de Karney, et le contour est validé
(auto-intersections, doublons, dégénérescence, sens de parcours). Les cinq
autres onglets attendent les étapes suivantes.

### Ce qui manque à l'étape 3, et pourquoi

Deux fonctions de l'onglet Terrain dépendent de fichiers de HydroCrue que le
cahier des charges (§2.2 et §2.3) impose de **réutiliser sans les modifier**,
et qui n'ont pas encore été fournis :

| Fonction | Fichier attendu | État actuel |
|---|---|---|
| Systèmes Lambert Merchich, UTM, Point 58, Nord Sahara 59 | `calculations/coordonnees.js` | seul le WGS84 est proposé ; les autres sont visibles mais désactivés, avec la raison affichée |
| Import de classeurs `.xlsx` | `services/miniXlsx.js` | l'import CSV fonctionne ; le `.xlsx` renvoie un message expliquant comment enregistrer en CSV |

Les deux sont signalés **à l'écran**, jamais contournés par une valeur de
repli (§5). Le reste du code est écrit pour que leur branchement soit une
substitution locale : la colonne de conversion existe déjà dans le tableau
de saisie, et toute l'analyse d'un fichier importé (nombres, en-tête,
regroupement par terrain, lignes fautives) est commune au CSV et au `.xlsx`.

## Démarrage

```bash
npm install
npm run build      # compile l'interface React dans build/
npm run server     # sert build/ + API de licence sur http://localhost:3000
# ou, en une commande :
npm run serve
```

Application de bureau (Electron) :

```bash
npm run build
npm run electron   # ouvre la fenêtre native, pointée sur le serveur local
```

Développement (rechargement à chaud) :

```bash
npm start          # http://localhost:3000
```

> Les routes `/api/*` (licence, presse-papiers) ne sont disponibles qu'avec
> `npm run server` / `npm run electron` — `npm start` ne sert que l'UI React.

## Build de distribution

```bash
npm run dist   # = npm run build && electron-builder --win (installeur NSIS)
```

**Vérifié à l'étape 9**, dans cet environnement de développement (Linux,
sans accès réseau général — voir « Limites connues ») :

1. `npm run build` (compilation React) : ✅ réussi.
2. Téléchargement du binaire Electron 43 et empaquetage de l'application
   (`dist/win-unpacked/`) : ✅ réussi.
3. Construction de l'archive 7z du paquet NSIS (~127 Mo) : ✅ réussie.
4. **Compilation du stub d'installeur NSIS final (le `.exe`
   auto-extractible)** : ❌ échoue avec `spawn wine ENOENT` — pour
   construire un installeur **Windows** depuis un poste **Linux**,
   `electron-builder` doit exécuter `makensis.exe` via **Wine**, qui
   n'est pas installé dans cet environnement de développement (ce n'est
   pas un défaut du projet : c'est une dépendance système documentée
   d'electron-builder pour la compilation croisée). Un fichier
   `HydroPuits Setup 0.1.0.exe` de 282 Ko apparaît dans `dist/` à ce
   stade : ce n'est PAS un installeur valide, seulement le gabarit NSIS
   avant l'insertion du payload par Wine — ne pas le distribuer tel quel.

**Pour produire l'installeur final**, deux options équivalentes,
aucune ne demandant de changement de code :
- lancer `npm run dist` sur (ou depuis) une machine Windows, où
  `electron-builder` invoque directement `makensis.exe` sans Wine ;
- installer Wine sur un poste Linux/CI (`apt install wine`) puis relancer
  `npm run dist` sans autre modification.

## Tests

```bash
npm test
```

Runner maison (`tests/run-tests.js`), **pas de Jest** : aucune dépendance de
test, sortie au format *attendu | obtenu | écart | % | PASS/FAIL*, code de
sortie non nul si un test échoue.

## Licence (activation)

Modèle unifié essai + activation à distance, repris de HydroCrue : un seul
installeur, essai automatique de 3 jours au premier lancement, aucun code
saisi par le client, activation par l'éditeur depuis `admin/licences-admin.html`
via l'Identifiant Machine, revérification toutes les 60 s, période de grâce
hors-ligne une fois activé.

> ⚠️ **La feuille de licences est partagée avec HydroCrue** (même
> `licenseServerUrl`, choix explicite de l'éditeur). L'Identifiant Machine
> étant calculé de la même façon dans les deux logiciels, un poste activé
> pour l'un est reconnu activé pour l'autre : la licence est de fait attachée
> au **poste**, pas au produit. Voir le bandeau d'en-tête de
> `src/services/activationClient.js`.

> ⚠️ La clé d'administration n'est **jamais** commitée : elle reste dans le
> stockage local de votre navigateur une fois saisie dans l'outil admin.

## Étape 4 — sources de données

L'onglet **Données** est opérationnel : registre explicite des 5 sources
(`src/services/sourcesDonnees.js`), téléchargement avec file d'attente,
progression et annulation (`src/services/telechargementJobs.js`), cache
disque par terrain (`src/services/cacheDonnees.js`), et gestion locale des
clés d'API (`src/services/clesLocales.js`).

| Source | Clé | État |
|---|---|---|
| Open-Meteo Elevation (MNT ≈ 90 m) | non | opérationnelle |
| Overpass API (OpenStreetMap — cours d'eau, sources, puits, failles) | non | opérationnelle |
| NASA POWER (pluviométrie) | non | opérationnelle |
| SoilGrids / ISRIC (texture du sol) | non | ⚠️ service en pause côté ISRIC (vérifié le 19/09/2026), client prêt |
| OpenTopography (MNT 30 m) | **oui** | opérationnelle une fois la clé collée par l'utilisateur |

**Règle absolue respectée à la lettre (§3.3)** : le logiciel ne crée jamais
de compte, ne se connecte à aucun compte Google/Gmail, n'automatise aucune
inscription. Une source à clé reste désactivée tant que l'utilisateur n'a
pas collé lui-même, dans l'onglet Données, la clé obtenue en s'inscrivant
ailleurs. Le rappel de cette règle est affiché en permanence en tête
d'onglet.

**Cache et re-jeu hors ligne** : chaque téléchargement est identifié par le
CONTOUR du terrain (arrondi à ~11 cm, insensible au bruit de tracé) et les
paramètres qui changent le résultat — un terrain retravaillé retrouve son
cache instantanément, sans nouvel appel réseau (vérifié : voir plus bas).

### Limite de vérification, propre à cet environnement de développement

Le réseau sortant de cet environnement est filtré par liste blanche et ne
couvre aucun des 5 services externes — chaque tentative de téléchargement y
échoue avec `Host not in allowlist`. C'est la même limite que documentait
déjà `nasaPowerClient.js` de HydroCrue (« l'appel réseau lui-même n'a pas pu
être testé en conditions réelles dans cet environnement »). Ce qui a été
vérifié malgré cette limite, en conditions réelles dans Chromium :

- construction d'URL et analyse de réponse de **chaque** client, sur
  réponses synthétiques conformes au format documenté (`npm test`) ;
- le registre, l'enregistrement/la suppression d'une clé, le démarrage d'un
  job, son état d'erreur, et son rejeu instantané depuis un cache
  pré-rempli — bout en bout, serveur + interface ;
- l'échec réseau réel (bloqué par le pare-feu sortant du bac à sable) est
  capturé proprement et affiché à l'écran, sans page blanche ni plantage.

Ce qui reste à vérifier en dehors de ce bac à sable, sur un poste avec accès
Internet normal : qu'une réponse RÉELLE de chaque service correspond bien
au format documenté que les tests reproduisent.

## Étape 5 — dérivation des facteurs

Cinq modules purs (`src/calculations/`), chacun testé sur MNT synthétique
avec résultat calculable à la main (§7) :

| Module | Contenu |
|---|---|
| `grilleLocale.js` | Projection métrique locale (voir ci-dessous) |
| `grilleMnt.js` | Grille de calcul + interpolation bilinéaire du MNT |
| `derivesMnt.js` | Pente (Horn, 1981) et courbure (Zevenbergen & Thorne, 1987) |
| `hydrologieGrille.js` | Remplissage des cuvettes (Planchon & Darboux, 2001), direction et accumulation **D8**, TWI |
| `geometrieLigneaire.js` | Densité linéaire (drainage, linéaments) et distance aux cours d'eau |

Avec `lithologieSol` (SoilGrids, étape 4) et `pluviometrie` (NASA POWER,
étape 4, déjà agrégée en moyenne annuelle), les 8 facteurs du §3.4 sont
tous disponibles ; leur combinaison par AHP est l'étape 6.

### ⚠️ Écart assumé : pas de vraie projection UTM

Le cahier des charges (§4) demande une grille construite « dans une
projection métrique locale (UTM du fuseau du terrain) ». Écrire cette
projection (série de Krüger à l'ordre n⁶) demande de vérifier une table de
coefficients à plusieurs termes — et `WebFetch` s'est révélé bloqué, dans
cette session, sur **toutes** les sources de référence testées (Wikipedia,
movable-type.co.uk, neacsu.net), pas seulement celles déjà signalées à
l'étape 1. Plutôt que de recopier une formule de mémoire sans pouvoir la
vérifier — précisément ce que le cahier des charges interdit (§8) —
`grilleLocale.js` utilise un plan tangent local au centroïde du terrain,
mis à l'échelle par différences finies **géodésiques exactes**
(`calculations/geodesie.js`, le moteur de Karney déjà validé à l'étape 3).

Cette projection est trivialement inversible (aucune itération de
latitude de pied, contrairement à l'inverse d'une vraie UTM) et sa
distorsion est **mesurée**, pas supposée : `distorsionMaximale_relatif()`
la calcule avec le même moteur géodésique, et un avertissement est émis
au-delà de 0,1 % (soit 1 m d'écart par km — déjà sous la résolution du
MNT, ≈ 90 m). Sur l'échelle visée par ce logiciel (une parcelle), la
distorsion mesurée est de l'ordre de 10⁻⁵, très en dessous de ce seuil
(voir `tests/unit-grille-locale.test.js`).

**À revoir dès que `coordonnees.js` sera fourni** (§2.2) : son système
`utm-wgs84`, une fois copié tel quel, devient la référence à utiliser ici
— `versLocal`/`versGeographique` ont les mêmes signatures qu'un
remplacement demanderait, pour que ce changement reste local à
`grilleLocale.js`.

### Choix algorithmiques explicites (§4 : « dis lequel »)

- **TWI / aire drainée : D8** (O'Callaghan & Mark, 1984), pas D-infini —
  plus simple à valider analytiquement sur un MNT synthétique, suffisant
  à l'échelle d'une parcelle (les biais directionnels connus de D8 sur de
  grands bassins allongés n'ont pas d'effet notable ici).
- **Remplissage des cuvettes : Planchon & Darboux (2001)**, incrément
  minimal ε = 1 mm (choix par défaut, ajustable — très en dessous de la
  précision verticale réelle d'un MNT satellitaire).
- **Courbure : Zevenbergen & Thorne (1987)**, courbure totale
  `-2(D+E)` — toujours définie (pas de division par le gradient au carré,
  contrairement aux courbures de profil/en plan, indéfinies en terrain
  plat). Signe vérifié analytiquement : une cuvette (paraboloïde
  `z=a(x²+y²)`, a>0) donne `-4a < 0` — négatif = concave = favorable,
  conforme au §3.4.

### Un bug de conception trouvé en écrivant les tests, pas en relisant le code

Le premier scénario de test pour la direction D8 (une cuvette entourée
d'un bord de grille *bas*, pensé comme un exutoire) s'est révélé
**inutilisable** : D8 choisit la pente la plus **forte**, pas le voisin le
plus **bas** — un bord suffisamment bas crée des raccourcis diagonaux
compétitifs avec le chemin attendu vers le col. Reconstruit avec un
scénario sans cette ambiguïté (une tranchée encaissée dans un mur bien
plus haut) — et même celui-ci a trahi un second piège à la première
dérivation à la main (les rangées immédiatement adjacentes à la tranchée
y drainent aussi) : les valeurs finales ont été confirmées par un script
de contrôle avant d'être figées dans le test, pas simplement re-dérivées
une troisième fois à la main (voir l'en-tête de
`tests/unit-hydrologie-grille.test.js` pour le détail).

## Étape 6 — moteur AHP, cohérence, reclassement

Deux modules purs (`src/calculations/`) :

| Module | Contenu |
|---|---|
| `ahp.js` | Poids AHP (vecteur propre principal, puissance itérée), CI/CR (Saaty, 1980), refus explicite si CR ≥ 0,10, renormalisation des poids quand un facteur est désactivé |
| `reclassement.js` | Reclassement 1..5 sur seuils éditables (bornes exactes testées), seuils par défaut calculés sur les données réelles (quantiles), direction croissante/décroissante par facteur |

Aucune interface n'accompagne cette étape (comme l'étape 5) : ce sont des
modules de calcul purs, consommés par la carte de favorabilité de l'étape 7.

### Poids AHP : vecteur propre, pas une moyenne de colonnes

Le poids de chaque facteur est le vecteur propre principal de la matrice
de comparaisons, obtenu par puissance itérée (convergence à 10⁻¹² sur le
poids de chaque facteur, échec explicite au-delà de 1000 itérations —
jamais un résultat approché en silence, §4). C'est la méthode exacte de
Saaty, plus précise que l'approximation courante « moyenne des colonnes
normalisées ». Vérifiée sur une propriété mathématique indépendante du
code : une matrice construite comme les ratios EXACTS d'un vecteur de
poids connu est, par définition, parfaitement cohérente (λmax = n, CI =
CR = 0) — `tests/unit-ahp.test.js` construit un tel cas (w=[8,4,2,1]) et
vérifie que le vecteur propre retrouve exactement ce vecteur, plutôt que
de comparer à une valeur recopiée d'ailleurs.

### Refus explicite si la matrice est incohérente (§3.4, §5)

`calculerPoidsAhp` refuse de produire un poids si CR ≥ 0,10 (seuil de
Saaty, universel dans la littérature AHP) : le cahier des charges
interdit qu'un jugement contradictoire produise un chiffre qui a l'air
valide. Le refus nomme les paires de comparaisons les plus contradictoires
(`pairesLesPlusIncoherentes`), pour que l'utilisateur sache lesquelles
revoir plutôt que de recevoir un simple message bloquant. Testé sur un
cas d'école d'incohérence maximale (cycle A≫B≫C≫A sur l'échelle de Saaty,
CR calculé ≈ 6,13 — trente fois le seuil).

### Honnêteté sur la matrice de comparaisons par défaut

Le cahier des charges (§3.4) demande que chaque valeur par défaut porte
en commentaire sa référence bibliographique. Recherche menée pour cette
étape (19/09/2026) : **aucune publication ne fournit une matrice 8×8 pour
exactement ces 8 facteurs**, et les études publiées ne s'accordent pas
entre elles sur des poids numériques — deux exemples trouvés : une étude
classe densité de linéaments / pente / densité de drainage en tête ;
une autre (facteurs proches mais différents) donne lithologie 38 %,
occupation du sol 16 %, TWI 14 %, densité de linéaments 10 %, pente 9 %,
densité de drainage 7 %, sol 3 %, pluviométrie 3 %. Plutôt que de citer
une matrice publiée comme si elle correspondait à ce jeu de facteurs (ce
qu'elle ne fait pas), `MATRICE_DEFAUT_AHP` documente honnêtement qu'elle
reprend seulement un ORDRE de grandeur défendable pour un contexte de
socle fracturé, construite pour être cohérente (CR = 0,079, **calculé**
par le module lui-même, pas visé a priori) et **entièrement modifiable** —
le CR reste recalculé et affiché à chaque modification.

### Reclassement : seuils calculés sur les données plutôt qu'inventés

Pour la pente, un seuil absolu existe et peut être cité honnêtement
(classes de pente usuelles en évaluation de l'aptitude à l'infiltration,
FAO, fusionnées à 5 classes : 2/5/10/20 %). Pour les 7 autres facteurs
(TWI, densités, distance, courbure, lithologie, pluviométrie), aucun
seuil absolu universel n'existe : le TWI, en particulier, dépend de la
résolution de grille (déjà documenté dans `hydrologieGrille.js`) — fixer
un nombre absolu aurait été exactement la « constante sans origine »
interdite par le cahier des charges (§4). `seuilsQuantiles()` calcule
donc des seuils par défaut à partir des données réelles du terrain
analysé (quantiles 20/40/60/80 %, méthode usuelle de classification par
quantiles), toujours affichés et modifiables (§3.4).

Le sens de variation (valeur brute croissante = plus ou moins favorable)
est documenté facteur par facteur dans `SENS_DEFAUT_PAR_FACTEUR`, avec sa
justification hydrogéologique — à une exception notée explicitement :
`lithologieSol` n'a pas encore de source de données réellement câblée
(SoilGrids reste `indisponibleTemporairement`, étape 4), donc son sens
par défaut est arbitraire et marqué comme tel dans le code, pas présenté
comme une conclusion.

## Étape 7 — carte de favorabilité, classement des points

Deux nouveaux modules purs (`src/calculations/`), plus une extraction
d'architecture :

| Module | Contenu |
|---|---|
| `facteurs.js` | Assemble les 8 facteurs du §3.4 à partir des données déjà téléchargées (étape 4) et des modules de calcul de l'étape 5 — la correspondance facteur ↔ source(s) est écrite UNE FOIS, ici |
| `favorabilite.js` | Reclasse les 8 grilles (via `reclassement.js`), les combine par les poids AHP (`ahp.js`) en un score 1..5, classe les N meilleurs points |
| `carteBase.js` | Fond de carte (Esri World Imagery + CARTO, `ZOOM_MAX=17`) extrait de `CarteTerrain.js` pour être PARTAGÉ, pas recopié, par la future carte de favorabilité — §2/§8 imposent de ne jamais faire diverger le fond de carte |

### Onglets Critères et Résultats, et le pipeline qui les alimente

Trois fichiers de plus branchent le moteur ci-dessus sur l'interface :

| Fichier | Contenu |
|---|---|
| `services/pipelineClient.js` | Redemande les 4 sources déjà téléchargées via EXACTEMENT la même API que `DonneesTab.js` (étape 4) — réponse quasi instantanée depuis le cache serveur si rien n'a changé — puis appelle `facteurs.construireFacteurs()` |
| `tabs/facteursCriteres.js` | Ordre de priorité PARTAGÉ entre les deux onglets pour « quel seuil/sens/poids effectif utiliser » (réglage utilisateur > défaut absolu défendable (pente) > quantiles calculés sur les données réelles > `null`) — écrit une seule fois pour que les deux onglets ne puissent jamais se contredire |
| `tabs/CriteresTab.js` | Active/désactive les 8 facteurs, seuils éditables (pré-remplis par les quantiles calculés dès que les données sont là), matrice de comparaisons AHP (28 paires, échelle de Saaty) avec poids et CR recalculés EN DIRECT à chaque changement |
| `tabs/ResultatsTab.js` + `CarteFavorabilite.js` | Lance le pipeline, reclasse, combine, classe les meilleurs points, et affiche une carte (fond partagé via `carteBase.js`) colorée par classe + la liste classée |

**Pourquoi les données de l'étape 4 sont redemandées plutôt que réutilisées
telles quelles** : `DonneesTab.js` ne conserve QUE les métadonnées d'un
téléchargement dans l'état du projet, pas les données elles-mêmes (voir
son en-tête) — celles-ci restent dans le cache disque du serveur, tenu
par le contour du terrain. `pipelineClient.js` les redemande via la même
API, ce qui répond quasi instantanément depuis ce cache si le contour
n'a pas changé (§3.3 : « re-jouable hors ligne »), sans dupliquer la
logique de téléchargement.

**Vérifié de bout en bout** (Playwright, terrain saisi au clavier) :
- Sans aucune source disponible (réseau sortant bloqué dans cet
  environnement de développement — même caveat que pour toutes les
  autres sources de ce projet) : chaque échec est nommé individuellement,
  tous les facteurs grillés se désactivent avec l'avertissement
  `facAvtMntManquant`, aucun plantage, aucun résultat qui aurait l'air
  valide.
- Avec les 4 sources pré-remplies dans le cache serveur (script de test,
  MNT synthétique avec un creux central, cours d'eau et faille
  traversant le terrain) : seuils calculés par quantiles affichés dans
  Critères, CR = 0,079 (matrice par défaut), carte de favorabilité
  colorée cohérente avec le creux synthétique (centre plus favorable),
  liste des 10 meilleurs points correctement classée et géoréférencée.

### Pourquoi la lithologie et la pluviométrie sont des valeurs UNIQUES, pas des grilles

SoilGrids et NASA POWER sont interrogés en un seul point (le centre
approché du terrain) à des résolutions natives (≈ 250 m et ≈ 50-60 km)
bien plus grossières que la parcelle visée par ce logiciel — construire
une grille interpolée à partir d'un seul point serait une fausse
précision. La valeur est donc appliquée uniformément sur tout le
terrain, ce qui est dit explicitement (avertissement affiché, pas un
défaut silencieux) plutôt que présenté comme une vraie variation
spatiale mesurée.

Pour la lithologie/sol, faute d'une vraie classification lithologique
câblée, `facteurs.js` utilise le **pourcentage de sable** (SoilGrids,
0-30 cm) comme facteur de favorabilité : un sol sableux a une
conductivité hydraulique bien supérieure à un sol argileux (principe de
base de la physique des sols). C'est une simplification assumée — une
vraie évaluation lithologique demanderait la nature de la roche et la
profondeur au substratum, pas seulement la texture de surface — et de
toute façon SoilGrids reste marqué `indisponibleTemporairement` (l'API
ISRIC était en pause au 19/09/2026).

### La grille de calcul dépend du MNT, donc TOUS les facteurs grillés en dépendent

`construireGrilleCalcul()` (étape 5) définit la géométrie de la grille
(bornes, taille de maille, masque du polygone) EN MÊME TEMPS qu'elle
interpole l'altitude. Si le MNT est indisponible, ni la pente/TWI/
courbure NI les densités/distance (qui n'ont pourtant rien à voir avec
l'altitude) ne peuvent être calculées, faute de géométrie de grille sur
laquelle les poser — `facteurs.js` le dit explicitement
(`facAvtMntManquant`) plutôt que de laisser deviner pourquoi la carte
resterait vide.

### Score de favorabilité : jamais un pourcentage

Le score combiné est une somme pondérée de classes 1 à 5 par des poids
qui somment à 1 (renormalisation AHP, étape 6) : il reste donc lui-même
dans [1,5], directement comparable aux classes de chaque facteur.
Volontairement PAS ramené à un pourcentage 0-100 % : un pourcentage
ressemblerait à une probabilité de trouver de l'eau, ce que ce logiciel
s'interdit explicitement de présenter (§5, voir `Avertissement.js`).

Règle de complétude, testée : **un seul facteur ACTIF manquant à une
cellule invalide le score de cette cellule entière** (`NaN`), jamais une
moyenne recalculée en silence sur les facteurs restants — la pondération
AHP a été choisie par l'utilisateur pour un ensemble précis de facteurs ;
recalculer localement reviendrait à lui faire dire autre chose que ce
qu'il a validé, sans le prévenir.

## Étape 8 — analyse de sensibilité, rapport, export PNG

Un nouveau module de calcul pur, deux nouveaux onglets, et un partage
d'état entre onglets :

| Fichier | Contenu |
|---|---|
| `calculations/sensibilite.js` | Perturbe le poids de chaque facteur actif de ±20 % (redistribution proportionnelle des autres, méthode de Triantaphyllou & Sanchez 1997), mesure l'écart moyen du score et si le meilleur point change |
| `tabs/SensibiliteTab.js` | Graphique (recharts, tornado) + tableau détaillé, triés par influence décroissante |
| `tabs/RapportTab.js` | Synthèse imprimable : résumé, carte exportable en PNG, poids, meilleurs points, observations libres de l'ingénieur |
| `carteBase.js` (complété) | `creerCanvasExport()` et `palierEchelle()` extraits de `CarteTerrain.js` pour être PARTAGÉS par `CarteFavorabilite.js` — même logique de compositing de tuiles, jamais deux copies |

### Un seul calcul, partagé par Résultats, Sensibilité et Rapport

`App.js` porte désormais `resultatCalcul` (grille, classes reclassées,
poids, score, meilleurs points) — une donnée DÉRIVÉE, PAS dans `etat`
(donc pas dans le `.hpu` : entièrement recalculable). Résultats le
calcule et le publie ; Sensibilité et Rapport le RÉUTILISENT tel quel,
au lieu de relancer chacun leur propre pipeline, pour qu'il ne puisse
jamais exister trois résultats légèrement différents pour le même
terrain. Il est **invalidé automatiquement** dès que le terrain ou les
critères (facteurs actifs, seuils, matrice AHP) changent — Sensibilité
et Rapport redeviennent alors des états vides explicites tant que
l'utilisateur n'a pas relancé le calcul, jamais un résultat obsolète
affiché comme à jour (§5). Vérifié par Playwright : modifier un sommet
du terrain après un calcul fait bien disparaître le rapport.

### Méthode de sensibilité : « one-at-a-time » avec redistribution proportionnelle

Pour chaque facteur actif, son poids est multiplié par 1,2 puis 0,8 (±20 %,
imposé par le cahier des charges), et **tous les autres facteurs actifs
sont redistribués proportionnellement entre eux** pour que la somme
reste 1 — c'est la méthode usuelle d'analyse de sensibilité en AHP
(Triantaphyllou & Sanchez, 1997). Propriété vérifiée par test : le
RAPPORT entre deux facteurs non perturbés reste rigoureusement inchangé
après redistribution (ce n'est pas une coïncidence numérique, c'est la
définition même d'une redistribution proportionnelle).

Ce qui est mesuré et affiché pour chaque facteur : l'écart moyen absolu
du score sur les cellules valides (impact global sur la carte), et si le
MEILLEUR point change (impact sur la décision elle-même — l'indicateur
le plus concret). Avec un seul facteur actif, l'analyse le dit
explicitement (`insuffisant: true`) plutôt que d'afficher un tableau vide
sans explication.

### Export PNG : cartouche avec avertissement scientifique baké dans l'image

`CarteFavorabilite.js` exporte la carte de favorabilité en PNG avec la
même cartouche professionnelle que la carte du terrain (titre, échelle
graphique, légende) — et, comme pour elle, **l'avertissement
scientifique du §5 est dessiné directement sur l'image**, pas seulement
affiché à l'écran : une image exportée circule seule (message, e-mail),
détachée de l'application qui la nuance habituellement.

## Notes d'architecture

- **Pas de `"type": "module"` à la racine** : Webpack doit pouvoir résoudre
  `./App` sans extension. Chaque dossier réellement ESM porte son propre
  petit `package.json` (`src/services/`, `src/calculations/`, `src/data/`,
  `src/i18n/`, `tests/`). Ajouter ce champ à `src/` casse le build — vérifié.
- **Tabler Icons est servi localement** (`public/vendor/tabler-icons/`,
  licence MIT), pas depuis un CDN comme dans HydroCrue : le logiciel est
  distribué en poste isolé, souvent sans Internet, et un CDN ferait perdre
  toutes les icônes hors ligne. Ce n'est pas une dépendance npm.
- **Dépendances runtime volontairement limitées** à `leaflet`, `react`,
  `react-dom`, `react-scripts`, `recharts`, `web-vitals`. Tout le reste
  s'écrit à la main : chaque dépendance est un risque d'installation sur un
  poste hors ligne.

## Limites connues

Cette section rassemble, en un seul endroit, tous les écarts et
simplifications assumés au fil des 9 étapes — chacun est déjà documenté
en détail dans le code et la section d'étape correspondante ; ce qui
suit n'en est que l'index, pour qu'aucun ne reste enterré dans un
commentaire qu'on ne pense pas à relire.

### 1. Quatre fichiers HydroCrue jamais fournis

Le cahier des charges (§2.2, §2.3) imposait de RÉUTILISER, sans les
modifier, cinq fichiers de HydroCrue. Ils ont été demandés à l'étape 1,
puis re-demandés aux étapes 3, 4 et 5 (systématiquement vérifiés absents
via `git ls-tree` sur le dépôt de référence à chaque fois) — jamais
fournis. **Mise à jour du 20/09/2026** : un utilisateur réel a signalé
que « les coordonnées Lambert et UTM ne fonctionnent pas », bloquant
l'usage du logiciel au Maroc — plutôt que d'attendre indéfiniment un
fichier qui n'arrive pas, `calculations/coordonnees.js` a été
**implémenté directement**, à partir de paramètres EPSG vérifiés (voir
§2 ci-dessous) : ce n'est donc plus « le fichier HydroCrue », c'est une
implémentation indépendante, documentée et testée. Les 4 AUTRES fichiers
restent non fournis :

| Fichier attendu | Ce qu'il aurait apporté | Ce qui existe à la place |
|---|---|---|
| `services/miniXlsx.js` | Import de classeurs `.xlsx` | Seul le CSV fonctionne ; `.xlsx` renvoie un message expliquant comment enregistrer en CSV (`importTerrain.js`, `lireXlsx()`) |
| `services/importPoints.js` | Logique d'import Excel déjà écrite dans HydroCrue | Réimplémentée pour le CSV dans `importTerrain.js` |
| `calculations/DelimitationCarteMulti.js` | Carte de saisie multi-polygone de référence | `CarteTerrain.js` réécrit pour HydroPuits (polygone unique éditable), sans base à comparer au pixel près |
| `unit-coordonnees.test.js` | Suite de tests de référence HydroCrue pour les conversions de coordonnées | `tests/unit-coordonnees.test.js` réécrit indépendamment (round-trips + cross-validation contre le moteur géodésique, voir §2) |

Conséquence résiduelle pour l'utilisateur : un fichier `.xlsx` doit
encore être réenregistré en CSV avant import (les coordonnées, elles,
fonctionnent dans les 6 systèmes listés au §2).

### 2. Lambert Merchich et UTM : implémentés le 20/09/2026, à partir de paramètres vérifiés

`calculations/coordonnees.js` convertit désormais WGS84 ↔ 6 systèmes :
UTM WGS84 (n'importe quel fuseau) et les 4 zones Lambert Merchich (Nord,
Sud, Sahara Nord, Sahara Sud) — branché dans `TerrainTab.js` (saisie au
clavier ET import CSV ; le tracé à la carte reste en WGS84, Leaflet
travaillant nativement dans ce système).

**Méthode** : (1) conversion géodésique ↔ géocentrique cartésien par
formule fermée standard ; (2) changement de datum Merchich↔WGS84 par
translation géocentrique à 3 paramètres (EPSG:1166, précision ±7 m
annoncée par l'EPSG lui-même — pas un calage cadastral centimétrique,
mais très en dessous de la résolution utile de ce logiciel, grille
≈ 90 m) ; (3) projection Lambert conforme conique à 1 parallèle
(EPSG 9801, formules de Snyder 1987) ou Mercator transverse (UTM, mêmes
formules, précision <1 mm à moins de 3° du méridien central — pas la
série de Krüger à l'ordre n⁶ utilisée pour une précision géodésique
extrême, inutile ici).

**Vérification des paramètres** (20/09/2026, `WebSearch` — `WebFetch`
restant bloqué dans cet environnement pour epsg.io/epsg.org eux-mêmes) :
chaque paramètre (ellipsoïde Clarke 1880 IGN, lat₀/lon₀/k₀/FE/FN des 4
zones, décalage de datum) recoupé sur au moins 3 miroirs indépendants du
registre EPSG (dont OSGeo/PROJ-CRS-Explorer, GDAL, JuliaEarth/
CoordRefSystems.jl) plus un support de cours de géodésie universitaire
marocain — voir l'en-tête de `coordonnees.js` pour le détail complet,
y compris un site tiers non officiel repéré comme donnant des
paramètres ERRONÉS et délibérément écarté comme source.

**Vérification du calcul** (indépendante des paramètres eux-mêmes,
`tests/unit-coordonnees.test.js`) : round-trip WGS84↔système pour les 6
systèmes (écart < 1 mm), l'origine de chaque zone Lambert reprojette
exactement sur (FE, FN), et — cross-validation la plus forte — la
distance projetée le long du parallèle standard d'une zone Lambert,
divisée par k₀, correspond à la distance géodésique **calculée par le
moteur de Karney déjà validé** (`geodesie.js`) à 7 ppm près : c'est la
propriété mathématique définissant une projection conforme au parallèle
standard, vérifiée contre un oracle indépendant, pas juste un round-trip
interne au même code.

**Ce qui reste désactivé** : `utm-point58` et `utm-nordsahara59`, deux
datums historiques propres au Sahara occidental dont les paramètres de
changement de datum n'ont pas pu être vérifiés avec la même rigueur —
visibles dans le sélecteur, désactivés, raison affichée, comme
auparavant pour l'ensemble des systèmes non-WGS84.

**Ce qui n'a volontairement PAS changé** : `calculations/grilleLocale.js`
(la grille de CALCUL interne — pente/TWI/densités, §4/§5 ci-dessus)
continue d'utiliser son plan tangent local, pas les formules UTM
ci-dessus. Un remplacement reste possible (les signatures
`versLocal`/`versGeographique` ont été conçues pour ça) mais n'a pas été
fait dans cette correction : la distorsion déjà mesurée de cette
approche (~10⁻⁵, tests/unit-grille-locale.test.js) est sans rapport
avec le bug réel signalé (la saisie utilisateur, pas la grille de
calcul), et le risque d'un changement non sollicité dans un module qui
alimente tout le pipeline de facteurs dépassait le bénéfice pratique.

### 3. Réseau sortant bloqué dans cet environnement de développement — mais partiellement vérifié depuis, en usage réel

Aucun des 5 clients réseau ne peut être exercé contre son vrai serveur
distant DEPUIS CET ENVIRONNEMENT DE DÉVELOPPEMENT : le bac à sable
bloque toute connexion sortante hors d'une liste précise (registre npm,
dépôts de paquets), confirmée en observant les rejets de connexion du
proxy sortant. Ce n'est pas propre à ce projet — HydroCrue portait déjà
la même réserve sur son client NASA POWER.

**Mise à jour du 20/09/2026 — premiers résultats réels** : un
utilisateur exécutant HydroPuits sur un poste avec accès réseau normal a
transmis des captures d'écran de l'onglet Données. Trois bugs RÉELS en
ont été identifiés et corrigés (recherches `WebSearch` croisant plusieurs
sources indépendantes pour chacun, aucune donnée réelle recopiée
aveuglément) :

- **Overpass** (« This operation was aborted » sur les 2 miroirs) :
  délai côté serveur porté de 60 à 90 s, délai côté client de 70 à
  120 s — les instances publiques peuvent être plus lentes que prévu en
  période de charge (`overpassClient.js`, `telechargementJobs.js`).
- **SoilGrids** (« propriété 'clay' absente pour la profondeur 0-30cm »)
  : bug de conception identifié ET confirmé indépendamment par
  recherche sur le code source réel d'un client tiers (`ncss-tech/
  soilDB`, R/CRAN) — SoilGrids ne publie **aucune** granule native
  « 0-30cm » (seulement 0-5/5-15/15-30/30-60/60-100/100-200 cm) ; le
  client interroge désormais les 3 granules qui couvrent 0-30 cm et
  calcule une moyenne pondérée par leur épaisseur (`soilGridsClient.js`).
- **OpenTopography** (« nodata_value manquant ») : le parseur
  n'acceptait que la convention d'en-tête `xllcorner`/`yllcorner` ; la
  variante `xllcenter`/`yllcenter`, également documentée par la
  spécification Esri du format ASCII Grid, est désormais acceptée
  (`openTopographyClient.js`) — cause probable mais pas formellement
  confirmée (le portail OpenTopography restait bloqué depuis CET
  environnement pour capturer une réponse brute réelle).

Ce que cette correction NE remplace PAS : aucun de ces 3 clients n'a
encore été revérifié contre son vrai serveur DEPUIS cet environnement de
développement (toujours bloqué) — seule la recherche croisée et le
raisonnement à partir du message d'erreur réel transmis par
l'utilisateur ont guidé chaque correction. **Confirmation par
l'utilisateur, sur son propre poste, encore attendue.**

Conséquence et mitigation, inchangées pour le reste :
- Construction d'URL et analyse de réponse restent testées sur des
  réponses **synthétiques reproduisant le format documenté** de chaque
  API (voir chaque `tests/unit-*-client.test.js`).
- Le pipeline COMPLET (téléchargement → grille → dérivées → hydrologie
  → géométrie linéaire → reclassement → AHP → carte) a été vérifié de
  bout en bout de façon réaliste en préremplissant le cache disque du
  serveur (`cacheDonnees.js`) avec des données synthétiques MAIS
  conformes au format réel, puis en pilotant l'application avec
  Playwright (voir étapes 7 et 8 ci-dessus).

### 4. Lithologie/sol : simplification assumée, source en pause

`facteurs.js` utilise le **pourcentage de sable** (SoilGrids, 0-30 cm)
comme proxy de favorabilité lithologique — un sol sableux est plus
perméable qu'un sol argileux, principe de base de la physique des sols,
mais ce n'est PAS une vraie lithologie (nature de la roche, profondeur
au substratum). De plus, l'API ISRIC SoilGrids était **en pause**
(« temporarily paused ») au 19/09/2026 — la source reste marquée
`indisponibleTemporairement` dans `sourcesDonnees.js`, et le facteur
Lithologie/sol est **désactivé par défaut** dans l'onglet Critères tant
qu'elle ne l'est pas.

### 5. Lithologie et pluviométrie : valeurs ponctuelles, pas de vraies grilles

SoilGrids (≈ 250 m) et NASA POWER (≈ 50-60 km, grille de réanalyse
MERRA-2) sont interrogés en UN SEUL point (le centre approché du
terrain) : leur résolution native est bien plus grossière que la
parcelle visée par ce logiciel, donc interpoler une grille à partir d'un
point unique serait une fausse précision. La valeur est appliquée
UNIFORMÉMENT sur tout le terrain — dit explicitement (avertissement à
l'écran), jamais présenté comme une variation spatiale mesurée.

### 6. Pas de détection automatique de linéaments sur MNT

§3.4 mentionne « densité de linéaments : OSM + détection sur MNT ».
Seule la première moitié est câblée : le tag OpenStreetMap
`geological=fault` (via Overpass). Aucun algorithme de détection
automatique de linéaments sur MNT (filtrage directionnel, détection de
ruptures de pente alignées, etc.) n'a été implémenté — la couverture de
ce tag dans OSM est elle-même très inégale, ce que `overpassClient.js`
signale explicitement (`srcAvtAucuneFailleOsm`) plutôt que de laisser
croire à un socle homogène en son absence.

### 7. Matrice AHP par défaut : un ordre défendable, pas une matrice publiée

Aucune publication ne fournit une matrice de comparaisons 8×8 pour
exactement les 8 facteurs de ce logiciel — les études AHP publiées sur
le potentiel en eaux souterraines portent sur des jeux de facteurs
voisins mais différents, et ne s'accordent PAS entre elles sur des poids
numériques (deux exemples opposés trouvés et cités dans `ahp.js` et
l'étape 6 ci-dessus). `MATRICE_DEFAUT_AHP` encode donc un ORDRE de
grandeur défendable pour un contexte de socle fracturé, construit pour
être cohérent (CR=0,079, calculé et vérifié par test) et **entièrement
modifiable** dans l'onglet Critères — jamais présentée comme LA matrice
de référence de la littérature.

### 8. Seuils de reclassement par défaut : calculés sur les données, pas universels

Sauf pour la pente (classes FAO, seuil absolu défendable), les 7 autres
facteurs n'ont pas de seuil universel citable — le TWI, en particulier,
dépend directement de la résolution de grille. Les seuils par défaut
sont donc calculés par QUANTILES sur les données réelles du terrain
analysé (`reclassement.seuilsQuantiles()`), pas des nombres absolus
inventés, et restent modifiables dans l'onglet Critères.

### 9. D8 plutôt que D-infini pour le TWI et l'aire drainée

Choix explicite (§4 : « dis lequel ») documenté dans
`hydrologieGrille.js` : D8 (O'Callaghan & Mark, 1984) plutôt que D∞
(Tarboton, 1997). D8 est connu pour introduire un biais directionnel sur
de grands bassins versants allongés — jugé non significatif à l'échelle
d'une parcelle de quelques hectares, l'échelle visée par ce logiciel, et
plus simple à valider analytiquement sur un MNT synthétique.

### 10. Résolution du MNT (~90 m) : limite de discrimination sur petit terrain

Un terrain plus petit qu'une maille du MNT (< 8 100 m², `polygone.js`,
`AIRE_MINIMALE_ANALYSABLE_M2`) tiendrait dans un seul pixel altimétrique
: les facteurs dérivés du relief y seraient constants, donc sans pouvoir
discriminant. Ce n'est pas un refus, seulement un avertissement affiché
— la précision du résultat reste bornée par la résolution de la donnée
d'entrée, jamais supérieure à elle.

### 11. Aucune automatisation de compte ou d'inscription (règle absolue respectée)

Conformément à §3.3, le logiciel ne crée et ne remplit jamais un compte,
ne se connecte jamais à un compte Google/Gmail, et n'automatise aucune
inscription — rappelé en permanence à l'écran dans l'onglet Données. Les
2 sources à clé (OpenTopography, et SoilGrids si elle demandait une
clé) restent désactivées tant que l'utilisateur n'a pas obtenu et collé
lui-même sa propre clé.

### 12. Pas d'export PDF direct

Le rapport s'exporte en deux morceaux, pas un seul fichier PDF composé :
la carte de favorabilité en PNG (cartouche avec avertissement baké dans
l'image, `CarteFavorabilite.js`), et le reste de l'onglet Rapport via le
bouton **Imprimer** déjà présent dans la barre d'outils
(`window.print()`, qui laisse le choix « Enregistrer en PDF » au
navigateur/à l'OS) — pas de générateur PDF maison qui aurait ajouté une
dépendance ou une bibliothèque de mise en page à écrire à la main.

### 13. Build Electron (`npm run dist`)

Voir la section [Build de distribution](#build-de-distribution)
ci-dessus pour le résultat exact obtenu dans cet environnement de
développement (Linux, sans accès réseau général) : la compilation React
et l'empaquetage Electron réussissent, seule la compilation finale du
stub NSIS échoue faute de Wine (dépendance système d'electron-builder
pour la compilation croisée Linux→Windows, pas un défaut du projet) —
et ce qu'il reste à vérifier sur un poste Windows avant une première
distribution.

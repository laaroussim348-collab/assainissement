# HydroPuits — Favorabilité hydrogéologique pour l'implantation d'un forage

> ⚠️ **README provisoire — étape 5 sur 9.** Le README complet (avec la
> section « Limites connues », la description du moteur AHP, des sources de
> données et de la procédure de build) est prévu à l'étape 9 du plan de
> construction. Ce fichier ne décrit que l'état actuel.

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
| 7 | Carte de favorabilité + classement des emplacements | à faire |
| 8 | Analyse de sensibilité + rapport + export PNG | à faire |
| 9 | README complet + build `npm run dist` | à faire |

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

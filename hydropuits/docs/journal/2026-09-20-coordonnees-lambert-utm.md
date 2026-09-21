# Journal — 20/09/2026 : coordonnées Lambert Maroc et UTM

> Entrée de journal. Décrit ce qui a été fait À CETTE DATE et pourquoi.
> L'état COURANT du logiciel est décrit dans `README.md` ; ce fichier ne
> se modifie plus. Voir `docs/journal/README.md` pour la raison de ce
> découpage.

**Déclencheur** : un utilisateur réel signale que « les coordonnées
Lambert et UTM ne fonctionnent pas », ce qui bloque l'usage du logiciel
au Maroc.

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
(la grille de CALCUL interne — pente/TWI/densités)
continue d'utiliser son plan tangent local, pas les formules UTM
ci-dessus. Un remplacement reste possible (les signatures
`versLocal`/`versGeographique` ont été conçues pour ça) mais n'a pas été
fait dans cette correction : la distorsion déjà mesurée de cette
approche (~10⁻⁵, tests/unit-grille-locale.test.js) est sans rapport
avec le bug réel signalé (la saisie utilisateur, pas la grille de
calcul), et le risque d'un changement non sollicité dans un module qui
alimente tout le pipeline de facteurs dépassait le bénéfice pratique.


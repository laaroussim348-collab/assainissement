# Journal — 20 et 21/09/2026 : pannes de téléchargement, du tâtonnement à la preuve

> Entrée de journal. Décrit ce qui a été fait À CES DATES et pourquoi.
> L'état COURANT du logiciel est décrit dans `README.md` ; ce fichier ne
> se modifie plus. Voir `docs/journal/README.md`.

**Déclencheur** : un utilisateur réel signale que les téléchargements de
données échouent. Trois tours ont été nécessaires — les deux premiers à
partir d'un message d'erreur sur une capture d'écran (donc en devinant,
et à côté de la cible), le troisième à partir d'un rapport de diagnostic
mesuré sur son poste (donc juste, du premier coup). La leçon est
consignée dans `CLAUDE.md` : ne pas corriger une panne réseau sans
l'avoir mesurée.

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

**Deuxième mise à jour du 20/09/2026 — l'utilisateur signale que les
téléchargements échouent toujours.** Deux corrections faites à partir
d'une simple capture d'écran n'ont pas suffi, et c'était prévisible :
un message d'erreur d'une ligne ne dit ni le code HTTP, ni le temps de
réponse, ni ce que le serveur a réellement renvoyé. Plutôt que de
deviner une troisième fois, quatre changements ont été faits, dont
aucun ne dépend d'une hypothèse sur la cause :

1. **Diagnostic réseau intégré** (`services/diagnosticReseau.js`,
   `services/diagnosticRapport.js`, bouton dans l'onglet Données).
   Teste les 9 cibles (5 API, les 2 instances Overpass, les 2 fonds de
   carte) DEPUIS LE POSTE DE L'UTILISATEUR et rapporte, pour chacune :
   code HTTP, temps de réponse, taille, et les 300 premiers caractères
   BRUTS de la réponse. Rapport copiable en un clic. **Aucune clé d'API
   n'y figure** — double censure testée sous 7 angles
   (`tests/unit-diagnostic-reseau.test.js`), une fuite de clé étant le
   seul vrai danger d'un rapport destiné à être transmis. Le panneau
   s'affiche même sans terrain tracé : c'est quand rien ne marche qu'on
   doit pouvoir savoir pourquoi.
2. **Réessais** (`services/reseauRobuste.js`) : il n'y en avait AUCUN
   dans tout le logiciel. Le téléchargement d'altimétrie enchaîne
   jusqu'à 40 requêtes ; un seul incident passager sur les 40 — coupure
   d'une seconde, 503 momentané, quota 429 — faisait échouer la
   totalité, sans conserver ce qui avait déjà répondu. Sur une connexion
   mobile ou lente, c'est le cas le plus probable, pas le cas rare.
   Désormais : 3 tentatives, temporisation exponentielle (1 s, 2 s,
   4 s), respect de `Retry-After`, et **aucun réessai sur une erreur
   définitive** (401, 403, 404 : réessayer une clé invalide ne la rendra
   pas valide). Pause de 120 ms entre les lots d'altimétrie, pour rester
   sous les 600 requêtes/minute documentées par Open-Meteo.
3. **Requête Overpass allégée** : `out geom;` remplace
   `out body; >; out skel qt;`. La récursion `>;` était l'étape la plus
   coûteuse côté serveur ET la plus volumineuse sur le réseau (un cours
   d'eau de 200 points renvoyé comme 200 objets JSON distincts à
   recoller côté client). `out geom;` donne la même information en une
   fois, avec nettement moins d'octets — cause plausible des délais
   dépassés sur connexion lente. Le parseur accepte les deux formats.
4. **Un résultat même quand une source tombe** : c'est le changement le
   plus visible. Un facteur actif dont la source n'avait pas répondu
   invalidait TOUTES les cellules (règle voulue de `favorabilite.js` :
   pas de moyenne partielle silencieuse), si bien qu'une seule source en
   panne ne dégradait pas le résultat mais le **supprimait entièrement**
   — l'utilisateur n'obtenait plus rien. Le facteur est maintenant
   écarté, les poids AHP renormalisés sur les restants, et la liste des
   facteurs écartés affichée à l'écran. Les deux propriétés qui rendent
   cela honnête sont testées : somme des poids exactement 1, et rapports
   entre facteurs conservés inchangés (`tests/unit-facteurs-criteres.test.js`).

Le diagnostic a été exercé de bout en bout depuis cet environnement
(serveur réel, interface réelle pilotée par Playwright) : il rapporte
correctement les 9 cibles en échec avec `HTTP 403 — Host not in
allowlist`, détecte que TOUT est bloqué, et le dit. C'est précisément le
comportement attendu ici — et la preuve que le rapport dira la vérité
sur un poste où, lui, le réseau fonctionne.

### 3 bis. Le diagnostic a tranché : les deux vraies causes, corrigées sur preuve

L'utilisateur a exécuté le diagnostic sur son poste et transmis le
rapport le 20/09/2026. **6 cibles sur 9 fonctionnaient** — Open-Meteo,
NASA POWER, SoilGrids, les deux fonds de carte et OpenTopography
répondaient toutes `HTTP 200`. Les deux seules pannes réelles n'avaient
AUCUN rapport avec ce qui avait été supposé lors des deux corrections
précédentes. C'est la justification a posteriori du diagnostic :
**deviner avait produit deux corrections à côté de la cible ; mesurer a
donné les deux causes en un seul aller-retour.**

**Cause n° 1 — Overpass refusait nos requêtes faute de `User-Agent`**
(ce n'était donc pas un problème de délai) :

```
overpass.kumi.systems → HTTP 429
  « Please include a meaningful User-Agent string with your requests
    to avoid rate-limiting. »
overpass-api.de       → HTTP 406 Not Acceptable (Apache)
```

Vérifié dans cet environnement : `fetch` de Node 22 envoie
`User-Agent: node` — littéralement — et `Accept: */*` (correct, donc la
négociation de contenu n'est pas en cause). Un User-Agent par défaut est
exactement ce que ces instances filtrent. `reseauRobuste.js` envoie
désormais `HydroPuits/0.1 (…)` sur **toute** requête sortante ; cela
répond aussi à la politique d'usage d'OSM/Overpass, qui exige qu'un
client s'identifie. La chaîne ne contient ni identifiant de poste ni
donnée personnelle (§3.3), et cela est testé. L'envoi effectif de
l'en-tête a été vérifié sur un serveur HTTP local — pas seulement dans
une constante.

**Cause n° 2 — OpenTopography ne déclare PAS de `NODATA_value`.** La
réponse brute capturée (emprise de 0,01° au Maroc, COP30) commence
ainsi :

```
ncols        36
nrows        36
xllcorner    -8.000138900000
yllcorner    31.630138900000
cellsize     0.000277777778
453.78460693359375 454.75750732421875 456.62158203125 ...
```

Cinq lignes d'en-tête, puis les altitudes — **aucune ligne
`NODATA_value`**, alors que le parseur l'exigeait. C'est conforme à la
spécification Esri, qui donne ce champ pour optionnel (défaut -9999), et
un générateur l'omet légitimement quand aucune cellule n'est vide — le
cas d'un MNT en plein continent. Le champ est donc devenu facultatif :
en son absence, la convention -9999 est appliquée **et affichée à
l'écran** (`srcAvtNodataAbsent`), jamais substituée en silence (§5).
Cet en-tête réel est désormais un cas de test (`ASCII_GRID_REEL_SANS_NODATA`)
— la seule réponse RÉELLE dont ce projet dispose, tout le reste étant
synthétique.

À noter : la variante `xllcenter`/`yllcenter` corrigée lors du tour
précédent n'était **pas** en cause ici (le fichier réel utilise bien
`xllcorner`). Le correctif reste valide et utile, mais il visait à côté.

**Deux conséquences heureuses du même rapport :**
- **SoilGrids est rétablie** (`HTTP 200` en 632 ms, réponse conforme).
  Le marquage `indisponibleTemporairement` est retiré et le facteur
  Lithologie/sol redevient **actif par défaut** : l'analyse repose
  désormais sur les **8** facteurs, non plus 7.
- **OpenTopography met 11,3 s pour 36×36 cellules.** Le service
  rééchantillonne à la demande, donc le temps croît avec la surface : le
  délai est porté de 60 s à 180 s, sur mesure et non par précaution
  vague.

Conséquence et mitigation, inchangées pour le reste :
- Construction d'URL et analyse de réponse restent testées sur des
  réponses **synthétiques reproduisant le format documenté** de chaque
  API (voir chaque `tests/unit-*-client.test.js`).
- Le pipeline COMPLET (téléchargement → grille → dérivées → hydrologie
  → géométrie linéaire → reclassement → AHP → carte) a été vérifié de
  bout en bout de façon réaliste en préremplissant le cache disque du
  serveur (`cacheDonnees.js`) avec des données synthétiques MAIS
  conformes au format réel, puis en pilotant l'application avec
  Playwright (voir les étapes 7 et 8 dans `README.md`).


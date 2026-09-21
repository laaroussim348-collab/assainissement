# Conventions du dépôt — à lire avant toute modification

Ce fichier existe parce que certaines erreurs ont été commises PLUSIEURS
FOIS. Chaque règle ci-dessous vient d'un échec réel, pas d'une
préférence de style. La cause de chacune est indiquée : elle explique
pourquoi la règle mérite d'être suivie même quand elle paraît excessive.

---

## 1. Ne jamais ajouter de récit daté à `README.md`

**Règle** : `README.md` décrit le logiciel **tel qu'il est aujourd'hui**.
Il ne contient ni « mise à jour du JJ/MM », ni « deuxième correction »,
ni section « X bis ». Le récit d'un épisode (panne constatée, cause,
correctif, ce qui restait incertain) va dans **un fichier neuf** :
`hydropuits/docs/journal/AAAA-MM-JJ-sujet.md`.

Si un épisode change ce que le logiciel FAIT, on met à jour la phrase
concernée du README — sans y recopier le récit.

**Pourquoi** : les correctifs de septembre 2026 ont été livrés en
plusieurs tours, et à chaque tour le récit était inséré au MÊME endroit
du README (section « Limites connues »). Les demandes de fusion de ce
dépôt sont intégrées en **squash**, ce qui réécrit l'historique : git ne
peut plus voir que le travail précédent de la branche est déjà dans
`main`, retombe sur la même région modifiée des deux côtés, et signale
un conflit. **Cela s'est produit trois fois de suite**, pour un contenu
qui ne présentait aucun désaccord réel. Un fichier que seul un côté crée
ne peut pas entrer en conflit : le problème disparaît par construction.

---

## 2. Fusion en squash : attendre la divergence et la traiter sans paniquer

**Règle** : quand une PR de ce dépôt est fusionnée, elle l'est en
**squash**. La branche de travail garde donc une histoire que `main`
ignore. Avant de « résoudre un conflit », **vérifier d'abord s'il y a un
vrai désaccord de contenu** :

```bash
git fetch origin main
git diff --stat <dernier-commit-déjà-fusionné> origin/main   # vide ?
git diff --stat HEAD origin/main                             # que manque-t-il à main ?
```

Si l'arbre de `main` est identique à celui de la branche avant ses
nouveaux commits, `main` ne contient **rien** que la branche n'ait déjà :
le conflit est un artefact du squash. Raccrocher l'ancêtre sans toucher
au contenu :

```bash
git merge -s ours origin/main -m "..."
git diff --stat <HEAD-avant-fusion> HEAD    # DOIT être vide : rien perdu
git merge-base --is-ancestor origin/main HEAD && echo "PR fusionnable"
```

**Ne jamais** utiliser `-s ours` sans avoir vérifié que `main` n'apporte
rien — sinon cela écrase silencieusement du travail.

**Pourquoi** : `git push --force` est refusé dans cet environnement, donc
le rebase n'est pas disponible pour réaligner la branche. Le raccrochage
d'ancêtre est la seule manœuvre non destructrice qui rend la PR
fusionnable, et elle est sûre **à condition** de prouver d'abord qu'il
n'y a rien à perdre.

---

## 3. Ne jamais corriger une panne réseau sans l'avoir mesurée

**Règle** : le réseau sortant est bloqué depuis l'environnement de
développement (`HTTP 403 — Host not in allowlist`). Une panne signalée
par l'utilisateur ne se corrige donc **pas** à partir d'un message
d'erreur sur une capture d'écran. On lui fait exécuter le **diagnostic
réseau intégré** (onglet Données → « Lancer le diagnostic » → « Copier
le rapport »), et on corrige à partir du code HTTP et de la réponse
brute.

**Pourquoi** : deux tours de correctifs ont été produits en devinant la
cause à partir d'un message d'une ligne. Les deux ont visé à côté :

| Cause supposée | Cause réelle (mesurée) |
|---|---|
| Overpass trop lent → délais augmentés | Overpass refusait la requête faute de `User-Agent` (429 / 406) |
| En-tête ASCII `xllcenter` non reconnu | OpenTopography ne déclare **aucun** `NODATA_value`, que le parseur exigeait |
| SoilGrids en pause côté ISRIC | Service rétabli et fonctionnel (HTTP 200) |

Le diagnostic a donné les trois réponses en **un seul** aller-retour.
Devinez-vous une cause ? Faites-la mesurer d'abord.

---

## 4. Toute valeur numérique porte l'origine de sa valeur

**Règle** : aucune constante numérique sans commentaire disant d'où
vient le chiffre — spécification, mesure, publication, ou « choix par
défaut, ajustable ». Un seuil mesuré doit dire ce qui a été mesuré
(« 11,3 s pour 36×36 cellules, diagnostic du 20/09/2026 »).

**Pourquoi** : exigence du cahier des charges (§4), et c'est ce qui a
permis de distinguer, en relisant le code, les délais choisis au hasard
de ceux fondés sur une mesure.

---

## 5. Jamais de valeur de repli silencieuse

**Règle** : quand une donnée manque, le logiciel le **dit à l'écran**.
Il n'applique pas une valeur par défaut en silence, et il ne présente
jamais un résultat comme complet s'il ne l'est pas. Si une source tombe,
son facteur est écarté, les poids sont renormalisés sur les autres, et
la liste des facteurs écartés est affichée.

**Pourquoi** : §5 du cahier des charges. Contre-exemple corrigé : un
facteur actif sans donnée invalidait toutes les cellules, donc une seule
source en panne ne dégradait pas le résultat — elle le **supprimait
entièrement**, sans que l'utilisateur comprenne pourquoi.

---

## 6. Règles absolues, non négociables

- **Aucune automatisation de compte** : ne jamais créer de compte, se
  connecter à un compte Google/Gmail, ni automatiser une inscription.
  Une clé d'API est saisie par l'utilisateur, jamais obtenue par le
  logiciel (§3.3).
- **Aucune dépendance npm nouvelle sans demander.** Les dépendances de
  production sont limitées à 6 paquets ; le logiciel doit s'installer sur
  un poste isolé.
- **Ne jamais présenter un résultat comme une probabilité de trouver de
  l'eau** ni comme un débit prévu. La sortie est une favorabilité
  **relative**, ordinale.
- **Ne pas modifier** le fond de carte, `ZOOM_MAX`, ni
  `licenseServerUrl`.
- **Ne jamais inventer** une URL d'API, un paramètre de système de
  coordonnées ou une référence bibliographique. Vérifier et citer la
  date de vérification ; en cas de doute, le dire au lieu de deviner.
- **Aucune clé d'API dans un rapport de diagnostic** (il est fait pour
  être copié et transmis). La censure est testée.

---

## 7. Code et tests

- **Langue du code et des commentaires : français.** Les commentaires
  expliquent le *pourquoi*, pas le *quoi*.
- **Tests** : runner maison (`npm test`, `tests/run-tests.js`), aucune
  dépendance de test, aucun framework. Toute nouvelle suite s'enregistre
  dans le tableau `SUITES`.
- **Avant de livrer** : `npm test` (tous les tests passent) **et**
  `npm run build` (compilation propre). Nettoyer `build/`, `dist/`,
  `.cache-donnees/`, `.activation-local.json` avant de committer.
- Une valeur attendue dans un test n'est **jamais** recopiée « à vue
  d'œil » : elle vient d'un calcul à la main, d'une spécification, ou
  d'un oracle indépendant (ex. cross-validation des projections contre
  le moteur géodésique de Karney).

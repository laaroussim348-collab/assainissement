# Journal de développement

Un fichier **daté** par épisode notable : une panne constatée en usage
réel, sa cause, sa correction, et ce qui restait incertain au moment où
elle a été faite.

## Pourquoi ce dossier existe

Deux raisons, dans cet ordre d'importance.

**1. `README.md` doit décrire le logiciel TEL QU'IL EST, pas son
histoire.** Un lecteur qui découvre le projet veut savoir ce que le
logiciel fait et ce qu'il ne fait pas aujourd'hui. Il n'a pas besoin de
traverser trois « mises à jour du 20/09 » successives pour reconstituer
l'état courant — et une section qui raconte l'historique finit toujours
par contredire le code, parce qu'on corrige le code sans réécrire le
récit.

**2. Un journal en fichiers séparés ne provoque JAMAIS de conflit de
fusion.** C'est la raison concrète de ce découpage, et elle vient d'une
erreur répétée trois fois. Les correctifs de septembre 2026 ont été
livrés en plusieurs tours ; à chaque tour, le récit était ajouté au
MÊME endroit de `README.md` (la section « Limites connues »). Comme les
demandes de fusion sont intégrées en **squash** — ce qui réécrit
l'historique et empêche git de voir que le travail précédent de la
branche est déjà dans `main` — git retombait chaque fois sur la même
région modifiée des deux côtés, et signalait un conflit. Trois fois de
suite, pour un contenu qui ne présentait aucun désaccord réel.

Un fichier que **seul un côté crée** ne peut pas entrer en conflit. Le
problème disparaît donc par construction, sans rien demander à
personne et quelle que soit la stratégie de fusion utilisée.

## Convention

- **Un épisode = un fichier neuf**, nommé `AAAA-MM-JJ-sujet.md`.
- **On ne modifie pas une entrée existante** (sauf pour corriger une
  erreur factuelle). Si la situation évolue, on écrit une entrée
  nouvelle qui renvoie à l'ancienne.
- **Rien ne s'ajoute à `README.md`** au passage : si un épisode change
  ce que le logiciel FAIT, on met à jour la phrase concernée du README,
  sans y recopier le récit.
- Chaque entrée dit **ce qui a été mesuré** et **ce qui restait
  supposé** — la distinction qui manquait aux deux premiers tours de
  septembre 2026.

## Entrées

| Date | Sujet |
|---|---|
| 2026-09-20 | [Coordonnées Lambert Maroc et UTM](2026-09-20-coordonnees-lambert-utm.md) — implémentation depuis les paramètres EPSG vérifiés, faute du fichier HydroCrue jamais fourni |
| 2026-09-20 → 21 | [Pannes de téléchargement](2026-09-20-pannes-reseau.md) — Overpass, SoilGrids, OpenTopography : du tâtonnement au diagnostic mesuré |

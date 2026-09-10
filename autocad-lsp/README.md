# Étiquetage des conduites (LSP AutoCAD 2019)

`libelle-conduites.lsp` écrit automatiquement le type et le diamètre d'une
conduite (ex: `PVC Ø200mm`) au milieu de **chaque segment** (entre deux
sommets) des lignes (`LINE`) et polylignes (`LWPOLYLINE` / `POLYLINE`)
sélectionnées — y compris les segments courbes des polylignes (bulge).

## Chargement

1. Dans AutoCAD 2019, commande `APPLOAD` (ou glisser-déposer le fichier
   `.lsp` dans la fenêtre AutoCAD).
2. Sélectionner `libelle-conduites.lsp`, cliquer **Charger**.

Pour un chargement automatique à chaque ouverture d'AutoCAD, ajouter le
fichier à la liste "Startup Suite" dans la même boîte de dialogue APPLOAD.

## Utilisation

1. Taper la commande **`LIBCOND`** (alias `LC`).
2. Sélectionner les objets : vous pouvez sélectionner **tout le dessin**
   (fenêtre, `ALL`, Ctrl+A...) — seules les `LINE`/`LWPOLYLINE`/`POLYLINE`
   de la sélection sont retenues, le reste est ignoré automatiquement.
3. Entrer le **type de conduite** (ex: `PVC`, `BETON`, `PEHD`).
4. Entrer le **diamètre** en mm (ex: `200`).
5. Valider la hauteur de texte proposée (Entrée) ou en saisir une autre.

Un texte identique (type + diamètre) est alors créé au milieu de chaque
segment de chaque objet sélectionné, orienté selon la direction du
segment et toujours lisible (jamais à l'envers). Le texte est placé sur
le calque courant, avec le style de texte courant.

L'ensemble de l'opération s'annule en un seul `Ctrl+Z`.

## Notes

- Pour une conduite différente (autre type/diamètre), relancer `LIBCOND`
  sur la sélection correspondante.
- Le symbole de diamètre est généré via le code `%%c` d'AutoCAD (pas de
  caractère spécial dans le fichier), pour un affichage fiable quel que
  soit l'encodage.

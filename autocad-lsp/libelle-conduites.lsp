;;; ============================================================================
;;; LIBELLE-CONDUITES.LSP
;;; AutoCAD 2019 (AutoLISP) - Etiquetage automatique des conduites (collecteurs)
;;;
;;; OBJET :
;;;   Ecrit un texte "TYPE %%cDIAMETREmm" (ex: PVC O200mm) au milieu de
;;;   CHAQUE segment (entre deux sommets consecutifs) de toutes les LINE,
;;;   LWPOLYLINE et POLYLINE selectionnees.
;;;
;;; UTILISATION :
;;;   1. Charger le fichier dans AutoCAD :
;;;        - Menu "Gerer" > "Charger l'application" (APPLOAD), choisir ce
;;;          fichier, puis "Charger"  --  ou glisser-deposer le .lsp dans
;;;          la fenetre AutoCAD.
;;;   2. Taper la commande :  LIBCOND   (alias court : LC)
;;;   3. Selectionner les objets (vous pouvez selectionner TOUT le dessin,
;;;      par fenetre, par "Tout" (ALL) ou Ctrl+A : seules les LINE,
;;;      LWPOLYLINE et POLYLINE seront retenues automatiquement, le reste
;;;      de la selection est ignore).
;;;   4. Entrer le type de conduite (ex: PVC, BETON, PEHD, FONTE...).
;;;   5. Entrer le diametre en mm (ex: 200).
;;;   6. Valider la hauteur de texte proposee (touche Entree) ou en saisir
;;;      une autre.
;;;   -> Un texte est cree au milieu de chaque segment de chaque objet
;;;      selectionne, aligne sur la direction du segment, et toujours
;;;      lisible (jamais a l'envers).
;;;
;;; REMARQUES :
;;;   - Les polylignes avec des segments courbes (bulge) sont gerees : le
;;;     texte est place au milieu de l'arc, pas de la corde.
;;;   - Le texte est cree sur le calque courant (CLAYER), avec le style de
;;;     texte courant.
;;;   - L'operation complete est annulable en une seule fois (UNDO).
;;; ============================================================================

;; ----------------------------------------------------------------------------
;; Renvoie la liste des sommets d'une LWPOLYLINE sous la forme
;; ( (pt1 bulge1) (pt2 bulge2) ... )  a partir de sa liste entget.
;; ----------------------------------------------------------------------------
(defun lc:lwpoly-vertices (edata / verts item)
  (setq verts '())
  (foreach item edata
    (cond
      ((= (car item) 10)
       (setq verts (cons (list (cdr item) 0.0) verts))
      )
      ((= (car item) 42)
       (setq verts (cons (list (car (car verts)) (cdr item)) (cdr verts)))
      )
    )
  )
  (reverse verts)
)

;; ----------------------------------------------------------------------------
;; Renvoie la liste des sommets d'une POLYLINE "lourde" (2D/3D, ancien
;; format) sous la forme ( (pt1 bulge1) (pt2 bulge2) ... ) en parcourant
;; ses sous-entites VERTEX jusqu'a SEQEND.
;; ----------------------------------------------------------------------------
(defun lc:heavy-polyline-vertices (ent / verts e ed etype pt bulge)
  (setq verts '())
  (setq e (entnext ent))
  (while (and e (/= (setq etype (cdr (assoc 0 (setq ed (entget e))))) "SEQEND"))
    (if (= etype "VERTEX")
      (progn
        (setq pt (cdr (assoc 10 ed)))
        (setq bulge (if (assoc 42 ed) (cdr (assoc 42 ed)) 0.0))
        (setq verts (cons (list pt bulge) verts))
      )
    )
    (setq e (entnext e))
  )
  (reverse verts)
)

;; ----------------------------------------------------------------------------
;; Ramene un angle "a l'envers" (entre 90 et 270 degres) dans le champ
;; lisible en le tournant de 180 degres, pour que le texte ne soit jamais
;; a l'envers a l'ecran.
;; ----------------------------------------------------------------------------
(defun lc:normalize-angle (ang)
  (if (and (> ang (/ pi 2.0)) (< ang (* 1.5 pi)))
    (- ang pi)
    ang
  )
)

;; ----------------------------------------------------------------------------
;; Formate un diametre (reel) en chaine, sans decimale inutile.
;; ----------------------------------------------------------------------------
(defun lc:format-diam (d)
  (if (= d (fix d))
    (rtos d 2 0)
    (rtos d 2 2)
  )
)

;; ----------------------------------------------------------------------------
;; Cree le texte au milieu du segment p1-p2 (bulge = courbure eventuelle
;; issue de p1, 0.0 si segment droit). Renvoie T si un texte a ete cree.
;; ----------------------------------------------------------------------------
(defun lc:draw-label-segment (p1 bulge p2 ht txt / d ang mid sagitta perp-ang)
  (setq d (distance p1 p2))
  (if (> d 1e-6)
    (progn
      (setq ang (angle p1 p2))
      (setq mid (list (/ (+ (car p1) (car p2)) 2.0)
                       (/ (+ (cadr p1) (cadr p2)) 2.0)))
      (if (and bulge (/= bulge 0.0))
        (progn
          (setq sagitta (* bulge (/ d 2.0)))
          (setq perp-ang (+ ang (/ pi 2.0)))
          (setq mid (polar mid perp-ang sagitta))
        )
      )
      (setq mid (list (car mid) (cadr mid) 0.0))
      (entmake
        (list
          '(0 . "TEXT")
          (cons 8 (getvar "CLAYER"))
          (cons 10 mid)
          (cons 40 ht)
          (cons 1 txt)
          (cons 50 (lc:normalize-angle ang))
          (cons 72 1)
          (cons 73 2)
          (cons 11 mid)
        )
      )
      T
    )
  )
)

;; ----------------------------------------------------------------------------
;; Parcourt une liste de sommets ( (pt bulge) ... ) et cree un texte au
;; milieu de chaque segment (et du segment de fermeture si closed = T).
;; Renvoie le nombre de textes crees.
;; ----------------------------------------------------------------------------
(defun lc:process-vertices (verts closed ht txt / lst p1 b1 first-pt count)
  (setq count 0)
  (setq first-pt (car (car verts)))
  (setq lst verts)
  (while (cdr lst)
    (setq p1 (car (car lst)))
    (setq b1 (cadr (car lst)))
    (if (lc:draw-label-segment p1 b1 (car (cadr lst)) ht txt)
      (setq count (1+ count))
    )
    (setq lst (cdr lst))
  )
  (if closed
    (progn
      (setq p1 (car (car lst)))
      (setq b1 (cadr (car lst)))
      (if (lc:draw-label-segment p1 b1 first-pt ht txt)
        (setq count (1+ count))
      )
    )
  )
  count
)

;; ----------------------------------------------------------------------------
;; Commande principale : LIBCOND
;; ----------------------------------------------------------------------------
(defun c:LIBCOND ( / *error* old-cmdecho old-osmode undo-open ss n i ent edata
                     etype verts closed type-conduite diametre ht-defaut
                     ht-texte ht-saisie txt nb-total nb-seg)

  (defun *error* (msg)
    (if old-cmdecho (setvar "CMDECHO" old-cmdecho))
    (if old-osmode (setvar "OSMODE" old-osmode))
    (if undo-open (command "_.undo" "_end"))
    (if (not (member msg '("Function cancelled" "quit / exit abort" "")))
      (princ (strcat "\nErreur : " msg))
    )
    (princ)
  )

  (setq old-cmdecho (getvar "CMDECHO"))
  (setq old-osmode (getvar "OSMODE"))
  (setq undo-open nil)
  (setvar "CMDECHO" 0)

  (princ "\nSelectionnez les conduites (lignes / polylignes) - vous pouvez tout selectionner, seules les LINE/LWPOLYLINE/POLYLINE seront prises en compte :")
  (setq ss (ssget '((0 . "LINE,LWPOLYLINE,POLYLINE"))))

  (if (not ss)
    (princ "\nAucune ligne ou polyligne trouvee dans la selection.")
    (progn
      (setq type-conduite "")
      (while (= type-conduite "")
        (setq type-conduite (getstring T "\nType de conduite (ex: PVC, BETON, PEHD) : "))
      )
      (setq type-conduite (strcase type-conduite))

      (setq diametre nil)
      (while (or (not diametre) (<= diametre 0))
        (setq diametre (getreal "\nDiametre de la conduite en mm : "))
        (if (or (not diametre) (<= diametre 0))
          (princ "\nVeuillez entrer un nombre positif.")
        )
      )

      (setq ht-defaut (getvar "TEXTSIZE"))
      (if (or (not ht-defaut) (<= ht-defaut 0)) (setq ht-defaut 2.5))
      (setq ht-saisie (getreal (strcat "\nHauteur du texte <" (rtos ht-defaut 2 2) "> : ")))
      (setq ht-texte (if ht-saisie ht-saisie ht-defaut))

      (setq txt (strcat type-conduite " %%c" (lc:format-diam diametre) "mm"))

      (command "_.undo" "_begin")
      (setq undo-open T)

      (setq nb-total 0)
      (setq nb-seg 0)
      (setq n (sslength ss))
      (setq i 0)
      (while (< i n)
        (setq ent (ssname ss i))
        (setq edata (entget ent))
        (setq etype (cdr (assoc 0 edata)))
        (setq verts nil closed nil)
        (cond
          ((= etype "LINE")
           (setq verts (list (list (cdr (assoc 10 edata)) 0.0)
                              (list (cdr (assoc 11 edata)) 0.0)))
           (setq closed nil)
          )
          ((= etype "LWPOLYLINE")
           (setq verts (lc:lwpoly-vertices edata))
           (setq closed (and (assoc 70 edata) (/= 0 (logand 1 (cdr (assoc 70 edata))))))
          )
          ((= etype "POLYLINE")
           (setq verts (lc:heavy-polyline-vertices ent))
           (setq closed (and (assoc 70 edata) (/= 0 (logand 1 (cdr (assoc 70 edata))))))
          )
        )
        (if (and verts (>= (length verts) 2))
          (progn
            (setq nb-seg (+ nb-seg (lc:process-vertices verts closed ht-texte txt)))
            (setq nb-total (1+ nb-total))
          )
        )
        (setq i (1+ i))
      )

      (command "_.undo" "_end")
      (setq undo-open nil)

      (princ (strcat "\n" (itoa nb-seg) " libelle(s) \"" txt "\" cree(s) sur " (itoa nb-total) " objet(s)."))
    )
  )

  (setvar "CMDECHO" old-cmdecho)
  (setvar "OSMODE" old-osmode)
  (princ)
)

;; Alias court
(defun c:LC () (c:LIBCOND))

(princ "\nLIBELLE-CONDUITES.LSP charge. Tapez LIBCOND (ou LC) pour lancer la commande.")
(princ)

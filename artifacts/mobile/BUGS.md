# BUGS.md — BARDEC

Dernière mise à jour : 13 août 2026

## 🔴 BLOQUANT

- [ ] Produits ajoutés par le vendeur n'apparaissent pas dans l'accueil/liste produits publique
- [ ] Produits avec une catégorie assignée invisibles nulle part
- [ ] Image produit ne s'affiche pas dans "Mes produits" côté vendeur
- [ ] Commande passée par le buyer n'apparaît pas dans sa liste de commandes
- [ ] Statut de commande mis à jour par le vendeur n'apparaît pas côté commande réelle (reproduit après le fix RLS : le vendeur peut changer le statut mais ça ne se reflète pas ailleurs)
- [ ] Admin ne voit aucune donnée réelle (dashboard, utilisateurs, vendeurs, commandes semblent être des données de test)
- [ ] Erreur de navigation "REPLACE" sur la route vendor-dashboard (log dev)
- [ ] Crash du sélecteur de photo Android : ExponentImagePicker.launchImageLibraryAsync renvoie une URI content:// que le code ne gère pas ("Uri lacks 'file' scheme") — touche upload photo profil et ajout photo boutique de quartier

## 🟠 FONCTIONNALITÉS NON CONNECTÉES

- [ ] Profil customer : aucun sous-menu ne réagit (info perso, liste de souhaits, avis, support, vider le cache)
- [ ] Buyer : rien ne fonctionne (bon de commande, approbation en cours toujours à 0, badges incorrects)
- [ ] Approver : mêmes bugs que Buyer
- [ ] OMNI (assistant IA) : répond toujours "désolé, je n'ai pas pu répondre, réessayer dans un instant"
- [ ] BARDEC UNLIMITED : aucune action au clic
- [ ] "Contacter le vendeur" sur une fiche produit : aucune action
- [ ] Boutique de quartier (Près de moi) : pas de bouton confirmer après ajout photo ; pas de barre de recherche boutique
- [ ] Micro sur la barre de recherche accueil ne fonctionne pas

## 🟡 AMÉLIORATIONS / MANQUANT

- [ ] Traduction des catégories reste en anglais malgré changement de langue
- [ ] Impossible de créer de nouvelles catégories
- [ ] Validation d'adresse manquante (accepte pays/numéros invalides)
- [ ] Pas de badge de notification sur l'icône commandes
- [ ] Numéro de suivi (tracking) à ajouter côté vendeur lors de la mise à jour de statut
- [ ] Paramètres admin non éditables (commission, crédit max, clés API, webhooks)
- [ ] Actions détail commande non fonctionnelles (suivre commande, détail, recommander, laisser un avis)

## 🔵 FEATURE MAJEURE (hors bug fix, chantier à part)

- [ ] Intégration paiement réelle Wave/Orange Money/MTN MoMo : flow complet (demande de paiement → redirection agrégateur → confirmation → mise à jour commande)

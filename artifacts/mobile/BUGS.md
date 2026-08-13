# BUGS.md — BARDEC

Dernière mise à jour : 13 août 2026

## 🔴 BLOQUANT

- [x] Produits ajoutés par le vendeur n'apparaissent pas dans l'accueil/liste produits publique — **cause racine trouvée et corrigée** : `handleAddProduct` (vendor-dashboard.tsx) basculait silencieusement en branche locale/démo (`_imported:true`, aucun insert Supabase) dès que `user` du contexte était faux à l'instant du tap, sans jamais toucher la base ni afficher d'erreur. Guard changé pour ne dépendre que de `isSupabaseConfigured`/`supabase` ; l'UUID réel est toujours résolu via `supabase.auth.getUser()`, avec message "Session expirée" explicite si absent. À confirmer sur téléphone.
- [x] Produits avec une catégorie assignée invisibles nulle part — picker de catégorie (CATEGORIES partagé avec l'accueil) posé lors d'une session précédente ; combiné au fix ci-dessus, l'insert atteint désormais réellement la base avec un `category` valide. À confirmer sur téléphone.
  - [ ] Point lié : l'import CSV en masse (vendor-dashboard.tsx) a le même mismatch de taxonomie catégorie (texte libre non validé) — non corrigé par le picker du formulaire manuel, à traiter dans une session séparée
- [ ] Image produit ne s'affiche pas dans "Mes produits" côté vendeur
- [x] Commande passée par le buyer n'apparaît pas dans sa liste de commandes — **même cause racine** que le bug produit ci-dessus, trouvée dans `checkout.tsx` : le bloc d'insert vers `orders` était sauté silencieusement si `user` était faux, et le flow avançait quand même à l'étape "confirmation" comme si la commande avait réussi. Même correctif appliqué. Bug identique corrigé en prime dans `profile.tsx` (upload avatar) et `app/proximity/cart.tsx` (commande boutique de quartier), qui avaient exactement le même défaut. À confirmer sur téléphone.
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

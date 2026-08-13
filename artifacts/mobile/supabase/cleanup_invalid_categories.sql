-- ============================================================================
-- Nettoyage ponctuel : produits avec une catégorie invalide (texte libre saisi
-- avant l'ajout du picker de catégorie côté vendeur — voir vendor-dashboard.tsx).
--
-- À exécuter MANUELLEMENT dans le SQL Editor du dashboard Supabase (production
-- asawazxocogumygptdwh). Pas automatique, pas de migration associée.
--
-- Catégories valides = les id de CATEGORIES dans artifacts/mobile/constants/mockData.ts
-- (à tenir à jour si cette liste change) :
--   electronics, textiles, agri, chemicals, machinery, food, auto
-- ============================================================================

-- 1) Aperçu des produits concernés (à lancer d'abord pour vérifier)
SELECT id, vendor_id, name_i18n, category
FROM products
WHERE category NOT IN ('electronics', 'textiles', 'agri', 'chemicals', 'machinery', 'food', 'auto');

-- 2) Option A — remettre à vide (le vendeur re-choisira une vraie catégorie
--    via le picker la prochaine fois qu'il éditera le produit)
-- UPDATE products
-- SET category = ''
-- WHERE category NOT IN ('electronics', 'textiles', 'agri', 'chemicals', 'machinery', 'food', 'auto');

-- 3) Option B — remapper manuellement vers une vraie catégorie, au cas par cas,
--    en te basant sur le résultat de la requête (1). Exemple :
-- UPDATE products SET category = 'food' WHERE category IN ('Alimentation', 'Alimentation ');
-- UPDATE products SET category = ''     WHERE category = 'Général';

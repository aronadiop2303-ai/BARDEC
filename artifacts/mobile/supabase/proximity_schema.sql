-- ============================================================
-- BARDEC — Commerces de proximité
-- À exécuter dans le Dashboard Supabase > SQL Editor
-- ============================================================

-- 1. Extensions pour le calcul de distance géographique
CREATE EXTENSION IF NOT EXISTS earthdistance CASCADE;
CREATE EXTENSION IF NOT EXISTS cube CASCADE;

-- 2. Table des commerces de proximité
CREATE TABLE IF NOT EXISTS proximity_shops (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text NOT NULL,
  category       text NOT NULL CHECK (category IN (
    'Alimentation & Table',
    'Restauration & Loisirs',
    'Bricolage & Maison',
    'Beauté & Mode',
    'Santé & Hygiène',
    'Culture & Tech',
    'Services & Entretien'
  )),
  subcategory    text,
  description    text,
  phone          text,
  address        text,
  lat            float8 NOT NULL,
  lng            float8 NOT NULL,
  opening_hours  jsonb DEFAULT '{}'::jsonb,
  photos         text[] DEFAULT '{}',
  rating         float4 DEFAULT 0,
  rating_count   integer DEFAULT 0,
  is_active      boolean DEFAULT true,
  verified       boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

-- 3. Table des produits des commerces de proximité
CREATE TABLE IF NOT EXISTS proximity_products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     uuid NOT NULL REFERENCES proximity_shops(id) ON DELETE CASCADE,
  name        text NOT NULL,
  price       float8 NOT NULL DEFAULT 0,
  unit        text DEFAULT 'unité',
  image_url   text,
  in_stock    boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- 4. Table dédiée aux commandes de proximité
--    (table séparée pour éviter tout conflit avec le type order_status du schéma B2B)
CREATE TABLE IF NOT EXISTS proximity_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proximity_shop_id uuid NOT NULL REFERENCES proximity_shops(id) ON DELETE CASCADE,
  customer_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name     text,
  customer_phone    text,
  items             jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal          float8 NOT NULL DEFAULT 0,
  total             float8 NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','delivered','cancelled')),
  cancelled_by      text CHECK (cancelled_by IN ('customer','vendor')),
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- Trigger : updated_at automatique
CREATE OR REPLACE FUNCTION proximity_orders_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_proximity_orders_updated_at ON proximity_orders;
CREATE TRIGGER trg_proximity_orders_updated_at
  BEFORE UPDATE ON proximity_orders
  FOR EACH ROW EXECUTE FUNCTION proximity_orders_set_updated_at();

-- Fonction SECURITY DEFINER pour que le vendeur ne puisse changer QUE le statut
-- (protège items, total, customer_id, etc. contre toute modification)
-- cancelled_by est toujours dérivé côté serveur : 'vendor' si le vendeur annule,
-- jamais transmis par le client afin d'éviter toute falsification.
CREATE OR REPLACE FUNCTION update_proximity_order_status(
  p_order_id uuid,
  p_status   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop_owner uuid;
BEGIN
  -- Valider la valeur de statut
  IF p_status NOT IN ('pending','confirmed','delivered','cancelled') THEN
    RAISE EXCEPTION 'Statut invalide : %', p_status;
  END IF;

  -- Vérifier que l'appelant est le propriétaire de la boutique concernée
  SELECT s.owner_id INTO v_shop_owner
    FROM proximity_orders o
    JOIN proximity_shops   s ON s.id = o.proximity_shop_id
   WHERE o.id = p_order_id;

  IF v_shop_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Accès refusé : vous n''êtes pas propriétaire de cette boutique';
  END IF;

  -- Mettre à jour le statut.
  -- cancelled_by est dérivé ici : uniquement 'vendor' (le propriétaire de la boutique),
  -- jamais accepté en paramètre pour éviter toute falsification par l'appelant.
  UPDATE proximity_orders
     SET status       = p_status,
         cancelled_by = CASE WHEN p_status = 'cancelled' THEN 'vendor' ELSE NULL END
   WHERE id = p_order_id;
END;
$$;

-- Index pour les requêtes vendeur et client
CREATE INDEX IF NOT EXISTS idx_proximity_orders_shop
  ON proximity_orders (proximity_shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proximity_orders_customer
  ON proximity_orders (customer_id);

-- Row Level Security
ALTER TABLE proximity_orders ENABLE ROW LEVEL SECURITY;

-- Le client peut voir ses propres commandes
CREATE POLICY "customer can read own proximity orders"
  ON proximity_orders FOR SELECT
  USING (customer_id = auth.uid());

-- Le client peut passer une commande
CREATE POLICY "customer can insert proximity order"
  ON proximity_orders FOR INSERT
  WITH CHECK (customer_id = auth.uid());

-- Le vendeur peut voir les commandes de sa boutique
CREATE POLICY "vendor can read shop proximity orders"
  ON proximity_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM proximity_shops s
      WHERE s.id = proximity_orders.proximity_shop_id
        AND s.owner_id = auth.uid()
    )
  );

-- Pas de policy UPDATE directe pour les vendeurs :
-- ils passent par update_proximity_order_status() (SECURITY DEFINER).

-- 5. Index pour les requêtes géographiques et propriétaire
CREATE INDEX IF NOT EXISTS idx_proximity_shops_lat_lng
  ON proximity_shops USING btree (lat, lng)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_proximity_shops_owner
  ON proximity_shops (owner_id);

CREATE INDEX IF NOT EXISTS idx_proximity_products_shop
  ON proximity_products (shop_id);

-- 6. Row Level Security
ALTER TABLE proximity_shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE proximity_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read active shops"
  ON proximity_shops FOR SELECT
  USING (is_active = true);

CREATE POLICY "owner can read own shop"
  ON proximity_shops FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "owner can insert own shop"
  ON proximity_shops FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner can update own shop"
  ON proximity_shops FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "owner can delete own shop"
  ON proximity_shops FOR DELETE
  USING (owner_id = auth.uid());

CREATE POLICY "anyone can read products of active shops"
  ON proximity_products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM proximity_shops s
      WHERE s.id = proximity_products.shop_id AND s.is_active = true
    )
  );

CREATE POLICY "owner can manage products"
  ON proximity_products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM proximity_shops s
      WHERE s.id = proximity_products.shop_id AND s.owner_id = auth.uid()
    )
  );

-- 7. Fonction RPC : nearby_shops
CREATE OR REPLACE FUNCTION nearby_shops(
  user_lat        float8,
  user_lng        float8,
  radius_km       float8 DEFAULT 5,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  name          text,
  category      text,
  subcategory   text,
  description   text,
  phone         text,
  address       text,
  lat           float8,
  lng           float8,
  opening_hours jsonb,
  photos        text[],
  rating        float4,
  rating_count  integer,
  is_active     boolean,
  verified      boolean,
  owner_id      uuid,
  distance_km   float8
)
LANGUAGE sql STABLE AS $$
  SELECT
    s.id, s.name, s.category, s.subcategory, s.description,
    s.phone, s.address, s.lat, s.lng, s.opening_hours, s.photos,
    s.rating, s.rating_count, s.is_active, s.verified, s.owner_id,
    ROUND(
      (earth_distance(ll_to_earth(user_lat, user_lng), ll_to_earth(s.lat, s.lng)) / 1000)::numeric,
      2
    )::float8 AS distance_km
  FROM proximity_shops s
  WHERE
    s.is_active = true
    AND earth_distance(ll_to_earth(user_lat, user_lng), ll_to_earth(s.lat, s.lng)) <= (radius_km * 1000)
    AND (filter_category IS NULL OR s.category = filter_category)
  ORDER BY distance_km ASC;
$$;

-- 8. Table des avis clients (proximity_reviews)
CREATE TABLE IF NOT EXISTS proximity_reviews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES proximity_shops(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (shop_id, user_id)  -- un seul avis par utilisateur par commerce
);

-- Index pour les requêtes par commerce
CREATE INDEX IF NOT EXISTS idx_proximity_reviews_shop
  ON proximity_reviews (shop_id, created_at DESC);

-- Trigger : recalculer la note moyenne après chaque INSERT / UPDATE / DELETE
-- Cette fonction est le seul endroit qui touche aux agrégats du commerce,
-- ce qui garantit la cohérence quelle que soit la voie d'écriture.
CREATE OR REPLACE FUNCTION proximity_reviews_recalc_rating()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_shop_id uuid;
BEGIN
  -- Identifier le commerce concerné (INSERT/UPDATE → NEW, DELETE → OLD)
  v_shop_id := COALESCE(NEW.shop_id, OLD.shop_id);

  UPDATE proximity_shops
     SET rating       = COALESCE(
                          (SELECT ROUND(AVG(r.rating)::numeric, 1)::float4
                             FROM proximity_reviews r
                            WHERE r.shop_id = v_shop_id),
                          0
                        ),
         rating_count = (SELECT COUNT(*)
                           FROM proximity_reviews r
                          WHERE r.shop_id = v_shop_id)
   WHERE id = v_shop_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proximity_reviews_recalc ON proximity_reviews;
CREATE TRIGGER trg_proximity_reviews_recalc
  AFTER INSERT OR UPDATE OR DELETE ON proximity_reviews
  FOR EACH ROW EXECUTE FUNCTION proximity_reviews_recalc_rating();

-- Row Level Security
-- Seule la lecture directe est autorisée. Toutes les écritures passent
-- par submit_proximity_review() (SECURITY DEFINER) qui contourne le RLS
-- et garantit : user_id = auth.uid(), shop_id immuable, recalcul atomique.
ALTER TABLE proximity_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read reviews"
  ON proximity_reviews FOR SELECT USING (true);

-- Pas de policy INSERT/UPDATE directe pour les utilisateurs :
-- ils passent obligatoirement par submit_proximity_review() (SECURITY DEFINER).

-- Fonction RPC : soumettre ou mettre à jour un avis (voie d'écriture unique)
CREATE OR REPLACE FUNCTION submit_proximity_review(
  p_shop_id uuid,
  p_rating  smallint,
  p_comment text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Valider la note
  IF p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'La note doit être comprise entre 1 et 5';
  END IF;

  -- Insérer ou mettre à jour l'avis (une seule entrée par user+shop)
  -- Le trigger trg_proximity_reviews_recalc recalcule la moyenne automatiquement.
  INSERT INTO proximity_reviews (shop_id, user_id, rating, comment)
    VALUES (p_shop_id, auth.uid(), p_rating, p_comment)
    ON CONFLICT (shop_id, user_id)
    DO UPDATE SET rating     = EXCLUDED.rating,
                  comment    = EXCLUDED.comment,
                  created_at = now();
END;
$$;

-- Fonction RPC : annulation d'une commande par le client
-- Le client ne peut annuler QUE ses propres commandes en attente.
-- Passe par SECURITY DEFINER pour éviter d'avoir besoin d'une policy UPDATE.
CREATE OR REPLACE FUNCTION cancel_my_proximity_order(
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_updated integer;
  v_exists       boolean;
BEGIN
  -- Require an authenticated caller with a non-null uid
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Accès refusé : authentification requise';
  END IF;

  -- Single atomic UPDATE: succeeds only when this exact caller owns the order
  -- AND it is still pending.  The vendor's confirm runs a separate UPDATE on
  -- the same row, so the WHERE clause here acts as an optimistic-lock guard:
  -- if the vendor confirmed first, status <> 'pending' and zero rows match.
  UPDATE proximity_orders
     SET status       = 'cancelled',
         cancelled_by = 'customer'
   WHERE id            = p_order_id
     AND customer_id   = auth.uid()   -- explicit equality; rejects NULLs on both sides
     AND status        = 'pending';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    -- Distinguish "not yours" from "no longer pending" for a clearer error.
    SELECT EXISTS (
      SELECT 1 FROM proximity_orders WHERE id = p_order_id
    ) INTO v_exists;

    IF NOT v_exists THEN
      RAISE EXCEPTION 'Commande introuvable';
    END IF;

    -- Row exists but the UPDATE predicate didn't match: either wrong owner or
    -- the order is no longer pending (e.g. already confirmed by the vendor).
    RAISE EXCEPTION
      'Impossible d''annuler cette commande : elle n''est plus en attente ou ne vous appartient pas';
  END IF;
END;
$$;

-- 9. Migration : ajout de la colonne cancelled_by (idempotent)
-- À exécuter sur les bases existantes qui n'ont pas encore cette colonne.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'proximity_orders'
      AND  column_name  = 'cancelled_by'
  ) THEN
    ALTER TABLE proximity_orders
      ADD COLUMN cancelled_by text CHECK (cancelled_by IN ('customer','vendor'));
  END IF;
END;
$$;

-- 10. Bucket Storage (à créer manuellement dans Storage > New bucket)
-- Nom: proximity-shop-photos | Public: true

-- 10. Realtime publication
-- Allow customers to receive live UPDATE events on their own orders via the
-- Supabase Realtime channel opened in useCustomerOrdersRealtime().
-- RLS ensures each subscriber only sees rows they are authorised to SELECT.
-- The DO block is idempotent: it skips silently if the table is already a
-- member of the publication (avoids "relation already exists in publication"
-- on repeated migration runs).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_publication_tables
    WHERE  pubname   = 'supabase_realtime'
      AND  schemaname = 'public'
      AND  tablename  = 'proximity_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE proximity_orders;
  END IF;
END;
$$;

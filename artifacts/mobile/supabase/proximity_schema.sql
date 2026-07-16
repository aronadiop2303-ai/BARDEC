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

  -- Mettre à jour uniquement le statut
  UPDATE proximity_orders
     SET status = p_status
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

-- 8. Bucket Storage (à créer manuellement dans Storage > New bucket)
-- Nom: proximity-shop-photos | Public: true

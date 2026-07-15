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

-- 4. Champ proximity_shop_id sur la table orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS proximity_shop_id uuid REFERENCES proximity_shops(id);

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

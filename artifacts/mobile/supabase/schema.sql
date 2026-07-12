-- ═══════════════════════════════════════════════════════════════
-- BARDEC — Supabase PostgreSQL Schema
-- B2B & B2C Marketplace — avec Row Level Security par rôle
-- ═══════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- ENUM TYPES
-- ─────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('CUSTOMER', 'BUYER', 'APPROVER', 'VENDOR', 'ADMIN');
CREATE TYPE order_status AS ENUM (
  'pending', 'pending_approval', 'approved', 'shipped',
  'ready_for_delivery', 'out_for_delivery', 'completed', 'cancelled'
);
CREATE TYPE kyc_status AS ENUM ('pending', 'approved', 'rejected', 'incomplete');
CREATE TYPE dispute_status AS ENUM ('open', 'investigating', 'resolved', 'closed');
CREATE TYPE payment_method AS ENUM (
  'wave', 'orange_money', 'mtn_momo',
  'cash_on_delivery',
  'net30', 'bank_transfer',
  'card', 'paypal'
);
CREATE TYPE payment_status AS ENUM (
  'pending', 'awaiting_verification', 'paid', 'failed', 'refunded'
);
CREATE TYPE delivery_type AS ENUM ('home', 'drone', 'relay_point', 'store_pickup');

-- ─────────────────────────────────────────────
-- COMPANIES (B2B organizations)
-- ─────────────────────────────────────────────
CREATE TABLE companies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  tax_id          TEXT,
  country         TEXT NOT NULL DEFAULT 'FR',
  credit_limit    NUMERIC(12, 2) DEFAULT 0,
  net30_balance   NUMERIC(12, 2) DEFAULT 0,
  payment_terms   TEXT DEFAULT 'NET30',
  is_approved     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,
  display_name    TEXT,
  role            user_role NOT NULL DEFAULT 'CUSTOMER',
  language        TEXT DEFAULT 'fr',
  company_id      UUID REFERENCES companies(id),
  avatar_url      TEXT,
  phone           TEXT,
  is_approved     BOOLEAN DEFAULT true,
  mfa_enabled     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- PRODUCTS
-- ─────────────────────────────────────────────
CREATE TABLE products (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id           UUID NOT NULL REFERENCES users(id),
  name_i18n           JSONB NOT NULL DEFAULT '{}', -- { fr: "...", en: "...", ar: "...", ... }
  description_i18n    JSONB NOT NULL DEFAULT '{}',
  specifications      JSONB DEFAULT '{}',
  price_public        NUMERIC(12, 2) NOT NULL,
  price_wholesale     NUMERIC(12, 2) NOT NULL,
  min_order_quantity  INTEGER DEFAULT 1,
  stock_quantity      INTEGER DEFAULT 0,
  category            TEXT NOT NULL,
  images              TEXT[] DEFAULT '{}',
  tags                TEXT[] DEFAULT '{}',
  rating              NUMERIC(3, 2) DEFAULT 0,
  review_count        INTEGER DEFAULT 0,
  is_active           BOOLEAN DEFAULT true,
  external_id         TEXT UNIQUE, -- for external catalog sync via webhooks
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ORDERS
-- ─────────────────────────────────────────────
CREATE TABLE orders (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number          TEXT UNIQUE NOT NULL DEFAULT ('BDC-' || to_char(NOW(), 'YYYY') || '-' || lpad(nextval('order_seq')::text, 6, '0')),
  customer_id           UUID NOT NULL REFERENCES users(id),
  company_id            UUID REFERENCES companies(id),
  approver_id           UUID REFERENCES users(id),
  status                order_status NOT NULL DEFAULT 'pending',
  customer_type         TEXT NOT NULL DEFAULT 'B2C', -- 'B2B' | 'B2C'
  items                 JSONB NOT NULL DEFAULT '[]',
  subtotal              NUMERIC(12, 2) NOT NULL,
  shipping_cost         NUMERIC(12, 2) DEFAULT 0,
  tax_amount            NUMERIC(12, 2) DEFAULT 0,
  total                 NUMERIC(12, 2) NOT NULL,
  payment_method        payment_method,
  shipping_address      JSONB,
  tracking_number       TEXT,
  purchase_order_number TEXT,
  estimated_delivery    DATE,
  delivered_at          TIMESTAMPTZ,
  delivery_photo_url    TEXT,
  signature_url         TEXT,
  notes                 TEXT,
  delivery_type         delivery_type DEFAULT 'home',
  delivery_relay_point  JSONB,        -- { id, name, address, hours } si relay_point
  delivery_store        JSONB,        -- { id, name, address, hours, contact } si store_pickup
  -- ── Payment tracking ────────────────────────────────────────────────────────
  payment_status        payment_status DEFAULT 'pending',
  payment_proof_url     TEXT,         -- URL Supabase Storage de la preuve mobile money
  payment_currency      TEXT DEFAULT 'XOF',
  payment_amount_xof    NUMERIC(14, 0), -- montant exact en FCFA
  verified_by           UUID REFERENCES users(id),  -- admin qui a validé
  verified_at           TIMESTAMPTZ,
  payment_notes         TEXT,         -- motif rejet ou commentaire admin
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE order_seq START 1000;

-- ─────────────────────────────────────────────
-- REVIEWS
-- ─────────────────────────────────────────────
CREATE TABLE reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  order_id    UUID REFERENCES orders(id),
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  verified    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- CARTS
-- ─────────────────────────────────────────────
CREATE TABLE carts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) UNIQUE,
  items       JSONB NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- CONVERSATIONS & MESSAGES (P2P Chat)
-- ─────────────────────────────────────────────
CREATE TABLE conversations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participants UUID[] NOT NULL,
  last_message TEXT,
  last_msg_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id),
  content         TEXT NOT NULL,
  type            TEXT DEFAULT 'text', -- 'text' | 'quote' | 'image' | 'file'
  metadata        JSONB DEFAULT '{}',
  read_by         UUID[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- DISPUTES (Trade Assurance)
-- ─────────────────────────────────────────────
CREATE TABLE disputes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID NOT NULL REFERENCES orders(id),
  opened_by    UUID NOT NULL REFERENCES users(id),
  assigned_to  UUID REFERENCES users(id), -- admin
  status       dispute_status DEFAULT 'open',
  reason       TEXT NOT NULL,
  description  TEXT,
  evidence     TEXT[],
  resolution   TEXT,
  refund_amount NUMERIC(12, 2),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- VENDORS (KYC verification)
-- ─────────────────────────────────────────────
CREATE TABLE vendors (
  id              UUID PRIMARY KEY REFERENCES users(id),
  company_name    TEXT NOT NULL,
  country         TEXT,
  kyc_status      kyc_status DEFAULT 'pending',
  documents       TEXT[],
  response_rate   NUMERIC(5,2) DEFAULT 0,
  verified        BOOLEAN DEFAULT false,
  shop_active     BOOLEAN DEFAULT true,
  total_sales     NUMERIC(14, 2) DEFAULT 0,
  avg_rating      NUMERIC(3, 2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────────
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  details     JSONB DEFAULT '{}',
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- API KEYS (for external integrations)
-- ─────────────────────────────────────────────
CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  key         TEXT UNIQUE NOT NULL DEFAULT ('bdc_' || encode(gen_random_bytes(24), 'hex')),
  created_by  UUID REFERENCES users(id),
  permissions TEXT[] DEFAULT '{}', -- ['orders.read', 'products.read', 'webhooks']
  active      BOOLEAN DEFAULT true,
  last_used   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- WEBHOOK CONFIGS (outbound)
-- ─────────────────────────────────────────────
CREATE TABLE webhook_configs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  events      TEXT[] NOT NULL,
  secret      TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  active      BOOLEAN DEFAULT true,
  retry_count INTEGER DEFAULT 3,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- APP VERSION (force update control)
-- ─────────────────────────────────────────────
CREATE TABLE app_version (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  min_version     TEXT NOT NULL DEFAULT '1.0.0',
  latest_version  TEXT NOT NULL DEFAULT '1.0.0',
  ios_url         TEXT DEFAULT 'https://apps.apple.com',
  android_url     TEXT DEFAULT 'https://play.google.com',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_version (min_version, latest_version) VALUES ('1.0.0', '1.0.0');

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX idx_products_vendor    ON products(vendor_id);
CREATE INDEX idx_products_category  ON products(category);
CREATE INDEX idx_products_active    ON products(is_active);
CREATE INDEX idx_orders_customer    ON orders(customer_id);
CREATE INDEX idx_orders_status      ON orders(status);
CREATE INDEX idx_orders_company     ON orders(company_id);
CREATE INDEX idx_messages_conv      ON messages(conversation_id);
CREATE INDEX idx_audit_user         ON audit_logs(user_id);
CREATE INDEX idx_api_keys_key       ON api_keys(key);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews       ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs    ENABLE ROW LEVEL SECURITY;

-- Helper: get current user role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role LANGUAGE sql STABLE AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$;

-- USERS: chacun voit son profil; admins voient tout
CREATE POLICY "users_self"  ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_admin" ON users FOR ALL    USING (current_user_role() = 'ADMIN');
CREATE POLICY "users_update_self" ON users FOR UPDATE USING (id = auth.uid());

-- PRODUCTS: publics en lecture; vendors gèrent les leurs
CREATE POLICY "products_public_read"    ON products FOR SELECT USING (is_active = true);
CREATE POLICY "products_vendor_manage"  ON products FOR ALL    USING (vendor_id = auth.uid() OR current_user_role() = 'ADMIN');

-- ORDERS: clients voient les leurs; vendors voient commandes liées; approvers voient celles de l'entreprise
CREATE POLICY "orders_customer"  ON orders FOR SELECT USING (customer_id = auth.uid());
CREATE POLICY "orders_vendor"    ON orders FOR SELECT USING (
  EXISTS (SELECT 1 FROM products p, jsonb_array_elements(items) item
          WHERE p.vendor_id = auth.uid() AND p.id = (item->>'productId')::UUID)
);
CREATE POLICY "orders_approver"  ON orders FOR ALL USING (
  company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  AND current_user_role() IN ('APPROVER', 'ADMIN')
);
CREATE POLICY "orders_admin"     ON orders FOR ALL USING (current_user_role() = 'ADMIN');

-- CARTS: privé par utilisateur
CREATE POLICY "carts_own" ON carts FOR ALL USING (user_id = auth.uid());

-- MESSAGES: participants seulement
CREATE POLICY "messages_participants" ON messages FOR ALL USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND auth.uid() = ANY(c.participants))
);

-- ─────────────────────────────────────────────
-- REALTIME (pour chat et mises à jour commandes)
-- ─────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE disputes;

-- ─────────────────────────────────────────────
-- TRIGGERS: updated_at auto
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_users_updated    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_orders_updated   BEFORE UPDATE ON orders   FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- TRIGGER: auto-update product rating after review
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE products SET
    rating = (SELECT AVG(rating) FROM reviews WHERE product_id = NEW.product_id),
    review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = NEW.product_id)
  WHERE id = NEW.product_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_product_rating
  AFTER INSERT OR UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_product_rating();

-- ═══════════════════════════════════════════════════════════════
-- OMNI AI Conversations table
-- Run this in the Supabase SQL editor to enable OMNI chat history.
--
-- Note: only authenticated users get persistent history.
-- Anonymous callers receive AI replies but no conversation is stored.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS omni_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS idx_omni_conv_user
  ON omni_conversations(user_id);

-- Row-level security: each user sees only their own conversations.
ALTER TABLE omni_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "omni_conv_owner" ON omni_conversations
  FOR ALL
  USING (user_id = auth.uid());

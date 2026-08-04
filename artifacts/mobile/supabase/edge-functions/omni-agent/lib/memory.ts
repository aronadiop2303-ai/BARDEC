// ─── OMNI Memory — 3-table normalized persistence ─────────────────────────────
//
// Tables (already exist in production with RLS):
//   omni_conversations  — one row per conversation (id, user_id, title, timestamps)
//   omni_messages       — one row per turn       (id, conversation_id, role, content, created_at)
//   omni_memory         — key/value per user     (id, user_id, key, value JSONB, updated_at)

import type { ChatMessage, MemoryEntry, ServiceClient } from './types.ts';

// ── Conversation history ───────────────────────────────────────────────────────

/** Load the last `limit` messages for a conversation owned by `userId`. */
export async function loadHistory(
  db: ServiceClient,
  conversationId: string,
  userId: string,
  limit = 40,
): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from('omni_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  // Verify the conversation belongs to this user (defence-in-depth on top of RLS)
  const { data: conv } = await db
    .from('omni_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();

  if (!conv) return [];

  return (data as ChatMessage[]).filter(m => m.role === 'user' || m.role === 'assistant');
}

/**
 * Ensure a conversation row exists; returns its id.
 * Creates a new one (with an auto-title from the first user message) if needed.
 */
export async function ensureConversation(
  db: ServiceClient,
  conversationId: string | null | undefined,
  userId: string,
  firstUserMessage: string,
): Promise<string> {
  if (conversationId) {
    // Verify ownership
    const { data } = await db
      .from('omni_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();
    if (data) return conversationId;
    // Falls through to create new if ownership check fails
  }

  // Auto-title: first 60 chars of the user's first message
  const title = firstUserMessage.slice(0, 60) + (firstUserMessage.length > 60 ? '…' : '');

  const { data, error } = await db
    .from('omni_conversations')
    .insert({ user_id: userId, title, updated_at: new Date().toISOString() })
    .select('id')
    .single();

  if (error || !data) throw new Error(`Failed to create conversation: ${error?.message}`);
  return data.id as string;
}

/** Append user + assistant messages to omni_messages and bump the conversation timestamp. */
export async function appendMessages(
  db: ServiceClient,
  conversationId: string,
  userMessage: string,
  assistantReply: string,
): Promise<void> {
  const now = new Date().toISOString();

  const rows = [
    { conversation_id: conversationId, role: 'user',      content: userMessage,    created_at: now },
    { conversation_id: conversationId, role: 'assistant', content: assistantReply, created_at: now },
  ];

  const { error: msgErr } = await db.from('omni_messages').insert(rows);
  if (msgErr) throw new Error(`Failed to save messages: ${msgErr.message}`);

  await db
    .from('omni_conversations')
    .update({ updated_at: now })
    .eq('id', conversationId);
}

// ── Per-user memory (omni_memory) ──────────────────────────────────────────────

/** Load all memory entries for a user. */
export async function loadMemory(
  db: ServiceClient,
  userId: string,
): Promise<MemoryEntry[]> {
  const { data, error } = await db
    .from('omni_memory')
    .select('key, value')
    .eq('user_id', userId);

  if (error || !data) return [];
  return data as MemoryEntry[];
}

/** Upsert a single key/value memory entry for a user. */
export async function upsertMemory(
  db: ServiceClient,
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  await db
    .from('omni_memory')
    .upsert(
      { user_id: userId, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id, key' },
    );
}

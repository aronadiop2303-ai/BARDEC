// ─── OMNI Agent — shared types ────────────────────────────────────────────────

export type UserRole = 'CUSTOMER' | 'BUYER' | 'APPROVER' | 'VENDOR' | 'ADMIN';

export type ContextType = 'product' | 'order' | 'shop' | 'vendor_dashboard';

export interface OmniContext {
  type: ContextType;
  data: Record<string, unknown>;
}

/** Role as stored in omni_messages and sent to Anthropic */
export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/** Request body sent by the mobile app */
export interface OmniRequest {
  conversation_id?: string | null;
  message: string;
  context?: OmniContext;
  stream?: boolean;
  /** Caller's declared role — used to personalise the system prompt */
  user_role?: UserRole;
}

/** Non-streaming response */
export interface OmniResponse {
  reply: string;
  conversation_id: string | null;
}

/** Single key–value memory entry from omni_memory */
export interface MemoryEntry {
  key: string;
  value: unknown;
}

/** Minimal Supabase service-role client type */
export type ServiceClient = {
  from: (table: string) => any;
  auth: { getUser: (jwt: string) => Promise<any> };
};

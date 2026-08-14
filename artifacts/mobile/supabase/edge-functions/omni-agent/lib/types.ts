// ─── OMNI Agent — shared types ────────────────────────────────────────────────
// Type-only — erased at build time, so this file can be empty at runtime, but
// keeping real declarations here gives editors/tsc something to check against.

export interface OmniRequestBody {
  conversation_id?: string | null;
  message: string;
}

export interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface OmniMemory {
  summary: string | null;
  preferences: { language?: 'fr' | 'en'; tone?: string; [key: string]: unknown };
}

export interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

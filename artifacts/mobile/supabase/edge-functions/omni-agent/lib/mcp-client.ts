// ─── MCP Client — calls the BARDEC MCP server edge function ───────────────────
// OMNI uses this to resolve tool calls (search_products, get_order, etc.)
// returned by the Anthropic API.

const MCP_URL = Deno.env.get('MCP_SERVER_URL') ??
  'https://bbfvlgsrjkguwxiwnbgk.supabase.co/functions/v1/mcp-server';

export interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

/**
 * Execute a single MCP tool call and return its result formatted for Anthropic.
 *
 * @param toolUseId  - the `id` from the Anthropic tool_use block
 * @param toolName   - one of the names defined in mcp-tools.ts
 * @param toolInput  - the parsed JSON input from Anthropic
 * @param userJwt    - Bearer JWT of the authenticated user (forwarded for RLS)
 */
export async function callMcpTool(
  toolUseId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  userJwt: string,
): Promise<ToolResult> {
  try {
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${userJwt}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id:      1,
        method:  'tools/call',
        params:  { name: toolName, arguments: toolInput },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { type: 'tool_result', tool_use_id: toolUseId, content: `MCP error ${res.status}: ${text}` };
    }

    const json = await res.json();
    const result = json?.result;

    // MCP tools/call returns { content: [{ type: "text", text: "..." }] }
    if (Array.isArray(result?.content)) {
      const text = result.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
      return { type: 'tool_result', tool_use_id: toolUseId, content: text || '(no result)' };
    }

    return {
      type:        'tool_result',
      tool_use_id: toolUseId,
      content:     JSON.stringify(result ?? json),
    };
  } catch (err: any) {
    return {
      type:        'tool_result',
      tool_use_id: toolUseId,
      content:     `Tool call failed: ${err?.message ?? String(err)}`,
    };
  }
}

/** Execute all tool_use blocks from an Anthropic response in parallel. */
export async function resolveToolUses(
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  userJwt: string,
): Promise<ToolResult[]> {
  return Promise.all(
    toolUses.map(tu => callMcpTool(tu.id, tu.name, tu.input, userJwt)),
  );
}

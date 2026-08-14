export interface McpCallOptions {
  endpoint: string;
  apiKey: string;
}

export class McpToolError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

let requestCounter = 0;

export async function callMcpTool(
  options: McpCallOptions,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  requestCounter += 1;

  const response = await fetch(options.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': options.apiKey,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: requestCounter,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });

  if (!response.ok) {
    throw new McpToolError(-32000, `Serveur MCP indisponible (HTTP ${response.status}).`);
  }

  const body = await response.json();

  if (body.error) {
    throw new McpToolError(body.error.code, body.error.message);
  }

  const rawText: string | undefined = body.result?.content?.[0]?.text;
  if (rawText === undefined) {
    throw new McpToolError(-32003, "Réponse du serveur MCP dans un format inattendu.");
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

// ─── MCP Tool Definitions for Anthropic ───────────────────────────────────────
// These are the tools OMNI can invoke via the BARDEC MCP server to retrieve
// live data (products, orders, shops) in real time.

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const MCP_TOOLS: AnthropicTool[] = [
  {
    name: 'search_products',
    description:
      'Search the BARDEC product catalog by keyword, category, or vendor. ' +
      'Returns a list of matching products with name, price, stock, and ID.',
    input_schema: {
      type: 'object',
      properties: {
        query:    { type: 'string',  description: 'Search keywords' },
        category: { type: 'string',  description: 'Optional product category filter' },
        limit:    { type: 'integer', description: 'Max results (default 5, max 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product',
    description: 'Retrieve full details for a single product by its ID.',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'UUID of the product' },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'get_order',
    description:
      'Retrieve the current status and details of a customer order. ' +
      'Only returns orders belonging to the authenticated user.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'UUID or order number of the order' },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'list_orders',
    description:
      'List recent orders for the authenticated user (customer or vendor). ' +
      'Returns order number, status, total, and date.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Optional status filter (pending, shipped, completed, cancelled)',
        },
        limit: { type: 'integer', description: 'Max results (default 5, max 20)' },
      },
    },
  },
  {
    name: 'get_shop',
    description: 'Retrieve details about a BARDEC Proximity shop by its ID or name.',
    input_schema: {
      type: 'object',
      properties: {
        shop_id: { type: 'string', description: 'UUID of the proximity shop' },
      },
      required: ['shop_id'],
    },
  },
];

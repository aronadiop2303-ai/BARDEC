import { ClaudeToolDefinition } from './types.ts';

export const OMNI_TOOLS: ClaudeToolDefinition[] = [
  {
    name: 'search_products',
    description: 'Recherche des produits dans le catalogue BARDEC par mot-clé, catégorie, ou vendeur.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Terme de recherche (nom, description).' },
        category: { type: 'string', description: 'Filtrer par catégorie exacte.' },
        vendor_id: { type: 'string', description: "UUID du vendeur pour filtrer sur ses produits." },
        limit: { type: 'number', description: 'Nombre max de résultats.' },
      },
    },
  },
  {
    name: 'get_product_details',
    description: "Détails complets d'un produit (prix, stock, specs) et ses avis récents.",
    input_schema: {
      type: 'object',
      properties: { product_id: { type: 'string', description: 'UUID du produit.' } },
      required: ['product_id'],
    },
  },
  {
    name: 'get_order_status',
    description: "Statut détaillé d'une commande à partir de son numéro (ex: BDC-2026-001234).",
    input_schema: {
      type: 'object',
      properties: { order_number: { type: 'string', description: 'Numéro de commande, format BDC-AAAA-NNNNNN.' } },
      required: ['order_number'],
    },
  },
  {
    name: 'list_orders_by_customer',
    description: "Liste les commandes d'un client (par ID ou email), éventuellement filtrées par statut.",
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        customer_email: { type: 'string' },
        status: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'check_stock',
    description: "Vérifie la quantité en stock d'un produit.",
    input_schema: {
      type: 'object',
      properties: { product_id: { type: 'string' } },
      required: ['product_id'],
    },
  },
  {
    name: 'nearby_shops',
    description: 'Trouve les commerces de quartier à proximité de coordonnées GPS données.',
    input_schema: {
      type: 'object',
      properties: {
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        radius_km: { type: 'number', description: 'Rayon de recherche en km.' },
        category: {
          type: 'string',
          description:
            'alimentation_table | restauration_loisirs | bricolage_maison | beaute_mode | sante_hygiene | culture_tech | services_entretien',
        },
      },
      required: ['latitude', 'longitude'],
    },
  },
];

export const OMNI_TOOL_NAMES = new Set(OMNI_TOOLS.map((t) => t.name));

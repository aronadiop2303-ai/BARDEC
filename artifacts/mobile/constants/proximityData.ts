/** Catégories, sous-catégories et données de démo — Commerces de proximité BARDEC */

export const PROXIMITY_CATEGORIES = [
  'Alimentation & Table',
  'Restauration & Loisirs',
  'Bricolage & Maison',
  'Beauté & Mode',
  'Santé & Hygiène',
  'Culture & Tech',
  'Services & Entretien',
] as const;

export type ProximityCategory = typeof PROXIMITY_CATEGORIES[number];

export const PROXIMITY_SUBCATEGORIES: Record<ProximityCategory, string[]> = {
  'Alimentation & Table': [
    'Boulangerie/Pâtisserie',
    'Épicerie de quartier',
    'Supermarché/Supérette',
    'Boucherie/Charcuterie',
    'Poissonnerie',
    'Primeur',
    'Cave à vin/Caviste',
  ],
  'Restauration & Loisirs': [
    'Fast-food/Snack',
    'Dibiterie/Grill',
    'Gargote/Restaurant de quartier',
    'Café/Maquis',
    'Glacier',
  ],
  'Bricolage & Maison': ['Quincaillerie', 'Ameublement/Décoration', 'Électroménager'],
  'Beauté & Mode': [
    'Prêt-à-porter',
    'Friperie',
    'Salon de coiffure/Barbier',
    'Parfumerie/Cosmétiques',
    'Bijouterie',
    'Cordonnerie',
  ],
  'Santé & Hygiène': ['Pharmacie', 'Parapharmacie', 'Opticien'],
  'Culture & Tech': ['Librairie/Papeterie', 'Téléphonie/Télécoms', 'Cybercafé'],
  'Services & Entretien': [
    'Pressing/Blanchisserie',
    'Atelier de couture/Tailleur',
    'Fleuriste',
    'Bureau de tabac/Presse',
    'Agence de voyage',
    'Station-service',
  ],
};

export const CATEGORY_ICONS: Record<ProximityCategory, string> = {
  'Alimentation & Table': 'shopping-bag',
  'Restauration & Loisirs': 'coffee',
  'Bricolage & Maison': 'wrench',
  'Beauté & Mode': 'scissors',
  'Santé & Hygiène': 'heart',
  'Culture & Tech': 'book-open',
  'Services & Entretien': 'briefcase',
};

export const CATEGORY_COLORS: Record<ProximityCategory, string> = {
  'Alimentation & Table': '#F59E0B',
  'Restauration & Loisirs': '#EF4444',
  'Bricolage & Maison': '#6366F1',
  'Beauté & Mode': '#EC4899',
  'Santé & Hygiène': '#22C55E',
  'Culture & Tech': '#0EA5E9',
  'Services & Entretien': '#8B5CF6',
};

// The DB column proximity_shops.category is a Postgres ENUM (shop_category)
// using short slugs — it does NOT accept the French display labels above
// (confirmed via postgres_logs: "invalid input value for enum shop_category:
// \"Alimentation & Table\"", error 22P02). Every write to that column must
// go through CATEGORY_TO_ENUM; every read must go through ENUM_TO_CATEGORY
// so the rest of the app keeps working with the pretty labels it already
// uses everywhere (PROXIMITY_SUBCATEGORIES/CATEGORY_ICONS/CATEGORY_COLORS
// are all keyed by label, not slug).
export const CATEGORY_TO_ENUM: Record<ProximityCategory, string> = {
  'Alimentation & Table':   'alimentation_table',
  'Restauration & Loisirs': 'restauration_loisirs',
  'Bricolage & Maison':     'bricolage_maison',
  'Beauté & Mode':          'beaute_mode',
  'Santé & Hygiène':        'sante_hygiene',
  'Culture & Tech':         'culture_tech',
  'Services & Entretien':   'services_entretien',
};

export const ENUM_TO_CATEGORY: Record<string, ProximityCategory> = Object.fromEntries(
  Object.entries(CATEGORY_TO_ENUM).map(([label, slug]) => [slug, label]),
) as Record<string, ProximityCategory>;

export const DAY_LABELS: Record<string, string> = {
  lun: 'Lundi',
  mar: 'Mardi',
  mer: 'Mercredi',
  jeu: 'Jeudi',
  ven: 'Vendredi',
  sam: 'Samedi',
  dim: 'Dimanche',
};

export const DAY_KEYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

export interface ProximityShop {
  id: string;
  name: string;
  category: ProximityCategory;
  subcategory?: string;
  description?: string;
  phone?: string;
  address?: string;
  lat: number;
  lng: number;
  opening_hours?: Record<string, string>;
  photos?: string[];
  rating: number;
  rating_count: number;
  is_active: boolean;
  verified: boolean;
  owner_id?: string;
  distance_km?: number;
}

export interface ProximityProduct {
  id: string;
  shop_id: string;
  name: string;
  price: number;
  unit: string;
  image_url?: string;
  in_stock: boolean;
}

/** Commerces fictifs centrés sur Dakar pour le mode démo */
export const DEMO_SHOPS: ProximityShop[] = [
  {
    id: 'demo-1',
    name: 'Boulangerie du Plateau',
    category: 'Alimentation & Table',
    subcategory: 'Boulangerie/Pâtisserie',
    description: 'Pain frais, viennoiseries et gâteaux maison tous les matins.',
    phone: '+221 77 100 1001',
    address: 'Rue Carnot, Plateau, Dakar',
    lat: 14.6937,
    lng: -17.4441,
    opening_hours: { lun: '06:00-20:00', mar: '06:00-20:00', mer: '06:00-20:00', jeu: '06:00-20:00', ven: '06:00-13:00', sam: '07:00-20:00', dim: 'Fermé' },
    rating: 4.5, rating_count: 128, is_active: true, verified: true, distance_km: 0.3,
  },
  {
    id: 'demo-2',
    name: 'Pharmacie Centrale Dakar',
    category: 'Santé & Hygiène',
    subcategory: 'Pharmacie',
    description: 'Médicaments, parapharmacie et conseils pharmaceutiques 7j/7.',
    phone: '+221 77 200 2002',
    address: 'Avenue Cheikh Anta Diop, Dakar',
    lat: 14.6952,
    lng: -17.4468,
    opening_hours: { lun: '08:00-22:00', mar: '08:00-22:00', mer: '08:00-22:00', jeu: '08:00-22:00', ven: '08:00-22:00', sam: '09:00-21:00', dim: '10:00-18:00' },
    rating: 4.8, rating_count: 210, is_active: true, verified: true, distance_km: 0.7,
  },
  {
    id: 'demo-3',
    name: 'Dibiterie Chez Modou',
    category: 'Restauration & Loisirs',
    subcategory: 'Dibiterie/Grill',
    description: 'Le meilleur thiéboudienne du quartier, dibi frais à emporter.',
    phone: '+221 77 300 3003',
    address: 'Marché HLM, Dakar',
    lat: 14.6921,
    lng: -17.4505,
    opening_hours: { lun: '11:00-23:00', mar: '11:00-23:00', mer: '11:00-23:00', jeu: '11:00-23:00', ven: '11:00-23:00', sam: '11:00-00:00', dim: '12:00-22:00' },
    rating: 4.3, rating_count: 87, is_active: true, verified: false, distance_km: 1.1,
  },
  {
    id: 'demo-4',
    name: 'Salon Fatou Coiffure',
    category: 'Beauté & Mode',
    subcategory: 'Salon de coiffure/Barbier',
    description: 'Coiffures afro, tresses, défrisage — femmes et enfants.',
    phone: '+221 77 400 4004',
    address: 'Sacré-Cœur III, Dakar',
    lat: 14.7015,
    lng: -17.4572,
    opening_hours: { lun: '09:00-19:00', mar: '09:00-19:00', mer: '09:00-19:00', jeu: '09:00-19:00', ven: '09:00-12:00', sam: '09:00-20:00', dim: 'Fermé' },
    rating: 4.1, rating_count: 54, is_active: true, verified: false, distance_km: 1.8,
  },
  {
    id: 'demo-5',
    name: 'Téléboutique Orange Point',
    category: 'Culture & Tech',
    subcategory: 'Téléphonie/Télécoms',
    description: "Recharges, transferts d'argent, vente de puces et accessoires.",
    phone: '+221 77 500 5005',
    address: 'Médina, Dakar',
    lat: 14.6880,
    lng: -17.4520,
    opening_hours: { lun: '08:00-21:00', mar: '08:00-21:00', mer: '08:00-21:00', jeu: '08:00-21:00', ven: '08:00-21:00', sam: '09:00-20:00', dim: '10:00-18:00' },
    rating: 3.9, rating_count: 32, is_active: true, verified: false, distance_km: 2.1,
  },
];

export interface ProximityReview {
  id: string;
  shop_id: string;
  user_id: string;
  user_name: string;
  rating: number;
  comment?: string;
  created_at: string;
}

/** Avis fictifs pour le mode démo */
export const DEMO_REVIEWS: Record<string, ProximityReview[]> = {
  'demo-1': [
    { id: 'r1-1', shop_id: 'demo-1', user_id: 'u1', user_name: 'Aminata D.', rating: 5, comment: 'Pain toujours frais, livraison rapide !', created_at: '2024-06-01T08:00:00Z' },
    { id: 'r1-2', shop_id: 'demo-1', user_id: 'u2', user_name: 'Moussa K.', rating: 4, comment: 'Très bonne boulangerie, je recommande.', created_at: '2024-05-20T09:30:00Z' },
    { id: 'r1-3', shop_id: 'demo-1', user_id: 'u3', user_name: 'Fatou B.', rating: 4, comment: 'Les croissants sont délicieux.', created_at: '2024-05-10T07:45:00Z' },
  ],
  'demo-2': [
    { id: 'r2-1', shop_id: 'demo-2', user_id: 'u4', user_name: 'Ibrahima S.', rating: 5, comment: 'Pharmacien très professionnel et disponible.', created_at: '2024-06-02T10:00:00Z' },
    { id: 'r2-2', shop_id: 'demo-2', user_id: 'u5', user_name: 'Mariama T.', rating: 5, comment: 'Stock complet, prix corrects.', created_at: '2024-05-25T11:00:00Z' },
  ],
  'demo-3': [
    { id: 'r3-1', shop_id: 'demo-3', user_id: 'u6', user_name: 'Omar F.', rating: 4, comment: 'Meilleur thiébou de la ville !', created_at: '2024-06-01T14:00:00Z' },
    { id: 'r3-2', shop_id: 'demo-3', user_id: 'u7', user_name: 'Aïssatou N.', rating: 4, comment: 'Dibi bien mariné, servi chaud.', created_at: '2024-05-18T13:00:00Z' },
  ],
  'demo-4': [
    { id: 'r4-1', shop_id: 'demo-4', user_id: 'u8', user_name: 'Khadija M.', rating: 4, comment: 'Tresses soignées, ambiance agréable.', created_at: '2024-06-03T15:00:00Z' },
  ],
  'demo-5': [
    { id: 'r5-1', shop_id: 'demo-5', user_id: 'u9', user_name: 'Cheikh A.', rating: 4, comment: 'Rapide et efficace pour les recharges.', created_at: '2024-05-30T09:00:00Z' },
    { id: 'r5-2', shop_id: 'demo-5', user_id: 'u10', user_name: 'Ndéye L.', rating: 3, comment: 'Correct mais parfois en rupture.', created_at: '2024-05-22T10:30:00Z' },
  ],
};

export const DEMO_PRODUCTS: Record<string, ProximityProduct[]> = {
  'demo-1': [
    { id: 'p1-1', shop_id: 'demo-1', name: 'Baguette tradition', price: 200, unit: 'pièce', in_stock: true },
    { id: 'p1-2', shop_id: 'demo-1', name: 'Croissant beurre', price: 350, unit: 'pièce', in_stock: true },
    { id: 'p1-3', shop_id: 'demo-1', name: 'Pain de mie', price: 1500, unit: 'sachet', in_stock: true },
    { id: 'p1-4', shop_id: 'demo-1', name: 'Gâteau café', price: 2500, unit: 'part', in_stock: false },
  ],
  'demo-2': [
    { id: 'p2-1', shop_id: 'demo-2', name: 'Doliprane 500mg', price: 1200, unit: 'boîte', in_stock: true },
    { id: 'p2-2', shop_id: 'demo-2', name: 'Vitamine C 1000mg', price: 3500, unit: 'tube', in_stock: true },
    { id: 'p2-3', shop_id: 'demo-2', name: 'Gel hydroalcoolique', price: 800, unit: 'flacon', in_stock: true },
  ],
  'demo-3': [
    { id: 'p3-1', shop_id: 'demo-3', name: 'Thiéboudienne', price: 2500, unit: 'assiette', in_stock: true },
    { id: 'p3-2', shop_id: 'demo-3', name: 'Dibi 500g', price: 3000, unit: 'portion', in_stock: true },
    { id: 'p3-3', shop_id: 'demo-3', name: 'Yassa poulet', price: 2000, unit: 'assiette', in_stock: false },
  ],
  'demo-4': [
    { id: 'p4-1', shop_id: 'demo-4', name: 'Coupe femme simple', price: 3000, unit: 'prestation', in_stock: true },
    { id: 'p4-2', shop_id: 'demo-4', name: 'Tresses box braids', price: 15000, unit: 'prestation', in_stock: true },
    { id: 'p4-3', shop_id: 'demo-4', name: 'Défrisage', price: 5000, unit: 'prestation', in_stock: true },
  ],
  'demo-5': [
    { id: 'p5-1', shop_id: 'demo-5', name: 'Recharge Orange 500F', price: 500, unit: 'recharge', in_stock: true },
    { id: 'p5-2', shop_id: 'demo-5', name: 'Puce Orange', price: 200, unit: 'pièce', in_stock: true },
    { id: 'p5-3', shop_id: 'demo-5', name: 'Coque iPhone 14', price: 4500, unit: 'pièce', in_stock: false },
  ],
};

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

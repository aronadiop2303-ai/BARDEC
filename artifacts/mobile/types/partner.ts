// Fondation du rôle Partenaire — voir docs/README_PARTNER_ROLE.md.
// Ce repo n'a pas de types/database.types.ts généré : chaque écran déclare
// ses propres interfaces à la frontière Supabase (ex. constants/mockData.ts,
// interfaces `Real*` dans admin.tsx). Ce fichier suit la même convention
// plutôt que d'introduire un nouveau pattern de génération de types.

export type PartnerType =
  | 'DELIVERY' | 'TRANSPORTER' | 'LOGISTICS' | 'SUPPLIER' | 'WHOLESALER'
  | 'COMMERCIAL' | 'PICKUP_POINT' | 'WAREHOUSE' | 'FINANCIAL' | 'TECH_API'
  | 'AI' | 'SERVICE_PROVIDER' | 'TECHNICIAN' | 'MARKETING' | 'INSTITUTION_NGO'
  | 'INVESTOR' | 'STRATEGIC_INTL' | 'OTHER';

export const PARTNER_TYPES: PartnerType[] = [
  'DELIVERY', 'TRANSPORTER', 'LOGISTICS', 'SUPPLIER', 'WHOLESALER',
  'COMMERCIAL', 'PICKUP_POINT', 'WAREHOUSE', 'FINANCIAL', 'TECH_API',
  'AI', 'SERVICE_PROVIDER', 'TECHNICIAN', 'MARKETING', 'INSTITUTION_NGO',
  'INVESTOR', 'STRATEGIC_INTL', 'OTHER',
];

// Libellés FR partagés — seule copie dans tout le repo (admin.tsx,
// partner-dashboard.tsx, partner-pending.tsx importent tous celle-ci).
export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  DELIVERY: 'Livreur', TRANSPORTER: 'Transporteur', LOGISTICS: 'Logistique',
  SUPPLIER: 'Fournisseur', WHOLESALER: 'Grossiste', COMMERCIAL: 'Partenaire commercial',
  PICKUP_POINT: 'Point relais', WAREHOUSE: 'Entrepôt', FINANCIAL: 'Partenaire financier',
  TECH_API: 'Fournisseur API', AI: 'Partenaire IA', SERVICE_PROVIDER: 'Prestataire de services',
  TECHNICIAN: 'Technicien', MARKETING: 'Marketing', INSTITUTION_NGO: 'Institution / ONG',
  INVESTOR: 'Investisseur', STRATEGIC_INTL: 'Partenaire stratégique international', OTHER: 'Autre',
};

export type PartnerStatus =
  | 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'ACTIVE'
  | 'SUSPENDED' | 'RESTRICTED' | 'REJECTED' | 'TERMINATED';

// Statuts où le partenaire attend une décision — utilisés côté navigation
// pour router vers l'écran d'attente plutôt que l'espace partenaire.
export const PENDING_PARTNER_STATUSES: PartnerStatus[] = ['PENDING', 'UNDER_REVIEW'];

// Seuls ces statuts donnent accès à l'espace partenaire fonctionnel
// (onglet "Espace Partenaire"). Tout le reste — y compris SUSPENDED /
// RESTRICTED / REJECTED / TERMINATED, pas seulement PENDING/UNDER_REVIEW —
// retombe sur l'écran de statut (app/(app)/partner-pending.tsx), qui adapte
// son message selon le statut réel plutôt que de montrer une bottom bar
// avec un onglet dont l'accès n'est plus (ou pas encore) légitime.
export const ACTIVE_PARTNER_STATUSES: PartnerStatus[] = ['APPROVED', 'ACTIVE'];

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  PENDING: 'En attente', UNDER_REVIEW: 'En cours d\'examen', APPROVED: 'Approuvé',
  ACTIVE: 'Actif', SUSPENDED: 'Suspendu', RESTRICTED: 'Restreint',
  REJECTED: 'Rejeté', TERMINATED: 'Terminé',
};

/** Ligne brute de public.partners — mapping direct, pas de transformation. */
export interface PartnerRow {
  id: string;
  user_id: string;
  partner_type: PartnerType;
  status: PartnerStatus;
  company_name: string | null;
  metadata: Record<string, unknown>;
  /** Motif renseigné par l'admin lors d'un rejet ou d'une suspension. */
  status_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerCapabilities {
  /** Identifiants des capacités supportées, ex: ['manage_delivery', 'view_orders']. */
  actions: string[];
  /** true si ce partenaire peut recevoir des missions/commandes automatiquement. */
  canReceiveAssignments: boolean;
}

/**
 * Interface générique pour l'écosystème Partenaire (doc §14 — Ports /
 * Adapters). Un type de partenaire concret (DELIVERY, FINANCIAL, AI…) peut
 * l'implémenter pour exposer ses capacités de façon uniforme au Core BARDEC,
 * sans faire entrer la logique propre à chaque intégration externe dans le
 * Core. Fondation uniquement — aucun adapter concret n'est implémenté dans
 * ce chantier (voir docs/README_PARTNER_ROLE.md, section Post-lancement).
 */
export interface PartnerAdapter {
  readonly partnerId: string;
  readonly partnerType: PartnerType;
  readonly status: PartnerStatus;
  readonly metadata: Record<string, unknown>;

  /** Prépare l'adapter (ex: charger une config externe) avant utilisation. */
  initialize(): Promise<void>;
  /** Actions/capacités que ce partenaire peut exercer dans son état actuel. */
  getCapabilities(): PartnerCapabilities;
  /** Vérifie que `metadata` contient ce dont ce type de partenaire a besoin. */
  validateConfig(): { valid: boolean; errors: string[] };
}

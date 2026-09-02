import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

// customer_addresses has no street/city/country/zip split — just a single
// free-text `address` field (verified via information_schema before coding).
// `label` is an optional friendly name ("Maison", "Bureau").
export interface CustomerAddress {
  id: string;
  user_id: string;
  label: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at: string;
}

async function fetchAddresses(userId: string): Promise<CustomerAddress[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerAddress[];
}

export function useCustomerAddresses() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ['customer_addresses', userId],
    queryFn: () => fetchAddresses(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  });
}

interface AddressInput {
  label: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

// Setting one address as default unsets every other one first — no DB
// trigger enforces "only one default" (verified: no trigger on
// customer_addresses), so the client does it in two steps. Worst case if the
// second step fails is zero defaults (recoverable by retrying), never two.
async function applyDefault(supabaseClient: NonNullable<typeof supabase>, userId: string, exceptId?: string) {
  let query = supabaseClient.from('customer_addresses').update({ is_default: false }).eq('user_id', userId);
  if (exceptId) query = query.neq('id', exceptId);
  await query;
}

export function useCreateCustomerAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddressInput) => {
      if (!supabase) throw new Error('Supabase non configuré');
      // Real Supabase auth UUID — user.id from AuthContext can be a mock
      // placeholder ("u1"…) when the role-switcher preview is active.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const realUserId = authUser?.id;
      if (!realUserId) throw new Error('Session expirée');

      if (input.isDefault) await applyDefault(supabase, realUserId);

      const { error } = await supabase.from('customer_addresses').insert({
        user_id: realUserId,
        label: input.label,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        is_default: input.isDefault,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer_addresses'] }); },
  });
}

export function useUpdateCustomerAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userId, input }: { id: string; userId: string; input: AddressInput }) => {
      if (!supabase) throw new Error('Supabase non configuré');
      if (input.isDefault) await applyDefault(supabase, userId, id);

      const { error } = await supabase.from('customer_addresses').update({
        label: input.label,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        is_default: input.isDefault,
      }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer_addresses'] }); },
  });
}

export function useDeleteCustomerAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error('Supabase non configuré');
      const { error } = await supabase.from('customer_addresses').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer_addresses'] }); },
  });
}

export function useSetDefaultCustomerAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      if (!supabase) throw new Error('Supabase non configuré');
      await applyDefault(supabase, userId, id);
      const { error } = await supabase.from('customer_addresses').update({ is_default: true }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer_addresses'] }); },
  });
}

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useCurrency } from '@/context/CurrencyContext';
import BardecLayout from '@/components/BardecLayout';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

// Chantier 2 — Espace Partenaire / "Affectation de tournées".
// Liste des commandes expédiées/en attente (statuts shipped/approved/
// out_for_delivery) + livreurs, avec affectation d'une commande à un livreur.
// Fetch défensif (catch → état vide). Regroupement visuel par livreur assigné.

interface RouteOrderRow {
  id: string;
  order_number: string | null;
  status: string | null;
  total: number | null;
  delivery_partner_id: string | null;
  created_at: string | null;
}

interface CourierRow {
  id: string;
  name: string;
  phone: string;
  zone: string | null;
  active: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  pending_approval: 'En attente d\'approbation',
  approved: 'Approuvé',
  shipped: 'Expédié',
  ready_for_delivery: 'Prêt',
  out_for_delivery: 'En livraison',
  completed: 'Livré',
  cancelled: 'Annulé',
};

export default function PartnerRoutesScreen() {
  const colors = useColors();
  const { user, isDemoMode } = useAuth();
  const { formatPrice } = useCurrency();
  const [orders, setOrders] = useState<RouteOrderRow[]>([]);
  const [couriers, setCouriers] = useState<CourierRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ data: orderData, error: orderErr }, { data: courierData, error: courierErr }] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, status, total, delivery_partner_id, created_at')
          .in('status', ['shipped', 'approved', 'out_for_delivery'])
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('delivery_partners').select('id, name, phone, zone, active').order('name', { ascending: true }),
      ]);
      if (orderErr) {
        console.warn('Partner routes orders fetch error:', orderErr.message);
        setOrders([]);
      } else {
        setOrders((orderData ?? []) as RouteOrderRow[]);
      }
      if (courierErr) {
        console.warn('Partner routes couriers fetch error:', courierErr.message);
        setCouriers([]);
      } else {
        setCouriers((courierData ?? []) as CourierRow[]);
      }
    } catch (e) {
      console.warn('Partner routes fetch exception:', e);
      setOrders([]);
      setCouriers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  // Garde d'accès route-level (même pattern que partner-dashboard.tsx).
  if (!isDemoMode && user?.role !== 'PARTNER') {
    return <Redirect href="/(app)/(tabs)" />;
  }

  async function assignOrder(order: RouteOrderRow, courierId: string) {
    if (!isSupabaseConfigured || !supabase) {
      Alert.alert('Bientôt disponible', 'L\'affectation des tournées sera disponible une fois Supabase connecté.');
      return;
    }
    try {
      const { error } = await supabase.from('orders').update({ delivery_partner_id: courierId }).eq('id', order.id);
      if (error) {
        console.warn('Partner route assign error:', error.message);
        Alert.alert('Erreur', 'Impossible d\'affecter cette commande. Réessaie dans un instant.');
        return;
      }
      setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, delivery_partner_id: courierId } : o)));
    } catch (e) {
      console.warn('Partner route assign exception:', e);
      Alert.alert('Erreur', 'Impossible d\'affecter cette commande.');
    }
  }

  const unassigned = orders.filter(o => !o.delivery_partner_id);
  const groups: { key: string; title: string; icon: string; orders: RouteOrderRow[] }[] = [
    { key: 'unassigned', title: 'Non assignées', icon: 'inbox', orders: unassigned },
    ...couriers.map(c => ({
      key: c.id,
      title: c.name,
      icon: 'user',
      orders: orders.filter(o => o.delivery_partner_id === c.id),
    })),
  ];

  return (
    <BardecLayout onRefresh={fetchAll} refreshing={loading}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Affectation de tournées</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Assigne chaque commande à un livreur.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 24 }} />
      ) : (
        groups.map(group => (
          <View key={group.key} style={styles.group}>
            <View style={styles.groupHeader}>
              <Feather name={group.icon} size={15} color={colors.primary} />
              <Text style={[styles.groupTitle, { color: colors.foreground }]}>{group.title}</Text>
              <View style={[styles.countBadge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.countText, { color: colors.primary }]}>{group.orders.length}</Text>
              </View>
            </View>

            {group.orders.length === 0 ? (
              <Text style={[styles.groupEmpty, { color: colors.mutedForeground }]}>
                Aucune commande.
              </Text>
            ) : (
              group.orders.map(order => {
                const courierName = couriers.find(c => c.id === order.delivery_partner_id)?.name;
                return (
                  <View key={order.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                      <Text style={[styles.orderNumber, { color: colors.foreground }]}>
                        #{order.order_number ?? '—'}
                      </Text>
                      <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                        {STATUS_LABELS[order.status ?? ''] ?? order.status ?? '—'}
                      </Text>
                    </View>
                    <Text style={[styles.total, { color: colors.primary }]}>
                      {formatPrice(Number(order.total ?? 0))}
                    </Text>
                    {courierName ? (
                      <Text style={[styles.courierCurrent, { color: colors.mutedForeground }]}>
                        Livreur : {courierName}
                      </Text>
                    ) : null}

                    <Text style={[styles.assignLabel, { color: colors.mutedForeground }]}>Assigner à :</Text>
                    <View style={styles.chips}>
                      {couriers.map(c => (
                        <TouchableOpacity
                          key={c.id}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: order.delivery_partner_id === c.id ? colors.primary : colors.card,
                              borderColor: colors.border,
                            },
                          ]}
                          onPress={() => { void assignOrder(order, c.id); }}
                        >
                          <Text style={[styles.chipText, { color: order.delivery_partner_id === c.id ? 'white' : colors.foreground }]}>
                            {c.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {couriers.length === 0 && (
                        <Text style={[styles.noCouriers, { color: colors.mutedForeground }]}>
                          Aucun livreur disponible.
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ))
      )}
    </BardecLayout>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 2 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13 },
  group: { marginBottom: 16 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  groupTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  countBadge: { minWidth: 24, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, alignItems: 'center' },
  countText: { fontSize: 12, fontWeight: '800' },
  groupEmpty: { fontSize: 13, paddingHorizontal: 16, marginBottom: 8 },
  card: { marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  orderNumber: { fontSize: 15, fontWeight: '700', flex: 1 },
  statusText: { fontSize: 12, fontWeight: '600' },
  total: { fontSize: 16, fontWeight: '800' },
  courierCurrent: { fontSize: 12 },
  assignLabel: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },
  noCouriers: { fontSize: 12 },
});

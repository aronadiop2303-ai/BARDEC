import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { Order, STATUS_COLORS } from '@/constants/mockData';
import { TranslationKey } from '@/constants/translations';

interface Props {
  order: Order;
}

const STATUS_ICONS: Record<string, string> = {
  pending: 'clock',
  pending_approval: 'alert-circle',
  approved: 'check-circle',
  shipped: 'package',
  ready_for_delivery: 'check-square',
  out_for_delivery: 'truck',
  completed: 'check-circle',
  cancelled: 'x-circle',
};

export default function OrderCard({ order }: Props) {
  const colors = useColors();
  const { t } = useLanguage();

  const statusColor = STATUS_COLORS[order.status] ?? colors.mutedForeground;
  const statusIcon = (STATUS_ICONS[order.status] ?? 'circle') as keyof typeof Feather.glyphMap;
  const statusKey = order.status as TranslationKey;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      activeOpacity={0.85}
      onPress={() => router.push(`/order/${order.id}` as any)}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.orderNum, { color: colors.foreground }]}>
            {t('order_number')}{order.orderNumber}
          </Text>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>{order.date}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Feather name={statusIcon} size={12} color={statusColor} />
          <Text style={[styles.statusText, { color: statusColor }]}>{t(statusKey)}</Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.itemsSummary}>
        <Text style={[styles.itemCount, { color: colors.mutedForeground }]}>
          {order.items.length} item{order.items.length > 1 ? 's' : ''} · {order.items.map(i => i.productName).slice(0, 2).join(', ')}{order.items.length > 2 ? '...' : ''}
        </Text>
        <Text style={[styles.total, { color: colors.primary }]}>
          ${order.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
      </View>

      {order.purchaseOrderNumber && (
        <View style={[styles.poRow, { backgroundColor: colors.accent }]}>
          <Feather name="file-text" size={12} color={colors.primary} />
          <Text style={[styles.poText, { color: colors.primary }]}>PO: {order.purchaseOrderNumber}</Text>
        </View>
      )}

      {order.trackingNumber && (
        <View style={styles.trackRow}>
          <Feather name="map-pin" size={12} color={colors.secondary} />
          <Text style={[styles.trackText, { color: colors.secondary }]}>
            {t('track_order')}: {order.trackingNumber}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]}>
          <Feather name="eye" size={14} color={colors.mutedForeground} />
          <Text style={[styles.actionText, { color: colors.mutedForeground }]}>{t('order_details')}</Text>
        </TouchableOpacity>
        {order.status === 'shipped' || order.status === 'out_for_delivery' ? (
          <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.primary, backgroundColor: colors.accent }]}>
            <Feather name="navigation" size={14} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.primary }]}>{t('track_order')}</Text>
          </TouchableOpacity>
        ) : null}
        {order.status === 'completed' && (
          <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]}>
            <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
            <Text style={[styles.actionText, { color: colors.mutedForeground }]}>{t('reorder')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderNum: {
    fontSize: 14,
    fontWeight: '700',
  },
  date: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
  },
  itemsSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemCount: {
    fontSize: 13,
    flex: 1,
    marginRight: 8,
  },
  total: {
    fontSize: 16,
    fontWeight: '700',
  },
  poRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  poText: {
    fontSize: 12,
    fontWeight: '600',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trackText: {
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

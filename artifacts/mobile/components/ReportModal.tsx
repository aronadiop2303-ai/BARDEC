import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errors';

export type ReportTargetType = 'product' | 'shop' | 'review' | 'vendor' | 'user';

const TARGET_LABELS: Record<ReportTargetType, string> = {
  product: 'ce produit',
  shop: 'cette boutique',
  review: 'cet avis',
  vendor: 'ce vendeur',
  user: 'cet utilisateur',
};

const REPORT_REASONS = [
  'Contenu inapproprié',
  'Arnaque ou fraude',
  'Contrefaçon / faux produit',
  'Informations trompeuses',
  'Spam',
  'Autre',
];

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
}

// Reusable across every "Signaler" entry point (product, proximity shop,
// review, …) — same content_reports insert, same reporter_id = auth.uid()
// check enforced by RLS (reports_create_own), just a different target.
export function ReportModal({ visible, onClose, targetType, targetId }: ReportModalProps) {
  const colors = useColors();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setReason(null);
    setDetails('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!reason) return;
    if (!isSupabaseConfigured || !supabase) {
      Alert.alert('Indisponible en mode démo', 'Le signalement nécessite un compte Supabase réel.');
      return;
    }
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      Alert.alert('Connexion requise', 'Connecte-toi pour envoyer un signalement.');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('content_reports').insert({
      reporter_id: authUser.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      details: details.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      Alert.alert('Erreur', toUserMessage('report:submit', error, 'Impossible d\'envoyer ce signalement. Réessaie dans un instant.'));
      return;
    }
    Alert.alert('Signalement envoyé', 'Merci — un administrateur va examiner ce signalement.');
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>Signaler {TARGET_LABELS[targetType]}</Text>
            <TouchableOpacity onPress={handleClose}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: colors.foreground }]}>Motif *</Text>
          <View style={styles.chipsWrap}>
            {REPORT_REASONS.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, {
                  backgroundColor: reason === r ? colors.primary : colors.background,
                  borderColor: reason === r ? colors.primary : colors.border,
                }]}
                onPress={() => setReason(r)}
              >
                <Text style={{ color: reason === r ? 'white' : colors.foreground, fontSize: 13, fontWeight: '600' }}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.foreground, marginTop: 14 }]}>Détails (optionnel)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Précise le problème si besoin…"
            placeholderTextColor={colors.mutedForeground}
            value={details}
            onChangeText={setDetails}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: '#EF4444', opacity: (!reason || submitting) ? 0.6 : 1 }]}
            onPress={handleSubmit}
            disabled={!reason || submitting}
          >
            {submitting
              ? <ActivityIndicator size="small" color="white" />
              : <Feather name="flag" size={16} color="white" />}
            <Text style={styles.submitText}>{submitting ? 'Envoi…' : 'Envoyer le signalement'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', borderRadius: 20, padding: 20, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 70, textAlignVertical: 'top' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14, marginTop: 16,
  },
  submitText: { color: 'white', fontSize: 15, fontWeight: '700' },
});

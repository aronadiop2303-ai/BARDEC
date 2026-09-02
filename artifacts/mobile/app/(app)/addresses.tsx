import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@/components/Icon';
import { useAuth } from '@/context/AuthContext';
import { toUserMessage } from '@/lib/errors';
import {
  CustomerAddress,
  useCustomerAddresses,
  useCreateCustomerAddress,
  useUpdateCustomerAddress,
  useDeleteCustomerAddress,
  useSetDefaultCustomerAddress,
} from '@/hooks/useCustomerAddresses';

const GREEN = '#22C55E';

interface FormState {
  label: string;
  address: string;
  isDefault: boolean;
  latitude: number | null;
  longitude: number | null;
}

const EMPTY_FORM: FormState = { label: '', address: '', isDefault: false, latitude: null, longitude: null };

export default function AddressesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: addresses = [], isLoading } = useCustomerAddresses();
  const createAddress = useCreateCustomerAddress();
  const updateAddress = useUpdateCustomerAddress();
  const deleteAddress = useDeleteCustomerAddress();
  const setDefaultAddress = useSetDefaultCustomerAddress();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [locating, setLocating] = useState(false);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, isDefault: addresses.length === 0 });
    setModalVisible(true);
  }

  function openEdit(a: CustomerAddress) {
    setEditingId(a.id);
    setForm({ label: a.label ?? '', address: a.address, isDefault: a.is_default, latitude: a.latitude, longitude: a.longitude });
    setModalVisible(true);
  }

  async function useCurrentLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission refusée'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setForm(f => ({ ...f, latitude: loc.coords.latitude, longitude: loc.coords.longitude }));
    } catch {
      Alert.alert('Erreur', "Impossible d'obtenir la position.");
    } finally {
      setLocating(false);
    }
  }

  async function handleSave() {
    if (!form.address.trim()) {
      Alert.alert('Adresse requise', "Entre l'adresse complète (rue, quartier, ville…)."); return;
    }
    const input = {
      label: form.label.trim() || null,
      address: form.address.trim(),
      latitude: form.latitude,
      longitude: form.longitude,
      isDefault: form.isDefault,
    };
    try {
      if (editingId) {
        await updateAddress.mutateAsync({ id: editingId, userId: user!.id, input });
      } else {
        await createAddress.mutateAsync(input);
      }
      setModalVisible(false);
    } catch (err) {
      Alert.alert('Erreur', toUserMessage('addresses:save', err, "Impossible d'enregistrer cette adresse. Réessaie dans un instant."));
    }
  }

  function handleDelete(a: CustomerAddress) {
    Alert.alert(
      "Supprimer cette adresse ?",
      a.label ? `"${a.label}" sera définitivement supprimée.` : 'Cette adresse sera définitivement supprimée.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            try {
              await deleteAddress.mutateAsync(a.id);
            } catch (err) {
              Alert.alert('Erreur', toUserMessage('addresses:delete', err, 'Impossible de supprimer cette adresse. Réessaie dans un instant.'));
            }
          },
        },
      ],
    );
  }

  async function handleSetDefault(a: CustomerAddress) {
    try {
      await setDefaultAddress.mutateAsync({ id: a.id, userId: a.user_id });
    } catch (err) {
      Alert.alert('Erreur', toUserMessage('addresses:setDefault', err, 'Impossible de définir cette adresse par défaut. Réessaie dans un instant.'));
    }
  }

  const saving = createAddress.isPending || updateAddress.isPending;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Mes adresses</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100, gap: 12 }}>
        {isLoading && <ActivityIndicator color={GREEN} style={{ marginTop: 24 }} />}

        {!isLoading && addresses.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="map-pin" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>
              Aucune adresse enregistrée. Ajoute-en une pour aller plus vite au moment de commander.
            </Text>
          </View>
        )}

        {addresses.map(a => (
          <View key={a.id} style={[styles.card, { backgroundColor: colors.card, borderColor: a.is_default ? GREEN : colors.border }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIcon, { backgroundColor: GREEN + '18' }]}>
                <Feather name="map-pin" size={16} color={GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardLabel, { color: colors.foreground }]}>{a.label || 'Adresse'}</Text>
                  {a.is_default && (
                    <View style={[styles.defaultBadge, { backgroundColor: GREEN + '18' }]}>
                      <Text style={[styles.defaultBadgeText, { color: GREEN }]}>Par défaut</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.cardAddress, { color: colors.mutedForeground }]}>{a.address}</Text>
              </View>
            </View>
            <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
              {!a.is_default && (
                <TouchableOpacity style={styles.cardActionBtn} onPress={() => handleSetDefault(a)}>
                  <Feather name="check-circle" size={14} color={colors.primary} />
                  <Text style={[styles.cardActionText, { color: colors.primary }]}>Par défaut</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cardActionBtn} onPress={() => openEdit(a)}>
                <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                <Text style={[styles.cardActionText, { color: colors.mutedForeground }]}>Modifier</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cardActionBtn} onPress={() => handleDelete(a)}>
                <Feather name="trash-2" size={14} color="#EF4444" />
                <Text style={[styles.cardActionText, { color: '#EF4444' }]}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Add button */}
      <View style={[styles.bottomBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: GREEN }]} onPress={openCreate}>
          <Feather name="plus" size={18} color="white" />
          <Text style={styles.addBtnText}>Ajouter une adresse</Text>
        </TouchableOpacity>
      </View>

      {/* Add/edit modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingId ? "Modifier l'adresse" : 'Nouvelle adresse'}
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Nom (optionnel)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Ex: Maison, Bureau…"
              placeholderTextColor={colors.mutedForeground}
              value={form.label}
              onChangeText={v => setForm(f => ({ ...f, label: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Adresse complète *</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Rue, quartier, ville…"
              placeholderTextColor={colors.mutedForeground}
              value={form.address}
              onChangeText={v => setForm(f => ({ ...f, address: v }))}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity onPress={useCurrentLocation} style={styles.locateRow} disabled={locating}>
              {locating
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Feather name="navigation" size={14} color={colors.primary} />}
              <Text style={[styles.locateText, { color: colors.primary }]}>
                {form.latitude != null ? 'Position enregistrée ✓ — mettre à jour' : 'Utiliser ma position actuelle (optionnel)'}
              </Text>
            </TouchableOpacity>

            <View style={styles.defaultRow}>
              <Text style={[styles.fieldLabel, { color: colors.foreground, marginBottom: 0 }]}>Adresse par défaut</Text>
              <Switch
                value={form.isDefault}
                onValueChange={v => setForm(f => ({ ...f, isDefault: v }))}
                trackColor={{ false: colors.muted, true: GREEN }}
                thumbColor="white"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setModalVisible(false)}
                disabled={saving}
              >
                <Text style={{ color: colors.mutedForeground, fontWeight: '700' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: GREEN, opacity: saving ? 0.7 : 1 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="white" />
                  : <Text style={{ color: 'white', fontWeight: '700' }}>Enregistrer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: '800' },
  emptyState: { alignItems: 'center', gap: 12, paddingTop: 40, paddingHorizontal: 24 },
  emptyTxt: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: { borderRadius: 14, borderWidth: 1.5, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', gap: 12, padding: 14 },
  cardIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  cardLabel: { fontSize: 15, fontWeight: '700' },
  defaultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  defaultBadgeText: { fontSize: 10, fontWeight: '700' },
  cardAddress: { fontSize: 13, lineHeight: 18 },
  cardActions: { flexDirection: 'row', borderTopWidth: 1 },
  cardActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11 },
  cardActionText: { fontSize: 12, fontWeight: '700' },
  bottomBar: { borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 16 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 14 },
  addBtnText: { color: 'white', fontSize: 15, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 4 },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  locateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  locateText: { fontSize: 13, fontWeight: '600' },
  defaultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

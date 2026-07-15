import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@/components/Icon';
import {
  DAY_KEYS,
  DAY_LABELS,
  PROXIMITY_CATEGORIES,
  PROXIMITY_SUBCATEGORIES,
  ProximityCategory,
} from '@/constants/proximityData';
import ProximityMap from '@/components/proximity/ProximityMap';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

const GREEN = '#22C55E';
const STEPS = ['Informations', 'Position', 'Horaires', 'Photos'];

interface ShopForm {
  name: string;
  category: ProximityCategory | '';
  subcategory: string;
  description: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  opening_hours: Record<string, string>;
  photos: string[];
}

const DEFAULT_HOURS: Record<string, string> = {
  lun: '08:00-20:00', mar: '08:00-20:00', mer: '08:00-20:00',
  jeu: '08:00-20:00', ven: '08:00-13:00', sam: '09:00-18:00', dim: 'Fermé',
};

export default function RegisterShopScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ShopForm>({
    name: '', category: '', subcategory: '', description: '',
    phone: '', address: '', lat: 14.6937, lng: -17.4441,
    opening_hours: { ...DEFAULT_HOURS }, photos: [],
  });

  useEffect(() => {
    // Pre-fill with user's current location if available
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(loc => {
          setForm(f => ({ ...f, lat: loc.coords.latitude, lng: loc.coords.longitude }));
        }).catch(() => {});
      }
    });
  }, []);

  function update<K extends keyof ShopForm>(key: K, value: ShopForm[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function validateStep(): boolean {
    if (step === 1) {
      if (!form.name.trim()) { Alert.alert('Champ requis', 'Entrez le nom du commerce.'); return false; }
      if (!form.category) { Alert.alert('Champ requis', 'Sélectionnez une catégorie.'); return false; }
    }
    return true;
  }

  function next() {
    if (!validateStep()) return;
    if (step < 4) setStep(s => s + 1);
  }

  async function useCurrentLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission refusée'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      update('lat', loc.coords.latitude);
      update('lng', loc.coords.longitude);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'obtenir la position.');
    }
  }

  async function pickPhoto() {
    if (form.photos.length >= 4) { Alert.alert('Maximum 4 photos atteint'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      update('photos', [...form.photos, result.assets[0].uri]);
    }
  }

  async function uploadPhoto(uri: string, userId: string): Promise<string> {
    if (!supabase) return uri;
    const response = await fetch(uri);
    const blob = await response.blob();
    const fileName = `${userId}/${Date.now()}.jpg`;
    const { data, error } = await supabase.storage
      .from('proximity-shop-photos')
      .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('proximity-shop-photos').getPublicUrl(fileName);
    return publicUrl;
  }

  async function handleSubmit() {
    if (!user) { Alert.alert('Non connecté'); return; }

    setSubmitting(true);
    try {
      if (!isSupabaseConfigured || !supabase) {
        // Demo mode
        Alert.alert(
          '✅ Boutique créée !',
          `"${form.name}" a été enregistrée (mode démo). Connecte Supabase pour une persistance réelle.`,
          [{ text: 'OK', onPress: () => router.back() }],
        );
        return;
      }

      // Upload photos
      const photoUrls: string[] = [];
      for (const uri of form.photos) {
        try {
          const url = await uploadPhoto(uri, user.id);
          photoUrls.push(url);
        } catch { photoUrls.push(uri); }
      }

      const { error } = await supabase.from('proximity_shops').insert({
        owner_id: user.id,
        name: form.name.trim(),
        category: form.category,
        subcategory: form.subcategory.trim() || null,
        description: form.description.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        lat: form.lat,
        lng: form.lng,
        opening_hours: form.opening_hours,
        photos: photoUrls,
        is_active: true,
        verified: false,
      });

      if (error) throw error;

      qc.invalidateQueries({ queryKey: ['my_proximity_shop'] });
      Alert.alert(
        '✅ Boutique créée !',
        `"${form.name}" est maintenant visible sur la carte. Elle sera vérifiée prochainement.`,
        [{ text: 'Gérer ma boutique', onPress: () => router.replace('/proximity/my-shop' as any) }],
      );
    } catch (err: any) {
      Alert.alert('Erreur', err.message ?? 'Impossible de créer la boutique.');
    } finally {
      setSubmitting(false);
    }
  }

  const subcats = form.category ? PROXIMITY_SUBCATEGORIES[form.category as ProximityCategory] : [];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => step > 1 ? setStep(s => s - 1) : router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Ouvrir ma boutique</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Step indicator */}
      <View style={[styles.stepBar, { borderBottomColor: colors.border }]}>
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const done = n < step;
          return (
            <View key={label} style={styles.stepItem}>
              <View style={[styles.stepDot, {
                backgroundColor: done ? GREEN : active ? GREEN : colors.muted,
                borderWidth: active ? 2 : 0,
                borderColor: active ? GREEN : 'transparent',
              }]}>
                {done
                  ? <Feather name="check" size={10} color="white" />
                  : <Text style={[styles.stepNum, { color: active ? 'white' : colors.mutedForeground }]}>{n}</Text>
                }
              </View>
              <Text style={[styles.stepLabel, { color: active ? GREEN : colors.mutedForeground }]}>{label}</Text>
            </View>
          );
        })}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── STEP 1: Basic info ─────────────────────────────────────── */}
          {step === 1 && (
            <View style={styles.stepContent}>
              <Field label="Nom du commerce *" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                  placeholder="Ex: Boulangerie du Plateau"
                  placeholderTextColor={colors.mutedForeground}
                  value={form.name}
                  onChangeText={v => update('name', v)}
                />
              </Field>

              <Field label="Catégorie principale *" colors={colors}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                  {PROXIMITY_CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.catChip, {
                        backgroundColor: form.category === cat ? GREEN : colors.muted,
                        borderColor: form.category === cat ? GREEN : colors.border,
                      }]}
                      onPress={() => { update('category', cat); update('subcategory', ''); }}
                    >
                      <Text style={[styles.catChipTxt, { color: form.category === cat ? 'white' : colors.foreground }]} numberOfLines={1}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </Field>

              {subcats.length > 0 && (
                <Field label="Sous-catégorie" colors={colors}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    {subcats.map(sc => (
                      <TouchableOpacity
                        key={sc}
                        style={[styles.catChip, {
                          backgroundColor: form.subcategory === sc ? colors.primary : colors.muted,
                          borderColor: form.subcategory === sc ? colors.primary : colors.border,
                        }]}
                        onPress={() => update('subcategory', sc)}
                      >
                        <Text style={[styles.catChipTxt, { color: form.subcategory === sc ? 'white' : colors.foreground }]}>
                          {sc}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </Field>
              )}

              <Field label="Description" colors={colors}>
                <TextInput
                  style={[styles.input, styles.textArea, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                  placeholder="Décrivez votre commerce, vos spécialités…"
                  placeholderTextColor={colors.mutedForeground}
                  value={form.description}
                  onChangeText={v => update('description', v)}
                  multiline
                  numberOfLines={3}
                />
              </Field>

              <Field label="Téléphone" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                  placeholder="+221 77 000 0000"
                  placeholderTextColor={colors.mutedForeground}
                  value={form.phone}
                  onChangeText={v => update('phone', v)}
                  keyboardType="phone-pad"
                />
              </Field>

              <Field label="Adresse (texte)" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                  placeholder="Rue, quartier, ville…"
                  placeholderTextColor={colors.mutedForeground}
                  value={form.address}
                  onChangeText={v => update('address', v)}
                />
              </Field>
            </View>
          )}

          {/* ── STEP 2: Location ───────────────────────────────────────── */}
          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
                Déplace le marqueur sur la carte ou utilise ta position GPS pour indiquer l'emplacement exact de ta boutique.
              </Text>
              <TouchableOpacity
                style={[styles.gpsBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
                onPress={useCurrentLocation}
              >
                <Feather name="navigation" size={16} color={colors.primary} />
                <Text style={[styles.gpsBtnTxt, { color: colors.primary }]}>Utiliser ma position actuelle</Text>
              </TouchableOpacity>
              <View style={[styles.mapWrapper, { borderColor: colors.border }]}>
                <ProximityMap
                  center={{ lat: form.lat, lng: form.lng }}
                  draggable
                  onLocationSelected={(lat, lng) => { update('lat', lat); update('lng', lng); }}
                  height={280}
                  zoom={15}
                />
              </View>
              <View style={[styles.coordBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.coordTxt, { color: colors.mutedForeground }]}>
                  📍 {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
                </Text>
              </View>
            </View>
          )}

          {/* ── STEP 3: Hours ──────────────────────────────────────────── */}
          {step === 3 && (
            <View style={styles.stepContent}>
              <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
                Renseigne tes horaires pour chaque jour. Format : "08:00-20:00" ou "Fermé".
              </Text>
              {DAY_KEYS.map(day => (
                <View key={day} style={styles.hoursRow}>
                  <Text style={[styles.dayLabel, { color: colors.foreground }]}>{DAY_LABELS[day]}</Text>
                  <TextInput
                    style={[styles.hoursInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                    value={form.opening_hours[day] ?? 'Fermé'}
                    onChangeText={v => update('opening_hours', { ...form.opening_hours, [day]: v })}
                    placeholder="Fermé"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              ))}
            </View>
          )}

          {/* ── STEP 4: Photos ─────────────────────────────────────────── */}
          {step === 4 && (
            <View style={styles.stepContent}>
              <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
                Ajoute jusqu'à 4 photos de ta boutique. Elles aideront les clients à te reconnaître.
              </Text>
              <View style={styles.photosGrid}>
                {form.photos.map((uri, idx) => (
                  <View key={idx} style={styles.photoWrapper}>
                    <Image source={{ uri }} style={styles.photoThumb} />
                    <TouchableOpacity
                      style={styles.photoDelete}
                      onPress={() => update('photos', form.photos.filter((_, i) => i !== idx))}
                    >
                      <Feather name="x" size={12} color="white" />
                    </TouchableOpacity>
                  </View>
                ))}
                {form.photos.length < 4 && (
                  <TouchableOpacity
                    style={[styles.photoAdd, { backgroundColor: colors.muted, borderColor: colors.border }]}
                    onPress={pickPhoto}
                  >
                    <Feather name="camera" size={24} color={colors.mutedForeground} />
                    <Text style={[styles.photoAddTxt, { color: colors.mutedForeground }]}>Ajouter</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.submitSummary, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.summaryTxt, { color: colors.foreground }]}>✓ {form.name}</Text>
                <Text style={[styles.summaryTxt, { color: colors.mutedForeground }]}>{form.category}{form.subcategory ? ` · ${form.subcategory}` : ''}</Text>
                <Text style={[styles.summaryTxt, { color: colors.mutedForeground }]}>📍 {form.lat.toFixed(4)}, {form.lng.toFixed(4)}</Text>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom navigation */}
      <View style={[styles.bottomNav, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        {step < 4 ? (
          <TouchableOpacity style={[styles.nextBtn, { backgroundColor: GREEN }]} onPress={next}>
            <Text style={styles.nextBtnTxt}>Suivant</Text>
            <Feather name="arrow-right" size={18} color="white" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: GREEN }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="white" />
              : <>
                  <Feather name="check-circle" size={18} color="white" />
                  <Text style={styles.nextBtnTxt}>Créer ma boutique</Text>
                </>
            }
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function Field({ label, children, colors }: { label: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: '800' },
  stepBar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14, borderBottomWidth: 1 },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  stepNum: { fontSize: 11, fontWeight: '700' },
  stepLabel: { fontSize: 10, fontWeight: '600' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  stepContent: { gap: 16 },
  stepDesc: { fontSize: 14, lineHeight: 20 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  catChipTxt: { fontSize: 13, fontWeight: '600' },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  gpsBtnTxt: { fontSize: 14, fontWeight: '700' },
  mapWrapper: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  coordBox: { borderRadius: 10, borderWidth: 1, padding: 10, alignItems: 'center' },
  coordTxt: { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayLabel: { width: 80, fontSize: 14, fontWeight: '600' },
  hoursInput: { flex: 1, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrapper: { width: 100, height: 100, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  photoThumb: { width: '100%', height: '100%' },
  photoDelete: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  photoAdd: { width: 100, height: 100, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 6 },
  photoAddTxt: { fontSize: 12, fontWeight: '600' },
  submitSummary: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  summaryTxt: { fontSize: 14 },
  bottomNav: { borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 16 },
  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 16 },
  nextBtnTxt: { color: 'white', fontSize: 16, fontWeight: '800' },
});

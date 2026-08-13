import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@/components/Icon';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { readLocalImageBytes } from '@/lib/imageUpload';
import { useQueryClient } from '@tanstack/react-query';

const GREEN = '#22C55E';

interface ProductForm {
  name: string;
  price: string;
  unit: string;
  imageUri: string;
  in_stock: boolean;
}

export default function AddProductScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { shopId, productId, productJson } = useLocalSearchParams<{
    shopId: string;
    productId?: string;
    productJson?: string;
  }>();

  const isEdit = !!productId;
  const [form, setForm] = useState<ProductForm>({
    name: '', price: '', unit: 'unité', imageUri: '', in_stock: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (productJson) {
      try {
        const p = JSON.parse(productJson);
        setForm({ name: p.name, price: String(p.price), unit: p.unit, imageUri: p.image_url ?? '', in_stock: p.in_stock });
      } catch {}
    }
  }, [productJson]);

  function update<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      update('imageUri', result.assets[0].uri);
    }
  }

  async function uploadImage(uri: string): Promise<string> {
    // Previously bailed out (returning the raw local uri unchanged) for any
    // uri not starting with 'file' — which silently skipped the upload for
    // every content:// URI from Android's Photo Picker. readLocalImageBytes
    // handles both file:// and content:// schemes.
    if (!supabase) return uri;
    const bytes = await readLocalImageBytes(uri);
    const fileName = `products/${shopId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('proximity-shop-photos')
      .upload(fileName, bytes, { contentType: 'image/jpeg' });
    if (error) return uri;
    const { data: { publicUrl } } = supabase.storage.from('proximity-shop-photos').getPublicUrl(fileName);
    return publicUrl;
  }

  async function handleSave() {
    if (!form.name.trim()) { Alert.alert('Champ requis', 'Entrez le nom du produit.'); return; }
    const priceNum = parseFloat(form.price.replace(',', '.'));
    if (isNaN(priceNum) || priceNum < 0) { Alert.alert('Prix invalide', 'Entrez un prix valide.'); return; }

    if (!isSupabaseConfigured || !supabase) {
      Alert.alert('Mode démo', 'Produit ajouté (simulation). Connecte Supabase pour la persistance.');
      router.back();
      return;
    }

    setSaving(true);
    try {
      let imageUrl = form.imageUri;
      if (form.imageUri && form.imageUri.startsWith('file')) {
        imageUrl = await uploadImage(form.imageUri);
      }

      const payload = {
        shop_id: shopId,
        name: form.name.trim(),
        price: priceNum,
        unit: form.unit.trim() || 'unité',
        image_url: imageUrl || null,
        in_stock: form.in_stock,
      };

      if (isEdit && productId) {
        const { error } = await supabase.from('proximity_products').update(payload).eq('id', productId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('proximity_products').insert(payload);
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ['my_proximity_products'] });
      router.back();
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setSaving(false);
    }
  }

  const COMMON_UNITS = ['unité', 'kg', 'g', 'litre', 'sachet', 'boîte', 'assiette', 'portion', 'prestation', 'recharge'];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {isEdit ? 'Modifier le produit' : 'Nouveau produit'}
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color={GREEN} />
            : <Text style={[styles.saveBtn, { color: GREEN }]}>Enregistrer</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Image picker */}
          <TouchableOpacity style={[styles.imagePicker, { backgroundColor: colors.muted, borderColor: colors.border }]} onPress={pickImage}>
            {form.imageUri ? (
              <Image source={{ uri: form.imageUri }} style={styles.imagePreview} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Feather name="camera" size={32} color={colors.mutedForeground} />
                <Text style={[styles.imagePlaceholderTxt, { color: colors.mutedForeground }]}>Ajouter une photo</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Name */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Nom du produit *</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
              placeholder="Ex: Baguette tradition, Thiéboudienne…"
              placeholderTextColor={colors.mutedForeground}
              value={form.name}
              onChangeText={v => update('name', v)}
            />
          </View>

          {/* Price */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Prix (FCFA) *</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
              placeholder="Ex: 500"
              placeholderTextColor={colors.mutedForeground}
              value={form.price}
              onChangeText={v => update('price', v)}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Unit */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Unité</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {COMMON_UNITS.map(u => (
                <TouchableOpacity
                  key={u}
                  style={[styles.unitChip, { backgroundColor: form.unit === u ? GREEN : colors.muted, borderColor: form.unit === u ? GREEN : colors.border }]}
                  onPress={() => update('unit', u)}
                >
                  <Text style={[styles.unitChipTxt, { color: form.unit === u ? 'white' : colors.foreground }]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
              placeholder="Ou entrer une unité personnalisée"
              placeholderTextColor={colors.mutedForeground}
              value={form.unit}
              onChangeText={v => update('unit', v)}
            />
          </View>

          {/* In stock toggle */}
          <View style={[styles.stockRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stockLabel, { color: colors.foreground }]}>En stock</Text>
              <Text style={[styles.stockDesc, { color: colors.mutedForeground }]}>
                Désactive pour marquer comme épuisé
              </Text>
            </View>
            <Switch
              value={form.in_stock}
              onValueChange={v => update('in_stock', v)}
              trackColor={{ false: colors.muted, true: GREEN }}
              thumbColor="white"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: '800' },
  saveBtn: { fontSize: 15, fontWeight: '700' },
  content: { padding: 16, gap: 20, paddingBottom: 60 },
  imagePicker: { borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', height: 180, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  imagePreview: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', gap: 8 },
  imagePlaceholderTxt: { fontSize: 14 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700' },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  unitChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  unitChipTxt: { fontSize: 13, fontWeight: '600' },
  stockRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 16 },
  stockLabel: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  stockDesc: { fontSize: 12 },
});

import React, { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Redirect } from 'expo-router';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import BardecLayout from '@/components/BardecLayout';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

// Chantier 2 — Espace Partenaire / "Documents & Contrat".
// Liste statique de 4 documents + upload vers le bucket Storage
// `partner-documents`. Tout appel Supabase est en try/catch ; en l'absence
// de configuration, on affiche un Alert "Bientôt disponible".

type DocStatus = 'approved' | 'pending' | 'rejected';

interface PartnerDoc {
  key: string;
  title: string;
  status: DocStatus;
  path: string | null;
}

const INITIAL_DOCS: PartnerDoc[] = [
  { key: 'contract',  title: 'Contrat',           status: 'pending',  path: null },
  { key: 'kbis',      title: 'KBIS',              status: 'pending',  path: null },
  { key: 'identity',  title: 'Pièce d\'identité', status: 'pending',  path: null },
  { key: 'insurance', title: 'Assurance',         status: 'pending',  path: null },
];

const STATUS_META: Record<DocStatus, { label: string; bg: string; fg: string; icon: string }> = {
  approved: { label: 'Approuvé',  bg: '#D1FAE5', fg: '#059669', icon: 'check-circle' },
  pending:  { label: 'En attente', bg: '#FEF3C7', fg: '#D97706', icon: 'clock' },
  rejected: { label: 'Rejeté',    bg: '#FEE2E2', fg: '#DC2626', icon: 'x-circle' },
};

// Lit un fichier local (content:// ou file://) en octets via base64 — même
// approche que lib/imageUpload.ts, sans dépendance au nom "image".
async function readLocalBytes(uri: string): Promise<Uint8Array> {
  let readUri = uri;
  if (uri.startsWith('content://')) {
    const dest = `${FileSystem.cacheDirectory ?? ''}doc_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    readUri = dest;
  }
  const base64 = await FileSystem.readAsStringAsync(readUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export default function PartnerDocumentsScreen() {
  const colors = useColors();
  const { user, isDemoMode } = useAuth();
  const [docs, setDocs] = useState<PartnerDoc[]>(INITIAL_DOCS);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  // Garde d'accès route-level (même pattern que partner-dashboard.tsx).
  if (!isDemoMode && user?.role !== 'PARTNER') {
    return <Redirect href="/(app)/(tabs)" />;
  }

  async function handleUpload(docKey: string) {
    if (!isSupabaseConfigured || !supabase) {
      Alert.alert('Bientôt disponible', 'Le téléversement de documents sera disponible une fois Supabase connecté.');
      return;
    }
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const file = picked.assets[0];

      const { data: { user: authUser } } = await supabase.auth.getUser();
      const userId = authUser?.id ?? user?.id ?? 'unknown';

      setUploadingKey(docKey);
      const ext = (file.name?.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
      const path = `${userId}/${Date.now()}_${file.name ?? 'document'}`;
      const bytes = await readLocalBytes(file.uri);
      const contentType = file.mimeType || (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream');

      const { error } = await supabase.storage
        .from('partner-documents')
        .upload(path, bytes, { contentType, upsert: false });
      if (error) {
        console.warn('Partner document upload error:', error.message);
        Alert.alert('Erreur', 'Impossible de téléverser ce document. Réessaie dans un instant.');
        return;
      }

      setDocs(prev => prev.map(d => (d.key === docKey ? { ...d, status: 'pending', path } : d)));
      Alert.alert('Document envoyé', 'Ton document a bien été téléversé.');
    } catch (e) {
      console.warn('Partner document upload exception:', e);
      Alert.alert('Erreur', 'Impossible de téléverser ce document.');
    } finally {
      setUploadingKey(null);
    }
  }

  async function handleView(doc: PartnerDoc) {
    if (!doc.path) {
      Alert.alert('Aucun document', 'Aucun document n\'a encore été téléversé.');
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      Alert.alert('Bientôt disponible', 'La consultation des documents sera disponible une fois Supabase connecté.');
      return;
    }
    try {
      const { data, error } = await supabase.storage.from('partner-documents').createSignedUrl(doc.path, 3600);
      if (error || !data?.signedUrl) {
        console.warn('Partner document signedUrl error:', error?.message ?? 'no signedUrl');
        Alert.alert('Erreur', 'Impossible de générer le lien du document.');
        return;
      }
      await Linking.openURL(data.signedUrl);
    } catch (e) {
      console.warn('Partner document view exception:', e);
      Alert.alert('Erreur', 'Impossible d\'ouvrir ce document.');
    }
  }

  return (
    <BardecLayout>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Documents & Contrat</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Téléverse et consulte les documents liés à ton partenariat.
        </Text>
      </View>

      {docs.map(doc => {
        const meta = STATUS_META[doc.status];
        return (
          <View key={doc.key} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.docIcon, { backgroundColor: colors.accent }]}>
                <Feather name="file-text" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.docTitle, { color: colors.foreground }]}>{doc.title}</Text>
              <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                <Feather name={meta.icon} size={12} color={meta.fg} />
                <Text style={[styles.badgeText, { color: meta.fg }]}>{meta.label}</Text>
              </View>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.accent, borderColor: colors.border }]}
                onPress={() => { void handleUpload(doc.key); }}
                disabled={uploadingKey === doc.key}
              >
                <Feather name="upload" size={14} color={colors.primary} />
                <Text style={[styles.actionText, { color: colors.primary }]}>
                  {uploadingKey === doc.key ? 'Envoi…' : 'Téléverser'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => { void handleView(doc); }}
              >
                <Feather name="eye" size={14} color={colors.foreground} />
                <Text style={[styles.actionText, { color: colors.foreground }]}>Consulter</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </BardecLayout>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 2 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13 },
  card: { marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  docIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  docTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderRadius: 10, paddingVertical: 9,
  },
  actionText: { fontSize: 13, fontWeight: '700' },
});

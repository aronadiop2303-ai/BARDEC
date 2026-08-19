import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking,
  Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errors';

const WHATSAPP_URL = 'https://wa.me/221771389885';

interface SupportMessage {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
}

const CATEGORIES: { id: string; label: string; icon: string }[] = [
  { id: 'bug',    label: 'Signaler un bug',      icon: 'alert-triangle' },
  { id: 'idea',   label: "Proposer une idée",    icon: 'zap' },
  { id: 'praise', label: 'Avis positif',         icon: 'heart' },
];

export default function SupportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const loadConversation = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !user) { setLoading(false); return; }
    setLoading(true);

    // Find-or-create: one ongoing support conversation per user.
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('type', 'support')
      .contains('participants', [user.id])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let convId = existing?.id as string | undefined;
    if (!convId) {
      const { data: created, error } = await supabase
        .from('conversations')
        .insert({ participants: [user.id], type: 'support' })
        .select('id')
        .single();
      if (error) {
        Alert.alert('Erreur', toUserMessage('support:createConversation', error, 'Impossible d\'ouvrir le chat support. Réessaie dans un instant.'));
        setLoading(false);
        return;
      }
      convId = created.id;
    }
    setConversationId(convId!);

    const { data: msgs, error: msgErr } = await supabase
      .from('messages')
      .select('id, content, sender_id, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    if (msgErr) console.warn('support:loadMessages', msgErr.message);
    setMessages((msgs ?? []) as SupportMessage[]);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { loadConversation(); }, [loadConversation]));

  async function handleSend() {
    if (!input.trim() || !conversationId || !supabase || !user) return;
    setSending(true);
    const content = category
      ? `[${CATEGORIES.find(c => c.id === category)?.label}] ${input.trim()}`
      : input.trim();

    const { data: sent, error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: user.id, content, metadata: category ? { category } : {} })
      .select('id, content, sender_id, created_at')
      .single();
    setSending(false);
    if (error) {
      Alert.alert('Erreur', toUserMessage('support:sendMessage', error, 'Impossible d\'envoyer ce message. Réessaie dans un instant.'));
      return;
    }
    await supabase.from('conversations')
      .update({ last_message: content, last_msg_at: new Date().toISOString() })
      .eq('id', conversationId);

    setMessages(prev => [...prev, sent as SupportMessage]);
    setInput('');
    setCategory(null);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Support BARDEC</Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>On te répond dès que possible</Text>
        </View>
        <TouchableOpacity
          style={[styles.whatsappBtn, { backgroundColor: '#25D366' }]}
          onPress={() => Linking.openURL(WHATSAPP_URL)}
        >
          <Feather name="message-circle" size={16} color="white" />
          <Text style={styles.whatsappText}>WhatsApp</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => {
            const isMe = item.sender_id === user?.id;
            return (
              <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowOther]}>
                {!isMe && (
                  <View style={[styles.supportAvatar, { backgroundColor: colors.primary }]}>
                    <Feather name="headphones" size={14} color="white" />
                  </View>
                )}
                <View style={{ maxWidth: '78%' }}>
                  {!isMe && <Text style={[styles.senderLabel, { color: colors.mutedForeground }]}>Support BARDEC</Text>}
                  <View style={[styles.bubble, isMe ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                    <Text style={isMe ? styles.bubbleTextMe : { color: colors.foreground }}>{item.content}</Text>
                  </View>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="headphones" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Une question, un bug, une idée ? Écris-nous ci-dessous.
              </Text>
            </View>
          }
        />
      )}

      <View style={[styles.categoryRow, { borderColor: colors.border }]}>
        {CATEGORIES.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[styles.categoryChip, {
              backgroundColor: category === c.id ? colors.primary + '18' : colors.card,
              borderColor: category === c.id ? colors.primary : colors.border,
            }]}
            onPress={() => setCategory(category === c.id ? null : c.id)}
          >
            <Feather name={c.icon as any} size={12} color={category === c.id ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.categoryChipText, { color: category === c.id ? colors.primary : colors.mutedForeground }]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + 10 }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          placeholder="Écris ton message…"
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          multiline
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={sending || !input.trim()}
          style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: (sending || !input.trim()) ? 0.5 : 1 }]}
        >
          <Feather name="send" size={16} color="white" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSubtitle: { fontSize: 12 },
  whatsappBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  whatsappText: { color: 'white', fontSize: 12, fontWeight: '700' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messageList: { padding: 16, gap: 12, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  supportAvatar: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  senderLabel: { fontSize: 11, fontWeight: '600', marginBottom: 3, marginLeft: 2 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleTextMe: { color: 'white' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 40 },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  categoryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, borderTopWidth: 1, flexWrap: 'wrap' },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  categoryChipText: { fontSize: 11, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  input: { flex: 1, maxHeight: 100, borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
});

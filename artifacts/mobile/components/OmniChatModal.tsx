import React, { useRef, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, FlatList,
  KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator,
  Animated, Image,
} from 'react-native';
import { useOmniChat, OmniChatMessage, OmniContext } from '../hooks/useOmniChat';

// ─── OMNI official logo (globe + infinity emblem, blue/silver) ────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OMNI_LOGO = require('../assets/images/omni-logo.jpg') as number;

interface OmniChatModalProps {
  visible: boolean;
  onClose: () => void;
  context?: OmniContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// Blinking cursor component
// ─────────────────────────────────────────────────────────────────────────────

function BlinkingCursor() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.Text style={[styles.cursor, { opacity }]}>▋</Animated.Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Message bubble
// ─────────────────────────────────────────────────────────────────────────────

function TopicSeparator({ label }: { label: string }) {
  return (
    <View style={styles.separatorRow}>
      <View style={styles.separatorLine} />
      <Text style={styles.separatorLabel}>{label}</Text>
      <View style={styles.separatorLine} />
    </View>
  );
}

function MessageBubble({ message }: { message: OmniChatMessage }) {
  if (message.role === 'separator') {
    return <TopicSeparator label={message.content} />;
  }

  const isUser = message.role === 'user';

  // Initial loading state: pending and no content yet → show spinner
  const showSpinner = message.pending && !message.streaming && !message.content;

  // Streaming state: has content coming in → show text + blinking cursor
  const showStreamingText = (message.streaming || message.pending) && !!message.content;

  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {showSpinner ? (
          <ActivityIndicator size="small" color={isUser ? '#FFFFFF' : '#2563EB'} />
        ) : showStreamingText ? (
          <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant}>
            {message.content}
            <BlinkingCursor />
          </Text>
        ) : (
          <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant}>
            {message.content}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vendor-specific empty state
// ─────────────────────────────────────────────────────────────────────────────

const VENDOR_SUGGESTIONS = [
  'Quels sont mes produits les plus vendus ?',
  'Rédige un message de suivi pour ma dernière commande',
  'Donne-moi un résumé de mes ventes récentes',
  'Comment améliorer la description de mes produits ?',
];

function VendorEmptyState({
  shopName,
  onSuggest,
}: {
  shopName?: string;
  onSuggest: (q: string) => void;
}) {
  const displayName = shopName && shopName.trim() ? shopName.trim() : 'votre boutique';
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>🏪</Text>
      <Text style={styles.emptyTitle}>Bonjour, je suis OMNI</Text>
      <Text style={styles.emptyText}>
        Je suis prêt à vous aider avec <Text style={styles.emptyBold}>{displayName}</Text>.
        Posez-moi une question ou choisissez une suggestion ci-dessous.
      </Text>
      <View style={styles.suggestionsContainer}>
        {VENDOR_SUGGESTIONS.map((q) => (
          <Pressable key={q} style={styles.suggestionChip} onPress={() => onSuggest(q)}>
            <Text style={styles.suggestionText}>{q}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

export function OmniChatModal({ visible, onClose, context }: OmniChatModalProps) {
  const { messages, isSending, error, sendMessage, startNewConversation } = useOmniChat(context);
  const [input, setInput] = React.useState('');
  const listRef = useRef<FlatList>(null);

  // Auto-scroll when messages update (streaming content causes frequent updates)
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const text = input;
    setInput('');
    sendMessage(text);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Image source={OMNI_LOGO} style={styles.avatar} resizeMode="cover" />
            <View>
              <Text style={styles.headerTitle}>OMNI</Text>
              <Text style={styles.headerSubtitle}>Assistant IA de BARDEC</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={startNewConversation} accessibilityLabel="Nouvelle conversation">
              <Text style={styles.headerAction}>Nouveau</Text>
            </Pressable>
            <Pressable onPress={onClose} accessibilityLabel="Fermer">
              <Text style={styles.headerClose}>✕</Text>
            </Pressable>
          </View>
        </View>

        {messages.length === 0 ? (
          context?.type === 'shop' && context.data?.shop_name ? (
            <VendorEmptyState shopName={context.data.shop_name as string} onSuggest={(q) => { sendMessage(q); }} />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>👋</Text>
              <Text style={styles.emptyTitle}>Bonjour, je suis OMNI</Text>
              <Text style={styles.emptyText}>
                Pose-moi une question sur un produit, une commande, ou demande-moi de l'aide pour rédiger quelque chose.
              </Text>
            </View>
          )
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={styles.messageList}
          />
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Écris ton message à OMNI..."
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            editable={!isSending}
            multiline
          />
          <Pressable
            onPress={handleSend}
            disabled={isSending || !input.trim()}
            style={[styles.sendButton, (isSending || !input.trim()) && styles.sendButtonDisabled]}
          >
            <Text style={styles.sendButtonText}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 56 : 24, paddingBottom: 16,
    backgroundColor: '#2563EB',
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: '#0F2444' },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerAction: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  headerClose: { color: '#FFFFFF', fontSize: 20 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  emptyBold: { fontWeight: '700', color: '#1E293B' },
  suggestionsContainer: { marginTop: 20, width: '100%', gap: 8 },
  suggestionChip: {
    backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  suggestionText: { fontSize: 13, color: '#1D4ED8', textAlign: 'center', lineHeight: 18 },
  messageList: { padding: 16, gap: 10 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAssistant: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleUser: { backgroundColor: '#2563EB', borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E2E8F0' },
  bubbleTextUser: { color: '#FFFFFF', fontSize: 15, lineHeight: 20 },
  bubbleTextAssistant: { color: '#1E293B', fontSize: 15, lineHeight: 20 },
  cursor: { color: '#2563EB', fontSize: 15 },
  errorText: { color: '#DC2626', fontSize: 12, textAlign: 'center', paddingBottom: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  input: { flex: 1, maxHeight: 100, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F1F5F9', fontSize: 15 },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { backgroundColor: '#CBD5E1' },
  sendButtonText: { color: '#FFFFFF', fontSize: 16 },
  separatorRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, paddingHorizontal: 8 },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  separatorLabel: { marginHorizontal: 10, fontSize: 11, color: '#94A3B8', fontWeight: '500', letterSpacing: 0.4 },
});

import React, { useRef, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, FlatList,
  KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useOmniChat, OmniChatMessage } from '../hooks/useOmniChat';

interface OmniChatModalProps {
  visible: boolean;
  onClose: () => void;
}

function MessageBubble({ message }: { message: OmniChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {message.pending ? (
          <ActivityIndicator size="small" color={isUser ? '#FFFFFF' : '#2563EB'} />
        ) : (
          <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant}>{message.content}</Text>
        )}
      </View>
    </View>
  );
}

export function OmniChatModal({ visible, onClose }: OmniChatModalProps) {
  const { messages, isSending, error, sendMessage, startNewConversation } = useOmniChat();
  const [input, setInput] = React.useState('');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages.length]);

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
            <View style={styles.avatar}><Text style={styles.avatarText}>∞</Text></View>
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
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>👋</Text>
            <Text style={styles.emptyTitle}>Bonjour, je suis OMNI</Text>
            <Text style={styles.emptyText}>
              Pose-moi une question sur un produit, une commande, ou demande-moi de l'aide pour rédiger quelque chose.
            </Text>
          </View>
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
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerAction: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  headerClose: { color: '#FFFFFF', fontSize: 20 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  messageList: { padding: 16, gap: 10 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAssistant: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleUser: { backgroundColor: '#2563EB', borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E2E8F0' },
  bubbleTextUser: { color: '#FFFFFF', fontSize: 15, lineHeight: 20 },
  bubbleTextAssistant: { color: '#1E293B', fontSize: 15, lineHeight: 20 },
  errorText: { color: '#DC2626', fontSize: 12, textAlign: 'center', paddingBottom: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  input: { flex: 1, maxHeight: 100, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F1F5F9', fontSize: 15 },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { backgroundColor: '#CBD5E1' },
  sendButtonText: { color: '#FFFFFF', fontSize: 16 },
});

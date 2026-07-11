import React, { useState, useRef, useCallback } from 'react';
import {
  Alert, FlatList, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { MOCK_CONVERSATIONS } from '@/constants/mockData';

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'other';
  time: string;
  translated?: string;
  showTranslation?: boolean;
  type?: 'text' | 'quote' | 'image';
  quoteData?: { product: string; price: number; qty: number };
}

const INITIAL_MESSAGES: Message[] = [
  { id: 'm1', text: 'Bonjour! Je suis intéressé par votre offre de 500 panneaux LED.', sender: 'me', time: '10:30' },
  { id: 'm2', text: 'Bonjour! Pour 500 unités, nous pouvons vous proposer un prix spécial de $48/unité avec livraison incluse.', sender: 'other', time: '10:32' },
  { id: 'm3', text: 'Le numéro de suivi de votre commande est DHL987654321', sender: 'other', time: '10:45' },
];

export default function ChatScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteProduct, setQuoteProduct] = useState('');
  const [quoteQty, setQuoteQty] = useState('');
  const [quotePrice, setQuotePrice] = useState('');
  const listRef = useRef<FlatList>(null);

  const onRefresh = useCallback(async () => {}, []);

  function sendMessage() {
    if (!inputText.trim()) return;
    const msg: Message = {
      id: `m${Date.now()}`,
      text: inputText.trim(),
      sender: 'me',
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, msg]);
    setInputText('');

    // Simulate reply
    setTimeout(() => {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const reply: Message = {
          id: `m${Date.now() + 1}`,
          text: 'Merci pour votre message. Nous vous répondrons dans les plus brefs délais.',
          sender: 'other',
          time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(prev => [...prev, reply]);
      }, 2000);
    }, 500);
  }

  function sendQuote() {
    if (!quoteProduct || !quoteQty || !quotePrice) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs du devis');
      return;
    }
    const msg: Message = {
      id: `m${Date.now()}`,
      text: `Demande de devis: ${quoteProduct}`,
      sender: 'me',
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      type: 'quote',
      quoteData: { product: quoteProduct, price: parseFloat(quotePrice), qty: parseInt(quoteQty) },
    };
    setMessages(prev => [...prev, msg]);
    setShowQuoteForm(false);
    setQuoteProduct(''); setQuoteQty(''); setQuotePrice('');
  }

  function translateMessage(id: string) {
    setMessages(prev => prev.map(m =>
      m.id === id ? { ...m, showTranslation: !m.showTranslation, translated: m.translated ?? `[Traduction: ${m.text}]` } : m
    ));
  }

  // CONVERSATIONS LIST
  if (!activeConv) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('chat')}</Text>
          <TouchableOpacity>
            <Feather name="edit" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {MOCK_CONVERSATIONS.map(conv => (
          <TouchableOpacity
            key={conv.id}
            style={[styles.convRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
            onPress={() => setActiveConv(conv.id)}
          >
            <View style={[styles.convAvatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.convAvatarText}>{conv.avatar}</Text>
              <View style={[styles.onlineDot, { backgroundColor: '#22C55E', borderColor: colors.card }]} />
            </View>
            <View style={styles.convInfo}>
              <View style={styles.convTopRow}>
                <Text style={[styles.convName, { color: colors.foreground }]}>{conv.name}</Text>
                <Text style={[styles.convTime, { color: colors.mutedForeground }]}>{conv.time}</Text>
              </View>
              <View style={styles.convBottomRow}>
                <Text style={[styles.convLastMsg, { color: colors.mutedForeground }]} numberOfLines={1}>{conv.lastMessage}</Text>
                {conv.unread > 0 && (
                  <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.unreadText}>{conv.unread}</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  const conv = MOCK_CONVERSATIONS.find(c => c.id === activeConv)!;

  // MESSAGE THREAD
  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
    >
      {/* Chat header */}
      <View style={[styles.chatHeader, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setActiveConv(null)}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={[styles.chatAvatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.convAvatarText}>{conv.avatar}</Text>
        </View>
        <View style={styles.chatInfo}>
          <Text style={[styles.chatName, { color: colors.foreground }]}>{conv.name}</Text>
          <Text style={[styles.chatStatus, { color: '#22C55E' }]}>En ligne</Text>
        </View>
        <TouchableOpacity>
          <Feather name="phone" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity>
          <Feather name="more-vertical" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Quote form */}
      {showQuoteForm && (
        <View style={[styles.quoteForm, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.quoteFormTitle, { color: colors.foreground }]}>{t('request_quote')}</Text>
          <TextInput
            style={[styles.quoteInput, { borderColor: colors.border, color: colors.foreground }]}
            placeholder="Produit"
            placeholderTextColor={colors.mutedForeground}
            value={quoteProduct}
            onChangeText={setQuoteProduct}
          />
          <View style={styles.quoteRow}>
            <TextInput
              style={[styles.quoteInput, { flex: 1, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Quantité"
              placeholderTextColor={colors.mutedForeground}
              value={quoteQty}
              onChangeText={setQuoteQty}
              keyboardType="number-pad"
            />
            <TextInput
              style={[styles.quoteInput, { flex: 1, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Prix cible ($)"
              placeholderTextColor={colors.mutedForeground}
              value={quotePrice}
              onChangeText={setQuotePrice}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.quoteActions}>
            <TouchableOpacity style={[styles.quoteCancelBtn, { borderColor: colors.border }]} onPress={() => setShowQuoteForm(false)}>
              <Text style={[styles.quoteCancelText, { color: colors.mutedForeground }]}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quoteSendBtn, { backgroundColor: colors.primary }]} onPress={sendQuote}>
              <Text style={styles.quoteSendText}>Envoyer le devis</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={[...messages, ...(isTyping ? [{ id: 'typing', text: '', sender: 'other' as const, time: '' }] : [])]}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.messagesList, { paddingBottom: 20 }]}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          if (item.id === 'typing') {
            return (
              <View style={[styles.typingBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.typingText, { color: colors.mutedForeground }]}>{t('typing')}...</Text>
              </View>
            );
          }

          const isMe = item.sender === 'me';
          return (
            <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
              {item.type === 'quote' && item.quoteData ? (
                <View style={[styles.quoteBubble, { backgroundColor: isMe ? colors.primary : colors.card, borderColor: colors.border }]}>
                  <View style={styles.quoteBubbleHeader}>
                    <Feather name="file-text" size={14} color={isMe ? 'rgba(255,255,255,0.8)' : colors.mutedForeground} />
                    <Text style={[styles.quoteBubbleLabel, { color: isMe ? 'rgba(255,255,255,0.8)' : colors.mutedForeground }]}>Demande de devis</Text>
                  </View>
                  <Text style={[styles.quoteBubbleProduct, { color: isMe ? 'white' : colors.foreground }]}>{item.quoteData.product}</Text>
                  <Text style={[styles.quoteBubbleMeta, { color: isMe ? 'rgba(255,255,255,0.8)' : colors.mutedForeground }]}>
                    Qté: {item.quoteData.qty} · Cible: ${item.quoteData.price}/unité
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onLongPress={() => translateMessage(item.id)}
                  style={[
                    styles.messageBubble,
                    isMe
                      ? [styles.bubbleMe, { backgroundColor: colors.primary }]
                      : [styles.bubbleOther, { backgroundColor: colors.card, borderColor: colors.border }],
                  ]}
                >
                  <Text style={[styles.messageText, { color: isMe ? 'white' : colors.foreground }]}>{item.text}</Text>
                  {item.showTranslation && item.translated && (
                    <Text style={[styles.translatedText, { color: isMe ? 'rgba(255,255,255,0.7)' : colors.mutedForeground }]}>
                      🌐 {item.translated}
                    </Text>
                  )}
                  <Text style={[styles.messageTime, { color: isMe ? 'rgba(255,255,255,0.65)' : colors.mutedForeground }]}>{item.time}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {/* Input bar */}
      <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity style={[styles.inputAction, { backgroundColor: colors.accent }]} onPress={() => setShowQuoteForm(!showQuoteForm)}>
          <Feather name="file-text" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.inputAction, { backgroundColor: colors.accent }]}>
          <Feather name="paperclip" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TextInput
          style={[styles.chatInput, { backgroundColor: colors.accent, color: colors.foreground, borderColor: colors.border }]}
          placeholder="Message..."
          placeholderTextColor={colors.mutedForeground}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity style={[styles.inputAction, { backgroundColor: colors.accent }]}>
          <Feather name="smile" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: inputText.trim() ? colors.primary : colors.muted }]}
          onPress={sendMessage}
          disabled={!inputText.trim()}
        >
          <Feather name="send" size={16} color="white" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  convRow: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, gap: 12,
  },
  convAvatar: {
    width: 50, height: 50, borderRadius: 25,
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  convAvatarText: { color: 'white', fontWeight: '700', fontSize: 15 },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6, borderWidth: 2,
  },
  convInfo: { flex: 1, gap: 4 },
  convTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName: { fontSize: 15, fontWeight: '600' },
  convTime: { fontSize: 12 },
  convBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convLastMsg: { flex: 1, fontSize: 13, marginRight: 8 },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
  },
  unreadText: { color: 'white', fontSize: 11, fontWeight: '700' },
  chatHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingBottom: 12,
    borderBottomWidth: 1, gap: 10,
  },
  chatAvatar: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
  },
  chatInfo: { flex: 1 },
  chatName: { fontSize: 15, fontWeight: '700' },
  chatStatus: { fontSize: 12 },
  quoteForm: {
    padding: 14, borderBottomWidth: 1, gap: 10,
  },
  quoteFormTitle: { fontSize: 14, fontWeight: '700' },
  quoteInput: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14,
  },
  quoteRow: { flexDirection: 'row', gap: 10 },
  quoteActions: { flexDirection: 'row', gap: 10 },
  quoteCancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, alignItems: 'center',
  },
  quoteCancelText: { fontSize: 13, fontWeight: '600' },
  quoteSendBtn: {
    flex: 2, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
  },
  quoteSendText: { color: 'white', fontSize: 13, fontWeight: '700' },
  messagesList: { padding: 14, gap: 8 },
  messageRow: { flexDirection: 'row', marginBottom: 2 },
  messageRowMe: { justifyContent: 'flex-end' },
  messageBubble: {
    maxWidth: '78%', padding: 12,
    borderRadius: 16, gap: 4,
  },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleOther: { borderWidth: 1, borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 20 },
  translatedText: { fontSize: 13, fontStyle: 'italic', marginTop: 4 },
  messageTime: { fontSize: 10, alignSelf: 'flex-end', marginTop: 2 },
  quoteBubble: {
    maxWidth: '78%', padding: 12, borderRadius: 16, borderWidth: 1, gap: 6,
  },
  quoteBubbleHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  quoteBubbleLabel: { fontSize: 11, fontWeight: '600' },
  quoteBubbleProduct: { fontSize: 14, fontWeight: '700' },
  quoteBubbleMeta: { fontSize: 12 },
  typingBubble: {
    alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 16, borderWidth: 1,
  },
  typingText: { fontSize: 13, fontStyle: 'italic' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 10, paddingTop: 10, borderTopWidth: 1, gap: 6,
  },
  inputAction: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
  },
  chatInput: {
    flex: 1, borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9, fontSize: 15,
    maxHeight: 100, minHeight: 38,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
  },
});

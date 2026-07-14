import React, { useState, useRef } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@/components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';

interface AIMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  time: string;
  loading?: boolean;
  sources?: string[];
}

const QUICK_PROMPTS = [
  { label: '🚚 Délai de livraison', prompt: 'Quels sont les délais de livraison estimés pour ma commande BDC-2024-001234?' },
  { label: '💰 Sourcing B2B', prompt: 'Je cherche des fournisseurs de panneaux solaires en Asie, MOQ 500 unités, budget $50/pièce.' },
  { label: '📊 Comparaison prix', prompt: 'Compare les prix des LED industriels 100W sur BARDEC avec le marché actuel.' },
  { label: '📦 Réapprovisionnement', prompt: 'Prédis quand je dois commander des stocks de shea butter pour éviter les ruptures.' },
  { label: '⚠️ Litige commande', prompt: 'J\'ai reçu une commande endommagée. Comment ouvrir un litige Trade Assurance?' },
  { label: '🌍 Importation règles', prompt: 'Quelles sont les règles douanières pour importer du Sénégal vers la France?' },
];

const INITIAL_MESSAGES: AIMessage[] = [
  {
    id: 'ai-0',
    sender: 'ai',
    text: '👋 Bonjour! Je suis **BARDEC AI**, votre assistant de commerce intelligent.\n\nJe peux vous aider avec:\n• 🔍 Recherche et sourcing de produits B2B\n• 🚚 Suivi et prédiction de livraisons\n• 💰 Comparaison de prix et négociation\n• 📊 Analyse de vos commandes\n• ⚖️ Réglementation import/export\n• 🛡️ Trade Assurance et litiges\n\nQue puis-je faire pour vous?',
    time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  },
];

const AI_RESPONSES: Record<string, string> = {
  livraison: `📍 **Commande BDC-2024-001234**\n\nTracking: DHL987654321\n\n**Statut actuel:** En transit\n**Dernière position:** Hub Paris CDG\n**ETA prévu:** Demain avant 18h\n**Confiance:** 94%\n\n*Basé sur les données historiques DHL + conditions météo actuelles. Probabilité de retard: 6%.*`,
  sourcing: `🌞 **Fournisseurs panneaux solaires recommandés**\n\n1. **Vega Electronics Co.** ⭐4.7\n   - MOQ: 200 unités | $46/pièce B2B\n   - Délai: 15-20 jours | CE certifié\n\n2. **SunTech Africa** ⭐4.5\n   - MOQ: 500 unités | $44/pièce\n   - Délai: 25 jours | ISO 9001\n\n3. **Lagos Tech Hub** ⭐4.3\n   - MOQ: 300 unités | $48/pièce\n   - Délai: 18 jours\n\n💡 *Je recommande Vega Electronics pour votre budget — 8% sous votre cible de $50 avec MOQ accessible.*`,
  defaut: `Je comprends votre question. Voici ma réponse détaillée basée sur les données BARDEC:\n\n**Analyse en cours...**\n\nJe consulte:\n• Base de données produits BARDEC\n• Historique des commandes\n• Données de marché en temps réel\n• Réglementations applicables\n\nRéponse prête. Selon mes analyses, la meilleure approche pour votre situation serait de...\n\n*[Réponse complète disponible avec Supabase connecté]*`,
};

export default function ChatAIScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<AIMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const listRef = useRef<FlatList>(null);

  async function sendMessage(text?: string) {
    const msgText = text ?? input.trim();
    if (!msgText || isThinking) return;
    setInput('');

    const userMsg: AIMessage = {
      id: `u${Date.now()}`,
      text: msgText,
      sender: 'user',
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    };

    const loadingMsg: AIMessage = {
      id: `ai${Date.now()}`,
      sender: 'ai',
      text: '',
      time: '',
      loading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setIsThinking(true);

    await new Promise(r => setTimeout(r, 1800));

    const lower = msgText.toLowerCase();
    let response = AI_RESPONSES.defaut;
    if (lower.includes('livraison') || lower.includes('tracking') || lower.includes('commande')) {
      response = AI_RESPONSES.livraison;
    } else if (lower.includes('sourcing') || lower.includes('fournisseur') || lower.includes('solaire') || lower.includes('led')) {
      response = AI_RESPONSES.sourcing;
    }

    const aiMsg: AIMessage = {
      id: `ai${Date.now() + 1}`,
      text: response,
      sender: 'ai',
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      sources: ['BARDEC DB', 'Données marché', 'Trade API'],
    };

    setMessages(prev => prev.filter(m => !m.loading).concat(aiMsg));
    setIsThinking(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }

  function renderMarkdown(text: string, color: string) {
    // Simple bold markdown parsing
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return (
      <Text style={{ color, fontSize: 15, lineHeight: 22 }}>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <Text key={i} style={{ fontWeight: '700' }}>{part.slice(2, -2)}</Text>;
          }
          return <Text key={i}>{part}</Text>;
        })}
      </Text>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="x" size={22} color="white" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>AI</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>{t('ai_assistant')}</Text>
            <Text style={styles.headerSubtitle}>Propulsé par BARDEC Intelligence</Text>
          </View>
        </View>
        <TouchableOpacity>
          <Feather name="trash-2" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={() => (
          messages.length === 1 ? (
            <View style={styles.quickSection}>
              <Text style={[styles.quickTitle, { color: colors.mutedForeground }]}>Questions fréquentes</Text>
              <View style={styles.quickGrid}>
                {QUICK_PROMPTS.map((q, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.quickChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => sendMessage(q.prompt)}
                  >
                    <Text style={[styles.quickChipText, { color: colors.foreground }]}>{q.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null
        )}
        renderItem={({ item }) => {
          if (item.loading) {
            return (
              <View style={[styles.aiMsg, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.aiMsgHeader}>
                  <View style={[styles.aiAvatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.aiAvatarText}>AI</Text>
                  </View>
                  <Text style={[styles.thinking, { color: colors.mutedForeground }]}>Analyse en cours...</Text>
                </View>
                <View style={styles.thinkingDots}>
                  {[0, 1, 2].map(i => (
                    <View key={i} style={[styles.thinkingDot, { backgroundColor: colors.primary, opacity: 0.4 + i * 0.2 }]} />
                  ))}
                </View>
              </View>
            );
          }

          if (item.sender === 'user') {
            return (
              <View style={styles.userMsgRow}>
                <View style={[styles.userMsg, { backgroundColor: colors.primary }]}>
                  <Text style={styles.userMsgText}>{item.text}</Text>
                  <Text style={styles.userMsgTime}>{item.time}</Text>
                </View>
              </View>
            );
          }

          return (
            <View style={[styles.aiMsg, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.aiMsgHeader}>
                <View style={[styles.aiAvatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.aiAvatarText}>AI</Text>
                </View>
                <Text style={[styles.aiMsgTime, { color: colors.mutedForeground }]}>{item.time}</Text>
              </View>
              {renderMarkdown(item.text, colors.foreground)}
              {item.sources && (
                <View style={styles.sourcesRow}>
                  {item.sources.map((s, i) => (
                    <View key={i} style={[styles.sourceChip, { backgroundColor: colors.accent }]}>
                      <Feather name="database" size={10} color={colors.primary} />
                      <Text style={[styles.sourceChipText, { color: colors.primary }]}>{s}</Text>
                    </View>
                  ))}
                </View>
              )}
              {/* Feedback */}
              <View style={styles.feedback}>
                <TouchableOpacity style={styles.feedbackBtn}>
                  <Feather name="thumbs-up" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.feedbackBtn}>
                  <Feather name="thumbs-down" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.feedbackBtn}>
                  <Feather name="copy" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      {/* Input */}
      <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.accent, color: colors.foreground, borderColor: colors.border }]}
          placeholder="Posez votre question..."
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={500}
        />
        <TouchableOpacity>
          <Feather name="mic" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: input.trim() ? colors.primary : colors.muted }]}
          onPress={() => sendMessage()}
          disabled={!input.trim() || isThinking}
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 14, gap: 12,
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiBadge: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
  },
  aiBadgeText: { color: 'white', fontWeight: '800', fontSize: 13 },
  headerTitle: { color: 'white', fontSize: 16, fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  messagesList: { padding: 14, gap: 10, paddingBottom: 20 },
  userMsgRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  userMsg: {
    maxWidth: '78%', padding: 12, borderRadius: 16,
    borderBottomRightRadius: 4, gap: 4,
  },
  userMsgText: { color: 'white', fontSize: 15, lineHeight: 20 },
  userMsgTime: { color: 'rgba(255,255,255,0.65)', fontSize: 11, alignSelf: 'flex-end' },
  aiMsg: {
    borderRadius: 16, borderBottomLeftRadius: 4,
    borderWidth: 1, padding: 14, gap: 8,
  },
  aiMsgHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiAvatar: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  aiAvatarText: { color: 'white', fontSize: 11, fontWeight: '800' },
  thinking: { fontSize: 13, fontStyle: 'italic' },
  aiMsgTime: { fontSize: 11 },
  thinkingDots: { flexDirection: 'row', gap: 4, paddingLeft: 36 },
  thinkingDot: { width: 8, height: 8, borderRadius: 4 },
  sourcesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sourceChip: {
    flexDirection: 'row', alignItems: 'center',
    gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  sourceChipText: { fontSize: 10, fontWeight: '600' },
  feedback: { flexDirection: 'row', gap: 8, marginTop: 4 },
  feedbackBtn: { padding: 4 },
  quickSection: { marginTop: 12, gap: 8 },
  quickTitle: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: {
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  quickChipText: { fontSize: 13, fontWeight: '500' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 14, paddingTop: 12, borderTopWidth: 1, gap: 8,
  },
  input: {
    flex: 1, borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15,
    maxHeight: 100, minHeight: 44,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
});

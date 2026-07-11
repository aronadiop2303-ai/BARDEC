import React, { useState } from 'react';
import {
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { LANGUAGES } from '@/constants/languages';

const LANGUAGE_GROUPS = [
  {
    title: '🌍 Langues Africaines',
    languages: ['fr', 'en', 'ar', 'wo', 'ha', 'sw', 'am', 'yo', 'ig', 'zu'],
  },
  {
    title: '🌐 Langues Mondiales',
    languages: ['es', 'pt', 'zh', 'hi', 'ja', 'ko', 'de', 'ru', 'it', 'tr'],
  },
];

export default function LanguageScreen() {
  const colors = useColors();
  const { language: currentLang, setLanguage, t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(currentLang);

  const filteredLanguages = LANGUAGES.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.nativeName.toLowerCase().includes(search.toLowerCase()) ||
    l.code.toLowerCase().includes(search.toLowerCase())
  );

  function handleApply() {
    setLanguage(selected);
    router.back();
  }

  const deviceLang = LANGUAGES.find(l => l.code === currentLang);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('language')}</Text>
        <TouchableOpacity
          style={[styles.applyBtn, { backgroundColor: colors.primary }]}
          onPress={handleApply}
        >
          <Text style={styles.applyBtnText}>{t('apply')}</Text>
        </TouchableOpacity>
      </View>

      {/* Auto-detect banner */}
      <View style={[styles.autoBanner, { backgroundColor: colors.accent, borderColor: colors.border }]}>
        <Feather name="globe" size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.autoBannerTitle, { color: colors.foreground }]}>{t('detect_auto')}</Text>
          <Text style={[styles.autoBannerDesc, { color: colors.mutedForeground }]}>
            Langue détectée: {deviceLang?.flag} {deviceLang?.nativeName}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.useDetectedBtn, { borderColor: colors.primary }]}
          onPress={() => setSelected(currentLang)}
        >
          <Text style={[styles.useDetectedText, { color: colors.primary }]}>Utiliser</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, margin: 14 }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder={t('search_languages')}
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
        {search ? (
          <View style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>
              {filteredLanguages.length} résultat{filteredLanguages.length !== 1 ? 's' : ''}
            </Text>
            {filteredLanguages.map(lang => (
              <LanguageRow key={lang.code} lang={lang} selected={selected} onSelect={setSelected} colors={colors} />
            ))}
          </View>
        ) : (
          LANGUAGE_GROUPS.map(group => {
            const groupLangs = group.languages.map(code => LANGUAGES.find(l => l.code === code)).filter(Boolean) as typeof LANGUAGES;
            return (
              <View key={group.title} style={styles.group}>
                <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>{group.title}</Text>
                {groupLangs.map(lang => (
                  <LanguageRow key={lang.code} lang={lang} selected={selected} onSelect={setSelected} colors={colors} />
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function LanguageRow({ lang, selected, onSelect, colors }: {
  lang: typeof LANGUAGES[0];
  selected: string;
  onSelect: (code: string) => void;
  colors: any;
}) {
  const isSelected = selected === lang.code;
  return (
    <TouchableOpacity
      style={[
        styles.langRow,
        {
          backgroundColor: isSelected ? colors.accent : colors.card,
          borderColor: isSelected ? colors.primary : colors.border,
        },
      ]}
      onPress={() => onSelect(lang.code)}
    >
      <Text style={styles.langFlag}>{lang.flag}</Text>
      <View style={styles.langNames}>
        <Text style={[styles.langNative, { color: colors.foreground }]}>{lang.nativeName}</Text>
        <Text style={[styles.langEnglish, { color: colors.mutedForeground }]}>{lang.name}</Text>
      </View>
      {lang.rtl && (
        <View style={[styles.rtlBadge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.rtlBadgeText, { color: colors.primary }]}>RTL</Text>
        </View>
      )}
      {isSelected ? (
        <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
          <Feather name="check" size={14} color="white" />
        </View>
      ) : (
        <View style={[styles.checkCircle, { borderWidth: 2, borderColor: colors.border }]} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  applyBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
  },
  applyBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  autoBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 14, marginTop: 14,
    borderRadius: 14, borderWidth: 1, padding: 14, gap: 12,
  },
  autoBannerTitle: { fontSize: 14, fontWeight: '600' },
  autoBannerDesc: { fontSize: 12, marginTop: 2 },
  useDetectedBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
  },
  useDetectedText: { fontSize: 13, fontWeight: '600' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  group: { paddingHorizontal: 14, gap: 6, marginBottom: 16 },
  groupTitle: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, paddingVertical: 6,
  },
  langRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 2, padding: 14, gap: 12,
  },
  langFlag: { fontSize: 28 },
  langNames: { flex: 1 },
  langNative: { fontSize: 16, fontWeight: '600' },
  langEnglish: { fontSize: 13, marginTop: 1 },
  rtlBadge: {
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
  },
  rtlBadgeText: { fontSize: 10, fontWeight: '700' },
  checkCircle: {
    width: 26, height: 26, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center',
  },
});

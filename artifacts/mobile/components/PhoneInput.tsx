import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList, Modal, Platform, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import {
  AsYouType, CountryCode, isValidPhoneNumber,
  parsePhoneNumber, validatePhoneNumberLength,
} from 'libphonenumber-js';
import { Feather } from '@/components/Icon';
import { getAllCountryOptions, CountryOption } from '@/constants/phoneCountries';

export interface PhoneInputValue {
  /** Numéro complet au format E.164 (ex: "+221771234567"), ou null tant qu'incomplet/invalide. */
  e164: string | null;
  isValid: boolean;
  country: CountryCode;
  /** Chiffres nationaux saisis (sans indicatif), pour affichage/debug uniquement. */
  nationalDigits: string;
}

interface PhoneInputProps {
  defaultCountry?: CountryCode;
  /** Valeur initiale au format E.164, si on édite un numéro déjà enregistré. */
  initialE164?: string | null;
  onChangeValue: (value: PhoneInputValue) => void;
  colors: {
    border: string; card: string; foreground: string; mutedForeground: string;
    primary: string; accent: string; background: string;
  };
  placeholder?: string;
  autoFocus?: boolean;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

export function PhoneInput({
  defaultCountry = 'SN',
  initialE164,
  onChangeValue,
  colors,
  placeholder = 'Numéro de téléphone *',
  autoFocus,
}: PhoneInputProps) {
  const parsedInitial = useMemo(() => {
    if (!initialE164) return null;
    try {
      return parsePhoneNumber(initialE164);
    } catch {
      return null;
    }
  }, [initialE164]);

  const [country, setCountry] = useState<CountryCode>(
    (parsedInitial?.country as CountryCode) || defaultCountry,
  );
  const [nationalDigits, setNationalDigits] = useState<string>(
    parsedInitial?.nationalNumber ? String(parsedInitial.nationalNumber) : '',
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<TextInput>(null);

  const options = useMemo(() => getAllCountryOptions(), []);
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter(
      (o) => o.name.toLowerCase().includes(q) || o.callingCode.includes(q) || o.code.toLowerCase().includes(q),
    );
  }, [options, search]);

  const selectedOption: CountryOption | undefined = useMemo(
    () => options.find((o) => o.code === country),
    [options, country],
  );

  const formatted = useMemo(() => {
    if (!nationalDigits) return '';
    const formatter = new AsYouType(country);
    return formatter.input(nationalDigits);
  }, [nationalDigits, country]);

  const isValid = nationalDigits.length > 0 && isValidPhoneNumber(nationalDigits, country);

  // Notifie le parent à chaque changement réel (pas à chaque render) —
  // évite les boucles de mise à jour infinies avec un state parent contrôlé.
  const lastEmitted = useRef<string>('');
  useEffect(() => {
    const key = `${country}:${nationalDigits}`;
    if (lastEmitted.current === key) return;
    lastEmitted.current = key;
    let e164: string | null = null;
    if (isValid) {
      try {
        e164 = parsePhoneNumber(nationalDigits, country)?.number ?? null;
      } catch {
        e164 = null;
      }
    }
    onChangeValue({ e164, isValid, country, nationalDigits });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, nationalDigits, isValid]);

  function handleChangeText(raw: string) {
    const digits = digitsOnly(raw);
    // Empêche la saisie de chiffres supplémentaires dès que la longueur
    // maximale valide pour le pays sélectionné est atteinte — n'affecte
    // jamais la suppression (digits plus court que l'état courant).
    if (digits.length > nationalDigits.length) {
      const lengthCheck = validatePhoneNumberLength(digits, country);
      if (lengthCheck === 'TOO_LONG') return;
    }
    setNationalDigits(digits);
  }

  function handleSelectCountry(code: CountryCode) {
    setCountry(code);
    // Le nombre de chiffres attendu change avec le pays — on repart d'un
    // champ vide plutôt que de garder des chiffres qui ne correspondraient
    // plus à rien (évite un faux "valide" trompeur).
    setNationalDigits('');
    setPickerOpen(false);
    setSearch('');
    inputRef.current?.focus();
  }

  return (
    <View>
      <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={styles.countryChip}
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Choisir l'indicatif du pays"
        >
          <Text style={styles.flag}>{selectedOption?.flag ?? '🏳️'}</Text>
          <Text style={[styles.callingCode, { color: colors.foreground }]}>
            +{selectedOption?.callingCode ?? ''}
          </Text>
          <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <TextInput
          ref={inputRef}
          style={[styles.input, { color: colors.foreground }]}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          value={formatted}
          onChangeText={handleChangeText}
          keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'phone-pad'}
          autoFocus={autoFocus}
        />

        {nationalDigits.length > 0 && (
          <Feather
            name={isValid ? 'check-circle' : 'alert-circle'}
            size={16}
            color={isValid ? '#22C55E' : colors.mutedForeground}
          />
        )}
      </View>

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Choisir un pays</Text>
            <TouchableOpacity onPress={() => setPickerOpen(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Rechercher un pays ou un indicatif"
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : null}
          </View>

          <FlatList
            data={filteredOptions}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const selected = item.code === country;
              return (
                <TouchableOpacity
                  style={[
                    styles.countryRow,
                    { backgroundColor: selected ? colors.accent : 'transparent', borderColor: colors.border },
                  ]}
                  onPress={() => handleSelectCountry(item.code)}
                >
                  <Text style={styles.rowFlag}>{item.flag}</Text>
                  <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.rowCode, { color: colors.mutedForeground }]}>+{item.callingCode}</Text>
                  {selected && <Feather name="check" size={16} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 10,
  },
  countryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 },
  flag: { fontSize: 20 },
  callingCode: { fontSize: 15, fontWeight: '600' },
  divider: { width: 1, height: 24 },
  input: { flex: 1, fontSize: 15, paddingVertical: 6 },
  modalContainer: { flex: 1, paddingTop: 50 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 14, marginTop: 14, marginBottom: 6,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },
  countryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowFlag: { fontSize: 22 },
  rowName: { flex: 1, fontSize: 15 },
  rowCode: { fontSize: 14, fontWeight: '600' },
});

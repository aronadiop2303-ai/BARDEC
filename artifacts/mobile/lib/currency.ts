import { getLocales } from 'expo-localization';
import { isSupabaseConfigured, supabase } from './supabase';

export type CurrencyCode = 'FCFA' | 'EUR' | 'USD';
export const CURRENCIES: CurrencyCode[] = ['FCFA', 'EUR', 'USD'];

interface CurrencyRate {
  code: CurrencyCode;
  rateToFcfa: number; // how many FCFA is worth 1 unit of this currency
  symbol: string;
}

// Matches currency_rates' seeded rows — used before the real rates have
// loaded (first render) and as the only source in demo mode.
const FALLBACK_RATES: Record<CurrencyCode, CurrencyRate> = {
  FCFA: { code: 'FCFA', rateToFcfa: 1,       symbol: 'FCFA' },
  EUR:  { code: 'EUR',  rateToFcfa: 655.957, symbol: '€' },
  USD:  { code: 'USD',  rateToFcfa: 610,     symbol: '$' },
};

let cachedRates: Record<string, CurrencyRate> = { ...FALLBACK_RATES };
let loadPromise: Promise<void> | null = null;

// Fetches currency_rates once and caches it in memory for the whole app
// session — formatPrice() needs to be synchronous (called from render, often
// many times per screen), and rates change rarely (admin-edited). Call
// again with force:true right after an admin edit to refresh the cache.
export async function loadCurrencyRates(force = false): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  if (loadPromise && !force) return loadPromise;
  loadPromise = (async () => {
    const { data, error } = await supabase!
      .from('currency_rates')
      .select('currency_code, rate_to_fcfa, symbol');
    if (error) { console.warn('loadCurrencyRates error:', error.message); return; }
    const next: Record<string, CurrencyRate> = {};
    (data ?? []).forEach((r: any) => {
      next[r.currency_code] = {
        code: r.currency_code,
        rateToFcfa: Number(r.rate_to_fcfa),
        symbol: r.symbol,
      };
    });
    if (Object.keys(next).length > 0) cachedRates = next;
  })();
  return loadPromise;
}

// fcfaAmount is always the amount as stored in the DB (products.price_public,
// orders.total, …) — genuinely FCFA, never USD. rate_to_fcfa = how many FCFA
// 1 unit of the target currency is worth, so FCFA → target = divide.
export function formatPrice(fcfaAmount: number, currencyCode: string = 'FCFA'): string {
  const rate = cachedRates[currencyCode] ?? FALLBACK_RATES.FCFA;
  const amount = rate.code === 'FCFA' ? fcfaAmount : fcfaAmount / rate.rateToFcfa;
  const decimals = rate.code === 'FCFA' ? 0 : 2;
  const formatted = amount.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return rate.code === 'FCFA' ? `${formatted} FCFA` : `${rate.symbol}${formatted}`;
}

// ─── Default currency detection (locale → country → currency) ──────────────
// UEMOA (West African CFA franc zone) — everyone else falls to EUR (Eurozone
// country codes) or USD otherwise.
const UEMOA_COUNTRIES = new Set(['SN', 'BJ', 'BF', 'CI', 'GW', 'ML', 'NE', 'TG']);
const EUROZONE_COUNTRIES = new Set([
  'FR', 'DE', 'IT', 'ES', 'PT', 'BE', 'NL', 'LU', 'IE', 'AT',
  'FI', 'GR', 'SK', 'SI', 'EE', 'LV', 'LT', 'CY', 'MT', 'HR',
]);

export function detectDefaultCurrency(): CurrencyCode {
  try {
    const region = getLocales()[0]?.regionCode ?? '';
    if (UEMOA_COUNTRIES.has(region)) return 'FCFA';
    if (EUROZONE_COUNTRIES.has(region)) return 'EUR';
    return 'USD';
  } catch {
    return 'FCFA';
  }
}

// Reads the user's saved preference; if still null (first launch/never set),
// detects one from the device locale and writes it back — matches the same
// "write once, respect afterwards" contract as the language picker's default.
export async function ensurePreferredCurrency(userId: string): Promise<CurrencyCode> {
  if (!isSupabaseConfigured || !supabase) return detectDefaultCurrency();
  const { data, error } = await supabase
    .from('users')
    .select('preferred_currency')
    .eq('id', userId)
    .maybeSingle();
  if (error) { console.warn('ensurePreferredCurrency fetch error:', error.message); return detectDefaultCurrency(); }
  const saved = data?.preferred_currency as CurrencyCode | null | undefined;
  if (saved && CURRENCIES.includes(saved)) return saved;

  const detected = detectDefaultCurrency();
  const { error: writeErr } = await supabase
    .from('users')
    .update({ preferred_currency: detected })
    .eq('id', userId);
  if (writeErr) console.warn('ensurePreferredCurrency write error:', writeErr.message);
  return detected;
}

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  CurrencyCode, detectDefaultCurrency, ensurePreferredCurrency,
  formatPrice as formatPriceFn, loadCurrencyRates,
} from '@/lib/currency';

interface CurrencyContextType {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  formatPrice: (fcfaAmount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType>({
  currency: 'FCFA',
  setCurrency: () => {},
  formatPrice: (fcfa) => formatPriceFn(fcfa, 'FCFA'),
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { user, isDemoMode } = useAuth();
  const [currency, setCurrencyState] = useState<CurrencyCode>('FCFA');

  // Rates rarely change (admin-edited) — load once per app session.
  useEffect(() => { loadCurrencyRates(); }, []);

  // Resolve the real Supabase auth UUID rather than user.id from context,
  // which can be a demo placeholder while the role-preview switcher is
  // active — same pattern used everywhere else in this codebase.
  useEffect(() => {
    if (!user) return;
    if (isDemoMode || !isSupabaseConfigured || !supabase) {
      setCurrencyState(detectDefaultCurrency());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: { user: authUser } } = await supabase!.auth.getUser();
      if (!authUser) return;
      const resolved = await ensurePreferredCurrency(authUser.id);
      if (!cancelled) setCurrencyState(resolved);
    })();
    return () => { cancelled = true; };
  }, [user?.id, isDemoMode]);

  function setCurrency(code: CurrencyCode) {
    setCurrencyState(code); // optimistic — UI reflects the choice immediately
    if (isDemoMode || !isSupabaseConfigured || !supabase) return;
    (async () => {
      const { data: { user: authUser } } = await supabase!.auth.getUser();
      if (!authUser) return;
      const { error } = await supabase!.from('users').update({ preferred_currency: code }).eq('id', authUser.id);
      if (error) console.warn('setCurrency write error:', error.message);
    })();
  }

  function formatPrice(fcfaAmount: number): string {
    return formatPriceFn(fcfaAmount, currency);
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatPrice }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

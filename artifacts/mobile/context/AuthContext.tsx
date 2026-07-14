import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEMO_USERS, User, UserRole } from '@/constants/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (
    email: string,
    password: string,
    name: string,
    role: UserRole,
    company?: string,
  ) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  switchDemoRole: (role: UserRole) => void;
  isDemoMode: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => ({}),
  register: async () => ({}),
  logout: async () => {},
  switchDemoRole: () => {},
  isDemoMode: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isDemoMode = !isSupabaseConfigured;

  useEffect(() => {
    initAuth();
  }, []);

  async function initAuth() {
    try {
      if (isDemoMode) {
        const stored = await AsyncStorage.getItem('bardec_demo_user');
        if (stored) setUser(JSON.parse(stored));
        setIsLoading(false);
        return;
      }

      const { data: { session } } = await supabase!.auth.getSession();
      if (session?.user) {
        const dbUser = await fetchUserProfile(session.user.id);
        setUser(dbUser);
      }
      supabase!.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const dbUser = await fetchUserProfile(session.user.id);
          setUser(dbUser);
        } else {
          setUser(null);
        }
      });
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchUserProfile(userId: string): Promise<User | null> {
    if (!supabase) return null;
    const { data } = await supabase.from('users').select('*').eq('id', userId).single();
    if (!data) return null;
    return {
      id: data.id,
      name: data.display_name ?? data.email,
      email: data.email,
      role: data.role as UserRole,
      company: data.company_id ?? undefined,
      creditLimit: data.credit_limit ?? undefined,
      creditBalance: data.net30_balance ?? undefined,
    };
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async function login(email: string, password: string): Promise<{ error?: string }> {
    if (isDemoMode) {
      const found = DEMO_USERS.find(u => u.email === email.toLowerCase());
      if (found) {
        setUser(found);
        await AsyncStorage.setItem('bardec_demo_user', JSON.stringify(found));
        return {};
      }
      // Accept any credentials in demo mode — default to CUSTOMER role
      const defaultUser: User = { ...DEMO_USERS[0], email, name: email.split('@')[0] };
      setUser(defaultUser);
      await AsyncStorage.setItem('bardec_demo_user', JSON.stringify(defaultUser));
      return {};
    }

    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  }

  // ── Register ───────────────────────────────────────────────────────────────
  async function register(
    email: string,
    password: string,
    name: string,
    role: UserRole,
    company?: string,
  ): Promise<{ error?: string }> {
    const isB2B = role === 'BUYER' || role === 'VENDOR';

    if (isDemoMode) {
      // Demo mode: create a local user immediately
      const newUser: User = { id: `demo_${Date.now()}`, name, email, role, company };
      setUser(newUser);
      await AsyncStorage.setItem('bardec_demo_user', JSON.stringify(newUser));
      return {};
    }

    // ── Step 1: Create the Supabase Auth account ──────────────────────────
    // Pass metadata in options.data so it's available in auth.users.raw_user_meta_data
    // and in Supabase Auth webhooks/triggers without an extra DB query.
    const { data, error } = await supabase!.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name,
          role,
          ...(isB2B && company ? { company_name: company } : {}),
        },
      },
    });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Erreur lors de la création du compte.' };

    // ── Step 2 (B2B only): create the company row first ───────────────────
    let companyId: string | undefined;
    if (isB2B && company) {
      const { data: companyRow, error: companyErr } = await supabase!
        .from('companies')
        .insert({
          name: company,
          is_approved: false, // pending admin validation
        })
        .select('id')
        .single();

      if (companyErr) {
        // Non-blocking: log but don't abort account creation
        console.warn('[register] companies insert failed:', companyErr.message);
      } else {
        companyId = companyRow?.id;
      }
    }

    // ── Step 3: insert the user profile row ───────────────────────────────
    const userRow: Record<string, unknown> = {
      id: data.user.id,
      email,
      display_name: name,
      role,
      // VENDORs need KYC validation before accessing the platform
      is_approved: role !== 'VENDOR',
    };
    if (companyId) userRow.company_id = companyId;

    const { error: profileError } = await supabase!.from('users').insert(userRow);
    if (profileError) return { error: profileError.message };

    // ── Step 4: check for email confirmation requirement ──────────────────
    // data.session is null when Supabase requires email verification.
    if (!data.session) {
      return { error: 'CONFIRM_EMAIL' };
    }

    return {};
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  async function logout() {
    if (isDemoMode) {
      await AsyncStorage.removeItem('bardec_demo_user');
      setUser(null);
      return;
    }
    await supabase!.auth.signOut();
    setUser(null);
  }

  // ── Role switcher (always available — needed for multi-role testing) ────────
  function switchDemoRole(role: UserRole) {
    // Try to find an exact demo user for this role
    const found = DEMO_USERS.find(u => u.role === role);
    if (found) {
      setUser(found);
      AsyncStorage.setItem('bardec_demo_user', JSON.stringify(found));
      return;
    }
    // Fallback: keep current user data but override the role locally
    if (user) {
      const overridden: User = { ...user, role };
      setUser(overridden);
      AsyncStorage.setItem('bardec_demo_user', JSON.stringify(overridden));
    }
  }

  return (
    <AuthContext.Provider value={{
      user, isLoading, isAuthenticated: !!user,
      login, register, logout, switchDemoRole, isDemoMode,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

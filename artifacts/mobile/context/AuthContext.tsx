import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEMO_USERS, User, UserRole } from '@/constants/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { toAuthMessage, toUserMessage } from '@/lib/errors';
import { registerPushToken } from '@/lib/notifications';

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
    phone: string,
    company?: string,
    inviteCode?: string,
  ) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  switchDemoRole: (role: UserRole) => void;
  updateUserAvatar: (url: string) => Promise<void>;
  updateUserName: (name: string) => Promise<void>;
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
  updateUserAvatar: async () => {},
  updateUserName: async () => {},
  isDemoMode: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isDemoMode = !isSupabaseConfigured;

  // Track whether we are inside the register() flow so onAuthStateChange
  // does not race with the users-row INSERT that happens right after signUp().
  const isRegistering = useRef(false);

  useEffect(() => {
    initAuth();
  }, []);

  // Register (or refresh) this device's push token whenever a real account
  // becomes authenticated — covers login, register, and session restore in
  // one place instead of duplicating the call at every call site.
  useEffect(() => {
    if (user && !isDemoMode && supabase) {
      registerPushToken(user.id, supabase).catch(() => { /* ignore */ });
    }
  }, [user?.id, isDemoMode]);

  async function initAuth() {
    try {
      if (isDemoMode) {
        const stored = await AsyncStorage.getItem('bardec_demo_user');
        if (stored) setUser(JSON.parse(stored));
        setIsLoading(false);
        return;
      }

      // Restore session persisted by AsyncStorage (survives app restarts).
      const { data: { session } } = await supabase!.auth.getSession();
      if (session?.user) {
        const dbUser = await fetchUserProfile(session.user.id);
        if (dbUser) setUser(dbUser);
      }

      supabase!.auth.onAuthStateChange(async (_event, session) => {
        if (!session?.user) {
          // Only clear user on explicit sign-out; never during register flow.
          if (!isRegistering.current) setUser(null);
          return;
        }

        // During register() the users row does not exist yet when this fires —
        // skip the fetch; register() will call setUser() directly after INSERT.
        if (isRegistering.current) return;

        const dbUser = await fetchUserProfile(session.user.id);
        // Only update state when we actually find the profile row.
        // A null here means the row hasn't been inserted yet (race condition
        // during signUp); register() handles that case explicitly.
        if (dbUser) setUser(dbUser);
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
      id:            data.id,
      name:          data.display_name ?? data.email,
      email:         data.email,
      role:          data.role as UserRole,
      company:       data.company_id ?? undefined,
      creditLimit:   data.credit_limit ?? undefined,
      creditBalance: data.net30_balance ?? undefined,
      avatar:        data.avatar_url ?? undefined,
    };
  }

  async function updateUserAvatar(url: string): Promise<void> {
    if (!user) return;
    const updated: User = { ...user, avatar: url };
    setUser(updated);
    if (isDemoMode) {
      await AsyncStorage.setItem('bardec_demo_user', JSON.stringify(updated));
    } else if (supabase) {
      // Real Supabase auth UUID — user.id can be a demo placeholder ("u4")
      // when the role switcher is active.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser?.id) await supabase.from('users').update({ avatar_url: url }).eq('id', authUser.id);
    }
  }

  async function updateUserName(name: string): Promise<void> {
    if (!user) return;
    const updated: User = { ...user, name };
    setUser(updated);
    if (isDemoMode) {
      await AsyncStorage.setItem('bardec_demo_user', JSON.stringify(updated));
    } else if (supabase) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser?.id) await supabase.from('users').update({ display_name: name }).eq('id', authUser.id);
    }
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
    if (error) return { error: toAuthMessage('auth:login', error) };
    return {};
  }

  // ── Register ───────────────────────────────────────────────────────────────
  async function register(
    email: string,
    password: string,
    name: string,
    role: UserRole,
    phone: string,
    company?: string,
    inviteCode?: string,
  ): Promise<{ error?: string }> {
    const isB2B = role === 'BUYER' || role === 'VENDOR';

    if (isDemoMode) {
      // Demo mode: create a local user immediately
      const newUser: User = { id: `demo_${Date.now()}`, name, email, role, company };
      setUser(newUser);
      await AsyncStorage.setItem('bardec_demo_user', JSON.stringify(newUser));
      return {};
    }

    // Guard onAuthStateChange so it doesn't race with our DB inserts below.
    isRegistering.current = true;

    try {
      // ── Step 1: Create the Supabase Auth account ─────────────────────────
      const { data, error } = await supabase!.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: name,
            role,
            phone,
            ...(isB2B && company ? { company_name: company } : {}),
          },
        },
      });
      if (error) return { error: toAuthMessage('auth:register:signUp', error) };
      if (!data.user) return { error: 'Erreur lors de la création du compte.' };

      // ── Step 2 (B2B only): create the company row first ──────────────────
      let companyId: string | undefined;
      if (isB2B && company) {
        const { data: companyRow, error: companyErr } = await supabase!
          .from('companies')
          .insert({ name: company, is_approved: false })
          .select('id')
          .single();
        if (companyErr) {
          console.warn('[register] companies insert failed:', companyErr.message);
        } else {
          companyId = companyRow?.id;
        }
      }

      // ── Step 3: insert the user profile row ──────────────────────────────
      const userRow: Record<string, unknown> = {
        id: data.user.id,
        email,
        display_name: name,
        role,
        phone,
        is_approved: role !== 'VENDOR',
      };
      if (companyId) userRow.company_id = companyId;
      if (inviteCode) userRow.invite_code = inviteCode;

      const { error: profileError } = await supabase!.from('users').insert(userRow);
      if (profileError) return { error: toUserMessage('auth:register:profileInsert', profileError, 'Impossible de finaliser la création du compte. Réessaie dans un instant.') };

      // ── Step 4: set user state immediately — do NOT wait for onAuthStateChange ──
      // This is the key fix: onAuthStateChange fires before the users row exists
      // (race condition), so we set state here right after the INSERT succeeds.
      const newUser: User = {
        id: data.user.id,
        name,
        email,
        role,
        company: companyId,
      };
      setUser(newUser);

      // ── Step 5: ensure we have an active session ──────────────────────────
      // Supabase returns the session at the root of the signUp response body
      // (not nested under "session"), so data.session may be null even when
      // the account was auto-confirmed. Attempt an explicit signIn as fallback.
      if (!data.session) {
        const isConfirmed = !!(data.user as any).email_confirmed_at;
        if (isConfirmed) {
          // Auto-confirmed but SDK did not surface the session — sign in explicitly.
          const { error: signInError } = await supabase!.auth.signInWithPassword({ email, password });
          if (signInError) {
            // Edge case: confirmed but sign-in failed — ask user to use login screen.
            return { error: 'CONFIRM_EMAIL' };
          }
        } else {
          // Genuine email confirmation required.
          return { error: 'CONFIRM_EMAIL' };
        }
      }

      return {};
    } finally {
      // Always release the guard so onAuthStateChange works normally afterwards.
      isRegistering.current = false;
    }
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
    if (!isDemoMode) {
      // Real Supabase session: never substitute the authenticated user with a
      // fake DEMO_USERS profile (id "u1"…) — the real Supabase Auth session
      // (auth.uid()) does not change, so every RLS-scoped query still runs as
      // the real account. Swapping in a fake id here previously desynced
      // context.user from that session: switching to "BUYER" while actually
      // logged in as a vendor made the Orders tab query orders_customer with
      // the vendor's own uid (which owns none), looking like "the vendor's
      // status update never reflects elsewhere" when really the previewed
      // role just wasn't the account that placed/owns those orders. This is
      // a UI-only role preview — only the `role` field changes, id/email
      // stay real, and RLS still enforces the account's actual DB role.
      if (user) setUser({ ...user, role });
      return;
    }
    const found = DEMO_USERS.find(u => u.role === role);
    if (found) {
      setUser(found);
      AsyncStorage.setItem('bardec_demo_user', JSON.stringify(found));
      return;
    }
    if (user) {
      const overridden: User = { ...user, role };
      setUser(overridden);
      AsyncStorage.setItem('bardec_demo_user', JSON.stringify(overridden));
    }
  }

  return (
    <AuthContext.Provider value={{
      user, isLoading, isAuthenticated: !!user,
      login, register, logout, switchDemoRole, updateUserAvatar, updateUserName, isDemoMode,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEMO_USERS, User, UserRole } from '@/constants/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  switchDemoRole: (role: UserRole) => void;
  isDemoMode: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => ({}),
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
        if (stored) {
          setUser(JSON.parse(stored));
        }
        setIsLoading(false);
        return;
      }

      const { data: { session } } = await supabase!.auth.getSession();
      if (session?.user) {
        const dbUser = await fetchUserProfile(session.user.id);
        setUser(dbUser);
      }
      supabase!.auth.onAuthStateChange(async (event, session) => {
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
    return data as User | null;
  }

  async function login(email: string, password: string): Promise<{ error?: string }> {
    if (isDemoMode) {
      const found = DEMO_USERS.find(u => u.email === email.toLowerCase());
      if (found) {
        setUser(found);
        await AsyncStorage.setItem('bardec_demo_user', JSON.stringify(found));
        return {};
      }
      // Accept any login in demo mode with first user
      const defaultUser = { ...DEMO_USERS[0], email, name: email.split('@')[0] };
      setUser(defaultUser);
      await AsyncStorage.setItem('bardec_demo_user', JSON.stringify(defaultUser));
      return {};
    }

    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  }

  async function logout() {
    if (isDemoMode) {
      await AsyncStorage.removeItem('bardec_demo_user');
      setUser(null);
      return;
    }
    await supabase!.auth.signOut();
    setUser(null);
  }

  function switchDemoRole(role: UserRole) {
    const found = DEMO_USERS.find(u => u.role === role);
    if (found) {
      setUser(found);
      AsyncStorage.setItem('bardec_demo_user', JSON.stringify(found));
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, switchDemoRole, isDemoMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

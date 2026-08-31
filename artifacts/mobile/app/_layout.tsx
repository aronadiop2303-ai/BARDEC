import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { CurrencyProvider } from '@/context/CurrencyContext';
import { CartProvider } from '@/context/CartContext';
import { ProximityCartProvider } from '@/context/ProximityCartContext';
import CustomerOrdersNotifier from '@/components/CustomerOrdersNotifier';
import { useColors } from '@/hooks/useColors';

// On web, expo-splash-screen creates a white overlay that never reliably clears.
// Only use it on native where it controls the OS-level splash screen.
if (Platform.OS !== 'web') {
  try { SplashScreen.preventAutoHideAsync(); } catch { /* ignore */ }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
});

// Strict auth gate: while not authenticated, the (app) group (tabs + every
// screen inside it — product, checkout, proximity, etc.) is never mounted at
// all, not just redirected away from after a flash. Expo Router's
// Stack.Protected excludes unguarded-false screens from the navigator
// entirely (see BUGS.md — this replaces a previous per-tab href-hiding
// scheme that still let a guest reach any tab directly). auth/reset-password
// stays in the "not authenticated" group deliberately — landing on it comes
// from a password-recovery link, not a real login, and must stay reachable;
// AuthContext ignores the transient PASSWORD_RECOVERY session for exactly
// this reason (see fetchUserProfile/onAuthStateChange).
function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useAuth();
  const colors = useColors();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/register" options={{ headerShown: false }} />
        <Stack.Screen name="auth/reset-password" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // Icons use lucide-react-native (SVG) — no Feather TTF font loading needed.
  // Only Inter text fonts need to be loaded here.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // On native: hide the OS splash screen once fonts have resolved.
  // On web:    never block rendering — fonts load in the background and
  //            text falls back to the system font until Inter is ready.
  useEffect(() => {
    if ((fontsLoaded || fontError) && Platform.OS !== 'web') {
      try { SplashScreen.hideAsync(); } catch { /* ignore */ }
    }
  }, [fontsLoaded, fontError]);

  // Block render ONLY on native while the OS splash is still shown.
  // Web must never return null here (fonts block indefinitely in the proxy).
  if (!fontsLoaded && !fontError && Platform.OS !== 'web') return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <LanguageProvider>
                <AuthProvider>
                  <CurrencyProvider>
                    <CartProvider>
                      <ProximityCartProvider>
                        {/* Keeps a Realtime channel open for customer order status
                            changes and fires local notifications app-wide */}
                        <CustomerOrdersNotifier />
                        <RootLayoutNav />
                      </ProximityCartProvider>
                    </CartProvider>
                  </CurrencyProvider>
                </AuthProvider>
              </LanguageProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

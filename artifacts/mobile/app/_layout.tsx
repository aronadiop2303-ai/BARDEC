import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
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
import { AuthProvider } from '@/context/AuthContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { CartProvider } from '@/context/CartContext';
import { ProximityCartProvider } from '@/context/ProximityCartContext';
import CustomerOrdersNotifier from '@/components/CustomerOrdersNotifier';

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

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth/login" options={{ headerShown: false }} />
      <Stack.Screen name="auth/register" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="checkout" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="chat" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="support" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="language" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="unlimited-benefits" options={{ headerShown: false, presentation: 'modal' }} />
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
                  <CartProvider>
                    <ProximityCartProvider>
                      {/* Keeps a Realtime channel open for customer order status
                          changes and fires local notifications app-wide */}
                      <CustomerOrdersNotifier />
                      <RootLayoutNav />
                    </ProximityCartProvider>
                  </CartProvider>
                </AuthProvider>
              </LanguageProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

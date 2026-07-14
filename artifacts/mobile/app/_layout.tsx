import React, { useEffect } from 'react';
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
import * as Font from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from '@/context/AuthContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { CartProvider } from '@/context/CartContext';

SplashScreen.preventAutoHideAsync();

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
      <Stack.Screen name="chat-ai" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="language" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="unlimited-benefits" options={{ headerShown: false, presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    // createIconSet (vendored react-native-vector-icons) picks the font family name
    // differently per platform:
    //   iOS / default → fontFamily arg  = 'feather'  (lowercase)
    //   Android       → fontBasename    = 'Feather'  (TTF filename without extension)
    //
    // We register both names from a local copy to bypass pnpm symlink resolution.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const featherAsset = require('../assets/fonts/Feather.ttf') as number;
    Font.loadAsync({
      feather: featherAsset,   // iOS / default path
      Feather: featherAsset,   // Android path  (fontBasename from filename)
    })
      .then(() =>
        console.log(`[BARDEC] Feather font loaded ✓ (platform: ${Platform.OS})`)
      )
      .catch((e: Error) =>
        console.warn(`[BARDEC] Feather font load FAILED on ${Platform.OS}:`, e.message)
      );
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <LanguageProvider>
                <AuthProvider>
                  <CartProvider>
                    <RootLayoutNav />
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

import React from 'react';
import { Stack } from 'expo-router';

// Everything under app/(app)/ requires an authenticated session — the root
// layout (app/_layout.tsx) only mounts this whole group once isAuthenticated
// is true (Stack.Protected), so no per-screen auth check is needed here.
export default function AppGroupLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="order/[id]" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="checkout" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="chat" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="support" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="addresses" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="language" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="unlimited-benefits" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="proximity/cart" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="proximity/register-shop" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="proximity/shop/[id]" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="proximity/my-orders/index" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="proximity/my-shop/index" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="proximity/my-shop/add-product" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="proximity/my-shop/orders" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="proximity/my-shop/products" options={{ headerShown: false, presentation: 'card' }} />
    </Stack>
  );
}

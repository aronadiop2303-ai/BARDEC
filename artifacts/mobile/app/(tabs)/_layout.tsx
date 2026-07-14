import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

// NOTE: expo-symbols (SF Symbols) is iOS-only and its native module is
// unavailable on Android — importing it crashes the tab layout on Android.
// We use @expo/vector-icons (Feather) everywhere for cross-platform safety.

export default function TabLayout() {
  const colors  = useColors();
  const { totalItems } = useCart();
  const { user } = useAuth();
  const { t }   = useLanguage();
  const isIOS   = Platform.OS === 'ios';
  const isWeb   = Platform.OS === 'web';
  const isVendor = user?.role === 'VENDOR';
  const isAdmin  = user?.role === 'ADMIN';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          height:      isWeb ? 84 : Platform.OS === 'android' ? 62 : 60,
          paddingBottom: isWeb ? 24 : Platform.OS === 'android' ? 6 : 8,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ),
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      {/* CUSTOMER / BUYER / APPROVER tabs */}
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          href: !isVendor && !isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('search'),
          href: !isVendor && !isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="search" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: t('cart'),
          href: !isVendor && !isAdmin ? undefined : null,
          tabBarBadge: totalItems > 0 ? totalItems : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 10 },
          tabBarIcon: ({ color }) => <Feather name="shopping-cart" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t('orders'),
          href: !isVendor && !isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="list" size={22} color={color} />,
        }}
      />

      {/* VENDOR tab */}
      <Tabs.Screen
        name="vendor-dashboard"
        options={{
          title: t('vendor_dashboard'),
          href: isVendor ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />

      {/* ADMIN tab */}
      <Tabs.Screen
        name="admin"
        options={{
          title: t('admin_panel'),
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="shield" size={22} color={color} />,
        }}
      />

      {/* PROFILE — always visible */}
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}

import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem } from '@/constants/mockData';
import { useAuth } from '@/context/AuthContext';

const LEGACY_STORAGE_KEY = 'bardec_cart';
const storageKey = (userId: string) => `bardec_cart:${userId}`;

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addItem: () => {},
  removeItem: () => {},
  updateQuantity: () => {},
  clearCart: () => {},
  totalItems: 0,
  subtotal: 0,
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<CartItem[]>([]);

  // Re-load whenever the signed-in account changes (login/logout/account
  // switch on a shared device) so one account's cart never leaks into another's.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        if (!cancelled) setItems([]);
        return;
      }
      const key = storageKey(userId);
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        if (!cancelled) setItems(JSON.parse(stored));
        return;
      }
      // One-time migration: the cart used to live under one global key shared
      // by every account on the device. Attach whatever is sitting there to
      // the first account that logs in after this deploy, then delete the
      // global key so a second account can never inherit it.
      const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        if (!cancelled) setItems(JSON.parse(legacy));
        await AsyncStorage.setItem(key, legacy);
        await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
      } else if (!cancelled) {
        setItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  function persist(next: CartItem[]) {
    setItems(next);
    if (userId) AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
  }

  function addItem(item: CartItem) {
    setItems(prev => {
      const existing = prev.find(i => i.productId === item.productId);
      let next: CartItem[];
      if (existing) {
        next = prev.map(i =>
          i.productId === item.productId
            ? { ...i, quantity: Math.min(i.quantity + item.quantity, i.maxStock) }
            : i
        );
      } else {
        next = [...prev, item];
      }
      if (userId) AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
      return next;
    });
  }

  function removeItem(productId: string) {
    persist(items.filter(i => i.productId !== productId));
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    persist(items.map(i => i.productId === productId ? { ...i, quantity } : i));
  }

  function clearCart() {
    persist([]);
  }

  // Badge shows number of distinct product lines (not total units).
  // B2B orders can have quantities like 5000 — summing units would make
  // the badge meaningless. Use item count instead.
  const totalItems = items.length;
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}

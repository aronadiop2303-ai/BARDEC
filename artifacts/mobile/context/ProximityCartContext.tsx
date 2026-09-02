import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';

export interface ProximityCartItem {
  productId: string;
  name: string;
  price: number;
  unit: string;
  quantity: number;
  shopId: string;
  shopName: string;
}

/** Minimal shape shared with ProximityOrderItem — used for re-ordering */
export interface ReorderItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
}

interface ProximityCartContextType {
  items: ProximityCartItem[];
  shopId: string | null;
  shopName: string | null;
  addItem: (item: ProximityCartItem) => Promise<{ switched: boolean }>;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  /** Replace the cart with all items from a previous order */
  reorder: (orderItems: ReorderItem[], shopId: string, shopName: string) => void;
  totalItems: number;
  subtotal: number;
}

const ProximityCartContext = createContext<ProximityCartContextType>({
  items: [],
  shopId: null,
  shopName: null,
  addItem: async () => ({ switched: false }),
  removeItem: () => {},
  updateQuantity: () => {},
  clearCart: () => {},
  reorder: () => {},
  totalItems: 0,
  subtotal: 0,
});

const LEGACY_STORAGE_KEY = 'bardec_proximity_cart';
const storageKey = (userId: string) => `bardec_proximity_cart:${userId}`;

export function ProximityCartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<ProximityCartItem[]>([]);

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

  function persist(next: ProximityCartItem[]) {
    setItems(next);
    if (userId) AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
  }

  async function addItem(item: ProximityCartItem): Promise<{ switched: boolean }> {
    let switched = false;
    setItems(prev => {
      // Si articles d'un autre commerce → vider et repartir
      if (prev.length > 0 && prev[0].shopId !== item.shopId) {
        switched = true;
        const next = [{ ...item }];
        if (userId) AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
        return next;
      }
      const existing = prev.find(i => i.productId === item.productId);
      let next: ProximityCartItem[];
      if (existing) {
        next = prev.map(i =>
          i.productId === item.productId
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        );
      } else {
        next = [...prev, { ...item }];
      }
      if (userId) AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
      return next;
    });
    return { switched };
  }

  function removeItem(productId: string) {
    persist(items.filter(i => i.productId !== productId));
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) { removeItem(productId); return; }
    persist(items.map(i => i.productId === productId ? { ...i, quantity } : i));
  }

  function clearCart() { persist([]); }

  function reorder(orderItems: ReorderItem[], sid: string, sName: string) {
    const cartItems: ProximityCartItem[] = orderItems.map(i => ({
      productId: i.product_id,
      name: i.name,
      price: i.unit_price,
      unit: 'unité',
      quantity: i.quantity,
      shopId: sid,
      shopName: sName,
    }));
    persist(cartItems);
  }

  const shopId   = items[0]?.shopId   ?? null;
  const shopName = items[0]?.shopName ?? null;
  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal   = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <ProximityCartContext.Provider
      value={{ items, shopId, shopName, addItem, removeItem, updateQuantity, clearCart, reorder, totalItems, subtotal }}
    >
      {children}
    </ProximityCartContext.Provider>
  );
}

export function useProximityCart() {
  return useContext(ProximityCartContext);
}

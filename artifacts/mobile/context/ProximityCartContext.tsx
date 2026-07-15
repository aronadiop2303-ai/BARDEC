import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ProximityCartItem {
  productId: string;
  name: string;
  price: number;
  unit: string;
  quantity: number;
  shopId: string;
  shopName: string;
}

interface ProximityCartContextType {
  items: ProximityCartItem[];
  shopId: string | null;
  shopName: string | null;
  addItem: (item: ProximityCartItem) => Promise<{ switched: boolean }>;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
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
  totalItems: 0,
  subtotal: 0,
});

const STORAGE_KEY = 'bardec_proximity_cart';

export function ProximityCartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ProximityCartItem[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(stored => {
      if (stored) setItems(JSON.parse(stored));
    });
  }, []);

  function persist(next: ProximityCartItem[]) {
    setItems(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function addItem(item: ProximityCartItem): Promise<{ switched: boolean }> {
    let switched = false;
    setItems(prev => {
      // Si articles d'un autre commerce → vider et repartir
      if (prev.length > 0 && prev[0].shopId !== item.shopId) {
        switched = true;
        const next = [{ ...item }];
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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

  const shopId   = items[0]?.shopId   ?? null;
  const shopName = items[0]?.shopName ?? null;
  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal   = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <ProximityCartContext.Provider
      value={{ items, shopId, shopName, addItem, removeItem, updateQuantity, clearCart, totalItems, subtotal }}
    >
      {children}
    </ProximityCartContext.Provider>
  );
}

export function useProximityCart() {
  return useContext(ProximityCartContext);
}

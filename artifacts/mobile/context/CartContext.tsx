import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem } from '@/constants/mockData';

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
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    AsyncStorage.getItem('bardec_cart').then(stored => {
      if (stored) setItems(JSON.parse(stored));
    });
  }, []);

  function persist(next: CartItem[]) {
    setItems(next);
    AsyncStorage.setItem('bardec_cart', JSON.stringify(next));
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
      AsyncStorage.setItem('bardec_cart', JSON.stringify(next));
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

import React, { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, Text } from 'react-native';
import { useLanguage } from '@/context/LanguageContext';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(-40)).current;
  const { t } = useLanguage();

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Cross-origin fetch (e.g. to google.com) is blocked by CORS in a
      // browser and was previously mistaken for "offline" — use the
      // browser's own connectivity signal instead, no network call needed.
      setIsOffline(!navigator.onLine);
      const goOnline  = () => setIsOffline(false);
      const goOffline = () => setIsOffline(true);
      window.addEventListener('online', goOnline);
      window.addEventListener('offline', goOffline);
      return () => {
        window.removeEventListener('online', goOnline);
        window.removeEventListener('offline', goOffline);
      };
    }

    // Native: CORS doesn't apply, so polling a real endpoint is fine.
    let interval: ReturnType<typeof setInterval>;
    const check = async () => {
      try {
        await fetch('https://www.google.com/favicon.ico', { method: 'HEAD', cache: 'no-store' });
        setIsOffline(false);
      } catch {
        setIsOffline(true);
      }
    };
    check();
    interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOffline ? 0 : -40,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOffline, slideAnim]);

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <Text style={styles.text}>⚡ {t('offline')}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#EF4444',
    paddingVertical: 8,
    alignItems: 'center',
  },
  text: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
});

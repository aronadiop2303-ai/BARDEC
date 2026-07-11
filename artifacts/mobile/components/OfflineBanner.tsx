import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useLanguage } from '@/context/LanguageContext';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(-40)).current;
  const { t } = useLanguage();

  useEffect(() => {
    // Simple connectivity polling via fetch
    let interval: ReturnType<typeof setInterval>;
    const check = async () => {
      try {
        await fetch('https://www.google.com/favicon.ico', { method: 'HEAD', cache: 'no-store' });
        if (isOffline) setIsOffline(false);
      } catch {
        setIsOffline(true);
      }
    };
    check();
    interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [isOffline]);

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

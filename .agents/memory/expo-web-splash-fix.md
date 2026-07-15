---
name: Expo web splash screen / font loading block
description: Why the Expo web preview shows a permanent blank screen and how to fix it.
---

## Rule
Never call `SplashScreen.preventAutoHideAsync()` or gate rendering with `return null` on web.
Gate both calls with `Platform.OS !== 'web'`.

## Why
On Expo Web inside Replit's Metro proxy:
- `SplashScreen.preventAutoHideAsync()` creates a white overlay div that is never reliably cleared.
- `useFonts` from `@expo-google-fonts/*` may hang indefinitely because Metro's asset proxy is slow;
  `fontError` is sometimes never set, so `return null` blocks forever.
- Together, these produce a permanently blank white preview.

## How to apply
In `app/_layout.tsx`:
```tsx
if (Platform.OS !== 'web') {
  try { SplashScreen.preventAutoHideAsync(); } catch {}
}
// ...
useEffect(() => {
  if ((fontsLoaded || fontError) && Platform.OS !== 'web') {
    try { SplashScreen.hideAsync(); } catch {}
  }
}, [fontsLoaded, fontError]);

// Block render ONLY on native; web must never return null here
if (!fontsLoaded && !fontError && Platform.OS !== 'web') return null;
```

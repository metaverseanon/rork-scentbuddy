import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, usePathname } from 'expo-router';
import createContextHook from '@nkzw/create-context-hook';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { useAuth } from '@/providers/AuthProvider';

const LAST_SHOWN_KEY = 'paywall_last_shown_at';
const OPEN_COUNT_KEY = 'paywall_open_count';

const MIN_INTERVAL_MS = 1000 * 60 * 60 * 24 * 2;
const OPENS_BEFORE_FIRST_SHOW = 3;
const OPENS_BETWEEN_SHOWS = 4;

const BLOCKED_PATHS: string[] = [
  '/paywall',
  '/onboarding',
  '/login',
  '/scanner',
];

export const [PaywallPromptProvider, usePaywallPrompt] = createContextHook(() => {
  const router = useRouter();
  const pathname = usePathname();
  const { isPro, rcConfigured, packages, isLoadingOfferings } = useRevenueCat();
  const { session, loading: authLoading } = useAuth();

  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  const isEligible = useCallback(() => {
    if (isPro) return false;
    if (!session) return false;
    if (authLoading) return false;
    if (!rcConfigured) return false;
    if (isLoadingOfferings) return false;
    if (packages.length === 0) return false;
    const current = pathnameRef.current ?? '';
    if (BLOCKED_PATHS.some(p => current.startsWith(p))) return false;
    return true;
  }, [isPro, session, authLoading, rcConfigured, isLoadingOfferings, packages.length]);

  const maybeShow = useCallback(async (trigger: string) => {
    try {
      if (!isEligible()) {
        console.log('[PaywallPrompt] Not eligible, skipping (trigger:', trigger, ')');
        return false;
      }

      const lastShownRaw = await AsyncStorage.getItem(LAST_SHOWN_KEY);
      const lastShown = lastShownRaw ? parseInt(lastShownRaw, 10) : 0;
      const now = Date.now();
      if (lastShown && now - lastShown < MIN_INTERVAL_MS) {
        console.log('[PaywallPrompt] Too soon since last shown, skipping');
        return false;
      }

      const countRaw = await AsyncStorage.getItem(OPEN_COUNT_KEY);
      const count = countRaw ? parseInt(countRaw, 10) : 0;
      const nextCount = count + 1;
      await AsyncStorage.setItem(OPEN_COUNT_KEY, String(nextCount));

      const threshold = lastShown === 0 ? OPENS_BEFORE_FIRST_SHOW : OPENS_BETWEEN_SHOWS;
      if (nextCount < threshold) {
        console.log('[PaywallPrompt] Open count', nextCount, '/', threshold, '- not showing yet');
        return false;
      }

      await AsyncStorage.setItem(OPEN_COUNT_KEY, '0');
      await AsyncStorage.setItem(LAST_SHOWN_KEY, String(now));
      console.log('[PaywallPrompt] Showing paywall (trigger:', trigger, ')');
      router.push('/paywall');
      return true;
    } catch (e) {
      console.log('[PaywallPrompt] Error:', e);
      return false;
    }
  }, [isEligible, router]);

  const didMountCheckRef = useRef(false);
  useEffect(() => {
    if (didMountCheckRef.current) return;
    if (authLoading) return;
    if (isLoadingOfferings) return;
    didMountCheckRef.current = true;
    const t = setTimeout(() => { void maybeShow('app-start'); }, 2500);
    return () => clearTimeout(t);
  }, [authLoading, isLoadingOfferings, maybeShow]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const lastStateRef = { current: AppState.currentState };
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = lastStateRef.current;
      lastStateRef.current = next;
      if ((prev === 'background' || prev === 'inactive') && next === 'active') {
        void maybeShow('app-foreground');
      }
    });
    return () => sub.remove();
  }, [maybeShow]);

  return useMemo(() => ({
    showPaywallIfEligible: () => maybeShow('manual'),
    openPaywall: () => router.push('/paywall'),
  }), [maybeShow, router]);
});

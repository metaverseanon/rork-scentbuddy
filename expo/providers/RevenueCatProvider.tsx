import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesOfferings,
  PurchasesPackage,
  LOG_LEVEL,
} from 'react-native-purchases';
import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/AuthProvider';
import { TikTokEvents } from '@/lib/tiktok';
import { AppsFlyerEvents } from '@/lib/appsflyer';

const FALLBACK_REVENUECAT_TEST_API_KEY = 'test_dZlhOfaQUxxuEKpMZbEqFSWghPI';
const FALLBACK_REVENUECAT_IOS_API_KEY = 'appl_TvsAKMkYQfMJDMqwtpCEkjnpcOX';
const FALLBACK_REVENUECAT_ANDROID_API_KEY = 'goog_FzEZEzeLBArDzvqfBnQfGnzbeDj';

function getRCApiKey(): string {
  const testKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY || FALLBACK_REVENUECAT_TEST_API_KEY;
  if (__DEV__ || Platform.OS === 'web') return testKey;

  const platformKey = Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || FALLBACK_REVENUECAT_IOS_API_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || FALLBACK_REVENUECAT_ANDROID_API_KEY,
    default: testKey,
  });

  return platformKey ?? testKey;
}

const RC_API_KEY = getRCApiKey();
const ENTITLEMENT_ID = 'Scent Buddy Pro';
const CONFIGURATION_POLL_MS = 250;
const CONFIGURATION_MAX_ATTEMPTS = 32;

let rcConfigureStarted = false;
let rcConfigured = false;
let rcConfigurationError: string | null = null;

function maskKey(key: string): string {
  if (!key) return 'missing';
  return `${key.slice(0, 12)}...${key.slice(-4)}`;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown RevenueCat error';
  }
}

function nativePurchasesAvailable(): boolean {
  if (Platform.OS === 'web') return true;
  return Boolean(NativeModules.RNPurchases);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function startRevenueCatConfiguration(appUserID?: string): boolean {
  if (rcConfigured || rcConfigureStarted) return true;
  if (!RC_API_KEY) {
    rcConfigurationError = 'Missing RevenueCat production API key';
    console.log('[RevenueCat] Missing API key for platform:', Platform.OS, 'dev:', __DEV__);
    return false;
  }
  if (!nativePurchasesAvailable()) {
    rcConfigurationError = 'RevenueCat native module is missing from this build';
    console.log('[RevenueCat] Native module missing. Platform:', Platform.OS, 'native modules:', Object.keys(NativeModules).filter(key => key.toLowerCase().includes('purchase')));
    return false;
  }

  try {
    void Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
    const config = appUserID
      ? { apiKey: RC_API_KEY, appUserID, shouldShowInAppMessagesAutomatically: false }
      : { apiKey: RC_API_KEY, shouldShowInAppMessagesAutomatically: false };
    Purchases.configure(config);
    rcConfigureStarted = true;
    rcConfigurationError = null;
    console.log('[RevenueCat] Configure started with key:', maskKey(RC_API_KEY), 'platform:', Platform.OS, 'dev:', __DEV__, 'hasUser:', Boolean(appUserID));
    return true;
  } catch (error) {
    rcConfigureStarted = false;
    rcConfigured = false;
    rcConfigurationError = normalizeError(error);
    console.log('[RevenueCat] Configuration threw:', rcConfigurationError);
    return false;
  }
}

async function ensureRevenueCatConfigured(appUserID?: string): Promise<boolean> {
  if (rcConfigured) return true;
  if (!startRevenueCatConfiguration(appUserID)) return false;

  for (let attempt = 1; attempt <= CONFIGURATION_MAX_ATTEMPTS; attempt += 1) {
    try {
      const configured = await Purchases.isConfigured();
      console.log('[RevenueCat] isConfigured check:', configured, 'attempt:', attempt);
      if (configured) {
        rcConfigured = true;
        rcConfigurationError = null;
        return true;
      }
    } catch (error) {
      rcConfigurationError = normalizeError(error);
      console.log('[RevenueCat] isConfigured error:', rcConfigurationError, 'attempt:', attempt);
    }
    await sleep(CONFIGURATION_POLL_MS);
  }

  rcConfigurationError = rcConfigurationError ?? 'RevenueCat did not finish configuring in time';
  console.log('[RevenueCat] Configure timed out:', rcConfigurationError);
  return false;
}

function selectOffering(offerings: PurchasesOfferings): PurchasesOffering | null {
  if (offerings.current?.availablePackages?.length) return offerings.current;
  const allOfferings = Object.values(offerings.all);
  const firstWithPackages = allOfferings.find(offering => offering.availablePackages.length > 0);
  if (firstWithPackages) {
    console.log('[RevenueCat] Using fallback offering:', firstWithPackages.identifier);
    return firstWithPackages;
  }
  return offerings.current ?? allOfferings[0] ?? null;
}

function hasProEntitlement(info: CustomerInfo | null): boolean {
  if (!info) return false;
  return typeof info.entitlements.active[ENTITLEMENT_ID] !== 'undefined';
}

export const [RevenueCatProvider, useRevenueCat] = createContextHook(() => {
  const { user, updateProfile } = useAuth();
  const queryClient = useQueryClient();
  const [isPro, setIsPro] = useState<boolean>(false);
  const [configured, setConfigured] = useState<boolean>(rcConfigured);
  const [configurationError, setConfigurationError] = useState<string | null>(rcConfigurationError);
  const [isInitializing, setIsInitializing] = useState<boolean>(!rcConfigured);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setIsInitializing(true);
      const ok = await ensureRevenueCatConfigured(user?.id);
      if (cancelled) return;
      setConfigured(ok);
      setConfigurationError(rcConfigurationError);
      setIsInitializing(false);
      if (ok) {
        console.log('[RevenueCat] Configure confirmed');
        void queryClient.invalidateQueries({ queryKey: ['rc-offerings'] });
        void queryClient.invalidateQueries({ queryKey: ['rc-customer-info'] });
      } else {
        console.log('[RevenueCat] Configure failed:', rcConfigurationError);
      }
    };
    void init();
    return () => { cancelled = true; };
  }, [queryClient, user?.id]);

  const customerInfoQuery = useQuery({
    queryKey: ['rc-customer-info'],
    queryFn: async () => {
      const ok = await ensureRevenueCatConfigured(user?.id);
      if (!ok) {
        console.log('[RevenueCat] Customer info skipped, not configured:', rcConfigurationError);
        return null;
      }
      try {
        const info = await Purchases.getCustomerInfo();
        console.log('[RevenueCat] Customer info fetched. Active entitlements:', Object.keys(info.entitlements.active));
        return info;
      } catch (error) {
        console.log('[RevenueCat] Error fetching customer info:', normalizeError(error));
        return null;
      }
    },
    staleTime: 1000 * 60 * 5,
    enabled: configured,
  });

  const offeringsQuery = useQuery({
    queryKey: ['rc-offerings'],
    queryFn: async () => {
      const ok = await ensureRevenueCatConfigured(user?.id);
      if (!ok) {
        console.log('[RevenueCat] Offerings skipped, not configured:', rcConfigurationError);
        return null;
      }
      const offerings = await Purchases.getOfferings();
      const current = selectOffering(offerings);
      console.log('[RevenueCat] Offerings fetched. Current:', offerings.current?.identifier, 'selected:', current?.identifier, 'all:', Object.keys(offerings.all));
      if (current) {
        console.log('[RevenueCat] Available packages:', current.availablePackages.map(pkg => `${pkg.identifier}:${pkg.product.identifier}:${pkg.product.priceString}`).join(', '));
      } else {
        console.log('[RevenueCat] No offerings available from RevenueCat');
      }
      return current ? { ...offerings, current } : offerings;
    },
    staleTime: 1000 * 60 * 5,
    retry: 5,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
    enabled: configured,
    refetchOnWindowFocus: false,
  });

  const loggedInUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (!configured || !user?.id) return;
    if (loggedInUserRef.current === user.id) return;
    let cancelled = false;
    const loginToRC = async () => {
      try {
        const ok = await ensureRevenueCatConfigured(user.id);
        if (!ok) return;
        const { customerInfo } = await Purchases.logIn(user.id);
        if (!cancelled) {
          loggedInUserRef.current = user.id;
          console.log('[RevenueCat] Logged in as:', user.id);
          queryClient.setQueryData(['rc-customer-info'], customerInfo);
          void queryClient.invalidateQueries({ queryKey: ['rc-offerings'] });
        }
      } catch (error) {
        if (!cancelled) {
          console.log('[RevenueCat] Login error:', normalizeError(error));
        }
      }
    };
    void loginToRC();
    return () => { cancelled = true; };
  }, [configured, user?.id, queryClient]);

  useEffect(() => {
    if (!configured) return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        console.log('[RevenueCat] App became active, refreshing offerings & customer info');
        void queryClient.invalidateQueries({ queryKey: ['rc-offerings'] });
        void queryClient.invalidateQueries({ queryKey: ['rc-customer-info'] });
      }
    });
    return () => sub.remove();
  }, [configured, queryClient]);

  useEffect(() => {
    if (!configured) return;
    let removed = false;
    const customerInfoListener = (info: CustomerInfo) => {
      if (removed) return;
      console.log('[RevenueCat] Customer info updated via listener. Active entitlements:', Object.keys(info.entitlements.active));
      queryClient.setQueryData(['rc-customer-info'], info);
    };
    Purchases.addCustomerInfoUpdateListener(customerInfoListener);
    return () => {
      removed = true;
      try {
        Purchases.removeCustomerInfoUpdateListener(customerInfoListener);
      } catch (error) {
        console.log('[RevenueCat] Listener cleanup error:', normalizeError(error));
      }
    };
  }, [configured, queryClient]);

  useEffect(() => {
    const active = hasProEntitlement(customerInfoQuery.data ?? null);
    console.log('[RevenueCat] Has Pro entitlement:', active);
    setIsPro(active);
  }, [customerInfoQuery.data]);

  useEffect(() => {
    if (user?.id && isPro) {
      updateProfile({ is_pro: true }).catch(error =>
        console.log('[RevenueCat] Failed to sync pro status to profile:', normalizeError(error))
      );
    }
  }, [isPro, user?.id, updateProfile]);

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      const ok = await ensureRevenueCatConfigured(user?.id);
      setConfigured(ok);
      setConfigurationError(rcConfigurationError);
      if (!ok) throw new Error(rcConfigurationError ?? 'Subscription service is unavailable. Please update the app and try again.');
      console.log('[RevenueCat] Purchasing package:', pkg.identifier, 'product:', pkg.product.identifier, 'price:', pkg.product.priceString);
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      try {
        const price = pkg.product.price;
        const currency = pkg.product.currencyCode ?? 'USD';
        const productId = pkg.product.identifier;
        const isTrial = !!pkg.product.introPrice && pkg.product.introPrice.price === 0;
        if (user?.id) {
          if (isTrial) {
            void TikTokEvents.startTrial(user.id, price, currency, productId);
            void AppsFlyerEvents.startTrial(user.id, price, currency, productId);
          } else {
            void TikTokEvents.subscribe(user.id, price, currency, productId);
            void AppsFlyerEvents.subscribe(user.id, price, currency, productId);
          }
          void TikTokEvents.purchase(user.id, price, currency, productId);
          void AppsFlyerEvents.purchase(user.id, price, currency, productId);
        }
      } catch (error) {
        console.log('[RevenueCat] TikTok/AppsFlyer track error:', normalizeError(error));
      }
      return customerInfo;
    },
    onSuccess: info => {
      queryClient.setQueryData(['rc-customer-info'], info);
      setIsPro(hasProEntitlement(info));
      console.log('[RevenueCat] Purchase successful. Active entitlements:', Object.keys(info.entitlements.active));
    },
    onError: (error: any) => {
      if (error?.userCancelled) {
        console.log('[RevenueCat] Purchase cancelled by user');
      } else {
        console.log('[RevenueCat] Purchase error:', normalizeError(error));
      }
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const ok = await ensureRevenueCatConfigured(user?.id);
      setConfigured(ok);
      setConfigurationError(rcConfigurationError);
      if (!ok) throw new Error(rcConfigurationError ?? 'Subscription service is unavailable. Please update the app and try again.');
      console.log('[RevenueCat] Restoring purchases...');
      return Purchases.restorePurchases();
    },
    onSuccess: info => {
      queryClient.setQueryData(['rc-customer-info'], info);
      setIsPro(hasProEntitlement(info));
      console.log('[RevenueCat] Restore successful. Active entitlements:', Object.keys(info.entitlements.active));
    },
    onError: (error: any) => {
      console.log('[RevenueCat] Restore error:', normalizeError(error));
    },
  });

  const currentOffering = offeringsQuery.data?.current ?? null;

  const refetchOfferings = useCallback(async () => {
    console.log('[RevenueCat] Manually refetching offerings...');
    const ok = await ensureRevenueCatConfigured(user?.id);
    setConfigured(ok);
    setConfigurationError(rcConfigurationError);
    if (ok) {
      await queryClient.invalidateQueries({ queryKey: ['rc-offerings'] });
    }
  }, [queryClient, user?.id]);

  const refreshCustomerInfo = useCallback(async () => {
    const ok = await ensureRevenueCatConfigured(user?.id);
    setConfigured(ok);
    setConfigurationError(rcConfigurationError);
    if (ok) {
      await queryClient.invalidateQueries({ queryKey: ['rc-customer-info'] });
    }
  }, [queryClient, user?.id]);

  return useMemo(() => ({
    isPro,
    customerInfo: customerInfoQuery.data ?? null,
    currentOffering,
    packages: currentOffering?.availablePackages ?? [],
    isLoadingOfferings: isInitializing || offeringsQuery.isLoading || offeringsQuery.isFetching,
    isLoadingCustomerInfo: customerInfoQuery.isLoading,
    purchasePackage: purchaseMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    purchaseError: purchaseMutation.error,
    restorePurchases: restoreMutation.mutateAsync,
    isRestoring: restoreMutation.isPending,
    restoreError: restoreMutation.error,
    rcConfigured: configured,
    rcConfigurationError: configurationError,
    refetchOfferings,
    refreshCustomerInfo,
  }), [
    isPro,
    configured,
    configurationError,
    isInitializing,
    customerInfoQuery.data,
    customerInfoQuery.isLoading,
    currentOffering,
    offeringsQuery.isLoading,
    offeringsQuery.isFetching,
    refetchOfferings,
    refreshCustomerInfo,
    purchaseMutation.mutateAsync,
    purchaseMutation.isPending,
    purchaseMutation.error,
    restoreMutation.mutateAsync,
    restoreMutation.isPending,
    restoreMutation.error,
  ]);
});

void startRevenueCatConfiguration();

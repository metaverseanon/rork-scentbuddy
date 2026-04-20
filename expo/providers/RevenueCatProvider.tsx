import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
  LOG_LEVEL,
} from 'react-native-purchases';
import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/AuthProvider';

function getRCApiKey(): string {
  if (__DEV__ || Platform.OS === 'web') {
    return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ?? '';
  }
  return Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    default: process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY,
  }) ?? '';
}

const RC_API_KEY = getRCApiKey();
const ENTITLEMENT_ID = 'Scent Buddy Pro';

let rcConfigured = false;

if (RC_API_KEY) {
  try {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey: RC_API_KEY });
    rcConfigured = true;
    console.log('[RevenueCat] Configured with key:', RC_API_KEY.substring(0, 12) + '...');
  } catch (e) {
    console.log('[RevenueCat] Configuration error:', e);
  }
} else {
  console.log('[RevenueCat] No API key found, skipping configuration');
}

export const [RevenueCatProvider, useRevenueCat] = createContextHook(() => {
  const { user, updateProfile } = useAuth();
  const queryClient = useQueryClient();
  const [isPro, setIsPro] = useState(false);

  const customerInfoQuery = useQuery({
    queryKey: ['rc-customer-info'],
    queryFn: async () => {
      if (!rcConfigured) return null;
      try {
        const info = await Purchases.getCustomerInfo();
        console.log('[RevenueCat] Customer info fetched:', JSON.stringify(info.entitlements.active));
        return info;
      } catch (e) {
        console.log('[RevenueCat] Error fetching customer info:', e);
        return null;
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  const offeringsQuery = useQuery({
    queryKey: ['rc-offerings'],
    queryFn: async () => {
      if (!rcConfigured) {
        console.log('[RevenueCat] Not configured, skipping offerings fetch');
        return null;
      }
      try {
        const offerings = await Purchases.getOfferings();
        console.log('[RevenueCat] Offerings fetched. Current:', offerings.current?.identifier);
        console.log('[RevenueCat] All offering keys:', Object.keys(offerings.all));
        if (offerings.current) {
          console.log('[RevenueCat] Available packages:', offerings.current.availablePackages.map(p => p.identifier));
        } else {
          console.log('[RevenueCat] WARNING: No current offering set in RevenueCat dashboard!');
          const allKeys = Object.keys(offerings.all);
          if (allKeys.length > 0) {
            console.log('[RevenueCat] Found non-current offerings:', allKeys, '- using first one as fallback');
            return { ...offerings, current: offerings.all[allKeys[0]] };
          }
        }
        return offerings;
      } catch (e) {
        console.log('[RevenueCat] Error fetching offerings:', e);
        throw e;
      }
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
    retryDelay: 2000,
    enabled: rcConfigured,
  });

  useEffect(() => {
    if (!rcConfigured || !user?.id) return;
    let cancelled = false;
    const loginToRC = async () => {
      try {
        const { customerInfo } = await Purchases.logIn(user.id);
        if (!cancelled) {
          console.log('[RevenueCat] Logged in as:', user.id);
          queryClient.setQueryData(['rc-customer-info'], customerInfo);
        }
      } catch (e) {
        if (!cancelled) {
          console.log('[RevenueCat] Login error:', e);
        }
      }
    };
    void loginToRC();
    return () => { cancelled = true; };
  }, [user?.id, queryClient]);

  useEffect(() => {
    if (!rcConfigured) return;
    let removed = false;
    const listener = Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
      if (removed) return;
      console.log('[RevenueCat] Customer info updated via listener');
      queryClient.setQueryData(['rc-customer-info'], info);
    });
    return () => {
      removed = true;
      try {
        listener.remove();
      } catch (e) {
        console.log('[RevenueCat] Listener cleanup error (safe to ignore):', e);
      }
    };
  }, [queryClient]);

  useEffect(() => {
    const info = customerInfoQuery.data;
    if (!info) {
      setIsPro(false);
      return;
    }
    const hasEntitlement = typeof info.entitlements.active[ENTITLEMENT_ID] !== 'undefined';
    console.log('[RevenueCat] Has Pro entitlement:', hasEntitlement);
    setIsPro(hasEntitlement);
  }, [customerInfoQuery.data]);

  useEffect(() => {
    if (user?.id && isPro) {
      updateProfile({ is_pro: true }).catch((e) =>
        console.log('[RevenueCat] Failed to sync pro status to profile:', e)
      );
    }
  }, [isPro, user?.id, updateProfile]);

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      if (!rcConfigured) throw new Error('RevenueCat not configured');
      console.log('[RevenueCat] Purchasing package:', pkg.identifier);
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    },
    onSuccess: (info) => {
      queryClient.setQueryData(['rc-customer-info'], info);
      console.log('[RevenueCat] Purchase successful');
    },
    onError: (error: any) => {
      if (error.userCancelled) {
        console.log('[RevenueCat] Purchase cancelled by user');
      } else {
        console.log('[RevenueCat] Purchase error:', error.message);
      }
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!rcConfigured) throw new Error('RevenueCat not configured');
      console.log('[RevenueCat] Restoring purchases...');
      const info = await Purchases.restorePurchases();
      return info;
    },
    onSuccess: (info) => {
      queryClient.setQueryData(['rc-customer-info'], info);
      console.log('[RevenueCat] Restore successful');
    },
    onError: (error: any) => {
      console.log('[RevenueCat] Restore error:', error.message);
    },
  });

  const currentOffering = offeringsQuery.data?.current ?? null;

  const refetchOfferings = useCallback(() => {
    console.log('[RevenueCat] Manually refetching offerings...');
    return queryClient.invalidateQueries({ queryKey: ['rc-offerings'] });
  }, [queryClient]);

  return useMemo(() => ({
    isPro,
    customerInfo: customerInfoQuery.data ?? null,
    currentOffering,
    packages: currentOffering?.availablePackages ?? [],
    isLoadingOfferings: offeringsQuery.isLoading || offeringsQuery.isFetching,
    isLoadingCustomerInfo: customerInfoQuery.isLoading,
    purchasePackage: purchaseMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    purchaseError: purchaseMutation.error,
    restorePurchases: restoreMutation.mutateAsync,
    isRestoring: restoreMutation.isPending,
    restoreError: restoreMutation.error,
    rcConfigured,
    refetchOfferings,
    refreshCustomerInfo: () => queryClient.invalidateQueries({ queryKey: ['rc-customer-info'] }),
  }), [
    isPro,
    customerInfoQuery.data,
    customerInfoQuery.isLoading,
    currentOffering,
    offeringsQuery.isLoading,
    offeringsQuery.isFetching,
    refetchOfferings,
    purchaseMutation.mutateAsync,
    purchaseMutation.isPending,
    purchaseMutation.error,
    restoreMutation.mutateAsync,
    restoreMutation.isPending,
    restoreMutation.error,
    queryClient,
  ]);
});

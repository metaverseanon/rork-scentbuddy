import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const INSTALL_TRACKED_KEY = 'tiktok_install_tracked_v1';

type TikTokEventName =
  | 'CompleteRegistration'
  | 'Login'
  | 'CompletePayment'
  | 'Subscribe'
  | 'StartTrial'
  | 'InitiateCheckout'
  | 'ViewContent'
  | 'AddToWishlist'
  | 'Search'
  | 'Contact'
  | 'Purchase'
  | string;

type TikTokUser = {
  external_id?: string;
  email?: string;
  phone?: string;
  idfa?: string;
  idfv?: string;
  gaid?: string;
  ttclid?: string;
  ttp?: string;
};

type TikTokProperties = {
  value?: number;
  currency?: string;
  content_id?: string;
  content_type?: string;
  description?: string;
  [k: string]: unknown;
};

type TrackOptions = {
  event: TikTokEventName;
  user?: TikTokUser;
  properties?: TikTokProperties;
  eventId?: string;
};

function makeEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function collectDeviceIds(): Promise<Pick<TikTokUser, 'idfv'>> {
  const out: Pick<TikTokUser, 'idfv'> = {};
  try {
    if (Platform.OS === 'ios') {
      const idfv = await Application.getIosIdForVendorAsync();
      if (idfv) out.idfv = idfv;
    }
  } catch (e) {
    console.log('[TikTok] Failed to collect device ids:', e);
  }
  return out;
}

export async function trackTikTokEvent(opts: TrackOptions): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[TikTok] Skipping event on web:', opts.event);
    return;
  }
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    const deviceIds = await collectDeviceIds();

    const payload = {
      event: opts.event,
      event_id: opts.eventId ?? makeEventId(),
      platform: Platform.OS,
      app_version:
        (Constants.expoConfig?.version as string | undefined) ??
        Application.nativeApplicationVersion ??
        undefined,
      os_version: String(Platform.Version ?? ''),
      user: {
        external_id: opts.user?.external_id ?? user?.id,
        email: opts.user?.email ?? user?.email,
        ...deviceIds,
        ...opts.user,
      },
      properties: opts.properties ?? {},
    };

    console.log('[TikTok] Tracking event:', opts.event, payload.event_id);

    const { data, error } = await supabase.functions.invoke('tiktok-track-event', {
      body: payload,
    });

    if (error) {
      console.log('[TikTok] Function invoke error:', error);
      return;
    }
    if (data && (data as { success?: boolean }).success === false) {
      console.log('[TikTok] Track failed:', data);
      return;
    }
    console.log('[TikTok] Event tracked:', opts.event);
  } catch (e) {
    console.log('[TikTok] Track error:', e);
  }
}

export const TikTokEvents = {
  registration: (userId: string, email?: string) =>
    trackTikTokEvent({
      event: 'CompleteRegistration',
      user: { external_id: userId, email },
    }),
  login: (userId: string, email?: string) =>
    trackTikTokEvent({
      event: 'Login',
      user: { external_id: userId, email },
    }),
  startTrial: (userId: string, value: number, currency: string, productId: string) =>
    trackTikTokEvent({
      event: 'StartTrial',
      user: { external_id: userId },
      properties: { value, currency, content_id: productId, content_type: 'product' },
    }),
  subscribe: (userId: string, value: number, currency: string, productId: string) =>
    trackTikTokEvent({
      event: 'Subscribe',
      user: { external_id: userId },
      properties: { value, currency, content_id: productId, content_type: 'product' },
    }),
  purchase: (userId: string, value: number, currency: string, productId: string) =>
    trackTikTokEvent({
      event: 'CompletePayment',
      user: { external_id: userId },
      properties: { value, currency, content_id: productId, content_type: 'product' },
    }),
  launchApp: () => trackTikTokEvent({ event: 'LaunchAPP' }),
  install: () => trackTikTokEvent({ event: 'InstallApp' }),
};

export async function trackAppOpen(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const alreadyInstalled = await AsyncStorage.getItem(INSTALL_TRACKED_KEY);
    if (!alreadyInstalled) {
      await TikTokEvents.install();
      await AsyncStorage.setItem(INSTALL_TRACKED_KEY, '1');
    }
    await TikTokEvents.launchApp();
  } catch (e) {
    console.log('[TikTok] trackAppOpen error:', e);
  }
}

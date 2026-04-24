import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const INSTALL_TRACKED_KEY = 'appsflyer_install_tracked_v1';
const APPSFLYER_ID_KEY = 'appsflyer_device_id_v1';

type AppsFlyerEventName =
  | 'af_login'
  | 'af_complete_registration'
  | 'af_purchase'
  | 'af_subscribe'
  | 'af_start_trial'
  | 'af_initiated_checkout'
  | 'af_content_view'
  | 'af_add_to_wishlist'
  | 'af_search'
  | 'af_app_open'
  | 'af_install'
  | string;

type AppsFlyerUser = {
  external_id?: string;
  email?: string;
  appsflyer_id?: string;
  idfa?: string;
  idfv?: string;
  advertising_id?: string;
};

type AppsFlyerProperties = {
  value?: number;
  currency?: string;
  content_id?: string;
  content_type?: string;
  [k: string]: unknown;
};

type TrackOptions = {
  event: AppsFlyerEventName;
  user?: AppsFlyerUser;
  properties?: AppsFlyerProperties;
  eventId?: string;
};

function makeEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeUuid(): string {
  try {
    const g = (globalThis as { crypto?: Crypto }).crypto;
    if (g && typeof g.randomUUID === 'function') return g.randomUUID();
  } catch {
    // ignore
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getOrCreateAppsFlyerId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(APPSFLYER_ID_KEY);
    if (existing) return existing;
    const fresh = makeUuid();
    await AsyncStorage.setItem(APPSFLYER_ID_KEY, fresh);
    return fresh;
  } catch (e) {
    console.log('[AppsFlyer] Failed to get/create id:', e);
    return makeUuid();
  }
}

async function collectDeviceIds(): Promise<Pick<AppsFlyerUser, 'idfv' | 'appsflyer_id'>> {
  const out: Pick<AppsFlyerUser, 'idfv' | 'appsflyer_id'> = {};
  try {
    if (Platform.OS === 'ios') {
      const idfv = await Application.getIosIdForVendorAsync();
      if (idfv) out.idfv = idfv;
    }
  } catch (e) {
    console.log('[AppsFlyer] Failed to collect device ids:', e);
  }
  out.appsflyer_id = await getOrCreateAppsFlyerId();
  return out;
}

export async function trackAppsFlyerEvent(opts: TrackOptions): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[AppsFlyer] Skipping event on web:', opts.event);
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

    console.log('[AppsFlyer] Tracking event:', opts.event, payload.event_id);

    const { data, error } = await supabase.functions.invoke('appsflyer-track-event', {
      body: payload,
    });

    if (error) {
      console.log('[AppsFlyer] Function invoke error:', error);
      return;
    }
    if (data && (data as { success?: boolean }).success === false) {
      console.log('[AppsFlyer] Track failed:', data);
      return;
    }
    console.log('[AppsFlyer] Event tracked:', opts.event);
  } catch (e) {
    console.log('[AppsFlyer] Track error:', e);
  }
}

export const AppsFlyerEvents = {
  registration: (userId: string, email?: string) =>
    trackAppsFlyerEvent({
      event: 'af_complete_registration',
      user: { external_id: userId, email },
    }),
  login: (userId: string, email?: string) =>
    trackAppsFlyerEvent({
      event: 'af_login',
      user: { external_id: userId, email },
    }),
  startTrial: (userId: string, value: number, currency: string, productId: string) =>
    trackAppsFlyerEvent({
      event: 'af_start_trial',
      user: { external_id: userId },
      properties: { value, currency, content_id: productId, content_type: 'product' },
    }),
  subscribe: (userId: string, value: number, currency: string, productId: string) =>
    trackAppsFlyerEvent({
      event: 'af_subscribe',
      user: { external_id: userId },
      properties: { value, currency, content_id: productId, content_type: 'product' },
    }),
  purchase: (userId: string, value: number, currency: string, productId: string) =>
    trackAppsFlyerEvent({
      event: 'af_purchase',
      user: { external_id: userId },
      properties: { value, currency, content_id: productId, content_type: 'product' },
    }),
  appOpen: () => trackAppsFlyerEvent({ event: 'af_app_open' }),
  install: () => trackAppsFlyerEvent({ event: 'af_install' }),
};

export async function trackAppsFlyerAppOpen(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const alreadyInstalled = await AsyncStorage.getItem(INSTALL_TRACKED_KEY);
    if (!alreadyInstalled) {
      await AppsFlyerEvents.install();
      await AsyncStorage.setItem(INSTALL_TRACKED_KEY, '1');
    }
    await AppsFlyerEvents.appOpen();
  } catch (e) {
    console.log('[AppsFlyer] trackAppOpen error:', e);
  }
}

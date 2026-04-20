import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Platform, AppState } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/lib/supabase';

const NOTIFICATION_SETTINGS_KEY = 'scentbuddy_notification_settings';
const DIARY_REMINDER_ID = 'diary-daily-reminder';
const STREAK_REMINDER_ID = 'streak-morning-reminder';
const WEEKLY_RECAP_ID = 'weekly-recap-reminder';
const FORGOTTEN_BOTTLES_ID = 'forgotten-bottles-reminder';
const PUSH_TOKEN_KEY = 'scentbuddy_push_token';
const MILESTONE_CHECK_KEY = 'scentbuddy_last_milestone_count';
const GOAL_CHECK_KEY = 'scentbuddy_last_goal_check';
const QUIZ_FOLLOWUP_KEY = 'scentbuddy_last_quiz_followup';

export interface NotificationSettings {
  sniffAlerts: boolean;
  followAlerts: boolean;
  diaryReminder: boolean;
  goalReminders: boolean;
  collectionMilestones: boolean;
  streakReminders: boolean;
  forgottenBottles: boolean;
  weeklyRecap: boolean;
  quizFollowUps: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  sniffAlerts: true,
  followAlerts: true,
  diaryReminder: true,
  goalReminders: true,
  collectionMilestones: true,
  streakReminders: true,
  forgottenBottles: true,
  weeklyRecap: true,
  quizFollowUps: true,
};

let Notifications: typeof import('expo-notifications') | null = null;
try {
  if (Platform.OS !== 'web') {
    Notifications = require('expo-notifications');
    Notifications!.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    console.log('[PUSH] expo-notifications loaded successfully');
  }
} catch (e) {
  console.log('[PUSH] Failed to load expo-notifications:', e);
  Notifications = null;
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications) {
    console.log('[PUSH] Not supported on web');
    return null;
  }

  let isPhysicalDevice = true;
  try {
    const Device = require('expo-device');
    isPhysicalDevice = Device.isDevice;
    console.log('[PUSH] Device.isDevice:', isPhysicalDevice, 'deviceType:', Device.deviceType);
  } catch {
    console.log('[PUSH] expo-device not available, assuming physical device');
  }

  if (!isPhysicalDevice) {
    console.log('[PUSH] Simulator detected, skipping push registration');
    return null;
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#c49a6c',
      });
      console.log('[PUSH] Android notification channel created');
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('[PUSH] Current permission status:', existingStatus);
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('[PUSH] Requested permission, result:', finalStatus);
    }

    if (finalStatus !== 'granted') {
      console.log('[PUSH] Permission denied, final status:', finalStatus);
      return null;
    }

    let projectId: string | undefined;
    try {
      const Constants = require('expo-constants');
      projectId = Constants.default?.easConfig?.projectId
        ?? Constants.default?.expoConfig?.extra?.eas?.projectId
        ?? undefined;
      console.log('[PUSH] EAS projectId from Constants:', projectId);
    } catch {
      console.log('[PUSH] expo-constants not available');
    }

    if (!projectId) {
      projectId = process.env.EXPO_PUBLIC_PROJECT_ID ?? undefined;
      console.log('[PUSH] Using EXPO_PUBLIC_PROJECT_ID:', projectId);
    }

    if (!projectId) {
      console.log('[PUSH] ERROR: No projectId available - push token cannot be generated');
      return null;
    }

    console.log('[PUSH] Requesting Expo push token with projectId:', projectId);

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    console.log('[PUSH] Token obtained:', tokenData.data);

    if (!tokenData.data || !tokenData.data.startsWith('ExponentPushToken[')) {
      console.log('[PUSH] WARNING: Token format unexpected:', tokenData.data);
    }

    return tokenData.data;
  } catch (error: any) {
    console.log('[PUSH] Registration error:', error?.message || error);
    console.log('[PUSH] Full error:', JSON.stringify(error));
    return null;
  }
}

async function savePushToken(userId: string, token: string): Promise<boolean> {
  try {
    console.log('[PUSH] Saving token for user:', userId, 'token:', token.substring(0, 25) + '...');

    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId);

    const { error: insertError } = await supabase
      .from('push_tokens')
      .insert({
        user_id: userId,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.log('[PUSH] Insert error:', insertError.message, insertError.code, insertError.details);

      if (insertError.code === '42P01') {
        console.log('[PUSH] push_tokens table does not exist! Create it in Supabase with:');
        console.log('[PUSH] CREATE TABLE push_tokens (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, token text NOT NULL, platform text, updated_at timestamptz DEFAULT now());');
        console.log('[PUSH] Also add RLS policies to allow users to manage their own tokens AND allow authenticated users to read all tokens for push delivery.');
      }
      return false;
    }

    const { data: verify, error: verifyError } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId)
      .single();

    if (verifyError || !verify) {
      console.log('[PUSH] Token verification failed - token may not have been saved:', verifyError?.message);
      return false;
    }

    console.log('[PUSH] Token verified and saved successfully for user:', userId);
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    return true;
  } catch (err: any) {
    console.log('[PUSH] Exception saving token:', err?.message || err);
    return false;
  }
}

async function scheduleDiaryReminder() {
  if (Platform.OS === 'web' || !Notifications) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(DIARY_REMINDER_ID).catch(() => {});

    const reminders = [
      "Don't forget to log what you're wearing today!",
      "Keep your streak alive \u2014 log today's fragrance!",
      "What scent are you rocking today? Log it now!",
      "Your diary misses you \u2014 add today's wear!",
      "Quick reminder to log your fragrance of the day!",
    ];

    const randomMessage = reminders[Math.floor(Math.random() * reminders.length)];

    await Notifications.scheduleNotificationAsync({
      identifier: DIARY_REMINDER_ID,
      content: {
        title: 'ScentBuddy Diary',
        body: randomMessage,
        sound: 'default',
        data: { type: 'diary_reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 13,
        minute: 0,
      },
    });

    console.log('[PUSH] Daily diary reminder scheduled for 1:00 PM');
  } catch (err) {
    console.log('[PUSH] Error scheduling diary reminder:', err);
  }
}

async function cancelDiaryReminder() {
  if (Platform.OS === 'web' || !Notifications) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(DIARY_REMINDER_ID);
    console.log('[PUSH] Daily diary reminder cancelled');
  } catch (err) {
    console.log('[PUSH] Error cancelling diary reminder:', err);
  }
}

async function cancelStreakReminder() {
  if (Platform.OS === 'web' || !Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_ID);
    console.log('[PUSH] Streak reminder cancelled');
  } catch (err) {
    console.log('[PUSH] Error cancelling streak reminder:', err);
  }
}

async function scheduleWeeklyRecap() {
  if (Platform.OS === 'web' || !Notifications) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_RECAP_ID).catch(() => {});

    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_RECAP_ID,
      content: {
        title: 'Your Weekly Scent Recap \uD83D\uDCCA',
        body: 'See what you wore this week, your most-used fragrance, and more!',
        sound: 'default',
        data: { type: 'weekly_recap' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 1,
        hour: 18,
        minute: 0,
      },
    });

    console.log('[PUSH] Weekly recap scheduled for Sunday 6:00 PM');
  } catch (err) {
    console.log('[PUSH] Error scheduling weekly recap:', err);
  }
}

async function cancelWeeklyRecap() {
  if (Platform.OS === 'web' || !Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_RECAP_ID);
    console.log('[PUSH] Weekly recap cancelled');
  } catch (err) {
    console.log('[PUSH] Error cancelling weekly recap:', err);
  }
}

async function scheduleForgottenBottles() {
  if (Platform.OS === 'web' || !Notifications) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(FORGOTTEN_BOTTLES_ID).catch(() => {});

    await Notifications.scheduleNotificationAsync({
      identifier: FORGOTTEN_BOTTLES_ID,
      content: {
        title: 'Forgotten Bottle? \uD83E\uDDF4',
        body: "Some fragrances in your collection haven't been worn in a while. Give them another try!",
        sound: 'default',
        data: { type: 'forgotten_bottles' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 4,
        hour: 10,
        minute: 0,
      },
    });

    console.log('[PUSH] Forgotten bottles reminder scheduled for Wednesday 10:00 AM');
  } catch (err) {
    console.log('[PUSH] Error scheduling forgotten bottles reminder:', err);
  }
}

async function cancelForgottenBottles() {
  if (Platform.OS === 'web' || !Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(FORGOTTEN_BOTTLES_ID);
    console.log('[PUSH] Forgotten bottles reminder cancelled');
  } catch (err) {
    console.log('[PUSH] Error cancelling forgotten bottles:', err);
  }
}

async function checkAndSendGoalReminder(userId: string) {
  if (Platform.OS === 'web' || !Notifications) return;

  try {
    const lastCheck = await AsyncStorage.getItem(`${GOAL_CHECK_KEY}_${userId}`);
    const now = Date.now();
    if (lastCheck && now - parseInt(lastCheck) < 24 * 60 * 60 * 1000) return;

    await AsyncStorage.setItem(`${GOAL_CHECK_KEY}_${userId}`, now.toString());

    const { supabase: sb } = require('@/lib/supabase');
    const { data: goalsData, error: goalsError } = await sb
      .from('user_goals')
      .select('label, target, completed')
      .eq('user_id', userId)
      .eq('completed', false);

    if (goalsError || !goalsData) return;

    const activeGoals = goalsData as Array<{ label: string; target: number; completed: boolean }>;

    if (activeGoals.length === 0) return;

    const randomGoal = activeGoals[Math.floor(Math.random() * activeGoals.length)];

    const fireDate = new Date();
    const currentHour = fireDate.getHours();
    if (currentHour >= 18) {
      fireDate.setDate(fireDate.getDate() + 1);
      fireDate.setHours(11, 0, 0, 0);
    } else if (currentHour < 10) {
      fireDate.setHours(11, 0, 0, 0);
    } else {
      fireDate.setHours(Math.min(currentHour + 4, 19), 0, 0, 0);
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Goal Progress \uD83C\uDFAF',
        body: `Keep working on "${randomGoal.label}" \u2014 you're getting closer to your target of ${randomGoal.target}!`,
        sound: 'default',
        data: { type: 'goal_reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
      },
    });

    console.log('[PUSH] Goal reminder scheduled for:', randomGoal.label, 'at', fireDate.toISOString());
  } catch (err) {
    console.log('[PUSH] Error checking goal reminders:', err);
  }
}

async function checkAndSendCollectionMilestone(userId: string) {
  if (Platform.OS === 'web') return;

  try {
    const { supabase: sb } = require('@/lib/supabase');
    const { data, error } = await sb
      .from('user_collections')
      .select('id')
      .eq('user_id', userId);

    if (error || !data) return;

    const currentCount = data.length;
    const lastCountStr = await AsyncStorage.getItem(`${MILESTONE_CHECK_KEY}_${userId}`);
    const lastCount = lastCountStr ? parseInt(lastCountStr) : 0;

    await AsyncStorage.setItem(`${MILESTONE_CHECK_KEY}_${userId}`, currentCount.toString());

    const milestones = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200];
    const crossedMilestone = milestones.find(m => currentCount >= m && lastCount < m);

    if (crossedMilestone && Notifications) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Collection Milestone! \uD83C\uDF89',
          body: `Congrats! You just hit ${crossedMilestone} fragrances in your collection! \uD83E\uDDF4\u2728`,
          sound: 'default',
          data: { type: 'collection_milestone' },
        },
        trigger: null,
      });
      console.log('[PUSH] Collection milestone notification sent:', crossedMilestone);
    }
  } catch (err) {
    console.log('[PUSH] Error checking collection milestones:', err);
  }
}

async function checkAndSendQuizFollowUp(userId: string) {
  if (Platform.OS === 'web' || !Notifications) return;

  try {
    const lastFollowup = await AsyncStorage.getItem(`${QUIZ_FOLLOWUP_KEY}_${userId}`);
    const now = Date.now();
    if (lastFollowup && now - parseInt(lastFollowup) < 7 * 24 * 60 * 60 * 1000) return;

    const quizRaw = await AsyncStorage.getItem('scentbuddy_onboarding_quiz');
    if (!quizRaw) return;

    const quizData = JSON.parse(quizRaw);
    if (!quizData?.scentFamilies?.length) return;

    await AsyncStorage.setItem(`${QUIZ_FOLLOWUP_KEY}_${userId}`, now.toString());

    const family = quizData.scentFamilies[Math.floor(Math.random() * quizData.scentFamilies.length)];

    const fireDate = new Date();
    const currentHour = fireDate.getHours();
    if (currentHour >= 18) {
      fireDate.setDate(fireDate.getDate() + 1);
      fireDate.setHours(12, 0, 0, 0);
    } else if (currentHour < 10) {
      fireDate.setHours(12, 0, 0, 0);
    } else {
      fireDate.setHours(Math.min(currentHour + 5, 19), 0, 0, 0);
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Based on Your Scent Profile \uD83D\uDC43',
        body: `You love ${family} scents! Explore new additions that match your taste in the community.`,
        sound: 'default',
        data: { type: 'quiz_followup' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
      },
    });

    console.log('[PUSH] Quiz follow-up notification scheduled for family:', family, 'at', fireDate.toISOString());
  } catch (err) {
    console.log('[PUSH] Error sending quiz follow-up:', err);
  }
}

export const [NotificationProvider, useNotifications] = createContextHook(() => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const notificationListener = useRef<{ remove: () => void } | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);
  const appState = useRef(AppState.currentState);
  const tokenSaved = useRef(false);

  useEffect(() => {
    void loadSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as NotificationSettings;
        setSettings(parsed);
        console.log('[PUSH] Notification settings loaded:', parsed);
      }
    } catch (err) {
      console.log('[PUSH] Error loading notification settings:', err);
    }
  }, []);

  const saveSettings = useCallback(async (newSettings: NotificationSettings) => {
    setSettings(newSettings);
    try {
      await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(newSettings));
      console.log('[PUSH] Notification settings saved:', newSettings);

      if (newSettings.diaryReminder) {
        await scheduleDiaryReminder();
      } else {
        await cancelDiaryReminder();
      }

      await cancelStreakReminder();

      if (newSettings.weeklyRecap) {
        await scheduleWeeklyRecap();
      } else {
        await cancelWeeklyRecap();
      }

      if (newSettings.forgottenBottles) {
        await scheduleForgottenBottles();
      } else {
        await cancelForgottenBottles();
      }
    } catch (err) {
      console.log('[PUSH] Error saving notification settings:', err);
    }
  }, []);

  const updateSetting = useCallback(async (key: keyof NotificationSettings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  useEffect(() => {
    if (!user?.id) {
      tokenSaved.current = false;
      return;
    }

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const setup = async () => {
      try {
        console.log('[PUSH] Starting setup for user:', user.id);
        const token = await registerForPushNotificationsAsync();
        if (cancelled) return;
        console.log('[PUSH] Registration result:', token ? 'got token' : 'no token');
        if (token) {
          setPushToken(token);
          setPermissionGranted(true);

          const saved = await savePushToken(user.id, token);
          if (cancelled) return;
          tokenSaved.current = saved;

          if (!saved) {
            console.log('[PUSH] WARNING: Token obtained but failed to save to database!');
            console.log('[PUSH] Retrying save in 3 seconds...');
            retryTimeout = setTimeout(async () => {
              if (cancelled) return;
              try {
                const retrySaved = await savePushToken(user.id, token);
                if (!cancelled) tokenSaved.current = retrySaved;
                if (!retrySaved) {
                  console.log('[PUSH] CRITICAL: Token save retry also failed.');
                }
              } catch (e) {
                console.log('[PUSH] Retry save error:', e);
              }
            }, 3000);
          }

          if (cancelled) return;
          if (settings.diaryReminder) {
            await scheduleDiaryReminder();
          }
          if (cancelled) return;
          await cancelStreakReminder();
          if (cancelled) return;
          if (settings.weeklyRecap) {
            await scheduleWeeklyRecap();
          }
          if (cancelled) return;
          if (settings.forgottenBottles) {
            await scheduleForgottenBottles();
          }
          if (cancelled) return;
          if (settings.goalReminders) {
            checkAndSendGoalReminder(user.id).catch(() => {});
          }
          if (settings.collectionMilestones) {
            checkAndSendCollectionMilestone(user.id).catch(() => {});
          }
          if (settings.quizFollowUps) {
            checkAndSendQuizFollowUp(user.id).catch(() => {});
          }
        } else {
          console.log('[PUSH] No token obtained - push notifications will not work');
          console.log('[PUSH] Common causes: simulator, missing projectId, permission denied');
        }
      } catch (e) {
        if (!cancelled) {
          console.log('[PUSH] Setup error (app may be closing):', e);
        }
      }
    };

    void setup();

    if (Platform.OS !== 'web' && Notifications) {
      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        console.log('[PUSH] Notification received in foreground:', notification.request.content.title);
      });

      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data;
        console.log('[PUSH] Notification tapped:', data);
        if (data?.type === 'diary_reminder' || data?.type === 'streak_reminder') {
          router.push('/diary');
        }
      });
    }

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [user?.id, settings.diaryReminder, settings.streakReminders, settings.weeklyRecap, settings.forgottenBottles, settings.goalReminders, settings.collectionMilestones, settings.quizFollowUps]);

  useEffect(() => {
    let isCleanedUp = false;
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (isCleanedUp) return;
      try {
        if (appState.current.match(/inactive|background/) && nextState === 'active') {
          if (Platform.OS !== 'web' && Notifications) {
            Notifications.setBadgeCountAsync(0).catch(() => {});
          }
          if (user?.id && !tokenSaved.current && !isCleanedUp) {
            console.log('[PUSH] App foregrounded, retrying token registration...');
            const token = await registerForPushNotificationsAsync();
            if (token && !isCleanedUp) {
              setPushToken(token);
              setPermissionGranted(true);
              const saved = await savePushToken(user.id, token);
              if (!isCleanedUp) tokenSaved.current = saved;
            }
          }
        }
        appState.current = nextState;
      } catch (e) {
        console.log('[PUSH] AppState handler error:', e);
      }
    });

    return () => {
      isCleanedUp = true;
      subscription.remove();
    };
  }, [user?.id]);

  const requestPermission = useCallback(async () => {
    const token = await registerForPushNotificationsAsync();
    if (token && user?.id) {
      setPushToken(token);
      setPermissionGranted(true);
      const saved = await savePushToken(user.id, token);
      tokenSaved.current = saved;
      if (settings.diaryReminder) {
        await scheduleDiaryReminder();
      }
    }
    return !!token;
  }, [user?.id, settings.diaryReminder]);

  return useMemo(() => ({
    pushToken,
    permissionGranted,
    settings,
    updateSetting,
    saveSettings,
    requestPermission,
  }), [pushToken, permissionGranted, settings, updateSetting, saveSettings, requestPermission]);
});

export async function sendLocalNotification(title: string, body: string, data?: Record<string, unknown>) {
  if (Platform.OS === 'web' || !Notifications) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        data: data ?? {},
      },
      trigger: null,
    });
    console.log('[PUSH] Local notification sent:', title);
  } catch (err) {
    console.log('[PUSH] Error sending local notification:', err);
  }
}

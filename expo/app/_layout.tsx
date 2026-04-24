import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState, useCallback } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthProvider } from "@/providers/AuthProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { NotificationProvider } from "@/providers/NotificationProvider";
import { RevenueCatProvider } from "@/providers/RevenueCatProvider";
import { PaywallPromptProvider } from "@/providers/PaywallPromptProvider";
import OnboardingScreen from "@/app/onboarding";
import AnimatedSplash from "@/components/AnimatedSplash";
import { trackAppOpen } from "@/lib/tiktok";
import { trackAppsFlyerAppOpen } from "@/lib/appsflyer";


const ONBOARDING_KEY = 'scentbuddy_onboarding_done';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const done = await AsyncStorage.getItem(ONBOARDING_KEY);
        console.log('Onboarding check result:', done);
        if (done !== 'true') {
          setNeedsOnboarding(true);
          console.log('User needs onboarding');
        } else {
          console.log('User already completed onboarding');
        }
      } catch (e) {
        console.log('Failed to check onboarding:', e);
        setNeedsOnboarding(true);
      }
      setOnboardingChecked(true);
      await SplashScreen.hideAsync();
    };
    void checkOnboarding();
    void trackAppOpen();
    void trackAppsFlyerAppOpen();
  }, []);

  const handleSplashFinish = useCallback(() => {
    console.log('Splash animation finished');
    setShowSplash(false);
  }, []);

  const handleOnboardingComplete = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      console.log('Onboarding completed, saved to storage');
    } catch (e) {
      console.log('Failed to save onboarding state:', e);
    }
    setNeedsOnboarding(false);
  }, []);

  if (!onboardingChecked) {
    return null;
  }

  if (needsOnboarding) {
    return (
      <>
        <OnboardingScreen onComplete={handleOnboardingComplete} />
        {showSplash && <AnimatedSplash onFinish={handleSplashFinish} />}
      </>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="statistics" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="fragrance-dna" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="diary" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="compare" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="scanner" options={{ headerShown: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="user-profile" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="goals" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="referrals" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="paywall" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      </Stack>
      {showSplash && <AnimatedSplash onFinish={handleSplashFinish} />}
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <AuthProvider>
            <RevenueCatProvider>
              <NotificationProvider>
                <PaywallPromptProvider>
                  <RootLayoutNav />
                </PaywallPromptProvider>
              </NotificationProvider>
            </RevenueCatProvider>
          </AuthProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

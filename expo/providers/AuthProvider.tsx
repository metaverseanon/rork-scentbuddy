import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Session } from '@supabase/supabase-js';
import createContextHook from '@nkzw/create-context-hook';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { ONBOARDING_QUIZ_KEY, QuizResults } from '@/constants/quiz';
import { trackReferralSignUp, generateReferralCode } from '@/lib/referrals';
import { TikTokEvents } from '@/lib/tiktok';
import { AppsFlyerEvents } from '@/lib/appsflyer';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        queryClient.clear();
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const profileQuery = useQuery({
    queryKey: ['profile', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      if (error) {
        console.log('Profile fetch error:', error);
        return null;
      }
      return data as Profile;
    },
    enabled: !!session?.user?.id,
  });

  const signInMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user) {
        void TikTokEvents.login(data.user.id, data.user.email ?? email);
        void AppsFlyerEvents.login(data.user.id, data.user.email ?? email);
      }
      return data;
    },
  });

  const signUpMutation = useMutation({
    mutationFn: async ({ email, password, username, displayName, referralCode }: { email: string; password: string; username: string; displayName: string; referralCode?: string }) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.user) {
        let quizResults: QuizResults | null = null;
        try {
          const stored = await AsyncStorage.getItem(ONBOARDING_QUIZ_KEY);
          if (stored) {
            quizResults = JSON.parse(stored) as QuizResults;
            console.log('Found onboarding quiz results for new user:', quizResults);
          }
        } catch (e) {
          console.log('Failed to read quiz results:', e);
        }

        const newReferralCode = generateReferralCode(username, data.user.id);

        const profileData: Record<string, unknown> = {
          id: data.user.id,
          email,
          username,
          display_name: displayName || username,
          avatar_emoji: '🧴',
          is_pro: false,
          referral_code: newReferralCode,
          created_at: new Date().toISOString(),
        };

        if (quizResults) {
          profileData.favorite_note = quizResults.favoriteNotes?.[0] ?? null;
          profileData.scent_quiz = quizResults;
        }

        await supabase.from('profiles').upsert(profileData);

        if (quizResults) {
          try {
            await AsyncStorage.removeItem(ONBOARDING_QUIZ_KEY);
            console.log('Cleared onboarding quiz data after account creation');
          } catch (e) {
            console.log('Failed to clear quiz data:', e);
          }
        }

        void TikTokEvents.registration(data.user.id, email);
        void AppsFlyerEvents.registration(data.user.id, email);

        if (referralCode?.trim()) {
          try {
            const tracked = await trackReferralSignUp(referralCode.trim(), data.user.id);
            console.log('Referral tracking result:', tracked);
          } catch (e) {
            console.log('Failed to track referral:', e);
          }
        }
      }
      return data;
    },
  });

  const router = useRouter();

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    queryClient.clear();
    try {
      router.replace('/');
    } catch {
      console.log('Navigation after sign out');
    }
  }, [queryClient, router]);

  const deleteAccount = useCallback(async () => {
    if (!session?.user?.id) throw new Error('Not signed in');
    const userId = session.user.id;
    console.log('Starting account deletion for user:', userId);

    try {
      await supabase.from('user_collections').delete().eq('user_id', userId);
      console.log('Deleted user collections');
    } catch (e) {
      console.log('Error deleting collections:', e);
    }

    try {
      await supabase.from('user_wishlists').delete().eq('user_id', userId);
      console.log('Deleted user wishlists');
    } catch (e) {
      console.log('Error deleting wishlists:', e);
    }

    try {
      await supabase.from('wear_diary').delete().eq('user_id', userId);
      console.log('Deleted wear diary entries');
    } catch (e) {
      console.log('Error deleting wear diary:', e);
    }

    try {
      await supabase.from('user_goals').delete().eq('user_id', userId);
      console.log('Deleted user goals');
    } catch (e) {
      console.log('Error deleting goals:', e);
    }

    try {
      await supabase.from('referrals').delete().eq('referrer_id', userId);
      console.log('Deleted referrals');
    } catch (e) {
      console.log('Error deleting referrals:', e);
    }

    try {
      await supabase.from('profiles').delete().eq('id', userId);
      console.log('Deleted user profile');
    } catch (e) {
      console.log('Error deleting profile:', e);
    }

    try {
      await supabase.storage.from('avatars').remove([`${userId}/avatar.jpg`]);
      console.log('Deleted avatar');
    } catch (e) {
      console.log('Error deleting avatar:', e);
    }

    await supabase.auth.signOut();
    setSession(null);
    queryClient.clear();
    console.log('Account deletion complete, signed out');

    try {
      router.replace('/');
    } catch {
      console.log('Navigation after account deletion');
    }
  }, [session?.user?.id, queryClient, router]);

  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!session?.user?.id) return;
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', session.user.id);
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ['profile', session.user.id] });
  }, [session?.user?.id, queryClient]);

  return useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile: profileQuery.data ?? null,
    loading,
    profileLoading: profileQuery.isLoading,
    signIn: signInMutation.mutateAsync,
    signUp: signUpMutation.mutateAsync,
    signOut,
    deleteAccount,
    updateProfile,
    signInLoading: signInMutation.isPending,
    signUpLoading: signUpMutation.isPending,
    signInError: signInMutation.error?.message ?? null,
    signUpError: signUpMutation.error?.message ?? null,
  }), [
    session,
    profileQuery.data,
    profileQuery.isLoading,
    loading,
    signInMutation.mutateAsync,
    signInMutation.isPending,
    signInMutation.error,
    signUpMutation.mutateAsync,
    signUpMutation.isPending,
    signUpMutation.error,
    signOut,
    deleteAccount,
    updateProfile,
  ]);
});

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Bell, MagnifyingGlass, X, TrendUp, ArrowSquareOut, Flame, Drop, Fire, ClipboardText, Binoculars, Users, Trophy, User, SprayBottle, Lightning, Check, ArrowRight } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { generateObject } from '@rork-ai/toolkit-sdk';
import { z } from 'zod';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { supabase, forceHttps } from '@/lib/supabase';
import { TodayWear, ActivityFeedItem, Profile, Notification, CollectionItem, TrendingItem } from '@/lib/types';
import ProfileAvatar from '@/components/ProfileAvatar';
import { createFollowNotification, sendPushToUser } from '@/lib/notifications';
import { getTodayChallenge } from '@/constants/daily-challenges';

const CHALLENGE_NOTE_PREFIX = '[SOTD]';
type CommunityTab = 'wearing' | 'challenge' | 'trending' | 'feed' | 'discover' | 'following' | 'leaderboard';

export default function CommunityScreen() {
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CommunityTab>('challenge');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showWearPicker, setShowWearPicker] = useState(false);
  const [showChallengePicker, setShowChallengePicker] = useState(false);
  const [searchUsers, setSearchUsers] = useState('');
  const challengePulse = useRef(new Animated.Value(1)).current;
  const challengeGlow = useRef(new Animated.Value(0)).current;

  const todayChallenge = useMemo(() => getTodayChallenge(), []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(challengePulse, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
        Animated.timing(challengePulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(challengeGlow, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(challengeGlow, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ])
    ).start();
  }, [challengePulse, challengeGlow]);

  const tabs: { key: CommunityTab; label: string; icon: string }[] = [
    { key: 'challenge', label: 'Scent of the Day', icon: 'lightning' },
    { key: 'wearing', label: 'Wearing Today', icon: 'drop' },
    { key: 'trending', label: 'Trending', icon: 'fire' },
    { key: 'feed', label: 'Feed', icon: 'clipboard' },
    { key: 'discover', label: 'Discover', icon: 'binoculars' },
    { key: 'following', label: 'Following', icon: 'users' },
    { key: 'leaderboard', label: 'Leaderboard', icon: 'trophy' },
  ];

  const getTabIcon = (iconName: string, color: string) => {
    const size = 16;
    switch (iconName) {
      case 'lightning': return <Lightning size={size} color={color} weight="fill" />;
      case 'drop': return <Drop size={size} color={color} weight="fill" />;
      case 'fire': return <Fire size={size} color={color} weight="fill" />;
      case 'clipboard': return <ClipboardText size={size} color={color} weight="fill" />;
      case 'binoculars': return <Binoculars size={size} color={color} weight="fill" />;
      case 'users': return <Users size={size} color={color} weight="fill" />;
      case 'trophy': return <Trophy size={size} color={color} weight="fill" />;
      default: return null;
    }
  };

  const todayWearsQuery = useQuery({
    queryKey: ['today-wears'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('today_wears')
        .select('*, profiles(*)')
        .eq('date', today)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TodayWear[];
    },
  });

  const feedQuery = useQuery({
    queryKey: ['activity-feed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_feed')
        .select('*, profiles(*)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ActivityFeedItem[];
    },
  });

  const usersQuery = useQuery({
    queryKey: ['all-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const followsQuery = useQuery({
    queryKey: ['follows', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', user.id);
      if (error) throw error;
      return (data ?? []).map(f => f.following_id) as string[];
    },
    enabled: !!user?.id,
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    enabled: !!user?.id,
  });

  const leaderboardQuery = useQuery({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sniffs')
        .select('target_user_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((s: any) => {
        counts[s.target_user_id] = (counts[s.target_user_id] || 0) + 1;
      });
      const sorted = Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);
      return sorted;
    },
  });

  const socialTrendingSchema = z.object({
    perfumes: z.array(z.object({
      name: z.string(),
      brand: z.string(),
      platform: z.string(),
      reason: z.string(),
      hotness: z.number().min(1).max(5),
    })),
  });

  const socialTrendsQuery = useQuery({
    queryKey: ['social-media-trends'],
    queryFn: async () => {
      try {
        console.log('Fetching social media trending perfumes...');
        const result = await generateObject({
          messages: [
            {
              role: 'user',
              content: `You are a fragrance industry expert. List the top 10 perfumes currently trending on social media platforms (TikTok, Instagram, Reddit, YouTube) in ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}. Include viral fragrances, newly launched popular ones, and ones getting lots of attention from fragrance communities. For each perfume, specify which platform it's trending on most, why it's trending, and a hotness score from 1-5. Be specific and accurate with real perfume names and brands. Do NOT include any URLs.`,
            },
          ],
          schema: socialTrendingSchema,
        });
        console.log('Social trends fetched:', result.perfumes?.length);
        return result.perfumes ?? [];
      } catch (err) {
        console.log('Social trends fetch error:', err);
        return [];
      }
    },
    staleTime: 1000 * 60 * 60 * 12,
    gcTime: 1000 * 60 * 60 * 24,
  });

  const trendsQuery = useQuery({
    queryKey: ['community-trends'],
    queryFn: async () => {
      try {
        const { data: allCollections, error } = await supabase
          .from('user_collections')
          .select('perfume_name, perfume_brand, image_url, concentration, created_at')
          .order('created_at', { ascending: false })
          .limit(500);
        if (error) throw error;

        const counts: Record<string, { name: string; brand: string; imageUrl: string | null; concentration: string | null; count: number; recentDate: string }> = {};
        (allCollections ?? []).forEach((item: any) => {
          const key = `${item.perfume_name}|${item.perfume_brand}`;
          if (!counts[key]) {
            counts[key] = {
              name: item.perfume_name,
              brand: item.perfume_brand,
              imageUrl: item.image_url,
              concentration: item.concentration,
              count: 0,
              recentDate: item.created_at,
            };
          }
          counts[key].count++;
          if (item.created_at > counts[key].recentDate) {
            counts[key].recentDate = item.created_at;
          }
        });

        const sorted = Object.values(counts)
          .filter(c => c.count >= 1)
          .sort((a, b) => b.count - a.count)
          .slice(0, 20);

        const maxCount = sorted[0]?.count ?? 1;

        return sorted.map((item): TrendingItem => ({
          name: item.name,
          brand: item.brand,
          platform: 'scentbuddy',
          source: `${item.count} collector${item.count > 1 ? 's' : ''}`,
          description: item.concentration ? `${item.concentration}` : '',
          hotness: Math.max(1, Math.min(5, Math.round((item.count / maxCount) * 5))),
          imageUrl: item.imageUrl,
        }));
      } catch (err) {
        console.log('Trends fetch error:', err);
        return [];
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  const collectionQuery = useQuery({
    queryKey: ['collection', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CollectionItem[];
    },
    enabled: !!user?.id,
  });

  const followMutation = useMutation({
    mutationFn: async (targetId: string) => {
      if (!user?.id) throw new Error('Not logged in');
      const isFollowing = (followsQuery.data ?? []).includes(targetId);
      if (isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId);
      } else {
        await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId });
        const displayName = profile?.display_name || profile?.username || 'Someone';
        void createFollowNotification(user.id, displayName, targetId);
        void sendPushToUser(targetId, 'New Follower!', `${displayName} started following you 🎉`, { type: 'follow', senderId: user.id });
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['follows', user?.id] });
    },
  });

  const postWearMutation = useMutation({
    mutationFn: async (item: CollectionItem) => {
      if (!user?.id) throw new Error('Not logged in');
      const today = new Date().toISOString().split('T')[0];
      console.log('Posting wear:', item.perfume_name, 'for date:', today);

      const { data: existing } = await supabase
        .from('today_wears')
        .select('id, note')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();

      if (existing?.id) {
        const preservedNote = existing.note?.includes(CHALLENGE_NOTE_PREFIX) ? existing.note : null;
        const { error } = await supabase
          .from('today_wears')
          .update({
            perfume_name: item.perfume_name,
            perfume_brand: item.perfume_brand,
            image_url: item.image_url,
            note: preservedNote,
          })
          .eq('id', existing.id);
        if (error) {
          console.log('Update wear error:', error);
          throw new Error(error.message);
        }
      } else {
        const { error } = await supabase.from('today_wears').insert({
          user_id: user.id,
          perfume_name: item.perfume_name,
          perfume_brand: item.perfume_brand,
          image_url: item.image_url,
          date: today,
        });
        if (error) {
          console.log('Post wear error:', error);
          throw new Error(error.message);
        }
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['today-wears'] });
      setShowWearPicker(false);
    },
  });

  const postChallengeMutation = useMutation({
    mutationFn: async (item: CollectionItem) => {
      if (!user?.id) throw new Error('Not logged in');
      const today = new Date().toISOString().split('T')[0];
      const noteText = `${CHALLENGE_NOTE_PREFIX} ${todayChallenge.title}`;
      console.log('Posting challenge pick:', item.perfume_name, 'note:', noteText, 'date:', today);

      const { data: existing, error: fetchError } = await supabase
        .from('today_wears')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();
      if (fetchError) {
        console.log('Challenge fetch existing error:', fetchError);
      }

      if (existing?.id) {
        console.log('Updating existing today_wear row:', existing.id);
        const { data, error } = await supabase
          .from('today_wears')
          .update({
            perfume_name: item.perfume_name,
            perfume_brand: item.perfume_brand,
            image_url: item.image_url,
            note: noteText,
          })
          .eq('id', existing.id)
          .select('*');
        if (error) {
          console.log('Challenge pick update error:', error);
          throw new Error(error.message);
        }
        console.log('Challenge response updated:', data);
      } else {
        const { data, error } = await supabase.from('today_wears').insert({
          user_id: user.id,
          perfume_name: item.perfume_name,
          perfume_brand: item.perfume_brand,
          image_url: item.image_url,
          date: today,
          note: noteText,
        }).select('*');
        if (error) {
          console.log('Challenge pick insert error:', error);
          throw new Error(error.message);
        }
        console.log('Challenge response inserted:', data);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onSuccess: () => {
      console.log('Challenge mutation onSuccess - invalidating today-wears');
      void queryClient.invalidateQueries({ queryKey: ['today-wears'] });
      setShowChallengePicker(false);
    },
    onError: (error) => {
      console.log('Challenge mutation error:', error.message);
    },
  });

  const challengeResponses = useMemo(() => {
    const wears = todayWearsQuery.data ?? [];
    const responses = wears.filter(w => w.note?.includes(CHALLENGE_NOTE_PREFIX) || w.note?.includes(todayChallenge.title));
    console.log('[SOTD] total wears today:', wears.length, 'matching challenge:', responses.length);
    return responses;
  }, [todayWearsQuery.data, todayChallenge.title]);

  const myResponse = useMemo(() => {
    return challengeResponses.find(w => w.user_id === user?.id);
  }, [challengeResponses, user?.id]);

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });

  const followingIds = followsQuery.data ?? [];
  const unreadCount = (notificationsQuery.data ?? []).filter(n => !n.read).length;

  const filteredUsers = useMemo(() => {
    const allUsers = usersQuery.data ?? [];
    if (!searchUsers.trim()) return allUsers.filter(u => u.id !== user?.id);
    const q = searchUsers.toLowerCase();
    return allUsers.filter(u =>
      u.id !== user?.id && (
        (u.username?.toLowerCase().includes(q)) ||
        (u.display_name?.toLowerCase().includes(q))
      )
    );
  }, [usersQuery.data, searchUsers, user?.id]);

  const followingUsers = useMemo(() => {
    const ids = followsQuery.data ?? [];
    return (usersQuery.data ?? []).filter(u => ids.includes(u.id));
  }, [usersQuery.data, followsQuery.data]);

  const onRefresh = useCallback(() => {
    void todayWearsQuery.refetch();
    void feedQuery.refetch();
    void usersQuery.refetch();
    void socialTrendsQuery.refetch();
    void trendsQuery.refetch();
  }, [todayWearsQuery, feedQuery, usersQuery, socialTrendsQuery, trendsQuery]);

  const renderChallenge = () => {
    const glowOpacity = challengeGlow.interpolate({
      inputRange: [0, 1],
      outputRange: [0.4, 0.9],
    });

    return (
      <>
        <Animated.View style={[styles.challengeHero, { transform: [{ scale: challengePulse }] }]}>
          <LinearGradient
            colors={[todayChallenge.color, todayChallenge.color + 'CC', todayChallenge.color + '88']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.challengeGradient}
          >
            <Animated.View style={[styles.challengeGlowDot, { opacity: glowOpacity, backgroundColor: '#fff' }]} />
            <Text style={styles.challengeEmoji}>{todayChallenge.emoji}</Text>
            <Text style={styles.challengeTitle}>{todayChallenge.title}</Text>
            <Text style={styles.challengeDesc}>{todayChallenge.description}</Text>
            <View style={styles.challengeHintRow}>
              <Lightning size={14} color="rgba(255,255,255,0.8)" weight="fill" />
              <Text style={styles.challengeHint}>{todayChallenge.hint}</Text>
            </View>
            <View style={styles.challengeDateRow}>
              <Text style={styles.challengeDate}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {!myResponse ? (
          <TouchableOpacity
            style={[styles.challengeAcceptBtn, { backgroundColor: todayChallenge.color }]}
            activeOpacity={0.85}
            onPress={() => {
              if (!user) {
                router.push('/login');
                return;
              }
              setShowChallengePicker(true);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
          >
            <Lightning size={20} color="#fff" weight="fill" />
            <Text style={styles.challengeAcceptText}>Accept Challenge</Text>
            <ArrowRight size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={[styles.challengeMyPick, { backgroundColor: colors.card, borderColor: todayChallenge.color + '40' }]}>
            <View style={[styles.challengePickedBadge, { backgroundColor: todayChallenge.color + '18' }]}>
              <Check size={14} color={todayChallenge.color} weight="bold" />
              <Text style={[styles.challengePickedLabel, { color: todayChallenge.color }]}>Your pick</Text>
            </View>
            <View style={styles.challengeMyPickContent}>
              {myResponse.image_url && (
                <Image source={{ uri: forceHttps(myResponse.image_url) ?? undefined }} style={styles.challengeMyPickImage} resizeMode="contain" />
              )}
              <View style={styles.challengeMyPickInfo}>
                <Text style={[styles.challengeMyPickName, { color: colors.text }]}>{myResponse.perfume_name}</Text>
                <Text style={[styles.challengeMyPickBrand, { color: colors.subtext }]}>{myResponse.perfume_brand}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.challengeStatsRow}>
          <View style={[styles.challengeStatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.challengeStatNum, { color: todayChallenge.color }]}>{challengeResponses.length}</Text>
            <Text style={[styles.challengeStatLabel, { color: colors.subtext }]}>participants</Text>
          </View>
          <View style={[styles.challengeStatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.challengeStatNum, { color: todayChallenge.color }]}>
              {new Set(challengeResponses.map(r => `${r.perfume_name}|${r.perfume_brand}`)).size}
            </Text>
            <Text style={[styles.challengeStatLabel, { color: colors.subtext }]}>unique picks</Text>
          </View>
        </View>

        {challengeResponses.length > 0 && (
          <>
            <Text style={[styles.challengeResponsesTitle, { color: colors.text }]}>Community Picks</Text>
            {challengeResponses.map(wear => (
              <TouchableOpacity
                key={wear.id}
                style={[styles.challengeResponseCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => {
                  if (wear.user_id && wear.user_id !== user?.id) {
                    router.push({ pathname: '/user-profile', params: { userId: wear.user_id } });
                  }
                }}
              >
                <ProfileAvatar avatarUrl={(wear.profiles as any)?.avatar_url} avatarEmoji={(wear.profiles as any)?.avatar_emoji} size={44} backgroundColor={colors.chip} />
                <View style={styles.challengeResponseContent}>
                  <Text style={[styles.challengeResponseUser, { color: colors.text }]}>
                    {(wear.profiles as any)?.display_name || (wear.profiles as any)?.username || 'User'}
                    {wear.user_id === user?.id ? ' (you)' : ''}
                  </Text>
                  <View style={[styles.challengeResponsePerfume, { backgroundColor: colors.chip }]}>
                    {wear.image_url && (
                      <Image source={{ uri: forceHttps(wear.image_url) ?? undefined }} style={styles.challengeResponseImage} resizeMode="contain" />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.challengeResponseName, { color: colors.text }]}>{wear.perfume_name}</Text>
                      <Text style={[styles.challengeResponseBrand, { color: colors.subtext }]}>{wear.perfume_brand}</Text>
                    </View>
                  </View>
                </View>
                <Text style={[styles.challengeResponseTime, { color: colors.subtext }]}>{formatTime(wear.created_at)}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {challengeResponses.length === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <Text style={styles.challengeEmptyEmoji}>{todayChallenge.emoji}</Text>
            <Text style={[styles.emptyText, { color: colors.subtext }]}>No one has answered yet — be the first!</Text>
          </View>
        )}
      </>
    );
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderWearingToday = () => (
    <>
      <TouchableOpacity
        style={[styles.wearInput, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => setShowWearPicker(true)}
      >
        <ProfileAvatar avatarUrl={profile?.avatar_url} avatarEmoji={profile?.avatar_emoji} size={40} backgroundColor={colors.chip} />
        <Text style={[styles.wearPlaceholder, { color: colors.subtext }]}>What are you wearing today?</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionLabel, { color: colors.text }]}>
        Everyone wearing today — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </Text>

      {todayWearsQuery.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      ) : (todayWearsQuery.data ?? []).length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Drop size={40} color={colors.subtext} weight="fill" />
          <Text style={[styles.emptyText, { color: colors.subtext }]}>No one has shared yet today — be the first!</Text>
        </View>
      ) : (
        (todayWearsQuery.data ?? []).map(wear => (
          <View key={wear.id} style={[styles.wearCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ProfileAvatar avatarUrl={(wear.profiles as any)?.avatar_url} avatarEmoji={(wear.profiles as any)?.avatar_emoji} size={40} backgroundColor={colors.chip} />
            <View style={styles.wearCardContent}>
              <Text style={[styles.wearCardUser, { color: colors.text }]}>
                {(wear.profiles as any)?.display_name || (wear.profiles as any)?.username || 'User'}
              </Text>
              <View style={[styles.wearCardPerfume, { backgroundColor: colors.chip }]}>
                {wear.image_url && (
                  <Image source={{ uri: forceHttps(wear.image_url) ?? undefined }} style={styles.wearCardImage} resizeMode="contain" />
                )}
                <View>
                  <Text style={[styles.wearCardName, { color: colors.text }]}>{wear.perfume_name}</Text>
                  <Text style={[styles.wearCardBrand, { color: colors.subtext }]}>{wear.perfume_brand}</Text>
                </View>
              </View>
              {wear.note && <Text style={[styles.wearCardNote, { color: colors.subtext }]}>{wear.note}</Text>}
              <Text style={[styles.wearCardTime, { color: colors.subtext }]}>{formatTime(wear.created_at)}</Text>
            </View>
          </View>
        ))
      )}
    </>
  );

  const renderFeed = () => (
    <>
      {feedQuery.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      ) : (feedQuery.data ?? []).length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.subtext }]}>No activity yet</Text>
        </View>
      ) : (
        (feedQuery.data ?? []).map(item => (
          <View key={item.id} style={[styles.feedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ProfileAvatar avatarUrl={(item.profiles as any)?.avatar_url} avatarEmoji={(item.profiles as any)?.avatar_emoji} size={40} backgroundColor={colors.chip} />
            <View style={styles.feedContent}>
              <Text style={[styles.feedText, { color: colors.text }]}>
                <Text style={{ fontWeight: '700' as const }}>{(item.profiles as any)?.username || 'User'}</Text>
                {' '}{item.activity_type === 'added_perfume' ? 'added' : item.activity_type === 'reviewed_perfume' ? 'reviewed' : 'is wearing'}
              </Text>
              {item.perfume_name && (
                <View style={[styles.feedPerfume, { backgroundColor: colors.chip }]}>
                  <View style={[styles.feedPerfumeIcon, { backgroundColor: colors.accent + '20' }]}>
                    <SprayBottle size={20} color={colors.accent} weight="fill" />
                  </View>
                  <View>
                    <Text style={[styles.feedPerfumeName, { color: colors.text }]}>{item.perfume_name}</Text>
                    <Text style={[styles.feedPerfumeBrand, { color: colors.subtext }]}>{item.perfume_brand}</Text>
                  </View>
                </View>
              )}
              <Text style={[styles.feedTime, { color: colors.subtext }]}>{formatTime(item.created_at)}</Text>
            </View>
          </View>
        ))
      )}
    </>
  );

  const renderDiscover = () => (
    <>
      <View style={[styles.searchBarContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <MagnifyingGlass size={18} color={colors.subtext} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search users..."
          placeholderTextColor={colors.subtext}
          value={searchUsers}
          onChangeText={setSearchUsers}
        />
      </View>
      {filteredUsers.map(u => (
        <TouchableOpacity
          key={u.id}
          style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: '/user-profile', params: { userId: u.id } })}
        >
          <ProfileAvatar avatarUrl={u.avatar_url} avatarEmoji={u.avatar_emoji} size={48} backgroundColor={colors.chip} />
          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: colors.text }]}>{u.display_name || u.username}</Text>
            <Text style={[styles.userHandle, { color: colors.subtext }]}>@{u.username}</Text>
          </View>
          <TouchableOpacity
            style={[styles.followBtn, {
              backgroundColor: followingIds.includes(u.id) ? colors.chip : colors.accent,
              borderColor: followingIds.includes(u.id) ? colors.border : colors.accent,
            }]}
            onPress={(e) => { e.stopPropagation(); followMutation.mutate(u.id); }}
          >
            <Text style={[styles.followBtnText, {
              color: followingIds.includes(u.id) ? colors.text : '#fff',
            }]}>
              {followingIds.includes(u.id) ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </>
  );

  const renderFollowing = () => (
    <>
      <View style={[styles.searchBarContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <MagnifyingGlass size={18} color={colors.subtext} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search users..."
          placeholderTextColor={colors.subtext}
        />
      </View>
      {followingUsers.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.subtext }]}>You're not following anyone yet</Text>
        </View>
      ) : (
        followingUsers.map(u => (
          <TouchableOpacity
            key={u.id}
            style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => router.push({ pathname: '/user-profile', params: { userId: u.id } })}
          >
            <ProfileAvatar avatarUrl={u.avatar_url} avatarEmoji={u.avatar_emoji} size={48} backgroundColor={colors.chip} />
            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: colors.text }]}>{u.display_name || u.username}</Text>
              <Text style={[styles.userHandle, { color: colors.subtext }]}>@{u.username}</Text>
            </View>
            <TouchableOpacity
              style={[styles.followBtn, { backgroundColor: colors.chip, borderColor: colors.border }]}
              onPress={(e) => { e.stopPropagation(); followMutation.mutate(u.id); }}
            >
              <Text style={[styles.followBtnText, { color: colors.text }]}>Following</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))
      )}
    </>
  );

  const renderLeaderboard = () => {
    const entries = leaderboardQuery.data ?? [];
    const allUsers = usersQuery.data ?? [];
    const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

    return (
      <>
        <View style={[styles.leaderboardHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Trophy size={36} color={colors.accent} weight="fill" />
          <Text style={[styles.leaderboardTitle, { color: colors.text }]}>Sniff Leaderboard</Text>
          <Text style={[styles.leaderboardSub, { color: colors.subtext }]}>Who has the most admired collection?</Text>
        </View>
        {entries.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.subtext }]}>No sniffs yet — explore collections!</Text>
          </View>
        ) : (
          entries.map(([userId, count], i) => {
            const u = allUsers.find(p => p.id === userId);
            const isMe = userId === user?.id;
            return (
              <TouchableOpacity
                key={userId}
                style={[styles.leaderEntry, { backgroundColor: colors.card, borderColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => router.push({ pathname: '/user-profile', params: { userId } })}
              >
                <View style={styles.leaderMedal}>
                  {i < 3 ? (
                    <Trophy size={22} color={medalColors[i]} weight="fill" />
                  ) : (
                    <Text style={[styles.leaderMedalText, { color: colors.subtext }]}>#{i + 1}</Text>
                  )}
                </View>
                <ProfileAvatar avatarUrl={u?.avatar_url} avatarEmoji={u?.avatar_emoji} size={48} backgroundColor={colors.chip} />
                <View style={styles.leaderInfo}>
                  <View style={styles.leaderNameRow}>
                    <Text style={[styles.userName, { color: colors.text }]}>{u?.display_name || u?.username || 'User'}</Text>
                    {isMe && (
                      <View style={[styles.youBadge, { backgroundColor: colors.accent + '20' }]}>
                        <Text style={[styles.youBadgeText, { color: colors.accent }]}>YOU</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.userHandle, { color: colors.subtext }]}>{u?.username}</Text>
                </View>
                <View style={styles.leaderScore}>
                  <Text style={[styles.leaderCount, { color: colors.accent }]}>{count}</Text>
                  <Text style={[styles.leaderLabel, { color: colors.subtext }]}>sniffs</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </>
    );
  };



  const renderTrending = () => {
    const socialTrends = socialTrendsQuery.data ?? [];
    const buddyTrends = trendsQuery.data ?? [];
    return (
      <>
        <View style={styles.trendingSectionHeader}>
          <View style={[styles.trendingIconWrap, { backgroundColor: '#FF4500' + '18' }]}>
            <TrendUp size={20} color="#FF4500" />
          </View>
          <View style={styles.trendingSectionText}>
            <Text style={[styles.trendingLabel, { color: colors.text }]}>Trending on Social Media</Text>
            <Text style={[styles.trendingSub, { color: colors.subtext }]}>What's hot on TikTok, Instagram, Reddit & more</Text>
          </View>
        </View>

        {socialTrendsQuery.isLoading ? (
          <View style={[styles.socialLoadingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={[styles.socialLoadingText, { color: colors.subtext }]}>Fetching latest social media trends...</Text>
          </View>
        ) : socialTrends.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.subtext }]}>Could not load social trends — pull to retry</Text>
          </View>
        ) : (
          socialTrends.map((trend, i) => (
            <TouchableOpacity
              key={`social-${trend.name}-${i}`}
              style={[styles.socialTrendCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.7}
              onPress={() => {
                const query = encodeURIComponent(`${trend.name} ${trend.brand} perfume`);
                const searchUrl = `https://www.google.com/search?q=${query}`;
                void Linking.openURL(searchUrl);
              }}
            >
              <View style={styles.socialTrendRank}>
                <Text style={[styles.socialRankNumber, { color: i < 3 ? '#FF4500' : colors.subtext }]}>#{i + 1}</Text>
              </View>
              <View style={styles.socialTrendBody}>
                <Text style={[styles.socialTrendName, { color: colors.text }]}>{trend.name}</Text>
                <Text style={[styles.socialTrendBrand, { color: colors.subtext }]}>{trend.brand}</Text>
                <View style={styles.socialTrendMeta}>
                  <View style={[styles.platformBadge, { backgroundColor: getSocialPlatformColor(trend.platform) }]}>
                    <Text style={styles.platformText}>{trend.platform}</Text>
                  </View>
                  <View style={styles.hotnessDots}>
                    {[1, 2, 3, 4, 5].map(dot => (
                      <View key={dot} style={[styles.hotnessDot, {
                        backgroundColor: dot <= trend.hotness ? getSocialPlatformColor(trend.platform) : colors.chip,
                      }]} />
                    ))}
                  </View>
                </View>
                <Text style={[styles.socialTrendReason, { color: colors.subtext }]} numberOfLines={2}>{trend.reason}</Text>
              </View>
              <View style={styles.socialTrendArrow}>
                <ArrowSquareOut size={16} color={colors.subtext} />
              </View>
            </TouchableOpacity>
          ))
        )}

        <View style={[styles.sectionDivider, { borderBottomColor: colors.border }]} />

        <View style={styles.trendingSectionHeader}>
          <View style={[styles.trendingIconWrap, { backgroundColor: colors.accent + '18' }]}>
            <Flame size={20} color={colors.accent} />
          </View>
          <View style={styles.trendingSectionText}>
            <Text style={[styles.trendingLabel, { color: colors.text }]}>Trending on ScentBuddy</Text>
            <Text style={[styles.trendingSub, { color: colors.subtext }]}>Most collected by the community</Text>
          </View>
        </View>

        {trendsQuery.isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
        ) : buddyTrends.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.subtext }]}>No community trends yet — be the first to add perfumes!</Text>
          </View>
        ) : (
          buddyTrends.map((trend, i) => (
            <View key={`buddy-${trend.name}-${i}`} style={[styles.trendCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.trendContent}>
                <View style={styles.trendTop}>
                  {trend.imageUrl && (
                    <Image source={{ uri: forceHttps(trend.imageUrl) ?? undefined }} style={styles.trendImage} resizeMode="contain" />
                  )}
                  <View style={styles.trendInfo}>
                    <Text style={[styles.trendName, { color: colors.text }]}>{trend.name}</Text>
                    <Text style={[styles.trendBrand, { color: colors.subtext }]}>{trend.brand}</Text>
                    <View style={styles.trendMeta}>
                      <View style={[styles.platformBadge, { backgroundColor: colors.accent }]}>
                        <Text style={styles.platformText}>{trend.source}</Text>
                      </View>
                      <View style={styles.hotnessDots}>
                        {[1, 2, 3, 4, 5].map(dot => (
                          <View key={dot} style={[styles.hotnessDot, {
                            backgroundColor: dot <= trend.hotness ? colors.accent : colors.chip,
                          }]} />
                        ))}
                      </View>
                    </View>
                  </View>
                </View>
                {trend.description ? (
                  <Text style={[styles.trendDesc, { color: colors.subtext }]}>{trend.description}</Text>
                ) : null}
              </View>
            </View>
          ))
        )}
      </>
    );
  };

  const getSocialPlatformColor = (platform: string) => {
    const p = platform?.toLowerCase();
    if (p?.includes('tiktok')) return '#ff0050';
    if (p?.includes('instagram')) return '#c13584';
    if (p?.includes('reddit')) return '#ff4500';
    if (p?.includes('youtube')) return '#FF0000';
    if (p?.includes('twitter') || p?.includes('x')) return '#1DA1F2';
    return '#6b8fa3';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.statusBarOverlay, { height: insets.top + 20 }]} pointerEvents="none">
        <LinearGradient
          colors={[colors.background, colors.background, colors.background + 'CC', colors.background + '00']}
          locations={[0, 0.5, 0.8, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.text }]}>Community</Text>
          <TouchableOpacity
            style={[styles.bellBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowNotifications(!showNotifications)}
          >
            <Bell size={20} color={colors.accent} />
            {unreadCount > 0 && <View style={styles.bellDot} />}
          </TouchableOpacity>
        </View>

        {showNotifications && (
          <View style={[styles.notifCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.notifHeader}>
              <Text style={[styles.notifTitle, { color: colors.text }]}>Notifications</Text>
              <TouchableOpacity onPress={() => markAllReadMutation.mutate()}>
                <Text style={[styles.markReadText, { color: colors.accent }]}>Mark all read</Text>
              </TouchableOpacity>
            </View>
            {(notificationsQuery.data ?? []).length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.subtext, paddingVertical: 12 }]}>No notifications</Text>
            ) : (
              (notificationsQuery.data ?? []).slice(0, 5).map(n => (
                <View key={n.id} style={[styles.notifItem, { borderTopColor: colors.border }]}>
                  {n.type === 'follow' ? <User size={18} color={colors.accent} weight="fill" /> : <Drop size={18} color={colors.accent} weight="fill" />}
                  <View style={styles.notifContent}>
                    <Text style={[styles.notifMessage, { color: colors.text }]}>{n.message}</Text>
                    {n.perfume_name && (
                      <Text style={[styles.notifPerfume, { color: colors.accent }]}>{n.perfume_name} — {n.perfume_brand}</Text>
                    )}
                    <Text style={[styles.notifTime, { color: colors.subtext }]}>{formatTime(n.created_at)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {tabs.map(tab => {
            const tabColor = activeTab === tab.key ? '#fff' : colors.text;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabChip, {
                  backgroundColor: activeTab === tab.key ? colors.accent : colors.card,
                  borderColor: activeTab === tab.key ? colors.accent : colors.border,
                }]}
                onPress={() => setActiveTab(tab.key)}
              >
                {getTabIcon(tab.icon, tabColor)}
                <Text style={[styles.tabText, { color: tabColor }]}>
                  {tab.label}{tab.key === 'wearing' ? ` (${(todayWearsQuery.data ?? []).length})` : ''}
                  {tab.key === 'following' ? ` (${followingIds.length})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.tabContent}>
          {activeTab === 'challenge' && renderChallenge()}
          {activeTab === 'wearing' && renderWearingToday()}
          {activeTab === 'trending' && renderTrending()}
          {activeTab === 'feed' && renderFeed()}
          {activeTab === 'discover' && renderDiscover()}
          {activeTab === 'following' && renderFollowing()}
          {activeTab === 'leaderboard' && renderLeaderboard()}
        </View>
      </ScrollView>

      <Modal visible={showChallengePicker} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Pick Your Scent</Text>
              <Text style={[styles.challengePickerSubtitle, { color: todayChallenge.color }]}>{todayChallenge.emoji} {todayChallenge.title}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowChallengePicker(false)}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={[styles.challengePickerHint, { backgroundColor: todayChallenge.color + '12', borderColor: todayChallenge.color + '30' }]}>
              <Lightning size={16} color={todayChallenge.color} weight="fill" />
              <Text style={[styles.challengePickerHintText, { color: todayChallenge.color }]}>{todayChallenge.description}</Text>
            </View>
            {(collectionQuery.data ?? []).map(item => (
              <TouchableOpacity
                key={item.id}
                style={[styles.wearPickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => postChallengeMutation.mutate(item)}
                disabled={postChallengeMutation.isPending}
              >
                {item.image_url && (
                  <Image source={{ uri: forceHttps(item.image_url) ?? undefined }} style={styles.wearPickerImage} resizeMode="contain" />
                )}
                <View style={styles.wearPickerInfo}>
                  <Text style={[styles.wearPickerName, { color: colors.text }]}>{item.perfume_name}</Text>
                  <Text style={[styles.wearPickerBrand, { color: colors.subtext }]}>{item.perfume_brand}</Text>
                </View>
                <ArrowRight size={18} color={colors.subtext} />
              </TouchableOpacity>
            ))}
            {(collectionQuery.data ?? []).length === 0 && (
              <Text style={[styles.emptyText, { color: colors.subtext, textAlign: 'center', marginTop: 40 }]}>
                Add perfumes to your collection first!
              </Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showWearPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>What are you wearing?</Text>
            <TouchableOpacity onPress={() => setShowWearPicker(false)}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {(collectionQuery.data ?? []).map(item => (
              <TouchableOpacity
                key={item.id}
                style={[styles.wearPickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => postWearMutation.mutate(item)}
              >
                {item.image_url && (
                  <Image source={{ uri: forceHttps(item.image_url) ?? undefined }} style={styles.wearPickerImage} resizeMode="contain" />
                )}
                <View style={styles.wearPickerInfo}>
                  <Text style={[styles.wearPickerName, { color: colors.text }]}>{item.perfume_name}</Text>
                  <Text style={[styles.wearPickerBrand, { color: colors.subtext }]}>{item.perfume_brand}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {(collectionQuery.data ?? []).length === 0 && (
              <Text style={[styles.emptyText, { color: colors.subtext, textAlign: 'center', marginTop: 40 }]}>
                Add perfumes to your collection first!
              </Text>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBarOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: { fontSize: 28, fontWeight: '700' as const },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  bellDot: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E74C3C',
  },
  tabRow: { paddingHorizontal: 20, gap: 8, marginBottom: 16 },
  tabChip: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    alignItems: 'center',
  },
  tabText: { fontSize: 13, fontWeight: '600' as const },
  tabContent: { paddingHorizontal: 20 },
  wearInput: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    marginBottom: 20,
  },
  wearAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  wearAvatarText: { fontSize: 20 },
  wearPlaceholder: { fontSize: 15 },
  sectionLabel: { fontSize: 16, fontWeight: '700' as const, marginBottom: 12 },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center' },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  wearCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  wearCardAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  wearCardContent: { flex: 1 },
  wearCardUser: { fontSize: 15, fontWeight: '700' as const, marginBottom: 6 },
  wearCardPerfume: { flexDirection: 'row', borderRadius: 12, padding: 10, gap: 10, alignItems: 'center', marginBottom: 4 },
  wearCardImage: { width: 40, height: 40, borderRadius: 8 },
  wearCardName: { fontSize: 14, fontWeight: '600' as const },
  wearCardBrand: { fontSize: 12 },
  wearCardNote: { fontSize: 13, marginTop: 6 },
  wearCardTime: { fontSize: 11, marginTop: 6 },
  feedCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  feedAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  feedContent: { flex: 1 },
  feedText: { fontSize: 14, lineHeight: 20 },
  feedPerfume: { flexDirection: 'row', borderRadius: 12, padding: 10, gap: 10, alignItems: 'center', marginTop: 8 },
  feedPerfumeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  feedPerfumeName: { fontSize: 14, fontWeight: '600' as const },
  feedPerfumeBrand: { fontSize: 12 },
  feedTime: { fontSize: 11, marginTop: 8 },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 16, padding: 0 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  userAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: 22 },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '700' as const },
  userHandle: { fontSize: 13, marginTop: 2 },
  followBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  followBtnText: { fontSize: 13, fontWeight: '700' as const },
  leaderboardHeader: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 12,
  },
  leaderboardEmoji: { fontSize: 36, marginBottom: 8 },
  leaderboardTitle: { fontSize: 20, fontWeight: '700' as const },
  leaderboardSub: { fontSize: 14, marginTop: 4 },
  leaderEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  leaderMedal: { width: 30, alignItems: 'center' as const, justifyContent: 'center' as const },
  leaderMedalText: { fontSize: 16, fontWeight: '700' as const },
  leaderInfo: { flex: 1 },
  leaderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  youBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  youBadgeText: { fontSize: 10, fontWeight: '700' as const },
  leaderScore: { alignItems: 'center' },
  leaderCount: { fontSize: 20, fontWeight: '700' as const },
  leaderLabel: { fontSize: 11 },
  trendingSectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 14,
  },
  trendingIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  trendingSectionText: { flex: 1 },
  trendingLabel: { fontSize: 18, fontWeight: '700' as const },
  trendingSub: { fontSize: 13, marginTop: 2 },
  sectionDivider: {
    borderBottomWidth: 1,
    marginVertical: 20,
  },
  socialLoadingCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 10,
  },
  socialLoadingText: { fontSize: 14 },
  socialTrendCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  socialTrendRank: {
    width: 36,
    alignItems: 'center' as const,
  },
  socialRankNumber: {
    fontSize: 18,
    fontWeight: '800' as const,
  },
  socialTrendBody: { flex: 1 },
  socialTrendName: { fontSize: 15, fontWeight: '700' as const },
  socialTrendBrand: { fontSize: 13, marginTop: 1 },
  socialTrendMeta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 6,
  },
  socialTrendReason: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  socialTrendArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  trendCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden' as const,
  },
  trendContent: { padding: 14 },
  trendTop: { flexDirection: 'row' as const, gap: 12 },
  trendImage: { width: 60, height: 60, borderRadius: 10, backgroundColor: '#f5f5f5' },
  trendInfo: { flex: 1 },
  trendName: { fontSize: 16, fontWeight: '700' as const },
  trendBrand: { fontSize: 13, marginTop: 2 },
  trendMeta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 6 },
  platformBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  platformText: { color: '#fff', fontSize: 11, fontWeight: '700' as const },
  hotnessDots: { flexDirection: 'row' as const, gap: 3 },
  hotnessDot: { width: 8, height: 8, borderRadius: 2 },
  trendDesc: { fontSize: 13, marginTop: 10, lineHeight: 18 },
  notifCard: {
    marginHorizontal: 0,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  notifTitle: { fontSize: 16, fontWeight: '700' as const },
  markReadText: { fontSize: 14, fontWeight: '600' as const },
  notifItem: { flexDirection: 'row', paddingTop: 10, marginTop: 10, borderTopWidth: 1, gap: 10 },
  notifEmoji: { fontSize: 18 },
  notifContent: { flex: 1 },
  notifMessage: { fontSize: 14, lineHeight: 20 },
  notifPerfume: { fontSize: 13, marginTop: 2 },
  notifTime: { fontSize: 11, marginTop: 4 },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 20, fontWeight: '700' as const },
  modalContent: { padding: 20, paddingBottom: 40 },
  wearPickerCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    alignItems: 'center',
    gap: 12,
  },
  wearPickerImage: { width: 56, height: 56, borderRadius: 8 },
  wearPickerInfo: { flex: 1 },
  wearPickerName: { fontSize: 15, fontWeight: '600' as const },
  wearPickerBrand: { fontSize: 13, marginTop: 2 },
  challengeHero: {
    borderRadius: 20,
    overflow: 'hidden' as const,
    marginBottom: 14,
  },
  challengeGradient: {
    padding: 28,
    alignItems: 'center' as const,
    position: 'relative' as const,
  },
  challengeGlowDot: {
    position: 'absolute' as const,
    top: 20,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  challengeEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  challengeTitle: {
    fontSize: 26,
    fontWeight: '800' as const,
    color: '#fff',
    textAlign: 'center' as const,
    letterSpacing: -0.5,
  },
  challengeDesc: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center' as const,
    marginTop: 8,
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  challengeHintRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  challengeHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600' as const,
  },
  challengeDateRow: {
    marginTop: 16,
  },
  challengeDate: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  challengeAcceptBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 16,
    borderRadius: 16,
    gap: 10,
    marginBottom: 16,
  },
  challengeAcceptText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#fff',
  },
  challengeMyPick: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 16,
  },
  challengePickedBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 10,
  },
  challengePickedLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  challengeMyPickContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  challengeMyPickImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  challengeMyPickInfo: {
    flex: 1,
  },
  challengeMyPickName: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  challengeMyPickBrand: {
    fontSize: 13,
    marginTop: 2,
  },
  challengeStatsRow: {
    flexDirection: 'row' as const,
    gap: 10,
    marginBottom: 16,
  },
  challengeStatCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center' as const,
  },
  challengeStatNum: {
    fontSize: 24,
    fontWeight: '800' as const,
  },
  challengeStatLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  challengeResponsesTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 12,
  },
  challengeResponseCard: {
    flexDirection: 'row' as const,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
    alignItems: 'flex-start' as const,
  },
  challengeResponseContent: {
    flex: 1,
  },
  challengeResponseUser: {
    fontSize: 14,
    fontWeight: '700' as const,
    marginBottom: 6,
  },
  challengeResponsePerfume: {
    flexDirection: 'row' as const,
    borderRadius: 12,
    padding: 10,
    gap: 10,
    alignItems: 'center' as const,
  },
  challengeResponseImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  challengeResponseName: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  challengeResponseBrand: {
    fontSize: 12,
    marginTop: 1,
  },
  challengeResponseTime: {
    fontSize: 11,
    marginTop: 2,
  },
  challengeEmptyEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  challengePickerSubtitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginTop: 4,
  },
  challengePickerHint: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  challengePickerHintText: {
    fontSize: 14,
    fontWeight: '600' as const,
    flex: 1,
  },
});

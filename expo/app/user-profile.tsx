import React, { useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, UserPlus, UserCheck, Heart, Wind, X, Star } from 'phosphor-react-native';
import { analyzeFragranceProfile, getSeasonSuitability, getTimeSuitability } from '@/lib/fragrance-profile';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { supabase, forceHttps } from '@/lib/supabase';
import { Profile, CollectionItem, WishlistItem } from '@/lib/types';
import { createSniffNotification, createFollowNotification, sendPushToUser } from '@/lib/notifications';
import ProfileAvatar from '@/components/ProfileAvatar';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48 - 10) / 2;

type ProfileTab = 'collection' | 'wishlist';

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user, profile: myProfile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<ProfileTab>('collection');
  const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);

  const profileQuery = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    enabled: !!userId,
  });

  const collectionQuery = useQuery({
    queryKey: ['user-collection', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CollectionItem[];
    },
    enabled: !!userId,
  });

  const wishlistQuery = useQuery({
    queryKey: ['user-wishlist', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_wishlists')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WishlistItem[];
    },
    enabled: !!userId,
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

  const followerCountQuery = useQuery({
    queryKey: ['follower-count', userId],
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
  });

  const followingCountQuery = useQuery({
    queryKey: ['following-count', userId],
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
  });

  const sniffCountQuery = useQuery({
    queryKey: ['sniff-count', userId],
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from('sniffs')
        .select('*', { count: 'exact', head: true })
        .eq('target_user_id', userId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
  });

  const isFollowing = useMemo(() => {
    return (followsQuery.data ?? []).includes(userId ?? '');
  }, [followsQuery.data, userId]);

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !userId) throw new Error('Not logged in');
      if (isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', userId);
      } else {
        await supabase.from('follows').insert({ follower_id: user.id, following_id: userId });
        const displayName = myProfile?.display_name || myProfile?.username || 'Someone';
        void createFollowNotification(user.id, displayName, userId);
        void sendPushToUser(userId, 'New Follower!', `${displayName} started following you`, { type: 'follow', senderId: user.id });
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['follows', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['follower-count', userId] });
    },
  });

  const sniffMutation = useMutation({
    mutationFn: async (item: CollectionItem) => {
      if (!user?.id || !userId) throw new Error('Not logged in');
      await supabase.from('sniffs').insert({
        user_id: user.id,
        target_user_id: userId,
        perfume_name: item.perfume_name,
        perfume_brand: item.perfume_brand,
      });
      const displayName = myProfile?.display_name || myProfile?.username || 'Someone';
      void createSniffNotification(user.id, displayName, userId, item.perfume_name, item.perfume_brand);
      void sendPushToUser(userId, 'Someone sniffed your perfume!', `${displayName} sniffed your ${item.perfume_name}`, {
        type: 'sniff',
        senderId: user.id,
        perfumeName: item.perfume_name,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sniff-count', userId] });
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      Alert.alert('Sniffed!', 'You sniffed this fragrance from their collection');
    },
  });

  const profileData = profileQuery.data;
  const collection = collectionQuery.data ?? [];
  const wishlist = wishlistQuery.data ?? [];
  const isMe = userId === user?.id;

  const handleSniff = useCallback((item: CollectionItem) => {
    if (!user?.id) {
      Alert.alert('Sign in', 'You need to sign in to sniff fragrances');
      return;
    }
    if (isMe) {
      Alert.alert('Oops', "You can't sniff your own fragrances!");
      return;
    }
    sniffMutation.mutate(item);
  }, [user?.id, isMe, sniffMutation]);

  if (profileQuery.isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </View>
    );
  }

  if (!profileData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.errorContainer, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card }]} onPress={() => router.back()}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.errorText, { color: colors.subtext }]}>User not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <LinearGradient
          colors={[colors.accent, `${colors.accent}55`, colors.background]}
          style={[styles.headerGradient, { paddingTop: insets.top + 12 }]}
        >
          <View style={styles.topBar}>
            <TouchableOpacity style={[styles.backBtn, { backgroundColor: 'rgba(0,0,0,0.2)' }]} onPress={() => router.back()}>
              <ArrowLeft size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.profileHeader}>
            <View style={styles.avatarShadow}>
              <ProfileAvatar
                avatarUrl={profileData.avatar_url}
                avatarEmoji={profileData.avatar_emoji}
                size={88}
                backgroundColor={colors.card}
              />
            </View>
            <Text style={styles.displayName}>{profileData.display_name || profileData.username || 'User'}</Text>
            <Text style={styles.handle}>@{profileData.username || 'unknown'}</Text>
            {profileData.bio && (
              <Text style={[styles.bio, { color: 'rgba(255,255,255,0.85)' }]}>{profileData.bio}</Text>
            )}
          </View>
        </LinearGradient>

        <View style={styles.statsContainer}>
          <View style={styles.statsRow}>
            {[
              { label: 'Collection', value: collection.length },
              { label: 'Wishlist', value: wishlist.length },
              { label: 'Followers', value: followerCountQuery.data ?? 0 },
              { label: 'Following', value: followingCountQuery.data ?? 0 },
              { label: 'Sniffs', value: sniffCountQuery.data ?? 0 },
            ].map((stat, i) => (
              <View key={i} style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: colors.subtext }]}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {!isMe && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.followButton, {
                backgroundColor: isFollowing ? colors.card : colors.accent,
                borderColor: isFollowing ? colors.border : colors.accent,
              }]}
              onPress={() => followMutation.mutate()}
              disabled={followMutation.isPending}
            >
              {isFollowing ? (
                <UserCheck size={18} color={colors.text} />
              ) : (
                <UserPlus size={18} color="#fff" />
              )}
              <Text style={[styles.followButtonText, {
                color: isFollowing ? colors.text : '#fff',
              }]}>
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.tabContainer}>
          {(['collection', 'wishlist'] as ProfileTab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, {
                backgroundColor: activeTab === tab ? colors.accent : colors.card,
                borderColor: activeTab === tab ? colors.accent : colors.border,
              }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, {
                color: activeTab === tab ? '#fff' : colors.text,
              }]}>
                {tab === 'collection' ? `Collection (${collection.length})` : `Wishlist (${wishlist.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'collection' && (
          <View style={styles.gridContainer}>
            {collection.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={styles.emptyEmoji}>🧴</Text>
                <Text style={[styles.emptyText, { color: colors.subtext }]}>No fragrances in collection yet</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {collection.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.perfumeCard, { overflow: 'hidden' }]}
                    activeOpacity={0.85}
                    onPress={() => setSelectedItem(item)}
                    testID={`collection-item-${item.id}`}
                  >
                    {item.image_url ? (
                      <Image
                        source={{ uri: forceHttps(item.image_url) ?? undefined }}
                        style={styles.perfumeImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.perfumeImage, { backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 32 }}>🧴</Text>
                      </View>
                    )}
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.8)']}
                      style={styles.perfumeOverlay}
                    >
                      <Text style={styles.perfumeName} numberOfLines={1}>{item.perfume_name}</Text>
                      <Text style={styles.perfumeBrand} numberOfLines={1}>{item.perfume_brand}</Text>
                    </LinearGradient>
                    {!isMe && (
                      <TouchableOpacity
                        style={[styles.sniffBtn, { backgroundColor: colors.accent }]}
                        onPress={() => handleSniff(item)}
                        disabled={sniffMutation.isPending}
                        activeOpacity={0.7}
                      >
                        <Wind size={14} color="#fff" />
                      </TouchableOpacity>
                    )}
                    {item.is_favorite && (
                      <View style={styles.favBadge}>
                        <Heart size={12} color="#E74C3C" weight="fill" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {activeTab === 'wishlist' && (
          <View style={styles.gridContainer}>
            {wishlist.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={styles.emptyEmoji}>💫</Text>
                <Text style={[styles.emptyText, { color: colors.subtext }]}>No fragrances on wishlist yet</Text>
              </View>
            ) : (
              wishlist.map(item => (
                <View key={item.id} style={[styles.wishlistCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {item.image_url ? (
                    <Image
                      source={{ uri: forceHttps(item.image_url) ?? undefined }}
                      style={styles.wishlistImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.wishlistImagePlaceholder, { backgroundColor: colors.chip }]}>
                      <Heart size={20} color={colors.accent} />
                    </View>
                  )}
                  <View style={styles.wishlistInfo}>
                    <Text style={[styles.wishlistName, { color: colors.text }]} numberOfLines={1}>{item.perfume_name}</Text>
                    <Text style={[styles.wishlistBrand, { color: colors.subtext }]} numberOfLines={1}>{item.perfume_brand}</Text>
                    {item.concentration && (
                      <View style={[styles.concBadge, { backgroundColor: colors.accent + '18' }]}>
                        <Text style={[styles.concText, { color: colors.accent }]}>{item.concentration}</Text>
                      </View>
                    )}
                  </View>
                  {item.priority > 0 && (
                    <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) }]}>
                      <Text style={styles.priorityText}>{'★'.repeat(Math.min(item.priority, 3))}</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {selectedItem && (
        <ReadOnlyFragranceModal
          visible={!!selectedItem}
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onSniff={!isMe ? () => { handleSniff(selectedItem); setSelectedItem(null); } : undefined}
          sniffing={sniffMutation.isPending}
        />
      )}
    </View>
  );
}

function ReadOnlyFragranceModal({ visible, item, onClose, onSniff, sniffing }: {
  visible: boolean;
  item: CollectionItem;
  onClose: () => void;
  onSniff?: () => void;
  sniffing?: boolean;
}) {
  const { colors } = useTheme();

  const allNotes = useMemo(() => [
    ...(item.base_notes ?? []).map(n => ({ note: n, type: 'base', weight: 3 })),
    ...(item.heart_notes ?? []).map(n => ({ note: n, type: 'heart', weight: 2 })),
    ...(item.top_notes ?? []).map(n => ({ note: n, type: 'top', weight: 1 })),
  ], [item.base_notes, item.heart_notes, item.top_notes]);

  const maxWeight = Math.max(...allNotes.map(n => n.weight), 1);

  const fragranceProfile = useMemo(() => analyzeFragranceProfile(
    item.top_notes ?? [],
    item.heart_notes ?? [],
    item.base_notes ?? [],
  ), [item.top_notes, item.heart_notes, item.base_notes]);

  const seasonMatch = (s: string) => {
    const key = s.toLowerCase() as 'spring' | 'summer' | 'autumn' | 'winter';
    return getSeasonSuitability(fragranceProfile.seasons[key]) === 'high';
  };
  const seasonMedium = (s: string) => {
    const key = s.toLowerCase() as 'spring' | 'summer' | 'autumn' | 'winter';
    return getSeasonSuitability(fragranceProfile.seasons[key]) === 'medium';
  };
  const dayHighOrMedium = getTimeSuitability(fragranceProfile.timeOfDay.day) !== 'low';
  const nightHighOrMedium = getTimeSuitability(fragranceProfile.timeOfDay.night) !== 'low';
  const dayHigh = getTimeSuitability(fragranceProfile.timeOfDay.day) === 'high';
  const nightHigh = getTimeSuitability(fragranceProfile.timeOfDay.night) === 'high';

  const getAccordColor = (accord: string): string => {
    const map: Record<string, string> = {
      sweet: '#E74C3C', honey: '#DAA520', vanilla: '#F4D03F', tobacco: '#8B4513',
      lavender: '#9B59B6', woody: '#795548', fresh: '#00BCD4', citrus: '#FFC107',
      floral: '#E91E63', spicy: '#FF5722', amber: '#FF8F00', leather: '#3E2723',
      rose: '#F06292', jasmine: '#FFF9C4', sandalwood: '#D2B48C', oud: '#3E2723',
      bergamot: '#C49A6C', cedar: '#795548', musk: '#CE93D8', patchouli: '#6D4C41',
    };
    const lower = accord.toLowerCase();
    for (const [key, color] of Object.entries(map)) {
      if (lower.includes(key)) return color;
    }
    return '#c49a6c';
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} {...(Platform.OS === 'ios' ? { presentationStyle: 'pageSheet' as const } : {})}>
      <View style={[mStyles.container, { backgroundColor: colors.background }]}>
        <View style={[mStyles.header, { borderBottomColor: colors.border }]}>
          <Text style={[mStyles.title, { color: colors.text }]} numberOfLines={1}>{item.perfume_name}</Text>
          <TouchableOpacity onPress={onClose} testID="close-fragrance-modal">
            <X size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={mStyles.content}>
          {item.image_url && (
            <View style={[mStyles.imageContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Image
                source={{ uri: forceHttps(item.image_url) ?? undefined }}
                style={mStyles.image}
                resizeMode="contain"
              />
            </View>
          )}

          <View style={mStyles.badges}>
            <View style={[mStyles.badge, {
              backgroundColor: item.status === 'owned' ? colors.accent + '15' : '#9B59B6' + '15',
              borderColor: item.status === 'owned' ? colors.accent : '#9B59B6',
            }]}>
              <Text style={[mStyles.badgeLabel, { color: colors.subtext }]}>Status</Text>
              <Text style={[mStyles.badgeValue, { color: item.status === 'owned' ? colors.accent : '#9B59B6' }]}>
                {item.status === 'owned' ? 'Owned' : 'Tried'}
              </Text>
            </View>
            {item.concentration && (
              <View style={[mStyles.badge, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                <Text style={[mStyles.badgeLabel, { color: colors.subtext }]}>Concentration</Text>
                <Text style={[mStyles.badgeValue, { color: colors.text }]}>{item.concentration}</Text>
              </View>
            )}
            {item.season && (
              <View style={[mStyles.badge, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                <Text style={[mStyles.badgeLabel, { color: colors.subtext }]}>Season</Text>
                <Text style={[mStyles.badgeValue, { color: colors.text }]}>{item.season}</Text>
              </View>
            )}
          </View>

          <Text style={[mStyles.brand, { color: colors.accent }]}>{item.perfume_brand}</Text>
          <Text style={[mStyles.name, { color: colors.text }]}>{item.perfume_name}</Text>

          {(item.rating ?? 0) > 0 && (
            <>
              <Text style={[mStyles.sectionTitle, { color: colors.subtext }]}>Their Rating</Text>
              <View style={mStyles.ratingRow}>
                {[1, 2, 3, 4, 5].map(r => (
                  <Star key={r} size={24} color="#FFD700" weight={(item.rating ?? 0) >= r ? 'fill' : 'regular'} />
                ))}
              </View>
            </>
          )}

          {allNotes.length > 0 && (
            <>
              <Text style={[mStyles.sectionTitle, { color: colors.text }]}>Fragrance Pyramid</Text>
              <Text style={[mStyles.accordLabel, { color: colors.accent }]}>MAIN ACCORDS</Text>
              {allNotes.map((n, i) => (
                <View key={i} style={mStyles.accordRow}>
                  <Text style={[mStyles.accordName, { color: colors.text }]}>{n.note}</Text>
                  <View style={[mStyles.accordBarBg, { backgroundColor: colors.chip }]}>
                    <View style={[mStyles.accordBar, {
                      backgroundColor: getAccordColor(n.note),
                      width: `${(n.weight / maxWeight) * 100}%`,
                    }]} />
                  </View>
                </View>
              ))}
            </>
          )}

          {(item.top_notes?.length ?? 0) > 0 && (
            <>
              <Text style={[mStyles.noteTypeLabel, { color: colors.accent }]}>TOP NOTES</Text>
              <View style={mStyles.notesChipRow}>
                {item.top_notes?.map((n, i) => (
                  <View key={i} style={[mStyles.noteChip, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                    <Text style={[mStyles.noteChipText, { color: colors.text }]}>{n}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {(item.heart_notes?.length ?? 0) > 0 && (
            <>
              <Text style={[mStyles.noteTypeLabel, { color: '#E91E63' }]}>HEART NOTES</Text>
              <View style={mStyles.notesChipRow}>
                {item.heart_notes?.map((n, i) => (
                  <View key={i} style={[mStyles.noteChip, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                    <Text style={[mStyles.noteChipText, { color: colors.text }]}>{n}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {(item.base_notes?.length ?? 0) > 0 && (
            <>
              <Text style={[mStyles.noteTypeLabel, { color: '#9B59B6' }]}>BASE NOTES</Text>
              <View style={mStyles.notesChipRow}>
                {item.base_notes?.map((n, i) => (
                  <View key={i} style={[mStyles.noteChip, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                    <Text style={[mStyles.noteChipText, { color: colors.text }]}>{n}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={[mStyles.sectionTitle, { color: colors.text }]}>BEST TIME</Text>
          <View style={mStyles.timeRow}>
            <View style={[mStyles.timeCard, { backgroundColor: dayHigh ? '#FFF8E1' : dayHighOrMedium ? '#FFFDE7' : colors.chip, borderColor: dayHigh ? '#FFC107' : dayHighOrMedium ? '#FFD54F' : colors.border, opacity: dayHighOrMedium ? 1 : 0.45 }]}>
              <Text style={mStyles.timeEmoji}>☀️</Text>
              <Text style={[mStyles.timeLabel, { color: dayHighOrMedium ? '#333' : colors.subtext }]}>Day</Text>
              <Text style={[mStyles.timeScore, { color: dayHigh ? '#F57F17' : dayHighOrMedium ? '#FBC02D' : colors.subtext }]}>{Math.round(fragranceProfile.timeOfDay.day * 100)}%</Text>
            </View>
            <View style={[mStyles.timeCard, { backgroundColor: nightHigh ? '#F3E5F5' : nightHighOrMedium ? '#F8EAF6' : colors.chip, borderColor: nightHigh ? '#9B59B6' : nightHighOrMedium ? '#CE93D8' : colors.border, opacity: nightHighOrMedium ? 1 : 0.45 }]}>
              <Text style={mStyles.timeEmoji}>🌙</Text>
              <Text style={[mStyles.timeLabel, { color: nightHighOrMedium ? '#333' : colors.subtext }]}>Night</Text>
              <Text style={[mStyles.timeScore, { color: nightHigh ? '#7B1FA2' : nightHighOrMedium ? '#AB47BC' : colors.subtext }]}>{Math.round(fragranceProfile.timeOfDay.night * 100)}%</Text>
            </View>
          </View>

          <Text style={[mStyles.sectionTitle, { color: colors.text }]}>SEASONS</Text>
          <View style={mStyles.seasonsGrid}>
            {[
              { name: 'Spring', emoji: '🌸', color: '#FCE4EC', border: '#E91E63' },
              { name: 'Summer', emoji: '☀️', color: '#FFF8E1', border: '#FFC107' },
              { name: 'Autumn', emoji: '🍂', color: '#FBE9E7', border: '#FF5722' },
              { name: 'Winter', emoji: '❄️', color: '#E3F2FD', border: '#2196F3' },
            ].map(s => (
              <View key={s.name} style={[mStyles.seasonCard, {
                backgroundColor: seasonMatch(s.name) ? s.color : seasonMedium(s.name) ? s.color + '80' : colors.chip,
                borderColor: seasonMatch(s.name) ? s.border : seasonMedium(s.name) ? s.border + '80' : colors.border,
                opacity: seasonMatch(s.name) || seasonMedium(s.name) ? 1 : 0.45,
              }]}>
                <Text style={mStyles.seasonEmoji}>{s.emoji}</Text>
                <View>
                  <Text style={[mStyles.seasonLabel, { color: seasonMatch(s.name) || seasonMedium(s.name) ? '#333' : colors.subtext }]}>{s.name}</Text>
                  <Text style={[mStyles.seasonScore, { color: seasonMatch(s.name) ? s.border : seasonMedium(s.name) ? s.border + 'CC' : colors.subtext }]}>{Math.round(fragranceProfile.seasons[s.name.toLowerCase() as 'spring' | 'summer' | 'autumn' | 'winter'] * 100)}%</Text>
                </View>
              </View>
            ))}
          </View>

          {item.personal_notes ? (
            <>
              <Text style={[mStyles.sectionTitle, { color: colors.text }]}>THEIR NOTES</Text>
              <View style={[mStyles.personalNotesBox, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                <Text style={[mStyles.personalNotesText, { color: colors.text }]}>{item.personal_notes}</Text>
              </View>
            </>
          ) : null}

          {onSniff && (
            <TouchableOpacity
              style={[mStyles.sniffButton, { backgroundColor: colors.accent }]}
              onPress={onSniff}
              disabled={sniffing}
              activeOpacity={0.85}
              testID="sniff-fragrance"
            >
              <Wind size={20} color="#fff" />
              <Text style={mStyles.sniffButtonText}>{sniffing ? 'Sniffing…' : 'Sniff This Fragrance'}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '700' as const, flex: 1, marginRight: 12 },
  content: { padding: 20, paddingBottom: 40 },
  imageContainer: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16, alignItems: 'center' },
  image: { width: 200, height: 200 },
  badges: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  badge: { borderRadius: 12, padding: 10, borderWidth: 1, minWidth: 100 },
  badgeLabel: { fontSize: 10, fontWeight: '600' as const, textAlign: 'center' },
  badgeValue: { fontSize: 14, fontWeight: '700' as const, textAlign: 'center', marginTop: 2 },
  brand: { fontSize: 14, fontWeight: '600' as const, marginBottom: 4 },
  name: { fontSize: 24, fontWeight: '700' as const, marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700' as const, marginBottom: 10, marginTop: 16, letterSpacing: 0.5 },
  ratingRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  accordLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1, marginBottom: 8 },
  accordRow: { marginBottom: 8 },
  accordName: { fontSize: 14, fontWeight: '600' as const, marginBottom: 4 },
  accordBarBg: { height: 24, borderRadius: 6, overflow: 'hidden' },
  accordBar: { height: 24, borderRadius: 6 },
  noteTypeLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1, marginTop: 12, marginBottom: 8 },
  notesChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  noteChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  noteChipText: { fontSize: 13 },
  timeRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  timeCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1 },
  timeEmoji: { fontSize: 24, marginBottom: 4 },
  timeLabel: { fontSize: 14, fontWeight: '600' as const },
  timeScore: { fontSize: 11, fontWeight: '700' as const, marginTop: 2 },
  seasonsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  seasonCard: { width: 160, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1 },
  seasonEmoji: { fontSize: 20 },
  seasonLabel: { fontSize: 14, fontWeight: '600' as const },
  seasonScore: { fontSize: 11, fontWeight: '700' as const },
  personalNotesBox: { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 8 },
  personalNotesText: { fontSize: 14, lineHeight: 20 },
  sniffButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 14, gap: 10, marginTop: 24 },
  sniffButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' as const },
});

function getPriorityColor(priority: number): string {
  if (priority >= 3) return '#E74C3C';
  if (priority >= 2) return '#E8A838';
  return '#4CAF50';
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: { paddingHorizontal: 20 },
  errorText: { fontSize: 16, textAlign: 'center', marginTop: 40 },
  headerGradient: {
    paddingBottom: 30,
  },
  topBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  avatarShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginBottom: 14,
  },
  displayName: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#fff',
    marginBottom: 2,
  },
  handle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  bio: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  statsContainer: {
    paddingHorizontal: 20,
    marginTop: -10,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  actionRow: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  followButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  gridContainer: {
    paddingHorizontal: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  perfumeCard: {
    width: CARD_WIDTH,
    height: 200,
    borderRadius: 16,
  },
  perfumeImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    position: 'absolute' as const,
  },
  perfumeOverlay: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    paddingTop: 40,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  perfumeName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  perfumeBrand: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 2,
  },
  sniffBtn: {
    position: 'absolute' as const,
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  favBadge: {
    position: 'absolute' as const,
    top: 10,
    left: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
  },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  wishlistCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    alignItems: 'center',
    gap: 12,
  },
  wishlistImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
  },
  wishlistImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishlistInfo: { flex: 1 },
  wishlistName: { fontSize: 15, fontWeight: '600' as const },
  wishlistBrand: { fontSize: 13, marginTop: 2 },
  concBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  concText: { fontSize: 11, fontWeight: '600' as const },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityText: {
    color: '#fff',
    fontSize: 12,
  },
});

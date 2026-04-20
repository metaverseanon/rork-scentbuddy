import React, { useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, ShareNetwork, Gift, Users, CheckCircle, Clock } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import {
  REFERRAL_GOAL,
  fetchReferralStats,
  fetchReferralsList,
  getOrCreateReferralCode,
  getReferralShareMessage,
  grantReferralProViaRevenueCat,
} from '@/lib/referrals';
import type { Referral } from '@/lib/referrals';
import ProfileAvatar from '@/components/ProfileAvatar';

export default function ReferralsScreen() {
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const statsQuery = useQuery({
    queryKey: ['referral-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const code = await getOrCreateReferralCode(user.id, profile?.username ?? null);
      await grantReferralProViaRevenueCat(user.id);
      const stats = await fetchReferralStats(user.id);
      return { ...stats, referralCode: code || stats.referralCode };
    },
    enabled: !!user?.id,
  });

  const referralsQuery = useQuery({
    queryKey: ['referrals-list', user?.id],
    queryFn: () => fetchReferralsList(user!.id),
    enabled: !!user?.id,
  });

  const progress = statsQuery.data
    ? Math.min(statsQuery.data.currentCycleProgress / REFERRAL_GOAL, 1)
    : 0;

  useEffect(() => {
    if (statsQuery.data) {
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 1000,
        delay: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [progress, progressAnim, statsQuery.data]);

  const handleShare = useCallback(async () => {
    if (!statsQuery.data?.referralCode) return;
    try {
      await Share.share({
        message: getReferralShareMessage(statsQuery.data.referralCode),
      });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      console.log('Share cancelled');
    }
  }, [statsQuery.data?.referralCode]);

  const handleCopyCode = useCallback(async () => {
    if (!statsQuery.data?.referralCode) return;
    try {
      await Clipboard.setStringAsync(statsQuery.data.referralCode);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Copied!', 'Referral code copied to clipboard.');
    } catch {
      console.log('Copy failed');
    }
  }, [statsQuery.data?.referralCode]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.centered, { paddingTop: insets.top + 60 }]}>
          <Text style={[styles.emptyText, { color: colors.subtext }]}>Sign in to access referrals</Text>
        </View>
      </View>
    );
  }

  const isLoading = statsQuery.isLoading;
  const stats = statsQuery.data;
  const referrals = referralsQuery.data ?? [];
  const remaining = stats ? stats.nextRewardIn : REFERRAL_GOAL;
  const monthsEarned = stats?.monthsEarned ?? 0;
  const expiryDate = stats?.proExpiresAt ? new Date(stats.proExpiresAt) : null;
  const expiryStr = expiryDate
    ? expiryDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const isRewardActive = !!expiryDate && expiryDate > new Date();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Referral Program</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.giftIconWrap, { backgroundColor: colors.accent + '15' }]}>
                <Gift size={36} color={colors.accent} weight="fill" />
              </View>
              <Text style={[styles.heroTitle, { color: colors.text }]}>
                Earn Free Pro Months
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.subtext }]}>
                Every {REFERRAL_GOAL} friends who sign up with your code = 1 free month of Pro. Rewards stack — keep inviting!
              </Text>

              {monthsEarned > 0 ? (
                <View style={[styles.rewardBadge, { backgroundColor: '#34c75915', borderColor: '#34c759' }]}>
                  <CheckCircle size={20} color="#34c759" weight="fill" />
                  <Text style={[styles.rewardBadgeText, { color: '#34c759' }]}>
                    {monthsEarned} free month{monthsEarned !== 1 ? 's' : ''} earned
                  </Text>
                </View>
              ) : null}

              {isRewardActive && expiryStr ? (
                <Text style={[styles.expiryText, { color: colors.subtext }]}>
                  Pro active until {expiryStr}
                </Text>
              ) : null}
            </View>

            <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.progressHeader}>
                <Text style={[styles.progressLabel, { color: colors.text }]}>Next Free Month</Text>
                <Text style={[styles.progressCount, { color: colors.accent }]}>
                  {stats?.currentCycleProgress ?? 0}/{REFERRAL_GOAL}
                </Text>
              </View>

              <View style={[styles.progressTrack, { backgroundColor: colors.chip }]}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    { backgroundColor: colors.accent, width: progressWidth },
                  ]}
                />
              </View>

              <View style={styles.progressDots}>
                {Array.from({ length: REFERRAL_GOAL }).map((_, i) => {
                  const completed = (stats?.currentCycleProgress ?? 0) > i;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.progressDot,
                        {
                          backgroundColor: completed ? colors.accent : colors.chip,
                          borderColor: completed ? colors.accent : colors.border,
                        },
                      ]}
                    >
                      {completed && <CheckCircle size={12} color="#fff" weight="fill" />}
                    </View>
                  );
                })}
              </View>

              {remaining > 0 && remaining < REFERRAL_GOAL ? (
                <Text style={[styles.remainingText, { color: colors.subtext }]}>
                  {remaining} more referral{remaining !== 1 ? 's' : ''} for another free month
                </Text>
              ) : (
                <Text style={[styles.remainingText, { color: colors.subtext }]}>
                  Invite {REFERRAL_GOAL} friends to earn your next free month
                </Text>
              )}

              <View style={[styles.totalRow, styles.totalRowFirst, { borderTopColor: colors.border }]}>
                <Text style={[styles.totalLabel, { color: colors.subtext }]}>Total referrals</Text>
                <Text style={[styles.totalValue, { color: colors.text }]}>{stats?.completedReferrals ?? 0}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.subtext }]}>Months earned</Text>
                <Text style={[styles.totalValue, { color: colors.accent }]}>{monthsEarned}</Text>
              </View>
            </View>

            <View style={[styles.codeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.codeLabel, { color: colors.subtext }]}>Your Referral Code</Text>
              <View style={[styles.codeBox, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                <Text style={[styles.codeText, { color: colors.text }]}>
                  {stats?.referralCode || '—'}
                </Text>
                <TouchableOpacity
                  onPress={handleCopyCode}
                  style={[styles.copyBtn, { backgroundColor: colors.accent + '15' }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Copy size={18} color={colors.accent} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.shareBtn, { backgroundColor: colors.accent }]}
                onPress={handleShare}
                activeOpacity={0.8}
              >
                <ShareNetwork size={20} color="#fff" weight="bold" />
                <Text style={styles.shareBtnText}>Share Invite Link</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.listSection]}>
              <View style={styles.listHeader}>
                <Users size={20} color={colors.accent} weight="fill" />
                <Text style={[styles.listTitle, { color: colors.text }]}>
                  Referred Friends ({referrals.length})
                </Text>
              </View>

              {referrals.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.emptyIcon]}>🫧</Text>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No referrals yet</Text>
                  <Text style={[styles.emptySubtext, { color: colors.subtext }]}>
                    Share your code with friends to start earning Pro!
                  </Text>
                </View>
              ) : (
                referrals.map((referral) => (
                  <ReferralRow key={referral.id} referral={referral} colors={colors} />
                ))
              )}
            </View>

            <View style={[styles.howItWorks, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.howTitle, { color: colors.text }]}>How It Works</Text>
              {[
                { step: '1', text: 'Share your unique referral code with friends' },
                { step: '2', text: 'They enter your code when signing up' },
                { step: '3', text: `Every ${REFERRAL_GOAL} friends who join = 1 free month of Pro` },
                { step: '4', text: 'Rewards stack — keep inviting for more months!' },
              ].map((item) => (
                <View key={item.step} style={styles.howRow}>
                  <View style={[styles.howStep, { backgroundColor: colors.accent + '15' }]}>
                    <Text style={[styles.howStepText, { color: colors.accent }]}>{item.step}</Text>
                  </View>
                  <Text style={[styles.howText, { color: colors.subtext }]}>{item.text}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

function ReferralRow({ referral, colors }: { referral: Referral; colors: any }) {
  const referred = referral.referred_profile;
  const isCompleted = referral.status === 'completed';
  const date = new Date(referral.created_at);
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <View style={[styles.referralRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ProfileAvatar
        avatarUrl={referred?.avatar_url ?? null}
        avatarEmoji={referred?.avatar_emoji ?? '🧴'}
        size={40}
        backgroundColor={colors.chip}
      />
      <View style={styles.referralInfo}>
        <Text style={[styles.referralName, { color: colors.text }]}>
          {referred?.display_name || referred?.username || 'User'}
        </Text>
        <Text style={[styles.referralDate, { color: colors.subtext }]}>{dateStr}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: isCompleted ? '#34c75915' : colors.chip }]}>
        {isCompleted ? (
          <CheckCircle size={14} color="#34c759" weight="fill" />
        ) : (
          <Clock size={14} color={colors.subtext} />
        )}
        <Text style={[styles.statusText, { color: isCompleted ? '#34c759' : colors.subtext }]}>
          {isCompleted ? 'Joined' : 'Pending'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '700' as const },
  scrollContent: { padding: 20, paddingBottom: 60 },
  loadingWrap: { paddingTop: 80, alignItems: 'center' },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  giftIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroTitle: { fontSize: 24, fontWeight: '800' as const, marginBottom: 8, textAlign: 'center' },
  heroSubtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  rewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  rewardBadgeText: { fontSize: 14, fontWeight: '700' as const },
  progressCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  progressLabel: { fontSize: 16, fontWeight: '700' as const },
  progressCount: { fontSize: 18, fontWeight: '800' as const },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  progressDots: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  remainingText: { fontSize: 13, textAlign: 'center' },
  expiryText: { fontSize: 13, marginTop: 10, textAlign: 'center', fontWeight: '600' as const },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  totalRowFirst: { paddingTop: 12, marginTop: 12, borderTopWidth: 1 },
  totalLabel: { fontSize: 14, fontWeight: '500' as const },
  totalValue: { fontSize: 16, fontWeight: '800' as const },
  codeCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 24,
  },
  codeLabel: { fontSize: 13, fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 10 },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  codeText: { fontSize: 20, fontWeight: '800' as const, letterSpacing: 2 },
  copyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 15,
  },
  shareBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' as const },
  listSection: { marginBottom: 24 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  listTitle: { fontSize: 17, fontWeight: '700' as const },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
  },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600' as const, marginBottom: 4 },
  emptySubtext: { fontSize: 14, textAlign: 'center' },
  emptyText: { fontSize: 16 },
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  referralInfo: { flex: 1 },
  referralName: { fontSize: 15, fontWeight: '600' as const },
  referralDate: { fontSize: 12, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: { fontSize: 12, fontWeight: '600' as const },
  howItWorks: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  howTitle: { fontSize: 17, fontWeight: '700' as const, marginBottom: 16 },
  howRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  howStep: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  howStepText: { fontSize: 14, fontWeight: '800' as const },
  howText: { flex: 1, fontSize: 14, lineHeight: 20 },
});

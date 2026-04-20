import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CaretLeft,
  Plus,
  Trophy,
  Target,
  X,
  Check,
  Trash,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { CollectionItem, WearDiaryEntry } from '@/lib/types';

const GOALS_KEY = 'scentbuddy_goals';
const FREE_GOAL_LIMIT = 1;

interface SupabaseGoal {
  id: string;
  user_id: string;
  type: string;
  label: string;
  icon: string | null;
  color: string | null;
  metric: string;
  target: number;
  completed: boolean;
  custom: boolean;
  completed_at: string | null;
  created_at: string;
}

interface FragranceGoal {
  id: string;
  title: string;
  description: string;
  type: GoalType;
  target: number;
  icon: string;
  color: string;
  createdAt: string;
  completedAt: string | null;
}

type GoalType =
  | 'collection_size'
  | 'brands_count'
  | 'wear_streak'
  | 'total_wears'
  | 'wishlist_size'
  | 'diary_entries'
  | 'try_new'
  | 'custom';

interface GoalTemplate {
  title: string;
  description: string;
  type: GoalType;
  targets: number[];
  icon: string;
  color: string;
}

const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    title: 'Collection Milestone',
    description: 'Grow your collection to {target} fragrances',
    type: 'collection_size',
    targets: [5, 10, 15, 20, 25, 50, 100],
    icon: '🧴',
    color: '#c49a6c',
  },
  {
    title: 'Brand Explorer',
    description: 'Collect fragrances from {target} different brands',
    type: 'brands_count',
    targets: [3, 5, 10, 20, 30],
    icon: '🏷️',
    color: '#5B8DEF',
  },
  {
    title: 'Wear Streak',
    description: 'Build a {target}-day consecutive wear streak',
    type: 'wear_streak',
    targets: [3, 7, 14, 30, 60],
    icon: '🔥',
    color: '#E8A838',
  },
  {
    title: 'Total Wears',
    description: 'Log {target} total wears in your diary',
    type: 'total_wears',
    targets: [10, 25, 50, 100, 250],
    icon: '📅',
    color: '#4CAF50',
  },
  {
    title: 'Wishlist Curator',
    description: 'Build a wishlist of {target} dream fragrances',
    type: 'wishlist_size',
    targets: [5, 10, 20, 50],
    icon: '💫',
    color: '#E91E63',
  },
  {
    title: 'Discovery Journey',
    description: 'Try {target} fragrances you don\'t own yet',
    type: 'try_new',
    targets: [3, 5, 10, 20],
    icon: '🔍',
    color: '#9B59B6',
  },
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function AnimatedProgressBar({ progress, color, delay }: { progress: number; color: string; delay: number }) {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: Math.min(progress, 100),
      duration: 800,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, delay, widthAnim]);

  const widthInterpolated = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.progressBarBg}>
      <Animated.View style={[styles.progressBarFill, { width: widthInterpolated, backgroundColor: color }]} />
    </View>
  );
}

export default function GoalsScreen() {
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const { isPro } = useRevenueCat();
  const hasPro = isPro || !!profile?.is_pro;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [celebrateGoalId, setCelebrateGoalId] = useState<string | null>(null);

  const goalsQuery = useQuery({
    queryKey: ['goals', user?.id],
    queryFn: async () => {
      if (!user?.id) return [] as FragranceGoal[];

      console.log('[GOALS] Fetching goals from Supabase...');
      const { data, error } = await supabase
        .from('user_goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.log('[GOALS] Supabase fetch error, falling back to local:', error.message);
        const stored = await AsyncStorage.getItem(`${GOALS_KEY}_${user.id}`);
        if (stored) return JSON.parse(stored) as FragranceGoal[];
        return [] as FragranceGoal[];
      }

      const goals: FragranceGoal[] = (data as SupabaseGoal[]).map(row => ({
        id: row.id,
        title: row.label,
        description: row.metric,
        type: row.type as GoalType,
        target: row.target,
        icon: row.icon ?? '🎯',
        color: row.color ?? '#c49a6c',
        createdAt: row.created_at,
        completedAt: row.completed_at,
      }));

      console.log('[GOALS] Fetched goals:', goals.length, goals.map(g => `${g.type}:${g.target}`));
      return goals;
    },
    enabled: !!user?.id,
    refetchOnMount: 'always' as const,
  });

  useEffect(() => {
    if (!user?.id) return;
    const migrateLocalGoals = async () => {
      try {
        const stored = await AsyncStorage.getItem(`${GOALS_KEY}_${user.id}`);
        if (!stored) return;
        const localGoals = JSON.parse(stored) as FragranceGoal[];
        if (localGoals.length === 0) return;

        const { data: existing } = await supabase
          .from('user_goals')
          .select('id')
          .eq('user_id', user.id);

        if (existing && existing.length > 0) {
          await AsyncStorage.removeItem(`${GOALS_KEY}_${user.id}`);
          return;
        }

        const rows = localGoals.map(g => ({
          user_id: user.id,
          type: g.type,
          label: g.title,
          icon: g.icon,
          color: g.color,
          metric: g.description,
          target: g.target,
          completed: !!g.completedAt,
          custom: g.type === 'custom',
          completed_at: g.completedAt,
        }));

        const { error } = await supabase.from('user_goals').insert(rows);
        if (!error) {
          await AsyncStorage.removeItem(`${GOALS_KEY}_${user.id}`);
          await queryClient.invalidateQueries({ queryKey: ['goals', user.id] });
          console.log('[GOALS] Migrated', localGoals.length, 'goals to Supabase');
        } else {
          console.log('[GOALS] Migration error:', error.message);
        }
      } catch (err) {
        console.log('[GOALS] Migration failed:', err);
      }
    };
    void migrateLocalGoals();
  }, [user?.id, queryClient]);

  const collectionQuery = useQuery({
    queryKey: ['collection', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      console.log('[GOALS] Fetching collection for stats...');
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const items = (data ?? []).map(item => ({
        ...item,
        perfume_name: item.perfume_name ?? 'Unknown',
        perfume_brand: item.perfume_brand ?? 'Unknown',
        top_notes: Array.isArray(item.top_notes) ? item.top_notes : [],
        heart_notes: Array.isArray(item.heart_notes) ? item.heart_notes : [],
        base_notes: Array.isArray(item.base_notes) ? item.base_notes : [],
        is_favorite: item.is_favorite ?? false,
        status: item.status || 'owned',
        fill_level: typeof item.fill_level === 'number' ? item.fill_level : 100,
        rating: typeof item.rating === 'number' ? item.rating : null,
      })) as CollectionItem[];
      console.log('[GOALS] Collection count:', items.length);
      return items;
    },
    enabled: !!user?.id,
    refetchOnMount: 'always' as const,
  });

  const wearsQuery = useQuery({
    queryKey: ['wears', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      console.log('[GOALS] Fetching wears for stats...');
      const { data, error } = await supabase
        .from('wear_diary')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      if (error) throw error;
      console.log('[GOALS] Wears count:', (data ?? []).length);
      return (data ?? []) as WearDiaryEntry[];
    },
    enabled: !!user?.id,
    refetchOnMount: 'always' as const,
  });

  const wishlistQuery = useQuery({
    queryKey: ['wishlist', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      console.log('[GOALS] Fetching wishlist for stats...');
      const { data, error } = await supabase
        .from('user_wishlists')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      console.log('[GOALS] Wishlist count:', (data ?? []).length);
      return data ?? [];
    },
    enabled: !!user?.id,
    refetchOnMount: 'always' as const,
  });

  const goals = useMemo(() => goalsQuery.data ?? [], [goalsQuery.data]);
  const collection = useMemo(() => collectionQuery.data ?? [], [collectionQuery.data]);
  const wears = useMemo(() => wearsQuery.data ?? [], [wearsQuery.data]);
  const wishlistCount = useMemo(() => wishlistQuery.data?.length ?? 0, [wishlistQuery.data]);

  const currentStats = useMemo(() => {
    const brands = new Set(collection.map(c => c.perfume_brand));
    let streak = 0;
    const wearDates = new Set(wears.map(w => w.date));
    const d = new Date();
    if (!wearDates.has(d.toISOString().split('T')[0])) {
      d.setDate(d.getDate() - 1);
    }
    while (wearDates.has(d.toISOString().split('T')[0])) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    const triedCount = collection.filter(c => c.status === 'tried').length;

    const stats = {
      collection_size: collection.length,
      brands_count: brands.size,
      wear_streak: streak,
      total_wears: wears.length,
      wishlist_size: wishlistCount,
      diary_entries: wears.length,
      try_new: triedCount,
      custom: 0,
    };
    console.log('[GOALS] Current stats:', JSON.stringify(stats));
    return stats;
  }, [collection, wears, wishlistCount]);

  const getProgress = useCallback((goal: FragranceGoal): number => {
    const current = currentStats[goal.type] ?? 0;
    return Math.min(100, Math.round((current / goal.target) * 100));
  }, [currentStats]);

  const getCurrentValue = useCallback((goal: FragranceGoal): number => {
    return currentStats[goal.type] ?? 0;
  }, [currentStats]);

  const addGoalMutation = useMutation({
    mutationFn: async (goal: FragranceGoal) => {
      if (!user?.id) throw new Error('Not authenticated');
      if (!hasPro) {
        const activeCount = goals.filter(g => !g.completedAt).length;
        if (activeCount >= FREE_GOAL_LIMIT) {
          throw new Error(`Free accounts are limited to ${FREE_GOAL_LIMIT} active goal. Upgrade to Pro for unlimited.`);
        }
      }
      const { error } = await supabase.from('user_goals').insert({
        user_id: user.id,
        type: goal.type,
        label: goal.title,
        icon: goal.icon,
        color: goal.color,
        metric: goal.description,
        target: goal.target,
        completed: false,
        custom: goal.type === 'custom',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['goals', user?.id] });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: Error) => {
      Alert.alert('Upgrade to Pro', error.message, [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/paywall' as any) },
      ]);
    },
  });

  const removeGoalMutation = useMutation({
    mutationFn: async (goalId: string) => {
      const { error } = await supabase.from('user_goals').delete().eq('id', goalId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['goals', user?.id] });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
  });

  const completeGoalMutation = useMutation({
    mutationFn: async (goalId: string) => {
      const { error } = await supabase
        .from('user_goals')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', goalId);
      if (error) throw error;
      return goalId;
    },
    onSuccess: (goalId) => {
      void queryClient.invalidateQueries({ queryKey: ['goals', user?.id] });
      setCelebrateGoalId(goalId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setCelebrateGoalId(null), 2500);
    },
  });

  const handleRemoveGoal = useCallback((goalId: string) => {
    Alert.alert('Remove Goal', 'Are you sure you want to remove this goal?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeGoalMutation.mutate(goalId) },
    ]);
  }, [removeGoalMutation]);

  const activeGoals = useMemo(() => goals.filter(g => !g.completedAt), [goals]);
  const completedGoals = useMemo(() => goals.filter(g => g.completedAt), [goals]);

  const handleOpenAdd = useCallback(() => {
    if (!hasPro && activeGoals.length >= FREE_GOAL_LIMIT) {
      Alert.alert(
        'Pro Feature',
        `Free accounts can have ${FREE_GOAL_LIMIT} active goal. Upgrade to Pro for unlimited goals!`,
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/paywall' as any) },
        ]
      );
      return;
    }
    setShowAddModal(true);
  }, [hasPro, activeGoals.length, router]);

  const overallProgress = useMemo(() => {
    if (activeGoals.length === 0) return 0;
    const total = activeGoals.reduce((sum, g) => sum + getProgress(g), 0);
    return Math.round(total / activeGoals.length);
  }, [activeGoals, getProgress]);

  useEffect(() => {
    activeGoals.forEach(goal => {
      if (getProgress(goal) >= 100 && !goal.completedAt) {
        completeGoalMutation.mutate(goal.id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStats]);

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
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <CaretLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Goals</Text>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.accent }]}
            onPress={handleOpenAdd}
          >
            <Plus size={18} color="#fff" weight="bold" />
          </TouchableOpacity>
        </View>

        {activeGoals.length > 0 && (
          <View style={[styles.overviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.overviewTop}>
              <View style={styles.overviewLeft}>
                <Trophy size={28} color={colors.accent} weight="fill" />
                <View style={styles.overviewInfo}>
                  <Text style={[styles.overviewLabel, { color: colors.subtext }]}>OVERALL PROGRESS</Text>
                  <Text style={[styles.overviewPct, { color: colors.text }]}>{overallProgress}%</Text>
                </View>
              </View>
              <View style={[styles.activeCountBadge, { backgroundColor: colors.accent + '18' }]}>
                <Text style={[styles.activeCountText, { color: colors.accent }]}>
                  {activeGoals.length} active
                </Text>
              </View>
            </View>
            <AnimatedProgressBar progress={overallProgress} color={colors.accent} delay={200} />
          </View>
        )}

        {activeGoals.length === 0 && completedGoals.length === 0 && (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.accent + '15' }]}>
              <Target size={36} color={colors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Set Your First Goal</Text>
            <Text style={[styles.emptySub, { color: colors.subtext }]}>
              Track your fragrance journey with personal milestones. Grow your collection, build streaks, and discover new scents.
            </Text>
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: colors.accent }]}
              onPress={handleOpenAdd}
            >
              <Plus size={18} color="#fff" />
              <Text style={styles.emptyBtnText}>Add a Goal</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeGoals.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Active Goals</Text>
            {activeGoals.map((goal, index) => {
              const progress = getProgress(goal);
              const current = getCurrentValue(goal);
              const isCelebrating = celebrateGoalId === goal.id;

              return (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  progress={progress}
                  current={current}
                  index={index}
                  isCelebrating={isCelebrating}
                  colors={colors}
                  onRemove={() => handleRemoveGoal(goal.id)}
                />
              );
            })}
          </View>
        )}

        {completedGoals.length > 0 && (
          <View style={styles.section}>
            <View style={styles.completedHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Completed</Text>
              <View style={[styles.completedBadge, { backgroundColor: '#4CAF50' + '18' }]}>
                <Check size={12} color="#4CAF50" weight="bold" />
                <Text style={[styles.completedBadgeText, { color: '#4CAF50' }]}>{completedGoals.length}</Text>
              </View>
            </View>
            {completedGoals.map(goal => (
              <View
                key={goal.id}
                style={[styles.completedCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.completedRow}>
                  <Text style={styles.goalEmoji}>{goal.icon}</Text>
                  <View style={styles.completedInfo}>
                    <Text style={[styles.completedTitle, { color: colors.text }]}>{goal.title}</Text>
                    <Text style={[styles.completedMeta, { color: colors.subtext }]}>
                      {goal.target} reached · {goal.completedAt ? new Date(goal.completedAt).toLocaleDateString() : ''}
                    </Text>
                  </View>
                  <View style={[styles.checkCircle, { backgroundColor: '#4CAF50' }]}>
                    <Check size={14} color="#fff" weight="bold" />
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.removeCompletedBtn}
                  onPress={() => handleRemoveGoal(goal.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Trash size={14} color={colors.subtext} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.tipCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={styles.tipEmoji}>💡</Text>
          <Text style={[styles.tipText, { color: colors.subtext }]}>
            Goals auto-complete when you hit the target. Keep adding to your collection, logging wears, and exploring new fragrances!
          </Text>
        </View>
      </ScrollView>

      <Modal visible={showAddModal} animationType="slide" {...(Platform.OS === 'ios' ? { presentationStyle: 'pageSheet' as const } : {})}>
        <AddGoalModal
          onClose={() => setShowAddModal(false)}
          onAdd={(goal) => {
            addGoalMutation.mutate(goal);
            setShowAddModal(false);
          }}
          existingGoals={goals}
          currentStats={currentStats}
        />
      </Modal>
    </View>
  );
}

const GoalCard = React.memo(function GoalCard({
  goal,
  progress,
  current,
  index,
  isCelebrating,
  colors,
  onRemove,
}: {
  goal: FragranceGoal;
  progress: number;
  current: number;
  index: number;
  isCelebrating: boolean;
  colors: any;
  onRemove: () => void;
}) {
  const celebrateScale = useRef(new Animated.Value(1)).current;
  const celebrateOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isCelebrating) {
      Animated.sequence([
        Animated.parallel([
          Animated.spring(celebrateScale, { toValue: 1.05, useNativeDriver: true }),
          Animated.timing(celebrateOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
        Animated.delay(1500),
        Animated.parallel([
          Animated.spring(celebrateScale, { toValue: 1, useNativeDriver: true }),
          Animated.timing(celebrateOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [isCelebrating, celebrateScale, celebrateOpacity]);

  return (
    <Animated.View
      style={[
        styles.goalCard,
        {
          backgroundColor: colors.card,
          borderColor: isCelebrating ? goal.color : colors.border,
          transform: [{ scale: celebrateScale }],
        },
      ]}
    >
      {isCelebrating && (
        <Animated.View style={[styles.celebrateOverlay, { opacity: celebrateOpacity, backgroundColor: goal.color + '10' }]}>
          <Text style={styles.celebrateText}>🎉 Goal Reached!</Text>
        </Animated.View>
      )}
      <View style={styles.goalTop}>
        <View style={[styles.goalIconWrap, { backgroundColor: goal.color + '18' }]}>
          <Text style={styles.goalEmoji}>{goal.icon}</Text>
        </View>
        <View style={styles.goalInfo}>
          <Text style={[styles.goalTitle, { color: colors.text }]}>{goal.title}</Text>
          <Text style={[styles.goalDesc, { color: colors.subtext }]}>
            {goal.description.replace('{target}', goal.target.toString())}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onRemove}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.goalRemoveBtn}
        >
          <X size={16} color={colors.subtext} />
        </TouchableOpacity>
      </View>
      <View style={styles.goalProgressSection}>
        <AnimatedProgressBar progress={progress} color={goal.color} delay={index * 100 + 300} />
        <View style={styles.goalProgressMeta}>
          <Text style={[styles.goalCurrent, { color: goal.color }]}>
            {current} / {goal.target}
          </Text>
          <Text style={[styles.goalPct, { color: colors.subtext }]}>{progress}%</Text>
        </View>
      </View>
    </Animated.View>
  );
});

function AddGoalModal({
  onClose,
  onAdd,
  existingGoals,
  currentStats,
}: {
  onClose: () => void;
  onAdd: (goal: FragranceGoal) => void;
  existingGoals: FragranceGoal[];
  currentStats: Record<string, number>;
}) {
  const { colors } = useTheme();
  const [selectedTemplate, setSelectedTemplate] = useState<GoalTemplate | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [customTarget, setCustomTarget] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const handleAddFromTemplate = useCallback(() => {
    if (!selectedTemplate || !selectedTarget) return;
    const goal: FragranceGoal = {
      id: generateId(),
      title: selectedTemplate.title,
      description: selectedTemplate.description,
      type: selectedTemplate.type,
      target: selectedTarget,
      icon: selectedTemplate.icon,
      color: selectedTemplate.color,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    onAdd(goal);
  }, [selectedTemplate, selectedTarget, onAdd]);

  const handleAddCustom = useCallback(() => {
    if (!customTitle.trim() || !customTarget.trim()) return;
    const target = parseInt(customTarget, 10);
    if (isNaN(target) || target <= 0) {
      Alert.alert('Invalid', 'Please enter a valid target number');
      return;
    }
    const goal: FragranceGoal = {
      id: generateId(),
      title: customTitle.trim(),
      description: `Reach ${target}`,
      type: 'custom',
      target,
      icon: '🎯',
      color: '#c49a6c',
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    onAdd(goal);
  }, [customTitle, customTarget, onAdd]);

  const getSmartSuggestion = useCallback((template: GoalTemplate): number | null => {
    const current = currentStats[template.type] ?? 0;
    const activeForType = existingGoals.filter(g => g.type === template.type && !g.completedAt);
    const activeTargets = new Set(activeForType.map(g => g.target));
    const nextTarget = template.targets.find(t => t > current && !activeTargets.has(t));
    return nextTarget ?? null;
  }, [currentStats, existingGoals]);

  return (
    <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
      <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.modalTitle, { color: colors.text }]}>Add Goal</Text>
        <TouchableOpacity onPress={onClose}>
          <X size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
        {!showCustom ? (
          <>
            <Text style={[styles.modalSectionLabel, { color: colors.subtext }]}>CHOOSE A GOAL</Text>
            {GOAL_TEMPLATES.map((template, i) => {
              const isSelected = selectedTemplate?.type === template.type;
              const suggestion = getSmartSuggestion(template);
              const currentVal = currentStats[template.type] ?? 0;

              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.templateCard,
                    {
                      backgroundColor: isSelected ? template.color + '12' : colors.card,
                      borderColor: isSelected ? template.color : colors.border,
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    setSelectedTemplate(template);
                    if (suggestion) setSelectedTarget(suggestion);
                    else setSelectedTarget(null);
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <View style={[styles.templateIcon, { backgroundColor: template.color + '18' }]}>
                    <Text style={styles.templateEmoji}>{template.icon}</Text>
                  </View>
                  <View style={styles.templateInfo}>
                    <Text style={[styles.templateTitle, { color: colors.text }]}>{template.title}</Text>
                    <Text style={[styles.templateSub, { color: colors.subtext }]}>
                      Currently at {currentVal}
                      {suggestion ? ` · Next: ${suggestion}` : ' · All targets active'}
                    </Text>
                  </View>
                  {isSelected && (
                    <View style={[styles.selectedDot, { backgroundColor: template.color }]} />
                  )}
                </TouchableOpacity>
              );
            })}

            {selectedTemplate && (
              <View style={styles.targetSection}>
                <Text style={[styles.modalSectionLabel, { color: colors.subtext }]}>SET TARGET</Text>
                <View style={styles.targetGrid}>
                  {selectedTemplate.targets.map(t => {
                    const isActive = selectedTarget === t;
                    const current = currentStats[selectedTemplate.type] ?? 0;
                    const alreadyReached = current >= t;
                    const alreadySet = existingGoals.some(g => g.type === selectedTemplate.type && g.target === t && !g.completedAt);

                    return (
                      <TouchableOpacity
                        key={t}
                        style={[
                          styles.targetChip,
                          {
                            backgroundColor: isActive
                              ? selectedTemplate.color
                              : alreadyReached
                              ? '#4CAF50' + '12'
                              : colors.chip,
                            borderColor: isActive
                              ? selectedTemplate.color
                              : alreadyReached
                              ? '#4CAF50' + '40'
                              : colors.border,
                            opacity: alreadySet ? 0.4 : 1,
                          },
                        ]}
                        onPress={() => {
                          if (!alreadySet) {
                            setSelectedTarget(t);
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }
                        }}
                        disabled={alreadySet}
                      >
                        <Text
                          style={[
                            styles.targetText,
                            {
                              color: isActive ? '#fff' : alreadyReached ? '#4CAF50' : colors.text,
                            },
                          ]}
                        >
                          {t}
                        </Text>
                        {alreadyReached && !isActive && (
                          <Check size={12} color="#4CAF50" weight="bold" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.customToggle, { borderColor: colors.border }]}
                onPress={() => setShowCustom(true)}
              >
                <Text style={[styles.customToggleText, { color: colors.subtext }]}>Or create a custom goal</Text>
              </TouchableOpacity>

              {selectedTemplate && selectedTarget && (
                <TouchableOpacity
                  style={[styles.addGoalBtn, { backgroundColor: selectedTemplate.color }]}
                  onPress={handleAddFromTemplate}
                >
                  <Target size={18} color="#fff" />
                  <Text style={styles.addGoalBtnText}>Add Goal</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.modalSectionLabel, { color: colors.subtext }]}>CUSTOM GOAL</Text>
            <View style={styles.customForm}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.accent }]}>Goal Title</Text>
                <TextInput
                  style={[styles.fieldInput, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border }]}
                  value={customTitle}
                  onChangeText={setCustomTitle}
                  placeholder="e.g. Build a niche collection"
                  placeholderTextColor={colors.subtext}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.accent }]}>Target Number</Text>
                <TextInput
                  style={[styles.fieldInput, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border }]}
                  value={customTarget}
                  onChangeText={setCustomTarget}
                  placeholder="e.g. 10"
                  placeholderTextColor={colors.subtext}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.customToggle, { borderColor: colors.border }]}
                onPress={() => setShowCustom(false)}
              >
                <Text style={[styles.customToggleText, { color: colors.subtext }]}>Back to templates</Text>
              </TouchableOpacity>

              {customTitle.trim() && customTarget.trim() && (
                <TouchableOpacity
                  style={[styles.addGoalBtn, { backgroundColor: colors.accent }]}
                  onPress={handleAddCustom}
                >
                  <Target size={18} color="#fff" />
                  <Text style={styles.addGoalBtnText}>Add Custom Goal</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700' as const,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 24,
  },
  overviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  overviewLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  overviewInfo: {},
  overviewLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  overviewPct: {
    fontSize: 28,
    fontWeight: '800' as const,
  },
  activeCountBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  activeCountText: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.15)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  emptyState: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  goalCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 12,
    overflow: 'hidden',
  },
  celebrateOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderRadius: 18,
  },
  celebrateText: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: '#4CAF50',
  },
  goalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  goalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalEmoji: {
    fontSize: 24,
  },
  goalInfo: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  goalDesc: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  goalRemoveBtn: {
    padding: 4,
  },
  goalProgressSection: {
    gap: 8,
  },
  goalProgressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalCurrent: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  goalPct: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 10,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  completedBadgeText: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
  completedCard: {
    marginHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  completedRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  completedInfo: {
    flex: 1,
  },
  completedTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  completedMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeCompletedBtn: {
    padding: 6,
    marginLeft: 8,
  },
  tipCard: {
    marginTop: 16,
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  tipEmoji: {
    fontSize: 20,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  modalContent: {
    padding: 20,
    paddingBottom: 40,
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 4,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    gap: 14,
  },
  templateIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateEmoji: {
    fontSize: 24,
  },
  templateInfo: {
    flex: 1,
  },
  templateTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  templateSub: {
    fontSize: 12,
    marginTop: 2,
  },
  selectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  targetSection: {
    marginTop: 16,
  },
  targetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  targetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  targetText: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  modalActions: {
    marginTop: 24,
    gap: 12,
  },
  customToggle: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  customToggleText: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  addGoalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  addGoalBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  customForm: {
    gap: 16,
  },
  fieldGroup: {},
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    marginBottom: 6,
  },
  fieldInput: {
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
  },
});

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CaretLeft, CaretRight, Plus, X, Star } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase, forceHttps } from '@/lib/supabase';
import { WearDiaryEntry, CollectionItem } from '@/lib/types';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MOODS = ['😊 Happy', '😌 Relaxed', '💪 Confident', '🥰 Romantic', '😎 Cool', '🤔 Thoughtful'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

export default function DiaryScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [showLogModal, setShowLogModal] = useState(false);

  const wearsQuery = useQuery({
    queryKey: ['wears', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('wear_diary')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WearDiaryEntry[];
    },
    enabled: !!user?.id,
  });

  const collectionQuery = useQuery({
    queryKey: ['collection', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data ?? []) as CollectionItem[];
    },
    enabled: !!user?.id,
  });

  const wears = wearsQuery.data ?? [];

  const wearDates = useMemo(() => {
    const set = new Set<string>();
    wears.forEach(w => set.add(w.date));
    return set;
  }, [wears]);

  const streakInfo = useMemo(() => {
    let streak = 0;
    const d = new Date();
    if (!wearDates.has(d.toISOString().split('T')[0])) {
      d.setDate(d.getDate() - 1);
    }
    while (wearDates.has(d.toISOString().split('T')[0])) {
      streak++;
      d.setDate(d.getDate() - 1);
    }

    let bestStreak = 0;
    let currentStreak = 0;
    const sortedDates = Array.from(wearDates).sort();
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        currentStreak = 1;
      } else {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
          currentStreak++;
        } else {
          currentStreak = 1;
        }
      }
      bestStreak = Math.max(bestStreak, currentStreak);
    }

    const uniqueScents = new Set(wears.map(w => `${w.perfume_name}|${w.perfume_brand}`));

    return { streak, bestStreak, totalWears: wears.length, uniqueScents: uniqueScents.size };
  }, [wears, wearDates]);

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const hasWornToday = wearDates.has(todayStr);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const monthName = new Date(viewYear, viewMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const recentWears = useMemo(() => {
    return wears.slice(0, 10);
  }, [wears]);

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
          <Text style={[styles.title, { color: colors.text }]}>Wear Diary</Text>
          <TouchableOpacity
            style={[styles.logBtn, { backgroundColor: colors.accent }]}
            onPress={() => setShowLogModal(true)}
          >
            <Plus size={16} color="#fff" />
            <Text style={styles.logBtnText}>Log Wear</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.streakCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.streakTop}>
            <Text style={styles.streakEmoji}>
              {streakInfo.streak > 0 ? '🔥' : '💤'}
            </Text>
            <View>
              <Text style={[styles.streakCount, { color: colors.text }]}>
                {streakInfo.streak} <Text style={[styles.streakLabel, { color: colors.subtext }]}>days</Text>
              </Text>
              <Text style={[styles.streakSub, { color: colors.subtext }]}>
                {streakInfo.streak > 0 ? 'Keep the streak going!' : 'Log a wear to start your streak'}
              </Text>
            </View>
          </View>
          <View style={styles.streakStats}>
            <View style={styles.streakStat}>
              <Text style={[styles.streakStatValue, { color: colors.text }]}>{streakInfo.bestStreak}</Text>
              <Text style={[styles.streakStatLabel, { color: colors.subtext }]}>Best streak</Text>
            </View>
            <View style={styles.streakStat}>
              <Text style={[styles.streakStatValue, { color: colors.text }]}>{streakInfo.totalWears}</Text>
              <Text style={[styles.streakStatLabel, { color: colors.subtext }]}>Total wears</Text>
            </View>
            <View style={styles.streakStat}>
              <Text style={[styles.streakStatValue, { color: colors.text }]}>{streakInfo.uniqueScents}</Text>
              <Text style={[styles.streakStatLabel, { color: colors.subtext }]}>Unique scents</Text>
            </View>
          </View>
        </View>

        <View style={styles.quickStats}>
          <View style={[styles.quickStatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.quickStatValue, { color: colors.text }]}>{hasWornToday ? '✓' : '—'}</Text>
            <Text style={[styles.quickStatLabel, { color: colors.subtext }]}>Today</Text>
          </View>
          <View style={[styles.quickStatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.quickStatValue, { color: colors.text }]}>
              {streakInfo.streak} {streakInfo.streak > 0 ? '🔥' : ''}
            </Text>
            <Text style={[styles.quickStatLabel, { color: colors.subtext }]}>Streak</Text>
          </View>
          <View style={[styles.quickStatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.quickStatValue, { color: colors.accent }]}>{streakInfo.bestStreak}</Text>
            <Text style={[styles.quickStatLabel, { color: colors.subtext }]}>Best</Text>
          </View>
        </View>

        <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.calendarHeader}>
            <TouchableOpacity onPress={prevMonth}>
              <CaretLeft size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.calendarMonth, { color: colors.text }]}>{monthName}</Text>
            <TouchableOpacity onPress={nextMonth}>
              <CaretRight size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.calendarDays}>
            {DAYS.map((d, i) => (
              <Text key={i} style={[styles.dayHeader, { color: colors.subtext }]}>{d}</Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.dayCell} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const hasWear = wearDates.has(dateStr);
              const isToday = dateStr === todayStr;

              return (
                <View key={day} style={styles.dayCell}>
                  <View style={[
                    styles.dayCircle,
                    hasWear && { backgroundColor: colors.accent + '20' },
                    isToday && { borderWidth: 2, borderColor: colors.accent },
                  ]}>
                    <Text style={[styles.dayText, { color: hasWear ? colors.accent : colors.text }]}>
                      {day}
                    </Text>
                  </View>
                  {hasWear && <View style={[styles.wearDot, { backgroundColor: colors.accent }]} />}
                </View>
              );
            })}
          </View>
        </View>

        {recentWears.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={[styles.recentTitle, { color: colors.text }]}>Recent Wears</Text>
            {recentWears.map(wear => {
              const colItem = (collectionQuery.data ?? []).find(
                c => c.perfume_name === wear.perfume_name && c.perfume_brand === wear.perfume_brand
              );
              return (
                <View key={wear.id} style={[styles.wearEntry, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {(colItem?.image_url || wear.image_url) ? (
                    <Image
                      source={{ uri: forceHttps(colItem?.image_url || wear.image_url) ?? undefined }}
                      style={styles.wearEntryImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.wearEntryImage, { backgroundColor: colors.chip }]} />
                  )}
                  <View style={styles.wearEntryInfo}>
                    <Text style={[styles.wearEntryName, { color: colors.text }]}>{wear.perfume_name}</Text>
                    <Text style={[styles.wearEntryBrand, { color: colors.subtext }]}>{wear.perfume_brand}</Text>
                  </View>
                  <View style={styles.wearEntryMeta}>
                    <Text style={[styles.wearEntryDate, { color: colors.subtext }]}>
                      {new Date(wear.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                    {wear.occasion && (
                      <Text style={[styles.wearEntryOccasion, { color: colors.accent }]}>{wear.occasion}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <LogWearModal
        visible={showLogModal}
        onClose={() => setShowLogModal(false)}
        userId={user?.id ?? ''}
        collection={collectionQuery.data ?? []}
      />
    </View>
  );
}

function LogWearModal({ visible, onClose, userId, collection }: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  collection: CollectionItem[];
}) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);
  const [occasion, setOccasion] = useState('');
  const [mood, setMood] = useState('');
  const [note, setNote] = useState('');
  const [rating, setRating] = useState(0);
  const [sprays, setSprays] = useState('');

  const logMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem) throw new Error('Select a perfume');
      const today = new Date().toISOString().split('T')[0];

      await supabase.from('wear_diary').insert({
        user_id: userId,
        perfume_name: selectedItem.perfume_name,
        perfume_brand: selectedItem.perfume_brand,
        date: today,
        note: note || null,
        image_url: selectedItem.image_url,
        occasion: occasion || null,
        mood: mood || null,
        rating: rating || null,
        sprays: sprays ? parseInt(sprays) : null,
      });

      await supabase.from('today_wears').insert({
        user_id: userId,
        perfume_name: selectedItem.perfume_name,
        perfume_brand: selectedItem.perfume_brand,
        image_url: selectedItem.image_url,
        note: note || null,
        date: today,
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wears', userId] });
      void queryClient.invalidateQueries({ queryKey: ['today-wears'] });
      resetForm();
      onClose();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const resetForm = useCallback(() => {
    setSelectedItem(null);
    setOccasion('');
    setMood('');
    setNote('');
    setRating(0);
    setSprays('');
  }, []);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modalContainer, { backgroundColor: colors.background }]}
      >
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Log Wear</Text>
          <TouchableOpacity onPress={() => { resetForm(); onClose(); }}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          {!selectedItem ? (
            <>
              <Text style={[styles.fieldLabel, { color: colors.subtext }]}>SELECT A PERFUME</Text>
              {collection.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.selectCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => setSelectedItem(item)}
                >
                  {item.image_url && (
                    <Image source={{ uri: forceHttps(item.image_url) ?? undefined }} style={styles.selectImage} resizeMode="contain" />
                  )}
                  <View style={styles.selectInfo}>
                    <Text style={[styles.selectName, { color: colors.text }]}>{item.perfume_name}</Text>
                    <Text style={[styles.selectBrand, { color: colors.subtext }]}>{item.perfume_brand}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <>
              <View style={[styles.selectedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.selectedName, { color: colors.text }]}>{selectedItem.perfume_name}</Text>
                <Text style={[styles.selectedBrand, { color: colors.subtext }]}>{selectedItem.perfume_brand}</Text>
                <TouchableOpacity onPress={() => setSelectedItem(null)}>
                  <Text style={[styles.changeText, { color: colors.accent }]}>Change</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.subtext }]}>OCCASION</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {['Everyday', 'Office', 'Date Night', 'Evening', 'Special'].map(o => (
                  <TouchableOpacity
                    key={o}
                    style={[styles.chip, {
                      backgroundColor: occasion === o ? colors.accent : colors.chip,
                      borderColor: occasion === o ? colors.accent : colors.border,
                    }]}
                    onPress={() => setOccasion(occasion === o ? '' : o)}
                  >
                    <Text style={[styles.chipText, { color: occasion === o ? '#fff' : colors.text }]}>{o}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.fieldLabel, { color: colors.subtext }]}>MOOD</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {MOODS.map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.chip, {
                      backgroundColor: mood === m ? colors.accent : colors.chip,
                      borderColor: mood === m ? colors.accent : colors.border,
                    }]}
                    onPress={() => setMood(mood === m ? '' : m)}
                  >
                    <Text style={[styles.chipText, { color: mood === m ? '#fff' : colors.text }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.fieldLabel, { color: colors.subtext }]}>RATING</Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map(r => (
                  <TouchableOpacity key={r} onPress={() => setRating(r)}>
                    <Star size={28} color="#FFD700" weight={rating >= r ? 'fill' : 'regular'} />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.subtext }]}>SPRAYS</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border }]}
                value={sprays}
                onChangeText={setSprays}
                keyboardType="number-pad"
                placeholder="How many sprays?"
                placeholderTextColor={colors.subtext}
              />

              <Text style={[styles.fieldLabel, { color: colors.subtext }]}>NOTE</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border, height: 80, textAlignVertical: 'top' }]}
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="How did it perform today?"
                placeholderTextColor={colors.subtext}
              />

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.accent }]}
                onPress={() => logMutation.mutate()}
                disabled={logMutation.isPending}
              >
                {logMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Log Wear</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16, gap: 8 },
  backBtn: { padding: 4 },
  title: { fontSize: 24, fontWeight: '700' as const, flex: 1 },
  logBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  logBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' as const },
  streakCard: { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 12 },
  streakTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  streakEmoji: { fontSize: 36 },
  streakCount: { fontSize: 28, fontWeight: '700' as const },
  streakLabel: { fontSize: 18, fontWeight: '400' as const },
  streakSub: { fontSize: 13, marginTop: 2 },
  streakStats: { flexDirection: 'row', justifyContent: 'space-around' },
  streakStat: { alignItems: 'center' },
  streakStatValue: { fontSize: 20, fontWeight: '700' as const },
  streakStatLabel: { fontSize: 12, marginTop: 2 },
  quickStats: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 16 },
  quickStatCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1 },
  quickStatValue: { fontSize: 20, fontWeight: '700' as const },
  quickStatLabel: { fontSize: 12, marginTop: 4 },
  calendarCard: { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 20 },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  calendarMonth: { fontSize: 18, fontWeight: '700' as const },
  calendarDays: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  dayHeader: { fontSize: 13, fontWeight: '600' as const, width: 36, textAlign: 'center' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', height: 44, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 14, fontWeight: '500' as const },
  wearDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  recentSection: { paddingHorizontal: 20 },
  recentTitle: { fontSize: 20, fontWeight: '700' as const, marginBottom: 12 },
  wearEntry: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8, gap: 12 },
  wearEntryImage: { width: 48, height: 48, borderRadius: 10 },
  wearEntryInfo: { flex: 1 },
  wearEntryName: { fontSize: 15, fontWeight: '600' as const },
  wearEntryBrand: { fontSize: 13, marginTop: 2 },
  wearEntryMeta: { alignItems: 'flex-end' },
  wearEntryDate: { fontSize: 12 },
  wearEntryOccasion: { fontSize: 12, marginTop: 4 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 20, fontWeight: '700' as const },
  modalContent: { padding: 20, paddingBottom: 40 },
  fieldLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.5, marginBottom: 8, marginTop: 12 },
  selectCard: { flexDirection: 'row', padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8, alignItems: 'center', gap: 12 },
  selectImage: { width: 48, height: 48, borderRadius: 8 },
  selectInfo: { flex: 1 },
  selectName: { fontSize: 15, fontWeight: '600' as const },
  selectBrand: { fontSize: 13, marginTop: 2 },
  selectedCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 8 },
  selectedName: { fontSize: 16, fontWeight: '700' as const },
  selectedBrand: { fontSize: 13, marginTop: 2 },
  changeText: { fontSize: 14, fontWeight: '600' as const, marginTop: 8 },
  chipScroll: { marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  chipText: { fontSize: 13, fontWeight: '600' as const },
  ratingRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  fieldInput: { borderRadius: 12, padding: 12, fontSize: 15, borderWidth: 1, marginBottom: 8 },
  submitBtn: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 16 },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' as const },
});

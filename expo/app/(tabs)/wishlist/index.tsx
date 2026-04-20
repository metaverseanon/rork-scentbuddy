import React, { useState, useCallback, useMemo } from 'react';
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
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, MagnifyingGlass, Star, Heart } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { supabase, searchFragrances, forceHttps } from '@/lib/supabase';
import { WishlistItem, SearchResult } from '@/lib/types';
import { analyzeFragranceProfile, getSeasonSuitability, getTimeSuitability } from '@/lib/fragrance-profile';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48 - 10) / 2;

const PRIORITY_LABELS = ['Low', 'Medium', 'High'] as const;
const PRIORITY_COLORS = ['#4CAF50', '#FFC107', '#E74C3C'];

export default function WishlistScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WishlistItem | null>(null);

  const wishlistQuery = useQuery({
    queryKey: ['wishlist', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_wishlists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WishlistItem[];
    },
    enabled: !!user?.id,
  });

  const wishlist = wishlistQuery.data ?? [];

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_wishlists').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wishlist', user?.id] });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
  });

  const handleRemove = useCallback((id: string) => {
    Alert.alert('Remove', 'Remove this from your wishlist?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate(id) },
    ]);
  }, [removeMutation]);

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
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Wishlist</Text>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.accent }]}
            onPress={() => setShowAddModal(true)}
          >
            <Plus size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        {wishlistQuery.isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : wishlist.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>💫</Text>
            <Text style={[styles.emptyText, { color: colors.subtext }]}>
              Your wishlist is empty.{'\n'}Add fragrances you want to try!
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {wishlist.map(item => (
              <TouchableOpacity
                key={item.id}
                style={[styles.card, { overflow: 'hidden', backgroundColor: colors.card }]}
                activeOpacity={0.85}
                onPress={() => {
                  setSelectedItem(item);
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                {item.image_url ? (
                  <Image
                    source={{ uri: forceHttps(item.image_url) ?? undefined }}
                    style={styles.cardImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.cardImage, { backgroundColor: colors.chip }]} />
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.75)']}
                  style={styles.cardOverlay}
                >
                  <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[item.priority] }]}>
                    <Text style={styles.priorityText}>{PRIORITY_LABELS[item.priority]}</Text>
                  </View>
                  <Text style={styles.cardName} numberOfLines={1}>{item.perfume_name}</Text>
                  <Text style={styles.cardBrand} numberOfLines={1}>{item.perfume_brand}</Text>
                  {item.estimated_price && (
                    <Text style={styles.cardPrice}>{item.estimated_price}</Text>
                  )}
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => handleRemove(item.id)}
                  >
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <AddWishlistModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        userId={user?.id ?? ''}
      />

      {selectedItem && (
        <WishlistDetailModal
          visible={!!selectedItem}
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onRemove={() => {
            handleRemove(selectedItem.id);
            setSelectedItem(null);
          }}
        />
      )}
    </View>
  );
}

function AddWishlistModal({ visible, onClose, userId }: {
  visible: boolean;
  onClose: () => void;
  userId: string;
}) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '', brand: '', imageUrl: '', estimatedPrice: '', reason: '', priority: 1,
  });

  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((text: string) => {
    setSearchText(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchFragrances(text);
      setSearchResults(results);
      setSearching(false);
    }, 400);
  }, []);

  const selectResult = useCallback((result: SearchResult) => {
    setFormData({
      name: result.name,
      brand: result.brand,
      imageUrl: result.imageUrl || '',
      estimatedPrice: '',
      reason: '',
      priority: 1,
    });
    setShowForm(true);
    setSearchResults([]);
  }, []);

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('user_wishlists').insert({
        user_id: userId,
        perfume_name: formData.name,
        perfume_brand: formData.brand,
        image_url: formData.imageUrl || null,
        estimated_price: formData.estimatedPrice || null,
        reason: formData.reason || null,
        priority: formData.priority,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wishlist', userId] });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
      onClose();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const resetForm = useCallback(() => {
    setSearchText('');
    setSearchResults([]);
    setFormData({ name: '', brand: '', imageUrl: '', estimatedPrice: '', reason: '', priority: 1 });
    setShowForm(false);
  }, []);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modalContainer, { backgroundColor: colors.background }]}
      >
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Add to Wishlist</Text>
          <TouchableOpacity onPress={() => { resetForm(); onClose(); }}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          {!showForm ? (
            <>
              <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <MagnifyingGlass size={18} color={colors.subtext} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Search fragrances..."
                  placeholderTextColor={colors.subtext}
                  value={searchText}
                  onChangeText={handleSearch}
                  autoFocus
                />
              </View>

              {searching && <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />}

              {searchResults.map((result, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => selectResult(result)}
                >
                  {result.imageUrl && (
                    <Image source={{ uri: forceHttps(result.imageUrl) ?? undefined }} style={styles.resultImage} resizeMode="contain" />
                  )}
                  <View style={styles.resultInfo}>
                    <Text style={[styles.resultName, { color: colors.text }]}>{result.name}</Text>
                    <Text style={[styles.resultBrand, { color: colors.subtext }]}>{result.brand}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[styles.manualBtn, { borderColor: colors.border }]}
                onPress={() => setShowForm(true)}
              >
                <Text style={[styles.manualBtnText, { color: colors.accent }]}>+ Add manually</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.subtext }]}>NAME</Text>
                <TextInput
                  style={[styles.fieldInput, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border }]}
                  value={formData.name}
                  onChangeText={v => setFormData(p => ({ ...p, name: v }))}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.subtext }]}>BRAND</Text>
                <TextInput
                  style={[styles.fieldInput, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border }]}
                  value={formData.brand}
                  onChangeText={v => setFormData(p => ({ ...p, brand: v }))}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.subtext }]}>ESTIMATED PRICE</Text>
                <TextInput
                  style={[styles.fieldInput, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border }]}
                  value={formData.estimatedPrice}
                  onChangeText={v => setFormData(p => ({ ...p, estimatedPrice: v }))}
                  placeholder="e.g. €150"
                  placeholderTextColor={colors.subtext}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.subtext }]}>REASON</Text>
                <TextInput
                  style={[styles.fieldInput, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border, height: 80, textAlignVertical: 'top' }]}
                  value={formData.reason}
                  onChangeText={v => setFormData(p => ({ ...p, reason: v }))}
                  placeholder="Why do you want this?"
                  placeholderTextColor={colors.subtext}
                  multiline
                />
              </View>

              <Text style={[styles.fieldLabel, { color: colors.subtext }]}>PRIORITY</Text>
              <View style={styles.priorityRow}>
                {PRIORITY_LABELS.map((label, i) => (
                  <TouchableOpacity
                    key={label}
                    style={[styles.priorityOption, {
                      backgroundColor: formData.priority === i ? PRIORITY_COLORS[i] : colors.chip,
                      borderColor: PRIORITY_COLORS[i],
                    }]}
                    onPress={() => setFormData(p => ({ ...p, priority: i }))}
                  >
                    <Text style={[styles.priorityOptionText, { color: formData.priority === i ? '#fff' : colors.text }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.accent }]}
                onPress={() => addMutation.mutate()}
                disabled={!formData.name.trim() || !formData.brand.trim() || addMutation.isPending}
              >
                {addMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Add to Wishlist</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ACCORD_COLORS: Record<string, string> = {
  sweet: '#E74C3C', honey: '#DAA520', vanilla: '#F4D03F', tobacco: '#8B4513',
  lavender: '#9B59B6', woody: '#795548', fresh: '#00BCD4', citrus: '#FFC107',
  floral: '#E91E63', spicy: '#FF5722', amber: '#FF8F00', leather: '#3E2723',
  rose: '#F06292', jasmine: '#FFF9C4', sandalwood: '#D2B48C', oud: '#3E2723',
  bergamot: '#C49A6C', cedar: '#795548', musk: '#CE93D8', patchouli: '#6D4C41',
};

function getAccordColor(accord: string): string {
  const lower = accord.toLowerCase();
  for (const [key, color] of Object.entries(ACCORD_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return '#c49a6c';
}

function WishlistDetailModal({ visible, item, onClose, onRemove }: {
  visible: boolean;
  item: WishlistItem;
  onClose: () => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();

  const detailQuery = useQuery({
    queryKey: ['wishlist-detail', item.perfume_name, item.perfume_brand],
    queryFn: async () => {
      const results = await searchFragrances(`${item.perfume_name} ${item.perfume_brand}`, 5);
      const match = results.find(
        (r: SearchResult) =>
          r.name.toLowerCase() === item.perfume_name.toLowerCase() &&
          r.brand.toLowerCase() === item.perfume_brand.toLowerCase()
      ) || results[0] || null;
      return match as SearchResult | null;
    },
    enabled: visible,
  });

  const detail = detailQuery.data;

  const fragranceProfile = useMemo(() => {
    if (!detail) return null;
    return analyzeFragranceProfile(
      detail.topNotes ?? [],
      detail.heartNotes ?? [],
      detail.baseNotes ?? [],
    );
  }, [detail]);

  const allNotes = useMemo(() => {
    if (!detail) return [];
    return [
      ...(detail.baseNotes ?? []).map(n => ({ note: n, type: 'base' as const, weight: 3 })),
      ...(detail.heartNotes ?? []).map(n => ({ note: n, type: 'heart' as const, weight: 2 })),
      ...(detail.topNotes ?? []).map(n => ({ note: n, type: 'top' as const, weight: 1 })),
    ];
  }, [detail]);

  const maxWeight = Math.max(...allNotes.map(n => n.weight), 1);

  const seasonMatch = useCallback((s: string) => {
    if (!fragranceProfile) return false;
    const key = s.toLowerCase() as keyof typeof fragranceProfile.seasons;
    return getSeasonSuitability(fragranceProfile.seasons[key]) === 'high';
  }, [fragranceProfile]);

  const seasonMedium = useCallback((s: string) => {
    if (!fragranceProfile) return false;
    const key = s.toLowerCase() as keyof typeof fragranceProfile.seasons;
    return getSeasonSuitability(fragranceProfile.seasons[key]) === 'medium';
  }, [fragranceProfile]);

  return (
    <Modal visible={visible} animationType="slide" {...(Platform.OS === 'ios' ? { presentationStyle: 'pageSheet' as const } : {})}>
      <View style={[styles.detailContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.detailTitle, { color: colors.text }]} numberOfLines={1}>{item.perfume_name}</Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.detailContent}>
          {(item.image_url || detail?.imageUrl) && (
            <View style={[styles.detailImageBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Image
                source={{ uri: forceHttps(item.image_url || detail?.imageUrl || null) ?? undefined }}
                style={styles.detailImage}
                resizeMode="contain"
              />
            </View>
          )}

          <View style={styles.detailBadges}>
            <View style={[styles.detailBadge, { backgroundColor: PRIORITY_COLORS[item.priority] + '20', borderColor: PRIORITY_COLORS[item.priority] }]}>
              <Text style={[styles.detailBadgeLabel, { color: colors.subtext }]}>Priority</Text>
              <Text style={[styles.detailBadgeValue, { color: PRIORITY_COLORS[item.priority] }]}>{PRIORITY_LABELS[item.priority]}</Text>
            </View>
            {detail?.concentration && (
              <View style={[styles.detailBadge, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                <Text style={[styles.detailBadgeLabel, { color: colors.subtext }]}>Concentration</Text>
                <Text style={[styles.detailBadgeValue, { color: colors.text }]}>{detail.concentration}</Text>
              </View>
            )}
            {detail?.year && (
              <View style={[styles.detailBadge, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                <Text style={[styles.detailBadgeLabel, { color: colors.subtext }]}>Year</Text>
                <Text style={[styles.detailBadgeValue, { color: colors.text }]}>{detail.year}</Text>
              </View>
            )}
          </View>

          <Text style={[styles.detailBrand, { color: colors.accent }]}>{item.perfume_brand}</Text>
          <Text style={[styles.detailName, { color: colors.text }]}>{item.perfume_name}</Text>

          {detail?.rating && (
            <View style={styles.detailRatingRow}>
              <Star size={16} color="#F5A623" weight="fill" />
              <Text style={styles.detailRatingText}>{parseFloat(detail.rating).toFixed(1)}</Text>
              <Text style={[styles.detailRatingSub, { color: colors.subtext }]}>community rating</Text>
            </View>
          )}

          {item.estimated_price && (
            <Text style={[styles.detailPrice, { color: colors.subtext }]}>Est. price: {item.estimated_price}</Text>
          )}

          {item.reason && (
            <View style={[styles.reasonBox, { backgroundColor: colors.chip, borderColor: colors.border }]}>
              <Text style={[styles.reasonLabel, { color: colors.subtext }]}>WHY I WANT THIS</Text>
              <Text style={[styles.reasonText, { color: colors.text }]}>{item.reason}</Text>
            </View>
          )}

          {detailQuery.isLoading && (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
          )}

          {detail?.accords && detail.accords.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>ACCORDS</Text>
              <View style={styles.accordsWrap}>
                {detail.accords.map((accord, i) => (
                  <View key={i} style={[styles.accordChip, { backgroundColor: getAccordColor(accord) + '20', borderColor: getAccordColor(accord) }]}>
                    <Text style={[styles.accordChipText, { color: getAccordColor(accord) }]}>{accord}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {allNotes.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>FRAGRANCE PYRAMID</Text>
              {allNotes.map((n, i) => (
                <View key={i} style={styles.noteBarRow}>
                  <Text style={[styles.noteBarName, { color: colors.text }]}>{n.note}</Text>
                  <View style={[styles.noteBarBg, { backgroundColor: colors.chip }]}>
                    <View style={[styles.noteBarFill, { backgroundColor: getAccordColor(n.note), width: `${(n.weight / maxWeight) * 100}%` }]} />
                  </View>
                </View>
              ))}
            </>
          )}

          {(detail?.topNotes?.length ?? 0) > 0 && (
            <>
              <Text style={[styles.noteTypeLabel, { color: colors.accent }]}>TOP NOTES</Text>
              <View style={styles.notesChipRow}>
                {detail?.topNotes?.map((n, i) => (
                  <View key={i} style={[styles.noteChip, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                    <Text style={[styles.noteChipText, { color: colors.text }]}>{n}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {(detail?.heartNotes?.length ?? 0) > 0 && (
            <>
              <Text style={[styles.noteTypeLabel, { color: '#E91E63' }]}>HEART NOTES</Text>
              <View style={styles.notesChipRow}>
                {detail?.heartNotes?.map((n, i) => (
                  <View key={i} style={[styles.noteChip, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                    <Text style={[styles.noteChipText, { color: colors.text }]}>{n}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {(detail?.baseNotes?.length ?? 0) > 0 && (
            <>
              <Text style={[styles.noteTypeLabel, { color: '#9B59B6' }]}>BASE NOTES</Text>
              <View style={styles.notesChipRow}>
                {detail?.baseNotes?.map((n, i) => (
                  <View key={i} style={[styles.noteChip, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                    <Text style={[styles.noteChipText, { color: colors.text }]}>{n}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {fragranceProfile && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>BEST TIME</Text>
              <View style={styles.timeRow}>
                {(() => {
                  const dayHigh = getTimeSuitability(fragranceProfile.timeOfDay.day) === 'high';
                  const dayOk = getTimeSuitability(fragranceProfile.timeOfDay.day) !== 'low';
                  const nightHigh = getTimeSuitability(fragranceProfile.timeOfDay.night) === 'high';
                  const nightOk = getTimeSuitability(fragranceProfile.timeOfDay.night) !== 'low';
                  return (
                    <>
                      <View style={[styles.timeCard, { backgroundColor: dayHigh ? '#FFF8E1' : dayOk ? '#FFFDE7' : colors.chip, borderColor: dayHigh ? '#FFC107' : dayOk ? '#FFD54F' : colors.border, opacity: dayOk ? 1 : 0.45 }]}>
                        <Text style={styles.timeEmoji}>☀️</Text>
                        <Text style={[styles.timeLabel, { color: dayOk ? '#333' : colors.subtext }]}>Day</Text>
                        <Text style={[styles.timeScore, { color: dayHigh ? '#F57F17' : dayOk ? '#FBC02D' : colors.subtext }]}>{Math.round(fragranceProfile.timeOfDay.day * 100)}%</Text>
                      </View>
                      <View style={[styles.timeCard, { backgroundColor: nightHigh ? '#F3E5F5' : nightOk ? '#F8EAF6' : colors.chip, borderColor: nightHigh ? '#9B59B6' : nightOk ? '#CE93D8' : colors.border, opacity: nightOk ? 1 : 0.45 }]}>
                        <Text style={styles.timeEmoji}>🌙</Text>
                        <Text style={[styles.timeLabel, { color: nightOk ? '#333' : colors.subtext }]}>Night</Text>
                        <Text style={[styles.timeScore, { color: nightHigh ? '#7B1FA2' : nightOk ? '#AB47BC' : colors.subtext }]}>{Math.round(fragranceProfile.timeOfDay.night * 100)}%</Text>
                      </View>
                    </>
                  );
                })()}
              </View>

              <Text style={[styles.sectionLabel, { color: colors.text }]}>SEASONS</Text>
              <View style={styles.seasonsGrid}>
                {[
                  { name: 'Spring', emoji: '🌸', color: '#FCE4EC', border: '#E91E63' },
                  { name: 'Summer', emoji: '☀️', color: '#FFF8E1', border: '#FFC107' },
                  { name: 'Autumn', emoji: '🍂', color: '#FBE9E7', border: '#FF5722' },
                  { name: 'Winter', emoji: '❄️', color: '#E3F2FD', border: '#2196F3' },
                ].map(s => (
                  <View key={s.name} style={[styles.seasonCard, {
                    backgroundColor: seasonMatch(s.name) ? s.color : seasonMedium(s.name) ? s.color + '80' : colors.chip,
                    borderColor: seasonMatch(s.name) ? s.border : seasonMedium(s.name) ? s.border + '80' : colors.border,
                    opacity: seasonMatch(s.name) || seasonMedium(s.name) ? 1 : 0.45,
                  }]}>
                    <Text style={styles.seasonEmoji}>{s.emoji}</Text>
                    <View>
                      <Text style={[styles.seasonLabel, { color: seasonMatch(s.name) || seasonMedium(s.name) ? '#333' : colors.subtext }]}>{s.name}</Text>
                      <Text style={[styles.seasonScore, { color: seasonMatch(s.name) ? s.border : seasonMedium(s.name) ? s.border + 'CC' : colors.subtext }]}>
                        {Math.round(fragranceProfile.seasons[s.name.toLowerCase() as keyof typeof fragranceProfile.seasons] * 100)}%
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {detail?.longevity && (
            <View style={[styles.statRow, { borderColor: colors.border }]}>
              <Text style={[styles.statLabel, { color: colors.subtext }]}>Longevity</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{detail.longevity}</Text>
            </View>
          )}
          {detail?.sillage && (
            <View style={[styles.statRow, { borderColor: colors.border }]}>
              <Text style={[styles.statLabel, { color: colors.subtext }]}>Sillage</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{detail.sillage}</Text>
            </View>
          )}
          {detail?.gender && (
            <View style={[styles.statRow, { borderColor: colors.border }]}>
              <Text style={[styles.statLabel, { color: colors.subtext }]}>Gender</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{detail.gender}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.removeFullBtn, { borderColor: '#E74C3C' }]}
            onPress={onRemove}
          >
            <Heart size={18} color="#E74C3C" />
            <Text style={styles.removeFullBtnText}>Remove from Wishlist</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  title: { fontSize: 28, fontWeight: '700' as const },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' as const },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 10,
  },
  card: {
    width: CARD_WIDTH,
    height: 240,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute' as const,
    borderRadius: 16,
  },
  cardOverlay: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    paddingTop: 50,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  priorityBadge: {
    alignSelf: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 8,
  },
  priorityText: { color: '#fff', fontSize: 11, fontWeight: '700' as const },
  cardName: { color: '#fff', fontSize: 14, fontWeight: '700' as const },
  cardBrand: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  cardPrice: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
  removeBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  removeBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' as const },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { textAlign: 'center', fontSize: 16, lineHeight: 24 },
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
  searchBar: {
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
  resultCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    alignItems: 'center',
    gap: 12,
  },
  resultImage: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#f0ebe3' },
  resultInfo: { flex: 1 },
  resultName: { fontSize: 15, fontWeight: '600' as const },
  resultBrand: { fontSize: 13, marginTop: 2 },
  manualBtn: { padding: 16, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', marginTop: 12 },
  manualBtnText: { fontSize: 15, fontWeight: '600' as const },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.5, marginBottom: 6 },
  fieldInput: { borderRadius: 12, padding: 12, fontSize: 15, borderWidth: 1 },
  priorityRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  priorityOption: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  priorityOptionText: { fontSize: 14, fontWeight: '600' as const },
  submitBtn: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' as const },
  detailContainer: { flex: 1 },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  detailTitle: { fontSize: 20, fontWeight: '700' as const, flex: 1, marginRight: 12 },
  detailContent: { padding: 20, paddingBottom: 40 },
  detailImageBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center' as const,
    marginBottom: 16,
  },
  detailImage: { width: 160, height: 200 },
  detailBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  detailBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  detailBadgeLabel: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.3 },
  detailBadgeValue: { fontSize: 14, fontWeight: '700' as const, marginTop: 1 },
  detailBrand: { fontSize: 15, fontWeight: '600' as const, marginBottom: 2 },
  detailName: { fontSize: 22, fontWeight: '700' as const, marginBottom: 8 },
  detailRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  detailRatingText: { fontSize: 15, fontWeight: '700' as const, color: '#F5A623' },
  detailRatingSub: { fontSize: 13 },
  detailPrice: { fontSize: 14, marginBottom: 12 },
  reasonBox: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 16 },
  reasonLabel: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.5, marginBottom: 4 },
  reasonText: { fontSize: 14, lineHeight: 20 },
  sectionLabel: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  accordsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accordChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  accordChipText: { fontSize: 13, fontWeight: '600' as const },
  noteBarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  noteBarName: { fontSize: 13, width: 90 },
  noteBarBg: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' as const },
  noteBarFill: { height: '100%', borderRadius: 4 },
  noteTypeLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  notesChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  noteChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  noteChipText: { fontSize: 12, fontWeight: '500' as const },
  timeRow: { flexDirection: 'row', gap: 10 },
  timeCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center' as const },
  timeEmoji: { fontSize: 24, marginBottom: 4 },
  timeLabel: { fontSize: 14, fontWeight: '600' as const },
  timeScore: { fontSize: 12, marginTop: 2 },
  seasonsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seasonCard: { width: '48%' as unknown as number, flexDirection: 'row', alignItems: 'center' as const, borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  seasonEmoji: { fontSize: 22 },
  seasonLabel: { fontSize: 14, fontWeight: '600' as const },
  seasonScore: { fontSize: 11, marginTop: 1 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1 },
  statLabel: { fontSize: 14 },
  statValue: { fontSize: 14, fontWeight: '600' as const },
  removeFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 24,
  },
  removeFullBtnText: { fontSize: 16, fontWeight: '600' as const, color: '#E74C3C' },
});

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Plus, Search, Heart, Star, X, Trash2, ChevronDown, Camera, LayoutGrid, List, Lock, Crown } from 'lucide-react-native';
import ShelfView from '@/components/ShelfView';
import { processFragranceImage } from '@/lib/image-processing';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { supabase, searchFragrances, forceHttps } from '@/lib/supabase';
import { CollectionItem, SearchResult } from '@/lib/types';
import { CONCENTRATIONS, SEASONS, OCCASIONS } from '@/constants/themes';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useRevenueCat } from '@/providers/RevenueCatProvider';

let analyzeFragranceProfile: any;
let getSeasonSuitability: any;
let getTimeSuitability: any;
try {
  const fp = require('@/lib/fragrance-profile');
  analyzeFragranceProfile = fp.analyzeFragranceProfile;
  getSeasonSuitability = fp.getSeasonSuitability;
  getTimeSuitability = fp.getTimeSuitability;
} catch (e) {
  console.log('[COLLECTION] Failed to load fragrance-profile:', e);
  analyzeFragranceProfile = () => ({
    seasons: { spring: 0.5, summer: 0.5, autumn: 0.5, winter: 0.5 },
    timeOfDay: { day: 0.5, night: 0.5 },
  });
  getSeasonSuitability = () => 'medium';
  getTimeSuitability = () => 'medium';
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

function getFillLevelColor(level: number): string {
  if (level >= 50) return '#4CAF50';
  if (level >= 20) return '#FFA726';
  return '#EF5350';
}

const FILTER_CHIPS = ['All', 'Owned', 'Tried', 'Favorites', 'EDP', 'EDT', 'Extrait'] as const;

const FREE_COLLECTION_LIMIT = 5;

function CollectionScreenInner() {
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const { isPro } = useRevenueCat();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'az' | 'rating'>('newest');
  const { perfumeId } = useLocalSearchParams<{ perfumeId?: string }>();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'shelf'>('cards');

  const collectionQuery = useQuery({
    queryKey: ['collection', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      console.log('[COLLECTION] Fetching collection for user:', user.id);
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.log('[COLLECTION] Fetch error:', error.message);
        throw error;
      }
      console.log('[COLLECTION] Fetched', (data ?? []).length, 'items');
      return (data ?? []).map(item => ({
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
        clean_image_url: item.clean_image_url ?? null,
      })) as CollectionItem[];
    },
    enabled: !!user?.id,
    placeholderData: keepPreviousData,
  });

  const collection = useMemo(() => collectionQuery.data ?? [], [collectionQuery.data]);

  const hasOpenedPerfumeId = useRef<string | null>(null);

  useEffect(() => {
    if (perfumeId && perfumeId !== hasOpenedPerfumeId.current && collection.length > 0) {
      const item = collection.find(c => c.id === perfumeId);
      if (item) {
        hasOpenedPerfumeId.current = perfumeId;
        setSelectedItemId(perfumeId);
        setShowDetailModal(true);
      }
    }
  }, [perfumeId, collection]);

  const selectedItem = useMemo(() => collection.find(c => c.id === selectedItemId) ?? null, [collection, selectedItemId]);

  const filteredCollection = useMemo(() => {
    let items = [...collection];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(c =>
        c.perfume_name.toLowerCase().includes(q) ||
        c.perfume_brand.toLowerCase().includes(q)
      );
    }

    switch (activeFilter) {
      case 'Favorites':
        items = items.filter(c => c.is_favorite);
        break;
      case 'Owned':
        items = items.filter(c => c.status === 'owned');
        break;
      case 'Tried':
        items = items.filter(c => c.status === 'tried');
        break;
      case 'EDP':
        items = items.filter(c => c.concentration?.toLowerCase().includes('parfum') && !c.concentration?.toLowerCase().includes('extrait'));
        break;
      case 'EDT':
        items = items.filter(c => c.concentration?.toLowerCase().includes('toilette'));
        break;
      case 'Extrait':
        items = items.filter(c => c.concentration?.toLowerCase().includes('extrait'));
        break;
      case 'All':
      default:
        break;
    }

    switch (sortBy) {
      case 'oldest':
        items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'az':
        items.sort((a, b) => a.perfume_name.localeCompare(b.perfume_name));
        break;
      case 'rating':
        items.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      default:
        items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return items;
  }, [collection, searchQuery, activeFilter, sortBy]);

  const stats = useMemo(() => {
    const brands = new Set(collection.map(c => c.perfume_brand));
    const favorites = collection.filter(c => c.is_favorite).length;
    const owned = collection.filter(c => c.status === 'owned').length;
    const tried = collection.filter(c => c.status === 'tried').length;
    return { perfumes: collection.length, brands: brands.size, favorites, owned, tried };
  }, [collection]);

  const toggleFavorite = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { error } = await supabase
        .from('user_collections')
        .update({ is_favorite: !isFavorite })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection', user?.id] });
    },
  });

  const updateRating = useMutation({
    mutationFn: async ({ id, rating }: { id: string; rating: number }) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { error } = await supabase
        .from('user_collections')
        .update({ rating })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection', user?.id] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'owned' | 'tried' }) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { error } = await supabase
        .from('user_collections')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection', user?.id] });
    },
  });

  const updateFillLevel = useMutation({
    mutationFn: async ({ id, fill_level }: { id: string; fill_level: number }) => {
      const { error } = await supabase
        .from('user_collections')
        .update({ fill_level })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection', user?.id] });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_collections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setShowDetailModal(false);
      setSelectedItemId(null);
      void queryClient.invalidateQueries({ queryKey: ['collection', user?.id] });
    },
  });

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Delete Perfume', 'Are you sure you want to remove this from your collection?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteItem.mutate(id) },
    ]);
  }, [deleteItem]);

  const openDetail = useCallback((item: CollectionItem) => {
    setSelectedItemId(item.id);
    setShowDetailModal(true);
  }, []);

  const renderCollectionCard = useCallback(({ item }: { item: CollectionItem }) => {
    try {
      const fillLevel = typeof item.fill_level === 'number' ? item.fill_level : 100;
      const imageUrl = item.image_url ? forceHttps(item.image_url) : null;
      return (
        <TouchableOpacity
          style={[styles.collectionCard, { backgroundColor: colors.card, marginHorizontal: 20, marginBottom: 12 }]}
          activeOpacity={0.85}
          onPress={() => openDetail(item)}
        >
          <View style={styles.cardImageArea}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.cardImage}
                contentFit="contain"
                transition={200}
              />
            ) : (
              <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.chip }]} />
            )}
          </View>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.85)']}
            style={styles.cardGradient}
          >
            <Text style={styles.cardName} numberOfLines={1}>{item.perfume_name || 'Unknown'}</Text>
            <Text style={styles.cardBrand} numberOfLines={1}>{item.perfume_brand || 'Unknown'}</Text>
            <View style={styles.cardBadges}>
              {item.concentration ? (
                <View style={styles.cardConcentration}>
                  <Text style={styles.cardConcentrationText}>{String(item.concentration).toUpperCase().replace(/ /g, '')}</Text>
                </View>
              ) : null}
              {item.status === 'tried' && (
                <View style={styles.triedBadge}>
                  <Text style={styles.triedBadgeText}>TRIED</Text>
                </View>
              )}
            </View>
          </LinearGradient>
          {item.is_favorite && (
            <View style={styles.favBadgeOverlay}>
              <Heart size={18} color="#FF4B6E" fill="#FF4B6E" />
            </View>
          )}
          {item.rating != null && item.rating > 0 ? (
            <View style={styles.ratingBadgeOverlay}>
              <Star size={12} color="#FFD700" fill="#FFD700" />
              <Text style={styles.ratingBadgeText}>{item.rating}</Text>
            </View>
          ) : null}
          {item.status === 'owned' && (
            <View style={styles.fillLevelBar}>
              <View style={[styles.fillLevelFill, {
                backgroundColor: getFillLevelColor(fillLevel),
                width: `${fillLevel}%`,
              }]} />
            </View>
          )}
        </TouchableOpacity>
      );
    } catch (err) {
      console.log('[COLLECTION] Card render error:', err, 'item:', item?.id);
      return null;
    }
  }, [colors.chip, colors.card, openDetail]);

  const ListHeader = useCallback(() => (
    <View>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>My Collection</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.scanBtn, { backgroundColor: viewMode === 'shelf' ? colors.accent + '20' : colors.card, borderColor: viewMode === 'shelf' ? colors.accent : colors.border }]}
            onPress={() => {
              if (!isPro) {
                Alert.alert(
                  'Pro Feature',
                  'The Shelf view is available for Pro users. Upgrade to unlock it!',
                  [
                    { text: 'Not Now', style: 'cancel' },
                    { text: 'Upgrade', onPress: () => router.push('/paywall') },
                  ]
                );
                return;
              }
              setViewMode(v => v === 'cards' ? 'shelf' : 'cards');
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            {viewMode === 'shelf' ? (
              <List size={18} color={colors.accent} />
            ) : (
              <View style={styles.shelfBtnInner}>
                <LayoutGrid size={18} color={colors.accent} />
                {!isPro && <Lock size={10} color={colors.accent} style={styles.lockIcon} />}
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scanBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/scanner')}
          >
            <Camera size={18} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.accent }]}
            onPress={() => setShowAddModal(true)}
          >
            <Plus size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsRow}>
        {[
          { label: 'Total', value: stats.perfumes, color: colors.accent },
          { label: 'Owned', value: stats.owned, color: '#5B8DEF' },
          { label: 'Tried', value: stats.tried, color: '#9B59B6' },
          { label: 'Favorites', value: stats.favorites, color: '#E74C3C' },
        ].map((stat, i) => (
          <View key={i} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: colors.subtext }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Search size={18} color={colors.subtext} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search your collection..."
          placeholderTextColor={colors.subtext}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        nestedScrollEnabled
      >
        {FILTER_CHIPS.map(f => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterChip,
              {
                backgroundColor: activeFilter === f ? colors.accent : colors.card,
                borderColor: activeFilter === f ? colors.accent : colors.border,
              },
            ]}
            onPress={() => {
              setActiveFilter(f);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={[styles.filterText, { color: activeFilter === f ? '#fff' : colors.text }]}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.sortRow}>
        <TouchableOpacity
          style={[styles.sortBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => {
            const next = { newest: 'oldest' as const, oldest: 'az' as const, az: 'rating' as const, rating: 'newest' as const };
            setSortBy(next[sortBy]);
          }}
        >
          <Text style={[styles.sortText, { color: colors.text }]}>
            {sortBy === 'newest' ? 'Newest' : sortBy === 'oldest' ? 'Oldest' : sortBy === 'az' ? 'A-Z' : 'Rating'}
          </Text>
          <ChevronDown size={14} color={colors.subtext} />
        </TouchableOpacity>
      </View>
    </View>
  ), [colors, stats, searchQuery, activeFilter, sortBy, router]);

  const keyExtractor = useCallback((item: CollectionItem) => item.id, []);

  const listEmptyComponent = useMemo(() => {
    if (collectionQuery.isLoading) {
      return <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;
    }
    return (
      <View style={styles.emptyState}>
        <Text style={[styles.emptyText, { color: colors.subtext }]}>
          {collection.length === 0 ? 'Your collection is empty.\nTap "Add" to get started!' : 'No results found.'}
        </Text>
      </View>
    );
  }, [collectionQuery.isLoading, collection.length, colors]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.statusBarOverlay, { height: insets.top + 20 }]} pointerEvents="none">
        <LinearGradient
          colors={[colors.background, colors.background, colors.background + 'CC', colors.background + '00']}
          locations={[0, 0.5, 0.8, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {viewMode === 'cards' ? (
        <FlatList
          data={filteredCollection}
          renderItem={renderCollectionCard}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={listEmptyComponent}
          contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void collectionQuery.refetch()} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
          initialNumToRender={4}
          maxToRenderPerBatch={3}
          windowSize={3}
          removeClippedSubviews={false}
        />
      ) : (
        <FlatList
          data={[]}
          renderItem={null}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={
            <View style={{ marginHorizontal: 12, marginBottom: 32 }}>
              <ShelfView items={filteredCollection} onItemPress={openDetail} />
            </View>
          }
          contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void collectionQuery.refetch()} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {showAddModal && (
        <AddPerfumeModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          userId={user?.id ?? ''}
          isPro={isPro}
          collectionCount={collection.length}
        />
      )}

      {selectedItem && showDetailModal && (
        <DetailModal
          visible={showDetailModal}
          onClose={() => { setShowDetailModal(false); setSelectedItemId(null); }}
          item={selectedItem}
          onToggleFavorite={() => toggleFavorite.mutate({ id: selectedItem.id, isFavorite: selectedItem.is_favorite })}
          onRate={(rating) => updateRating.mutate({ id: selectedItem.id, rating })}
          onDelete={() => handleDelete(selectedItem.id)}
          onUpdateStatus={(status) => updateStatus.mutate({ id: selectedItem.id, status })}
          onUpdateFillLevel={(fill_level) => updateFillLevel.mutate({ id: selectedItem.id, fill_level })}
        />
      )}
    </View>
  );
}

function AddPerfumeModal({ visible, onClose, userId, isPro, collectionCount }: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  isPro: boolean;
  collectionCount: number;
}) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [formData, setFormData] = useState({
    name: '', brand: '', concentration: '', season: '', occasion: '',
    topNotes: '', heartNotes: '', baseNotes: '', imageUrl: '', purchasePrice: '', rating: 0, notes: '',
    status: 'owned' as 'owned' | 'tried',
  });
  const [showForm, setShowForm] = useState(false);

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
      concentration: result.concentration || '',
      season: '',
      occasion: '',
      topNotes: (result.topNotes || []).join(', '),
      heartNotes: (result.heartNotes || []).join(', '),
      baseNotes: (result.baseNotes || []).join(', '),
      imageUrl: result.imageUrl || '',
      purchasePrice: '',
      rating: 0,
      notes: '',
      status: 'owned',
    });
    setShowForm(true);
    setSearchResults([]);
  }, []);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!isPro && collectionCount >= FREE_COLLECTION_LIMIT) {
        throw new Error(`Free accounts are limited to ${FREE_COLLECTION_LIMIT} fragrances. Upgrade to Pro for unlimited!`);
      }
      const { error } = await supabase.from('user_collections').insert({
        user_id: userId,
        perfume_name: formData.name,
        perfume_brand: formData.brand,
        concentration: formData.concentration || null,
        season: formData.season || null,
        occasion: formData.occasion || null,
        top_notes: formData.topNotes.split(',').map(s => s.trim()).filter(Boolean),
        heart_notes: formData.heartNotes.split(',').map(s => s.trim()).filter(Boolean),
        base_notes: formData.baseNotes.split(',').map(s => s.trim()).filter(Boolean),
        image_url: formData.imageUrl || null,
        purchase_price: formData.purchasePrice ? parseFloat(formData.purchasePrice) : null,
        rating: formData.rating || null,
        personal_notes: formData.notes || null,
        is_favorite: false,
        date_added: new Date().toISOString(),
        status: formData.status,
        fill_level: formData.status === 'owned' ? 100 : 0,
      });
      if (error) throw error;

      await supabase.from('activity_feed').insert({
        user_id: userId,
        activity_type: 'added_perfume',
        perfume_name: formData.name,
        perfume_brand: formData.brand,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection', userId] });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
      onClose();
    },
    onError: (err: Error) => {
      Alert.alert('Error', err.message);
    },
  });

  const resetForm = useCallback(() => {
    setSearchText('');
    setSearchResults([]);
    setFormData({ name: '', brand: '', concentration: '', season: '', occasion: '', topNotes: '', heartNotes: '', baseNotes: '', imageUrl: '', purchasePrice: '', rating: 0, notes: '', status: 'owned' });
    setShowForm(false);
  }, []);

  return (
    <Modal visible={visible} animationType="slide" {...(Platform.OS === 'ios' ? { presentationStyle: 'pageSheet' as const } : {})}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.modalContainer, { backgroundColor: colors.background }]}
      >
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Add Perfume</Text>
          <TouchableOpacity onPress={() => { resetForm(); onClose(); }}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          {!showForm ? (
            <>
              <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Search size={18} color={colors.subtext} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Search 74K+ fragrances..."
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
                  style={[styles.searchResultCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => selectResult(result)}
                >
                  {result.imageUrl && (
                    <Image
                      source={{ uri: forceHttps(result.imageUrl) ?? undefined }}
                      style={styles.searchResultImage}
                      contentFit="contain"
                    />
                  )}
                  <View style={styles.searchResultInfo}>
                    <Text style={[styles.searchResultName, { color: colors.text }]}>{result.name}</Text>
                    <Text style={[styles.searchResultBrand, { color: colors.subtext }]}>{result.brand}</Text>
                    {result.concentration && (
                      <Text style={[styles.searchResultConc, { color: colors.accent }]}>{result.concentration}</Text>
                    )}
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
              <Text style={[styles.fieldLabel, { color: colors.subtext }]}>STATUS</Text>
              <View style={styles.statusToggle}>
                {(['owned', 'tried'] as const).map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.statusOption, {
                      backgroundColor: formData.status === s ? colors.accent : colors.chip,
                      borderColor: formData.status === s ? colors.accent : colors.border,
                    }]}
                    onPress={() => setFormData(p => ({ ...p, status: s }))}
                  >
                    <Text style={[styles.statusOptionText, { color: formData.status === s ? '#fff' : colors.text }]}>
                      {s === 'owned' ? 'Owned' : 'Tried / Sampled'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <FormField label="Name" value={formData.name} onChange={v => setFormData(p => ({ ...p, name: v }))} colors={colors} />
              <FormField label="Brand" value={formData.brand} onChange={v => setFormData(p => ({ ...p, brand: v }))} colors={colors} />

              <Text style={[styles.fieldLabel, { color: colors.subtext }]}>CONCENTRATION</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} nestedScrollEnabled>
                {CONCENTRATIONS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.selectChip, { backgroundColor: formData.concentration === c ? colors.accent : colors.chip, borderColor: colors.border }]}
                    onPress={() => setFormData(p => ({ ...p, concentration: c }))}
                  >
                    <Text style={[styles.selectChipText, { color: formData.concentration === c ? '#fff' : colors.text }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.fieldLabel, { color: colors.subtext }]}>SEASON</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} nestedScrollEnabled>
                {SEASONS.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.selectChip, { backgroundColor: formData.season === s ? colors.accent : colors.chip, borderColor: colors.border }]}
                    onPress={() => setFormData(p => ({ ...p, season: s }))}
                  >
                    <Text style={[styles.selectChipText, { color: formData.season === s ? '#fff' : colors.text }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.fieldLabel, { color: colors.subtext }]}>OCCASION</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} nestedScrollEnabled>
                {OCCASIONS.map(o => (
                  <TouchableOpacity
                    key={o}
                    style={[styles.selectChip, { backgroundColor: formData.occasion === o ? colors.accent : colors.chip, borderColor: colors.border }]}
                    onPress={() => setFormData(p => ({ ...p, occasion: o }))}
                  >
                    <Text style={[styles.selectChipText, { color: formData.occasion === o ? '#fff' : colors.text }]}>{o}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <FormField label="Top Notes (comma separated)" value={formData.topNotes} onChange={v => setFormData(p => ({ ...p, topNotes: v }))} colors={colors} />
              <FormField label="Heart Notes (comma separated)" value={formData.heartNotes} onChange={v => setFormData(p => ({ ...p, heartNotes: v }))} colors={colors} />
              <FormField label="Base Notes (comma separated)" value={formData.baseNotes} onChange={v => setFormData(p => ({ ...p, baseNotes: v }))} colors={colors} />
              <FormField label="Image URL" value={formData.imageUrl} onChange={v => setFormData(p => ({ ...p, imageUrl: v }))} colors={colors} />
              <FormField label="Purchase Price" value={formData.purchasePrice} onChange={v => setFormData(p => ({ ...p, purchasePrice: v }))} colors={colors} keyboardType="decimal-pad" />
              <FormField label="Personal Notes" value={formData.notes} onChange={v => setFormData(p => ({ ...p, notes: v }))} colors={colors} multiline />

              <Text style={[styles.fieldLabel, { color: colors.subtext }]}>RATING</Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map(r => (
                  <TouchableOpacity key={r} onPress={() => setFormData(p => ({ ...p, rating: r }))}>
                    <Star size={32} color="#FFD700" fill={formData.rating >= r ? '#FFD700' : 'transparent'} />
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
                  <Text style={styles.submitBtnText}>Add to Collection</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FormField({ label, value, onChange, colors, keyboardType, multiline }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: any;
  keyboardType?: any;
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.subtext }]}>{label.toUpperCase()}</Text>
      <TextInput
        style={[styles.fieldInput, {
          backgroundColor: colors.chip,
          color: colors.text,
          borderColor: colors.border,
          ...(multiline ? { height: 80, ...(Platform.OS !== 'web' ? { textAlignVertical: 'top' as const } : {}) } : {}),
        }]}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={colors.subtext}
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  );
}

function DetailModal({ visible, onClose, item, onToggleFavorite, onRate, onDelete, onUpdateStatus, onUpdateFillLevel }: {
  visible: boolean;
  onClose: () => void;
  item: CollectionItem;
  onToggleFavorite: () => void;
  onRate: (rating: number) => void;
  onDelete: () => void;
  onUpdateStatus: (status: 'owned' | 'tried') => void;
  onUpdateFillLevel: (fill_level: number) => void;
}) {
  const { colors } = useTheme();
  const [localFillLevel, setLocalFillLevel] = useState(item.fill_level ?? 100);
  const [localRating, setLocalRating] = useState(item.rating ?? 0);

  useEffect(() => {
    setLocalFillLevel(item.fill_level ?? 100);
  }, [item.fill_level]);

  useEffect(() => {
    setLocalRating(item.rating ?? 0);
  }, [item.rating]);

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
    const key = s.toLowerCase() as keyof typeof fragranceProfile.seasons;
    return getSeasonSuitability(fragranceProfile.seasons[key]) === 'high';
  };

  const seasonMedium = (s: string) => {
    const key = s.toLowerCase() as keyof typeof fragranceProfile.seasons;
    return getSeasonSuitability(fragranceProfile.seasons[key]) === 'medium';
  };

  const dayHighOrMedium = getTimeSuitability(fragranceProfile.timeOfDay.day) !== 'low';
  const nightHighOrMedium = getTimeSuitability(fragranceProfile.timeOfDay.night) !== 'low';
  const dayHigh = getTimeSuitability(fragranceProfile.timeOfDay.day) === 'high';
  const nightHigh = getTimeSuitability(fragranceProfile.timeOfDay.night) === 'high';

  const fillLevelSteps = [0, 25, 50, 75, 100];

  return (
    <Modal visible={visible} animationType="slide" {...(Platform.OS === 'ios' ? { presentationStyle: 'pageSheet' as const } : {})}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>{item.perfume_name}</Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent}>
          {item.image_url && (
            <View style={[styles.detailImageContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Image
                source={{ uri: forceHttps(item.image_url) ?? undefined }}
                style={styles.detailImage}
                contentFit="contain"
                transition={200}
              />
            </View>
          )}

          <View style={styles.detailBadges}>
            <View style={[styles.detailBadge, {
              backgroundColor: item.status === 'owned' ? colors.accent + '15' : '#9B59B6' + '15',
              borderColor: item.status === 'owned' ? colors.accent : '#9B59B6',
            }]}>
              <Text style={[styles.detailBadgeLabel, { color: colors.subtext }]}>Status</Text>
              <Text style={[styles.detailBadgeValue, { color: item.status === 'owned' ? colors.accent : '#9B59B6' }]}>
                {item.status === 'owned' ? 'Owned' : 'Tried'}
              </Text>
            </View>
            {item.concentration && (
              <View style={[styles.detailBadge, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                <Text style={[styles.detailBadgeLabel, { color: colors.subtext }]}>Concentration</Text>
                <Text style={[styles.detailBadgeValue, { color: colors.text }]}>{item.concentration}</Text>
              </View>
            )}
            {item.season && (
              <View style={[styles.detailBadge, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                <Text style={[styles.detailBadgeLabel, { color: colors.subtext }]}>Season</Text>
                <Text style={[styles.detailBadgeValue, { color: colors.text }]}>{item.season}</Text>
              </View>
            )}
          </View>

          <Text style={[styles.detailBrand, { color: colors.accent }]}>{item.perfume_brand}</Text>
          <Text style={[styles.detailName, { color: colors.text }]}>{item.perfume_name}</Text>

          <Text style={[styles.detailSectionTitle, { color: colors.subtext }]}>Status</Text>
          <View style={styles.statusToggle}>
            {(['owned', 'tried'] as const).map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.statusOption, {
                  backgroundColor: item.status === s ? (s === 'owned' ? colors.accent : '#9B59B6') : colors.chip,
                  borderColor: item.status === s ? (s === 'owned' ? colors.accent : '#9B59B6') : colors.border,
                }]}
                onPress={() => onUpdateStatus(s)}
              >
                <Text style={[styles.statusOptionText, { color: item.status === s ? '#fff' : colors.text }]}>
                  {s === 'owned' ? 'Owned' : 'Tried / Sampled'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {item.status === 'owned' && (
            <>
              <Text style={[styles.detailSectionTitle, { color: colors.subtext }]}>Bottle Fill Level</Text>
              <View style={styles.fillLevelSection}>
                <View style={[styles.fillLevelTrack, { backgroundColor: colors.chip }]}>
                  <View style={[styles.fillLevelActive, {
                    backgroundColor: getFillLevelColor(localFillLevel),
                    width: `${localFillLevel}%`,
                  }]} />
                </View>
                <View style={styles.fillLevelSteps}>
                  {fillLevelSteps.map(step => (
                    <TouchableOpacity
                      key={step}
                      style={[styles.fillLevelStep, {
                        backgroundColor: localFillLevel >= step ? getFillLevelColor(localFillLevel) + '30' : colors.chip,
                        borderColor: localFillLevel >= step ? getFillLevelColor(localFillLevel) : colors.border,
                      }]}
                      onPress={() => {
                        setLocalFillLevel(step);
                        onUpdateFillLevel(step);
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Text style={[styles.fillLevelStepText, {
                        color: localFillLevel >= step ? getFillLevelColor(localFillLevel) : colors.subtext,
                      }]}>{step}%</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}

          <Text style={[styles.detailSectionTitle, { color: colors.subtext }]}>Your Rating</Text>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map(r => (
              <TouchableOpacity key={r} onPress={() => { setLocalRating(r); onRate(r); }}>
                <Star size={28} color="#FFD700" fill={localRating >= r ? '#FFD700' : 'transparent'} />
              </TouchableOpacity>
            ))}
          </View>

          {allNotes.length > 0 && (
            <>
              <Text style={[styles.detailSectionTitle, { color: colors.text }]}>Fragrance Pyramid</Text>
              <Text style={[styles.accordLabel, { color: colors.accent }]}>MAIN ACCORDS</Text>
              {allNotes.map((n, i) => (
                <View key={i} style={styles.accordRow}>
                  <Text style={[styles.accordName, { color: colors.text }]}>{n.note}</Text>
                  <View style={[styles.accordBarBg, { backgroundColor: colors.chip }]}>
                    <View
                      style={[styles.accordBar, {
                        backgroundColor: getAccordColor(n.note),
                        width: `${(n.weight / maxWeight) * 100}%`,
                      }]}
                    />
                  </View>
                </View>
              ))}
            </>
          )}

          {(item.top_notes?.length ?? 0) > 0 && (
            <>
              <Text style={[styles.noteTypeLabel, { color: colors.accent }]}>TOP NOTES</Text>
              <View style={styles.notesChipRow}>
                {item.top_notes?.map((n, i) => (
                  <View key={i} style={[styles.noteChip, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                    <Text style={[styles.noteChipText, { color: colors.text }]}>{n}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {(item.heart_notes?.length ?? 0) > 0 && (
            <>
              <Text style={[styles.noteTypeLabel, { color: '#E91E63' }]}>HEART NOTES</Text>
              <View style={styles.notesChipRow}>
                {item.heart_notes?.map((n, i) => (
                  <View key={i} style={[styles.noteChip, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                    <Text style={[styles.noteChipText, { color: colors.text }]}>{n}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {(item.base_notes?.length ?? 0) > 0 && (
            <>
              <Text style={[styles.noteTypeLabel, { color: '#9B59B6' }]}>BASE NOTES</Text>
              <View style={styles.notesChipRow}>
                {item.base_notes?.map((n, i) => (
                  <View key={i} style={[styles.noteChip, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                    <Text style={[styles.noteChipText, { color: colors.text }]}>{n}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={[styles.detailSectionTitle, { color: colors.text }]}>BEST TIME</Text>
          <View style={styles.timeRow}>
            <View style={[styles.timeCard, { backgroundColor: dayHigh ? '#FFF8E1' : dayHighOrMedium ? '#FFFDE7' : colors.chip, borderColor: dayHigh ? '#FFC107' : dayHighOrMedium ? '#FFD54F' : colors.border, opacity: dayHighOrMedium ? 1 : 0.45 }]}>
              <Text style={styles.timeEmoji}>☀️</Text>
              <Text style={[styles.timeLabel, { color: dayHighOrMedium ? '#333' : colors.subtext }]}>Day</Text>
              <Text style={[styles.timeScore, { color: dayHigh ? '#F57F17' : dayHighOrMedium ? '#FBC02D' : colors.subtext }]}>{Math.round(fragranceProfile.timeOfDay.day * 100)}%</Text>
            </View>
            <View style={[styles.timeCard, { backgroundColor: nightHigh ? '#F3E5F5' : nightHighOrMedium ? '#F8EAF6' : colors.chip, borderColor: nightHigh ? '#9B59B6' : nightHighOrMedium ? '#CE93D8' : colors.border, opacity: nightHighOrMedium ? 1 : 0.45 }]}>
              <Text style={styles.timeEmoji}>🌙</Text>
              <Text style={[styles.timeLabel, { color: nightHighOrMedium ? '#333' : colors.subtext }]}>Night</Text>
              <Text style={[styles.timeScore, { color: nightHigh ? '#7B1FA2' : nightHighOrMedium ? '#AB47BC' : colors.subtext }]}>{Math.round(fragranceProfile.timeOfDay.night * 100)}%</Text>
            </View>
          </View>

          <Text style={[styles.detailSectionTitle, { color: colors.text }]}>SEASONS</Text>
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
                  <Text style={[styles.seasonScore, { color: seasonMatch(s.name) ? s.border : seasonMedium(s.name) ? s.border + 'CC' : colors.subtext }]}>{Math.round(fragranceProfile.seasons[s.name.toLowerCase() as keyof typeof fragranceProfile.seasons] * 100)}%</Text>
                </View>
              </View>
            ))}
          </View>

          {item.personal_notes ? (
            <>
              <Text style={[styles.detailSectionTitle, { color: colors.text }]}>PERSONAL NOTES</Text>
              <View style={[styles.personalNotesBox, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                <Text style={[styles.personalNotesText, { color: colors.text }]}>{item.personal_notes}</Text>
              </View>
            </>
          ) : null}

          <View style={styles.detailActions}>
            <TouchableOpacity
              style={[styles.favButton, { backgroundColor: item.is_favorite ? '#FFF0F0' : colors.chip, borderColor: item.is_favorite ? '#FF4B6E' : colors.border }]}
              onPress={onToggleFavorite}
            >
              <Heart size={20} color="#FF4B6E" fill={item.is_favorite ? '#FF4B6E' : 'transparent'} />
              <Text style={[styles.favButtonText, { color: item.is_favorite ? '#FF4B6E' : colors.text }]}>
                {item.is_favorite ? 'Unfavorite' : 'Favorite'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteButton, { backgroundColor: colors.chip, borderColor: colors.border }]}
              onPress={onDelete}
            >
              <Trash2 size={20} color="#E74C3C" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function CollectionScreen() {
  return (
    <ErrorBoundary fallbackMessage="There was a problem loading your collection. Please try again.">
      <CollectionScreenInner />
    </ErrorBoundary>
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
    marginBottom: 16,
  },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  shelfBtnInner: { position: 'relative' as const, alignItems: 'center', justifyContent: 'center' },
  lockIcon: { position: 'absolute' as const, bottom: -4, right: -6 },
  scanBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  statValue: { fontSize: 22, fontWeight: '700' as const },
  statLabel: { fontSize: 11, marginTop: 2 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 16, padding: 0 },
  filterRow: { paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: { fontSize: 14, fontWeight: '600' as const },
  sortRow: { paddingHorizontal: 20, marginBottom: 16 },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  sortText: { fontSize: 14, fontWeight: '600' as const },
  collectionCard: {
    height: 280,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative' as const,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardImageArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
    paddingBottom: 60,
  },
  cardImage: {
    width: 150,
    height: 170,
  },
  cardImagePlaceholder: {
    width: 120,
    height: 160,
    borderRadius: 12,
  },
  cardGradient: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 50,
  },
  cardBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  favBadgeOverlay: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingBadgeOverlay: {
    position: 'absolute' as const,
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  triedBadge: {
    backgroundColor: '#9B59B6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  triedBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' as const, letterSpacing: 0.5 },
  ratingBadgeText: { fontSize: 12, fontWeight: '700' as const, color: '#fff' },
  cardName: { fontSize: 17, fontWeight: '700' as const, color: '#fff' },
  cardBrand: { fontSize: 13, marginTop: 2, color: 'rgba(255,255,255,0.8)' },
  cardConcentration: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  cardConcentrationText: { color: '#fff', fontSize: 10, fontWeight: '600' as const },
  fillLevelBar: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  fillLevelFill: {
    height: 3,
    borderRadius: 2,
  },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { textAlign: 'center', fontSize: 16, lineHeight: 24 },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 20, fontWeight: '700' as const, flex: 1 },
  modalContent: { padding: 20, paddingBottom: 40 },
  searchResultCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    alignItems: 'center',
    gap: 12,
  },
  searchResultImage: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#f0ebe3' },
  searchResultInfo: { flex: 1 },
  searchResultName: { fontSize: 15, fontWeight: '600' as const },
  searchResultBrand: { fontSize: 13, marginTop: 2 },
  searchResultConc: { fontSize: 12, marginTop: 2 },
  manualBtn: { padding: 16, borderRadius: 14, borderWidth: 1, alignItems: 'center', marginTop: 12 },
  manualBtnText: { fontSize: 15, fontWeight: '600' as const },
  statusToggle: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statusOption: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  statusOptionText: { fontSize: 14, fontWeight: '600' as const },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.5, marginBottom: 6 },
  fieldInput: { borderRadius: 12, padding: 12, fontSize: 15, borderWidth: 1 },
  chipScroll: { marginBottom: 16 },
  selectChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  selectChipText: { fontSize: 13, fontWeight: '600' as const },
  ratingRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  submitBtn: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' as const },
  detailImageContainer: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16, alignItems: 'center' },
  detailImage: { width: 200, height: 200 },
  detailBadges: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  detailBadge: { borderRadius: 12, padding: 10, borderWidth: 1, minWidth: 100 },
  detailBadgeLabel: { fontSize: 10, fontWeight: '600' as const, textAlign: 'center' },
  detailBadgeValue: { fontSize: 14, fontWeight: '700' as const, textAlign: 'center', marginTop: 2 },
  detailBrand: { fontSize: 14, fontWeight: '600' as const, marginBottom: 4 },
  detailName: { fontSize: 24, fontWeight: '700' as const, marginBottom: 16 },
  detailSectionTitle: { fontSize: 14, fontWeight: '700' as const, marginBottom: 10, marginTop: 16, letterSpacing: 0.5 },
  fillLevelSection: { marginBottom: 8 },
  fillLevelTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 12 },
  fillLevelActive: { height: 8, borderRadius: 4 },
  fillLevelSteps: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  fillLevelStep: { flex: 1, padding: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  fillLevelStepText: { fontSize: 13, fontWeight: '600' as const },
  accordLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1, marginBottom: 8 },
  accordRow: { marginBottom: 8 },
  accordName: { fontSize: 14, fontWeight: '600' as const, marginBottom: 4 },
  accordBarBg: { height: 24, borderRadius: 6, overflow: 'hidden' },
  accordBar: { height: 24, borderRadius: 6, paddingHorizontal: 8, justifyContent: 'center' },
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
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  favButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 14, borderWidth: 1, gap: 8 },
  favButtonText: { fontSize: 15, fontWeight: '700' as const },
  deleteButton: { width: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1 },
  personalNotesBox: { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 8 },
  personalNotesText: { fontSize: 14, lineHeight: 20 },
});

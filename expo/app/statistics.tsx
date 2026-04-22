import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { CaretLeft, Diamond, Sparkle, Tag, Crown, ShareNetwork, ArrowRight } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase, forceHttps } from '@/lib/supabase';
import { CollectionItem, WearDiaryEntry, SCENT_FAMILIES } from '@/lib/types';
import { CURRENCY_SYMBOLS } from '@/lib/types';

export default function StatisticsScreen() {
  const { user, profile } = useAuth();
  const { colors, currency } = useTheme();
  const { isPro } = useRevenueCat();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const currencySymbol = CURRENCY_SYMBOLS[currency];

  const collectionQuery = useQuery({
    queryKey: ['collection', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data ?? []).map(item => ({
        ...item,
        status: item.status || 'owned',
        fill_level: item.fill_level ?? 100,
      })) as CollectionItem[];
    },
    enabled: !!user?.id,
  });

  const wearsQuery = useQuery({
    queryKey: ['wears', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('wear_diary')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data ?? []) as WearDiaryEntry[];
    },
    enabled: !!user?.id,
  });

  const wishlistQuery = useQuery({
    queryKey: ['wishlist-count', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase.from('user_wishlists').select('id').eq('user_id', user.id);
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const items = useMemo(() => collectionQuery.data ?? [], [collectionQuery.data]);
  const wearEntries = useMemo(() => wearsQuery.data ?? [], [wearsQuery.data]);

  const stats = useMemo(() => {
    const brands = new Set(items.map(c => c.perfume_brand));
    const favorites = items.filter(c => c.is_favorite).length;
    const ratings = items.filter(c => c.rating && c.rating > 0);
    const avgRating = ratings.length > 0
      ? (ratings.reduce((sum, c) => sum + (c.rating ?? 0), 0) / ratings.length).toFixed(1)
      : '0';
    const owned = items.filter(c => c.status === 'owned').length;
    const tried = items.filter(c => c.status === 'tried').length;

    return {
      fragrances: items.length,
      brands: brands.size,
      favorites,
      totalWears: wearEntries.length,
      wishlist: wishlistQuery.data?.length ?? 0,
      avgRating,
      owned,
      tried,
    };
  }, [items, wearEntries, wishlistQuery.data]);

  const collectionValue = useMemo(() => {
    const priced = items.filter(c => c.purchase_price && c.purchase_price > 0);
    const total = priced.reduce((sum, c) => sum + (c.purchase_price ?? 0), 0);
    const avg = priced.length > 0 ? total / priced.length : 0;
    const most = priced.length > 0 ? Math.max(...priced.map(c => c.purchase_price ?? 0)) : 0;
    return { total, avg, most, pricedCount: priced.length, unpricedCount: items.length - priced.length };
  }, [items]);

  const topBottlesByValue = useMemo(() => {
    return items
      .filter(c => c.purchase_price && c.purchase_price > 0)
      .sort((a, b) => (b.purchase_price ?? 0) - (a.purchase_price ?? 0))
      .slice(0, 5);
  }, [items]);

  const fragranceDNA = useMemo(() => {
    const noteCounts: Record<string, number> = {};
    items.forEach(c => {
      [...(c.top_notes ?? []), ...(c.heart_notes ?? []), ...(c.base_notes ?? [])].forEach(n => {
        noteCounts[n] = (noteCounts[n] || 0) + 1;
      });
    });
    return Object.entries(noteCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
  }, [items]);

  const olfactoryProfile = useMemo(() => {
    const familyCounts: Record<string, number> = {};
    let totalNotes = 0;

    items.forEach(c => {
      const allNotes = [...(c.top_notes ?? []), ...(c.heart_notes ?? []), ...(c.base_notes ?? [])];
      allNotes.forEach(note => {
        const lower = note.toLowerCase();
        SCENT_FAMILIES.forEach(family => {
          if (family.keywords.some(kw => lower.includes(kw))) {
            familyCounts[family.name] = (familyCounts[family.name] || 0) + 1;
            totalNotes++;
          }
        });
      });
    });

    const sorted = SCENT_FAMILIES
      .map(f => ({
        name: f.name,
        color: f.color,
        count: familyCounts[f.name] || 0,
        percentage: totalNotes > 0 ? Math.round(((familyCounts[f.name] || 0) / totalNotes) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const top3 = sorted.filter(f => f.count > 0).slice(0, 3);
    let summary = '';
    if (top3.length >= 3) {
      summary = `You lean ${top3[0].name} with ${top3[1].name} & ${top3[2].name} undertones`;
    } else if (top3.length === 2) {
      summary = `You lean ${top3[0].name} with ${top3[1].name} undertones`;
    } else if (top3.length === 1) {
      summary = `Your collection is predominantly ${top3[0].name}`;
    }

    return { families: sorted, summary };
  }, [items]);

  const topBrands = useMemo(() => {
    const brandCounts: Record<string, number> = {};
    items.forEach(c => {
      brandCounts[c.perfume_brand] = (brandCounts[c.perfume_brand] || 0) + 1;
    });
    return Object.entries(brandCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);
  }, [items]);

  const genderStyle = useMemo(() => {
    let menCount = 0;
    let womenCount = 0;
    items.forEach(c => {
      const name = c.perfume_name.toLowerCase();
      if (name.includes('pour homme') || name.includes('for men') || name.includes('man ')) menCount++;
      if (name.includes('pour femme') || name.includes('for women') || name.includes('woman ')) womenCount++;
    });
    if (menCount > womenCount * 2) return 'Masculine';
    if (womenCount > menCount * 2) return 'Feminine';
    return 'Unisex';
  }, [items]);

  const topConcentration = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(c => {
      if (c.concentration) counts[c.concentration] = (counts[c.concentration] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    return sorted[0]?.[0] || 'N/A';
  }, [items]);

  const mostWorn = useMemo(() => {
    const counts: Record<string, { name: string; brand: string; count: number }> = {};
    wearEntries.forEach(w => {
      const key = `${w.perfume_name}|${w.perfume_brand}`;
      if (!counts[key]) counts[key] = { name: w.perfume_name, brand: w.perfume_brand, count: 0 };
      counts[key].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count)[0] ?? null;
  }, [wearEntries]);

  const topRated = useMemo(() => {
    const rated = items.filter(c => c.rating && c.rating > 0).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return rated[0] ?? null;
  }, [items]);

  const handleShareCollection = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const top5 = items
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 5);
    const names = top5.map(i => `${i.perfume_name} by ${i.perfume_brand}`).join(', ');
    const message = `My top fragrances: ${names} — track yours at scentbuddy.io`;

    try {
      await Share.share({ message });
    } catch {
      console.log('Share failed');
    }
  }, [items]);

  if (collectionQuery.isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      </View>
    );
  }

  const maxFamilyCount = Math.max(...olfactoryProfile.families.map(f => f.count), 1);

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
          <Text style={[styles.title, { color: colors.text }]}>Statistics</Text>
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={handleShareCollection}
          >
            <ShareNetwork size={18} color={colors.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsGrid}>
          {[
            { label: 'Fragrances', value: stats.fragrances, color: colors.accent },
            { label: 'Brands', value: stats.brands, color: '#5B8DEF' },
            { label: 'Owned', value: stats.owned, color: '#4CAF50' },
            { label: 'Tried', value: stats.tried, color: '#9B59B6' },
            { label: 'Total Wears', value: stats.totalWears, color: '#E8A838' },
            { label: 'Avg Rating', value: stats.avgRating, color: '#FFC107' },
          ].map((s, i) => (
            <View key={i} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.subtext }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Sparkle size={18} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Olfactory Profile</Text>
          </View>
          {olfactoryProfile.summary ? (
            <Text style={[styles.profileSummary, { color: colors.accent }]}>
              {olfactoryProfile.summary}
            </Text>
          ) : null}
          <View style={styles.familyBars}>
            {olfactoryProfile.families
              .filter(f => f.count > 0)
              .map(family => (
                <View key={family.name} style={styles.familyBarRow}>
                  <View style={styles.familyBarLabel}>
                    <View style={[styles.familyDot, { backgroundColor: family.color }]} />
                    <Text style={[styles.familyName, { color: colors.text }]}>{family.name}</Text>
                    <Text style={[styles.familyPct, { color: colors.subtext }]}>{family.percentage}%</Text>
                  </View>
                  <View style={[styles.familyBarTrack, { backgroundColor: colors.chip }]}>
                    <View style={[styles.familyBarFill, {
                      backgroundColor: family.color,
                      width: `${Math.max(4, (family.count / maxFamilyCount) * 100)}%`,
                    }]} />
                  </View>
                </View>
              ))}
          </View>
        </View>

        {!isPro && !profile?.is_pro && (
          <View style={[styles.proCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.proIcon, { backgroundColor: '#EBF2FF' }]}>
              <Text style={styles.proIconEmoji}>📊</Text>
            </View>
            <View style={styles.proInfo}>
              <Text style={[styles.proTitle, { color: colors.text }]}>Unlock Full Analytics</Text>
              <Text style={[styles.proSub, { color: colors.subtext }]}>
                Wear trends over time, note evolution, seasonal patterns, and more — all on Pro.
              </Text>
              <TouchableOpacity
                style={[styles.upgradeBtn, { backgroundColor: colors.accent }]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/paywall' as any);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.upgradeBtnText}>Upgrade</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Diamond size={18} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Collection Value</Text>
          </View>
          <Text style={[styles.sectionSub, { color: colors.subtext }]}>
            {collectionValue.pricedCount} of {items.length} perfumes priced
            {collectionValue.unpricedCount > 0 && ` · +${collectionValue.unpricedCount} unpriced`}
          </Text>
          <View style={styles.valueRow}>
            {[
              { label: 'Total value', value: `${currencySymbol}${Math.round(collectionValue.total)}` },
              { label: 'Avg per bottle', value: `${currencySymbol}${Math.round(collectionValue.avg)}` },
              { label: 'Most expensive', value: `${currencySymbol}${Math.round(collectionValue.most)}` },
            ].map((v, i) => (
              <View key={i} style={[styles.valueCard, { backgroundColor: colors.chip }]}>
                <Text style={[styles.valueAmount, { color: colors.accent }]}>{v.value}</Text>
                <Text style={[styles.valueLabel, { color: colors.subtext }]}>{v.label}</Text>
              </View>
            ))}
          </View>

          {topBottlesByValue.length > 0 && (
            <>
              <Text style={[styles.subSectionTitle, { color: colors.text }]}>TOP BOTTLES BY VALUE</Text>
              {topBottlesByValue.map(item => (
                <View key={item.id} style={[styles.bottleRow, { borderBottomColor: colors.border }]}>
                  {item.image_url ? (
                    <Image source={{ uri: forceHttps(item.image_url) ?? undefined }} style={styles.bottleImage} resizeMode="contain" />
                  ) : (
                    <View style={[styles.bottleImage, { backgroundColor: colors.chip }]} />
                  )}
                  <View style={styles.bottleInfo}>
                    <Text style={[styles.bottleName, { color: colors.text }]}>{item.perfume_name}</Text>
                    <Text style={[styles.bottleBrand, { color: colors.subtext }]}>{item.perfume_brand}</Text>
                  </View>
                  <Text style={[styles.bottlePrice, { color: colors.accent }]}>
                    {currencySymbol}{item.purchase_price}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/fragrance-dna' as any);
          }}
          style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          testID="open-fragrance-dna"
        >
          <View style={styles.sectionHeader}>
            <Sparkle size={18} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.text, flex: 1 }]}>Fragrance DNA</Text>
            <View style={[styles.dnaOpenBadge, { backgroundColor: colors.accent }]}>
              <Text style={styles.dnaOpenBadgeText}>Share card</Text>
              <ArrowRight size={12} color="#0d0905" weight="bold" />
            </View>
          </View>
          <Text style={[styles.sectionSub, { color: colors.subtext }]}>
            A shareable portrait of your scent identity — tap to open.
          </Text>
          <View style={styles.dnaChips}>
            {fragranceDNA.slice(0, 8).map(([note, count]) => (
              <View key={note} style={[styles.dnaChip, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                <Text style={[styles.dnaChipText, { color: colors.text }]}>{note}</Text>
                <Text style={[styles.dnaChipCount, { color: colors.accent }]}>x{count}</Text>
              </View>
            ))}
          </View>
          <View style={styles.dnaInfoRow}>
            {[
              { label: 'Style', value: genderStyle },
              { label: 'Top Concentration', value: topConcentration },
            ].map((info, i) => (
              <View key={i} style={[styles.dnaInfoCard, { backgroundColor: colors.chip }]}>
                <Text style={[styles.dnaInfoLabel, { color: colors.subtext }]}>{info.label}</Text>
                <Text style={[styles.dnaInfoValue, { color: colors.text }]}>{info.value}</Text>
              </View>
            ))}
          </View>
          {mostWorn && (
            <View style={styles.dnaInfoRow}>
              <View style={[styles.dnaInfoCard, { backgroundColor: colors.chip }]}>
                <Text style={[styles.dnaInfoLabel, { color: colors.subtext }]}>Most Worn</Text>
                <Text style={[styles.dnaInfoValue, { color: colors.text }]}>{mostWorn.name}</Text>
                <Text style={[styles.dnaInfoSub, { color: colors.accent }]}>x{mostWorn.count}</Text>
              </View>
              {topRated && (
                <View style={[styles.dnaInfoCard, { backgroundColor: colors.chip }]}>
                  <Text style={[styles.dnaInfoLabel, { color: colors.subtext }]}>Top Rated</Text>
                  <Text style={[styles.dnaInfoValue, { color: colors.text }]}>{topRated.perfume_name}</Text>
                  <Text style={[styles.dnaInfoSub, { color: colors.accent }]}>★{topRated.rating}</Text>
                </View>
              )}
            </View>
          )}
          <View style={[styles.dnaCta, { borderTopColor: colors.border }]}>
            <Text style={[styles.dnaCtaText, { color: colors.accent }]}>Open shareable DNA card</Text>
            <ArrowRight size={14} color={colors.accent} weight="bold" />
          </View>
        </TouchableOpacity>

        <View style={styles.twoColRow}>
          <View style={[styles.colCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Tag size={16} color={colors.accent} />
              <Text style={[styles.colTitle, { color: colors.text }]}>Top Notes</Text>
            </View>
            {fragranceDNA.map(([note, count]) => (
              <View key={note} style={styles.listRow}>
                <Text style={[styles.listName, { color: colors.text }]}>{note}</Text>
                <Text style={[styles.listCount, { color: colors.accent }]}>{count}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.colCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Crown size={16} color={colors.accent} />
              <Text style={[styles.colTitle, { color: colors.text }]}>Top Brands</Text>
            </View>
            {topBrands.map(([brand, count]) => (
              <View key={brand} style={styles.listRow}>
                <Text style={[styles.listName, { color: colors.text }]} numberOfLines={1}>{brand}</Text>
                <Text style={[styles.listCount, { color: colors.accent }]}>{count}</Text>
              </View>
            ))}
          </View>
        </View>

        {topRated && (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Crown size={18} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Top Rated</Text>
            </View>
            <View style={[styles.topRatedCard, { backgroundColor: colors.chip }]}>
              <View style={[styles.topRatedBadge, { backgroundColor: '#9B59B6' }]}>
                <Text style={styles.topRatedBadgeText}>{topRated.rating}</Text>
              </View>
              <View>
                <Text style={[styles.topRatedName, { color: colors.text }]}>{topRated.perfume_name}</Text>
                <Text style={[styles.topRatedBrand, { color: colors.subtext }]}>{topRated.perfume_brand}</Text>
              </View>
            </View>
          </View>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16 },
  backBtn: { padding: 4, marginRight: 8 },
  title: { fontSize: 24, fontWeight: '700' as const, flex: 1 },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  statValue: { fontSize: 28, fontWeight: '700' as const },
  statLabel: { fontSize: 13, marginTop: 2 },
  proCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  proIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  proIconEmoji: { fontSize: 24 },
  proInfo: {},
  proTitle: { fontSize: 18, fontWeight: '700' as const },
  proSub: { fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 12 },
  upgradeBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, alignSelf: 'flex-start' },
  upgradeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' as const },
  sectionCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700' as const },
  sectionSub: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  profileSummary: { fontSize: 14, fontWeight: '600' as const, marginBottom: 16, lineHeight: 20 },
  familyBars: { gap: 10 },
  familyBarRow: {},
  familyBarLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  familyDot: { width: 10, height: 10, borderRadius: 5 },
  familyName: { fontSize: 14, fontWeight: '600' as const, flex: 1 },
  familyPct: { fontSize: 13, fontWeight: '600' as const },
  familyBarTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  familyBarFill: { height: '100%', borderRadius: 4 },
  valueRow: { flexDirection: 'row', gap: 8 },
  valueCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  valueAmount: { fontSize: 18, fontWeight: '700' as const },
  valueLabel: { fontSize: 11, marginTop: 4, textAlign: 'center' },
  subSectionTitle: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.5, marginTop: 16, marginBottom: 10 },
  bottleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, gap: 10 },
  bottleImage: { width: 40, height: 40, borderRadius: 8 },
  bottleInfo: { flex: 1 },
  bottleName: { fontSize: 14, fontWeight: '600' as const },
  bottleBrand: { fontSize: 12, marginTop: 2 },
  bottlePrice: { fontSize: 15, fontWeight: '700' as const },
  dnaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  dnaChip: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, gap: 4 },
  dnaChipText: { fontSize: 13, fontWeight: '600' as const },
  dnaChipCount: { fontSize: 13 },
  dnaInfoRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  dnaInfoCard: { flex: 1, borderRadius: 12, padding: 12 },
  dnaInfoLabel: { fontSize: 11, fontWeight: '600' as const },
  dnaInfoValue: { fontSize: 15, fontWeight: '700' as const, marginTop: 4 },
  dnaInfoSub: { fontSize: 12, marginTop: 2 },
  twoColRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 16 },
  colCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16 },
  colTitle: { fontSize: 16, fontWeight: '700' as const },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  listName: { fontSize: 13, flex: 1 },
  listCount: { fontSize: 13, fontWeight: '700' as const },
  topRatedCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, gap: 12 },
  topRatedBadge: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  topRatedBadgeText: { color: '#fff', fontSize: 18, fontWeight: '700' as const },
  topRatedName: { fontSize: 15, fontWeight: '700' as const },
  topRatedBrand: { fontSize: 13, marginTop: 2 },
  dnaOpenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  dnaOpenBadgeText: {
    color: '#0d0905',
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  dnaCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  dnaCtaText: {
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
});

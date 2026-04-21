import React, { useMemo, useCallback, useEffect, useRef, useState, memo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Animated,
  Easing,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';

import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { BookOpen, Sparkle, ChartBar, ArrowsLeftRight, CaretRight, Heart, Newspaper, ArrowUpRight, Leaf, Sun, Flame, Snowflake, Scan, Target } from 'phosphor-react-native';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { supabase, forceHttps } from '@/lib/supabase';
import { CollectionItem, WishlistItem, WearDiaryEntry, NewsArticle } from '@/lib/types';
import { LinearGradient } from 'expo-linear-gradient';
import FloatingNotes from '@/components/FloatingNotes';
import BrandedLogo from '@/components/BrandedLogo';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SEASON_CONFIG = {
  spring: { keywords: ['fresh', 'floral', 'green', 'citrus', 'rose', 'jasmine', 'neroli', 'lily', 'violet'], icon: Leaf, color: '#4CAF50', label: 'Spring Picks' } as const,
  summer: { keywords: ['aquatic', 'citrus', 'marine', 'tropical', 'coconut', 'lime', 'bergamot', 'lemon', 'orange'], icon: Sun, color: '#FFC107', label: 'Summer Picks' } as const,
  autumn: { keywords: ['woody', 'leather', 'spicy', 'amber', 'patchouli', 'tobacco', 'oud', 'cedar', 'cinnamon'], icon: Flame, color: '#FF5722', label: 'Autumn Picks' } as const,
  winter: { keywords: ['warm', 'vanilla', 'amber', 'musk', 'incense', 'tonka', 'benzoin', 'sandalwood', 'oud'], icon: Snowflake, color: '#2196F3', label: 'Winter Picks' } as const,
} as const;

function getCurrentSeason(): keyof typeof SEASON_CONFIG {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

export default function HomeScreen() {
  const { user, profile, session } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeNewsIndex, setActiveNewsIndex] = useState(0);

  const logoSlide = useRef(new Animated.Value(30)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const ctaSlide = useRef(new Animated.Value(40)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  const greetSlide = useRef(new Animated.Value(20)).current;
  const greetOpacity = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!session) {
      hasAnimated.current = false;
      Animated.stagger(180, [
        Animated.parallel([
          Animated.timing(logoOpacity, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(logoSlide, { toValue: 0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ctaOpacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(ctaSlide, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]).start();
    } else {
      if (!hasAnimated.current) {
        hasAnimated.current = true;
        greetOpacity.setValue(0);
        greetSlide.setValue(20);
        contentOpacity.setValue(0);
        contentSlide.setValue(30);

        Animated.stagger(200, [
          Animated.parallel([
            Animated.timing(greetOpacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(greetSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(contentOpacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(contentSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
        ]).start();
      } else {
        greetOpacity.setValue(1);
        greetSlide.setValue(0);
        contentOpacity.setValue(1);
        contentSlide.setValue(0);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

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
      return (data ?? []).map(item => ({
        ...item,
        status: item.status || 'owned',
        fill_level: item.fill_level ?? 100,
      })) as CollectionItem[];
    },
    enabled: !!user?.id,
    placeholderData: keepPreviousData,
  });

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
    placeholderData: keepPreviousData,
  });

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
    placeholderData: keepPreviousData,
  });

  const newsQuery = useQuery({
    queryKey: ['fragrance-news'],
    queryFn: async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('https://scentbuddy.io/api/fragrance-news', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error(`News request failed: ${response.status}`);
        }
        const data = await response.json();
        const articles = (data?.articles ?? []) as NewsArticle[];
        return articles;
      } catch (err) {
        clearTimeout(timeoutId);
        console.log('News fetch error:', err);
        throw err;
      }
    },
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
    placeholderData: keepPreviousData,
  });

  const collection = useMemo(() => collectionQuery.data ?? [], [collectionQuery.data]);
  const wishlist = useMemo(() => wishlistQuery.data ?? [], [wishlistQuery.data]);
  const wears = useMemo(() => wearsQuery.data ?? [], [wearsQuery.data]);
  const newsArticles = useMemo(() => newsQuery.data ?? [], [newsQuery.data]);

  useEffect(() => {
    if (newsArticles.length === 0) return;
    if (activeNewsIndex >= newsArticles.length) {
      setActiveNewsIndex(0);
    }
  }, [newsArticles.length, activeNewsIndex]);

  useEffect(() => {
    if (newsArticles.length <= 1) return;
    const interval = setInterval(() => {
      setActiveNewsIndex(prev => (prev + 1) % newsArticles.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [newsArticles.length]);

  const getGreeting = useCallback(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'GOOD MORNING';
    if (hour < 18) return 'GOOD AFTERNOON';
    return 'GOOD EVENING';
  }, []);

  const stats = useMemo(() => {
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
    return {
      fragrances: collection.length,
      brands: brands.size,
      streak,
      totalWears: wears.length,
    };
  }, [collection, wears]);

  const mostWorn = useMemo(() => {
    const counts: Record<string, { name: string; brand: string; count: number; image: string | null }> = {};
    wears.forEach(w => {
      const key = `${w.perfume_name}|${w.perfume_brand}`;
      if (!counts[key]) {
        const col = collection.find(c => c.perfume_name === w.perfume_name && c.perfume_brand === w.perfume_brand);
        counts[key] = { name: w.perfume_name, brand: w.perfume_brand, count: 0, image: col?.image_url ?? null };
      }
      counts[key].count++;
    });
    const sorted = Object.values(counts).sort((a, b) => b.count - a.count);
    return sorted[0] ?? null;
  }, [wears, collection]);

  const favNote = useMemo(() => {
    const noteCounts: Record<string, number> = {};
    collection.forEach(c => {
      [...(c.top_notes ?? []), ...(c.heart_notes ?? []), ...(c.base_notes ?? [])].forEach(n => {
        noteCounts[n] = (noteCounts[n] || 0) + 1;
      });
    });
    let maxNote = '';
    let maxCount = 0;
    Object.entries(noteCounts).forEach(([note, count]) => {
      if (count > maxCount) { maxNote = note; maxCount = count; }
    });
    return maxNote ? { note: maxNote, count: maxCount } : null;
  }, [collection]);

  const hasWornToday = useMemo(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return wears.some(w => w.date === todayStr);
  }, [wears]);

  const heroItem = useMemo(() => {
    if (collection.length === 0 || hasWornToday) return null;
    const dayIndex = Math.floor(Date.now() / 86400000) % collection.length;
    return collection[dayIndex];
  }, [collection, hasWornToday]);

  const seasonalPicks = useMemo(() => {
    if (collection.length === 0) return [];
    const season = getCurrentSeason();
    const config = SEASON_CONFIG[season];
    const keywords = config.keywords;

    const scored = collection.map(item => {
      const allNotes = [
        ...(item.top_notes ?? []),
        ...(item.heart_notes ?? []),
        ...(item.base_notes ?? []),
      ].map(n => n.toLowerCase());
      const matchCount = keywords.filter(kw => allNotes.some(n => n.includes(kw))).length;
      return { item, matchCount };
    });

    return scored
      .filter(s => s.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 5)
      .map(s => s.item);
  }, [collection]);

  const currentSeason = getCurrentSeason();
  const SeasonIcon = SEASON_CONFIG[currentSeason].icon;

  const onRefresh = useCallback(() => {
    void collectionQuery.refetch();
    void wishlistQuery.refetch();
    void wearsQuery.refetch();
    void newsQuery.refetch();
  }, [collectionQuery, wishlistQuery, wearsQuery, newsQuery]);

  if (!session) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <FloatingNotes />
        <View style={styles.authPrompt}>
          <Animated.View style={[styles.authHeaderBackdrop, { backgroundColor: colors.background, opacity: logoOpacity, transform: [{ translateY: logoSlide }] }]}>
            <BrandedLogo fontSize={40} />
            <Text style={[styles.authSubtitle, { color: colors.subtext }]}>
              Track your fragrance collection, discover new scents, and connect with fellow enthusiasts.
            </Text>
          </Animated.View>
          <Animated.View style={{ opacity: ctaOpacity, transform: [{ translateY: ctaSlide }] }}>
            <TouchableOpacity
              style={[styles.authButton, { backgroundColor: colors.accent }]}
              onPress={() => router.push('/login')}
            >
              <Text style={styles.authButtonText}>Get Started</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    );
  }

  const activeArticle = newsArticles[activeNewsIndex] ?? newsArticles[0];

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
        <Animated.View style={[styles.headerRow, { opacity: greetOpacity, transform: [{ translateY: greetSlide }] }]}>
          <View style={styles.headerLeft}>
            <Text style={[styles.greeting, { color: colors.subtext }]}>{getGreeting()}</Text>
            <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
              {profile?.display_name || profile?.username || 'Fragrance Lover'}
            </Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push('/diary')}
            >
              <BookOpen size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '40' }]}
              onPress={() => router.push('/scanner')}
            >
              <Scan size={20} color={colors.accent} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Animated.View style={{ minHeight: 400, opacity: contentOpacity, transform: [{ translateY: contentSlide }] }}>

        {activeArticle && (
          <View style={styles.newsSection}>
            <TouchableOpacity
              style={[styles.newsCard, { overflow: 'hidden' }]}
              activeOpacity={0.9}
              onPress={() => {
                if (activeArticle.url) {
                  void Linking.openURL(activeArticle.url);
                }
              }}
            >
              {activeArticle.image && (
                <Image
                  source={{ uri: activeArticle.image }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={300}
                />
              )}
              <LinearGradient
                colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.88)']}
                style={styles.newsGradient}
              >
                <View style={styles.newsTop}>
                  <View style={[styles.newsBadge, { backgroundColor: colors.accent }]}>
                    <Newspaper size={10} color="#fff" />
                    <Text style={styles.newsBadgeText}>{activeArticle.source}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.newsArrow}
                    onPress={() => {
                      if (activeArticle.url) void Linking.openURL(activeArticle.url);
                    }}
                  >
                    <ArrowUpRight size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
                <View style={styles.newsBottom}>
                  <Text style={styles.newsTitle} numberOfLines={2}>{activeArticle.title}</Text>
                  {activeArticle.subtitle && (
                    <Text style={styles.newsSubtitle} numberOfLines={1}>{activeArticle.subtitle}</Text>
                  )}
                  <View style={styles.newsFooter}>
                    <Text style={styles.newsTime}>{activeArticle.publishedAt}</Text>
                    <View style={styles.newsDots}>
                      {newsArticles.slice(0, 5).map((_, i) => (
                        <TouchableOpacity key={i} onPress={() => setActiveNewsIndex(i)}>
                          <View style={[styles.newsDot, {
                            backgroundColor: i === activeNewsIndex ? '#fff' : 'rgba(255,255,255,0.4)',
                          }]} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {heroItem && (
          <TouchableOpacity
            style={[styles.heroCard, { overflow: 'hidden' }]}
            activeOpacity={0.9}
            onPress={() => router.push({ pathname: '/(tabs)/collection', params: { perfumeId: heroItem.id } })}
          >
            <LinearGradient
              colors={[colors.accent, `${colors.accent}88`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              <View style={styles.heroContent}>
                <View style={styles.heroBadge}>
                  <Sparkle size={12} color="#fff" />
                  <Text style={styles.heroBadgeText}>WEAR TODAY</Text>
                </View>
                <Text style={styles.heroBrand}>{heroItem.perfume_brand?.toUpperCase()}</Text>
                <Text style={styles.heroName}>{heroItem.perfume_name}</Text>
                {heroItem.concentration && (
                  <View style={styles.heroConcentration}>
                    <Text style={styles.heroConcentrationText}>{heroItem.concentration}</Text>
                  </View>
                )}
              </View>
              {heroItem.image_url && (
                <View style={styles.heroImageWrap}>
                  <Image
                    source={{ uri: forceHttps(heroItem.image_url) ?? undefined }}
                    style={styles.heroImage}
                    contentFit="contain"
                    transition={200}
                  />
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}

        <View style={styles.statsRow}>
          {[
            { label: 'Fragrances', value: stats.fragrances, color: colors.accent },
            { label: 'Brands', value: stats.brands, color: '#5B8DEF' },
            { label: `Day\nStreak`, value: stats.streak > 0 ? `${stats.streak}` : '0', color: '#E8A838' },
            { label: `Total\nWears`, value: stats.totalWears, color: '#4CAF50' },
          ].map((stat, i) => (
            <View key={i} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: stat.color }]}>
                {stat.value}
              </Text>
              <Text style={[styles.statLabel, { color: colors.subtext }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.featureGrid}>
          {[
            { icon: Scan, label: 'Scan', subtitle: 'Add by barcode', color: '#E8A838', bg: '#FFF8E1', route: '/scanner' },
            { icon: Sparkle, label: 'For You', subtitle: 'Smart picks', color: '#c49a6c', bg: '#FDF3E7', route: '/for-you' },
            { icon: ChartBar, label: 'Statistics', subtitle: 'Your data', color: '#5B8DEF', bg: '#EBF2FF', route: '/statistics' },
            { icon: ArrowsLeftRight, label: 'Compare', subtitle: 'Side by side', color: '#9B59B6', bg: '#F3E8F9', route: '/compare' },
            { icon: BookOpen, label: 'Diary', subtitle: 'Wear log', color: '#4CAF50', bg: '#E8F5E9', route: '/diary' },
            { icon: Target, label: 'Goals', subtitle: 'Milestones', color: '#E8A838', bg: '#FFF8E1', route: '/goals' },
          ].map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.featureCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.7}
              onPress={() => router.push(item.route as any)}
            >
              <View style={[styles.featureIconBg, { backgroundColor: item.bg }]}>
                <item.icon size={22} color={item.color} />
              </View>
              <Text style={[styles.featureLabel, { color: colors.text }]}>{item.label}</Text>
              <Text style={[styles.featureSubtitle, { color: colors.subtext }]}>{item.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {seasonalPicks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <SeasonIcon size={18} color={SEASON_CONFIG[currentSeason].color} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{SEASON_CONFIG[currentSeason].label}</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/(tabs)/collection')} style={styles.viewAllBtn}>
                <Text style={[styles.viewAllText, { color: colors.accent }]}>View all</Text>
                <CaretRight size={16} color={colors.accent} />
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonalScroll}>
              {seasonalPicks.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.seasonalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => router.push({ pathname: '/(tabs)/collection', params: { perfumeId: item.id } })}
                >
                  {item.image_url ? (
                    <Image
                      source={{ uri: forceHttps(item.image_url) ?? undefined }}
                      style={styles.seasonalImage}
                      contentFit="contain"
                      transition={200}
                    />
                  ) : (
                    <View style={[styles.seasonalImagePlaceholder, { backgroundColor: colors.chip }]}>
                      <SeasonIcon size={24} color={SEASON_CONFIG[currentSeason].color} />
                    </View>
                  )}
                  <Text style={[styles.seasonalName, { color: colors.text }]} numberOfLines={1}>{item.perfume_name}</Text>
                  <Text style={[styles.seasonalBrand, { color: colors.subtext }]} numberOfLines={1}>{item.perfume_brand}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.insightsRow}>
          {mostWorn && (
            <View style={[styles.insightCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.insightLabel, { color: colors.subtext }]}>MOST WORN</Text>
              <Text style={[styles.insightValue, { color: colors.text }]} numberOfLines={1}>{mostWorn.name}</Text>
              <Text style={[styles.insightSub, { color: colors.accent }]}>{mostWorn.count} wear{mostWorn.count !== 1 ? 's' : ''}</Text>
            </View>
          )}
          {favNote && (
            <View style={[styles.insightCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.insightLabel, { color: colors.subtext }]}>FAV NOTE</Text>
              <Text style={[styles.insightValue, { color: colors.text }]}>{favNote.note}</Text>
              <Text style={[styles.insightSub, { color: colors.accent }]}>in {favNote.count} perfumes</Text>
            </View>
          )}
          {!mostWorn && !favNote && (
            <View style={[styles.insightCard, { backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]}>
              <Text style={[styles.insightLabel, { color: colors.subtext }]}>ADD PERFUMES</Text>
              <Text style={[styles.insightValue, { color: colors.text }]}>Start your collection</Text>
              <Text style={[styles.insightSub, { color: colors.accent }]}>to see insights</Text>
            </View>
          )}
        </View>

        {wishlist.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Wishlist</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/wishlist')} style={styles.viewAllBtn}>
                <Text style={[styles.viewAllText, { color: colors.accent }]}>View all</Text>
                <CaretRight size={16} color={colors.accent} />
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wishlistScroll}>
              {wishlist.slice(0, 5).map(item => (
                <WishlistHomeCard
                  key={item.id}
                  item={item}
                  colors={colors}
                  onPress={() => router.push('/(tabs)/wishlist')}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {collection.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Collection</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/collection')} style={styles.viewAllBtn}>
                <Text style={[styles.viewAllText, { color: colors.accent }]}>View all</Text>
                <CaretRight size={16} color={colors.accent} />
              </TouchableOpacity>
            </View>
            <View style={styles.recentGrid}>
              {collection.slice(0, 6).map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.recentCard, { backgroundColor: colors.card }]}
                  activeOpacity={0.8}
                  onPress={() => router.push({ pathname: '/(tabs)/collection', params: { perfumeId: item.id } })}
                >
                  {item.image_url ? (
                    <Image
                      source={{ uri: forceHttps(item.image_url) ?? undefined }}
                      style={[styles.recentImage, { backgroundColor: colors.chip }]}
                      contentFit="cover"
                      transition={200}
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={[styles.recentImage, { backgroundColor: colors.chip }]} />
                  )}
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.7)']}
                    style={styles.recentOverlay}
                  >
                    {item.is_favorite && <Text style={styles.favHeart}>❤️</Text>}
                    <Text style={styles.recentName} numberOfLines={1}>{item.perfume_name}</Text>
                    <Text style={styles.recentBrand} numberOfLines={1}>{item.perfume_brand}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {collection.length === 0 && wishlist.length === 0 && (
          <View style={[styles.getStartedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.getStartedIcon, { backgroundColor: colors.accent + '18' }]}>
              <Sparkle size={28} color={colors.accent} />
            </View>
            <Text style={[styles.getStartedTitle, { color: colors.text }]}>Start Your Journey</Text>
            <Text style={[styles.getStartedSub, { color: colors.subtext }]}>
              Add your first fragrance to unlock personalized recommendations, stats, and more.
            </Text>
            <TouchableOpacity
              style={[styles.getStartedBtn, { backgroundColor: colors.accent }]}
              onPress={() => router.push('/(tabs)/collection')}
            >
              <Sparkle size={18} color="#fff" />
              <Text style={styles.getStartedBtnText}>Add Your First Fragrance</Text>
            </TouchableOpacity>
          </View>
        )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const WishlistHomeCard = memo(function WishlistHomeCard({ item, colors, onPress }: {
  item: WishlistItem;
  colors: any;
  onPress: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const imageUrl = item.image_url ? forceHttps(item.image_url) : null;
  const showImage = !!imageUrl && !imgError;

  return (
    <TouchableOpacity
      style={[styles.wishlistCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
    >
      {showImage ? (
        <Image
          source={{ uri: imageUrl ?? undefined }}
          style={styles.wishlistImage}
          contentFit="contain"
          transition={200}
          onError={() => {
            console.log('Wishlist image failed to load:', imageUrl);
            setImgError(true);
          }}
        />
      ) : (
        <View style={[styles.wishlistImagePlaceholder, { backgroundColor: colors.chip }]}>
          <Heart size={24} color={colors.accent} />
        </View>
      )}
      <Text style={[styles.wishlistName, { color: colors.text }]} numberOfLines={1}>{item.perfume_name}</Text>
      <Text style={[styles.wishlistBrand, { color: colors.subtext }]} numberOfLines={1}>{item.perfume_brand}</Text>
    </TouchableOpacity>
  );
});

const CARD_WIDTH = (SCREEN_WIDTH - 48 - 12) / 2;

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
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  username: {
    fontSize: 32,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  headerIcons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  newsSection: { marginHorizontal: 20, marginBottom: 20 },
  newsCard: {
    height: 160,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
  },
  newsGradient: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    justifyContent: 'space-between',
  },
  newsTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  newsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  newsBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' as const },
  newsArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsBottom: {},
  newsTitle: { color: '#fff', fontSize: 16, fontWeight: '700' as const, lineHeight: 22 },
  newsSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 },
  newsFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  newsTime: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  newsDots: { flexDirection: 'row', gap: 4 },
  newsDot: { width: 6, height: 6, borderRadius: 3 },
  heroCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    marginBottom: 20,
    height: 200,
  },
  heroGradient: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 20,
    padding: 20,
  },
  heroContent: { flex: 1, justifyContent: 'center' },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: 12,
  },
  heroBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.5 },
  heroBrand: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' as const, marginBottom: 4 },
  heroName: { color: '#fff', fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  heroConcentration: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  heroConcentrationText: { color: '#fff', fontSize: 12, fontWeight: '600' as const },
  heroImageWrap: {
    width: 130,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroImage: { width: '100%', height: '100%', borderRadius: 12 },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  statValue: { fontSize: 26, fontWeight: '700' as const },
  statLabel: { fontSize: 11, marginTop: 4, textAlign: 'center' },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  featureCard: {
    width: (SCREEN_WIDTH - 50) / 2,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  featureIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  featureLabel: { fontSize: 16, fontWeight: '700' as const },
  featureSubtitle: { fontSize: 13, marginTop: 2 },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '700' as const },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center' },
  viewAllText: { fontSize: 14, fontWeight: '600' as const },
  seasonalScroll: { paddingHorizontal: 20, gap: 12 },
  seasonalCard: {
    width: 130,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  seasonalImage: { width: '100%', height: 100, backgroundColor: '#f0ebe3' },
  seasonalImagePlaceholder: {
    width: '100%',
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seasonalName: { fontSize: 13, fontWeight: '600' as const, paddingHorizontal: 8, paddingTop: 8 },
  seasonalBrand: { fontSize: 11, paddingHorizontal: 8, paddingBottom: 10 },
  insightsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 24,
  },
  insightCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  insightLabel: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 1, marginBottom: 6 },
  insightValue: { fontSize: 16, fontWeight: '700' as const },
  insightSub: { fontSize: 13, marginTop: 4 },
  wishlistScroll: { paddingHorizontal: 20, gap: 12 },
  wishlistCard: {
    width: 120,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  wishlistImage: { width: '100%', height: 100, backgroundColor: '#f0ebe3' },
  wishlistImagePlaceholder: {
    width: '100%',
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishlistName: { fontSize: 13, fontWeight: '600' as const, paddingHorizontal: 8, paddingTop: 8 },
  wishlistBrand: { fontSize: 11, paddingHorizontal: 8, paddingBottom: 10 },
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 10,
  },
  recentCard: {
    width: CARD_WIDTH,
    height: 196,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  recentImage: {
    width: '100%',
    height: '100%',
    position: 'absolute' as const,
  },
  recentOverlay: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    paddingTop: 40,
  },
  favHeart: { fontSize: 14, marginBottom: 4 },
  recentName: { color: '#fff', fontSize: 15, fontWeight: '700' as const },
  recentBrand: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  authPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    zIndex: 2,
  },
  authHeaderBackdrop: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 20,
    borderRadius: 24,
    marginBottom: 24,
  },
  authSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  authButton: {
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 14,
  },
  authButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700' as const,
  },
  getStartedCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    marginBottom: 24,
  },
  getStartedIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  getStartedTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  getStartedSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  getStartedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  getStartedBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
  },
});

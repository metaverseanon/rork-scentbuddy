import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CaretLeft, Sparkle, Heart, CaretDown, CaretUp, X, Star } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { supabase, searchFragrances, forceHttps } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { CollectionItem, SearchResult } from '@/lib/types';
import { Crown } from 'phosphor-react-native';

const BRAND_TIERS: Record<string, number> = {
  'Dior': 1.3, 'Chanel': 1.3, 'Tom Ford': 1.3, 'YSL': 1.3, 'Guerlain': 1.3,
  'Hermès': 1.3, 'Armani': 1.3, 'Prada': 1.3, 'Versace': 1.3, 'Valentino': 1.3,
  'Burberry': 1.3, 'Givenchy': 1.3, 'Cartier': 1.3, 'Bvlgari': 1.3,
  'Creed': 1.15, 'MFK': 1.15, 'Jo Malone': 1.15, 'Byredo': 1.15,
  'Diptyque': 1.15, 'Frederic Malle': 1.15, 'Amouage': 1.15, 'Xerjoff': 1.15,
  'Mancera': 1.15, 'Parfums de Marly': 1.15, 'Maison Margiela': 1.15, 'Nishane': 1.15, 'Montale': 1.15,
  'Lattafa': 1.05, 'Rasasi': 1.05, 'Kayali': 1.05, 'Ralph Lauren': 1.05, 'Calvin Klein': 1.05,
};

function getDailySeed(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  for (let i = result.length - 1; i > 0; i--) {
    hash = ((hash << 5) - hash) + i;
    hash |= 0;
    const j = Math.abs(hash) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export default function ForYouScreen() {
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const { isPro } = useRevenueCat();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [similarSource, setSimilarSource] = useState<CollectionItem | null>(null);
  const [similarResults, setSimilarResults] = useState<(SearchResult & { matchPct: number; sharedNotes: string[] })[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarExpandedIndex, setSimilarExpandedIndex] = useState<number | null>(null);
  const [budget, setBudget] = useState(150);
  const [altSource, setAltSource] = useState<CollectionItem | null>(null);
  const [altResults, setAltResults] = useState<(SearchResult & { matchPct: number; sharedNotes: string[] })[]>([]);
  const [altLoading, setAltLoading] = useState(false);
  const [altExpandedIndex, setAltExpandedIndex] = useState<number | null>(null);


  const collectionQuery = useQuery({
    queryKey: ['collection', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_collections').select('*').eq('user_id', user.id);
      if (error) throw error;
      return (data ?? []) as CollectionItem[];
    },
    enabled: !!user?.id,
  });

  const wishlistQuery = useQuery({
    queryKey: ['wishlist', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_wishlists').select('perfume_name, perfume_brand').eq('user_id', user.id);
      if (error) throw error;
      return (data ?? []) as { perfume_name: string; perfume_brand: string }[];
    },
    enabled: !!user?.id,
  });

  const wishlistSet = useMemo(() => {
    const set = new Set<string>();
    (wishlistQuery.data ?? []).forEach(w => set.add(`${w.perfume_name}|${w.perfume_brand}`));
    return set;
  }, [wishlistQuery.data]);

  const collection = useMemo(() => collectionQuery.data ?? [], [collectionQuery.data]);

  const tasteProfile = useMemo(() => {
    const notes: Record<string, number> = {};
    collection.forEach(item => {
      const weight = !item.rating ? 0.6 :
        item.rating === 1 ? -1.0 : item.rating === 2 ? -0.5 :
        item.rating === 3 ? 0.5 : item.rating === 4 ? 0.67 : 1.0;

      (item.top_notes ?? []).forEach(n => { notes[n] = (notes[n] || 0) + weight * 1; });
      (item.heart_notes ?? []).forEach(n => { notes[n] = (notes[n] || 0) + weight * 2; });
      (item.base_notes ?? []).forEach(n => { notes[n] = (notes[n] || 0) + weight * 3; });
    });

    const positiveNotes = Object.entries(notes)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a);

    return positiveNotes.slice(0, 8);
  }, [collection]);

  const topSearchNotes = useMemo(() => {
    return tasteProfile.slice(0, 4).map(([note]) => note);
  }, [tasteProfile]);

  const dailySeed = useMemo(() => getDailySeed(), []);

  const recommendationsQuery = useQuery({
    queryKey: ['recommendations', user?.id, topSearchNotes.join(','), dailySeed],
    queryFn: async () => {
      if (topSearchNotes.length === 0) return [];
      const allResults: SearchResult[] = [];
      for (const note of topSearchNotes) {
        const results = await searchFragrances(note, 25);
        allResults.push(...results);
      }

      const ownedSet = new Set(collection.map(c => `${c.perfume_name}|${c.perfume_brand}`));
      const unique = allResults.filter(r => !ownedSet.has(`${r.name}|${r.brand}`) && !wishlistSet.has(`${r.name}|${r.brand}`));

      const seen = new Set<string>();
      const deduped = unique.filter(r => {
        const key = `${r.name}|${r.brand}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const scored = deduped.map(r => {
        let score = 0;
        const allNotes = [...(r.topNotes || []), ...(r.heartNotes || []), ...(r.baseNotes || [])];
        const matchedNotes: string[] = [];

        tasteProfile.forEach(([note, strength]) => {
          if ((r.topNotes || []).includes(note)) { score += strength * 1; matchedNotes.push(note); }
          if ((r.heartNotes || []).includes(note)) { score += strength * 2.5; matchedNotes.push(note); }
          if ((r.baseNotes || []).includes(note)) { score += strength * 4; matchedNotes.push(note); }
        });

        const uniqueMatches = [...new Set(matchedNotes)];
        if (uniqueMatches.length >= 3) score *= 1.4;
        else if (uniqueMatches.length >= 2) score *= 1.15;

        const brandMultiplier = Object.entries(BRAND_TIERS).find(([b]) =>
          r.brand.toLowerCase().includes(b.toLowerCase())
        )?.[1] ?? 1.0;
        score *= brandMultiplier;

        const ownedNotes = new Set<string>();
        collection.forEach(c => {
          [...(c.top_notes ?? []), ...(c.heart_notes ?? []), ...(c.base_notes ?? [])].forEach(n => ownedNotes.add(n));
        });
        const overlap = allNotes.filter(n => ownedNotes.has(n)).length / Math.max(allNotes.length, 1);
        if (overlap > 0.8) score *= 0.15;

        return { ...r, score, matchPct: 0, sharedNotes: [...new Set(matchedNotes)] };
      });

      scored.sort((a, b) => b.score - a.score);

      const brandCount: Record<string, number> = {};
      const limited = scored.filter(r => {
        brandCount[r.brand] = (brandCount[r.brand] || 0) + 1;
        return brandCount[r.brand] <= 2;
      });

      const shuffled = seededShuffle(limited, dailySeed);

      const maxResults = (isPro || profile?.is_pro) ? 12 : 5;
      const finalResults = shuffled.slice(0, maxResults);

      const topScore = finalResults.length > 0 ? finalResults[0].score : 1;
      const bottomScore = finalResults.length > 1 ? finalResults[finalResults.length - 1].score : 0;
      const scoreRange = Math.max(topScore - bottomScore, 0.01);
      return finalResults.map((r, idx) => {
        const relativePosition = (r.score - bottomScore) / scoreRange;
        const pct = Math.min(96, Math.max(45, Math.round(relativePosition * 40 + 56 - idx * 3)));
        return { ...r, matchPct: pct };
      });
    },
    enabled: topSearchNotes.length > 0,
    staleTime: 1000 * 60 * 60,
  });

  const recommendations = recommendationsQuery.data ?? [];

  const handleFindSimilar = useCallback(async (item: CollectionItem) => {
    console.log('Finding similar to:', item.perfume_name);
    setSimilarSource(item);
    setSimilarLoading(true);
    setSimilarResults([]);
    setSimilarExpandedIndex(null);
    try {
      const allNotes = [
        ...(item.base_notes ?? []),
        ...(item.heart_notes ?? []),
        ...(item.top_notes ?? []),
      ];
      if (allNotes.length === 0) {
        const results = await searchFragrances(item.perfume_name, 20);
        const filtered = results
          .filter((r: SearchResult) => !(r.name === item.perfume_name && r.brand === item.perfume_brand))
          .filter((r: SearchResult) => r.brand !== item.perfume_brand)
          .slice(0, 10)
          .map((r: SearchResult) => ({ ...r, matchPct: 50, sharedNotes: [] as string[] }));
        setSimilarResults(filtered);
        setSimilarLoading(false);
        return;
      }

      const noteFreq: Record<string, number> = {};
      collection.forEach(c => {
        [...(c.top_notes ?? []), ...(c.heart_notes ?? []), ...(c.base_notes ?? [])].forEach(n => {
          noteFreq[n] = (noteFreq[n] || 0) + 1;
        });
      });
      const total = collection.length || 1;
      const idf = (note: string) => Math.log((total + 1) / ((noteFreq[note] || 0) + 1));

      const noteWeights: { note: string; weight: number }[] = [];
      (item.base_notes ?? []).forEach(n => noteWeights.push({ note: n, weight: 3.5 * idf(n) }));
      (item.heart_notes ?? []).forEach(n => noteWeights.push({ note: n, weight: 2.0 * idf(n) }));
      (item.top_notes ?? []).forEach(n => noteWeights.push({ note: n, weight: 1.0 * idf(n) }));

      const tasteNoteSet = new Set(tasteProfile.map(([n]) => n));
      noteWeights.forEach(nw => {
        if (tasteNoteSet.has(nw.note)) {
          const tasteWeight = tasteProfile.find(([n]) => n === nw.note)?.[1] ?? 0;
          nw.weight *= 1.0 + Math.min(tasteWeight / 10, 0.5);
        }
      });

      noteWeights.sort((a, b) => b.weight - a.weight);

      const topTasteNotes = tasteProfile
        .filter(([n]) => !allNotes.includes(n))
        .slice(0, 2)
        .map(([n]) => n);

      const primaryNotes = noteWeights.slice(0, 3).map(nw => nw.note);
      const secondaryNotes = noteWeights.slice(3, 6).map(nw => nw.note);
      const searchTerms = [
        ...primaryNotes,
        ...secondaryNotes.slice(0, 1),
        ...topTasteNotes.slice(0, 1),
        item.perfume_name,
      ];
      const uniqueSearchTerms = [...new Set(searchTerms)].slice(0, 6);

      const allSearchResults: SearchResult[] = [];
      for (const term of uniqueSearchTerms) {
        const results = await searchFragrances(term, 20);
        allSearchResults.push(...results);
      }

      const ownedSet = new Set(collection.map(c => `${c.perfume_name}|${c.perfume_brand}`));
      const sourceKey = `${item.perfume_name}|${item.perfume_brand}`;
      const sourceBrand = item.perfume_brand.toLowerCase();
      const seen = new Set<string>();
      const unique = allSearchResults.filter(r => {
        const key = `${r.name}|${r.brand}`;
        if (key === sourceKey || ownedSet.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const scored = unique.map(r => {
        let score = 0;
        const matched: string[] = [];
        noteWeights.forEach(({ note, weight }) => {
          if ((r.baseNotes || []).includes(note)) { score += weight * 4; matched.push(note); }
          else if ((r.heartNotes || []).includes(note)) { score += weight * 2.5; matched.push(note); }
          else if ((r.topNotes || []).includes(note)) { score += weight * 1; matched.push(note); }
        });

        const rAllNotes = [...(r.topNotes || []), ...(r.heartNotes || []), ...(r.baseNotes || [])];
        tasteProfile.forEach(([tNote, tWeight]) => {
          if (!allNotes.includes(tNote) && rAllNotes.includes(tNote)) {
            score += (tWeight / 10) * 1.5;
            matched.push(tNote);
          }
        });

        const uniqueMatches = [...new Set(matched)];
        if (uniqueMatches.length >= 4) score *= 1.6;
        else if (uniqueMatches.length >= 3) score *= 1.4;
        else if (uniqueMatches.length >= 2) score *= 1.15;

        const brandMult = Object.entries(BRAND_TIERS).find(([b]) =>
          r.brand.toLowerCase().includes(b.toLowerCase())
        )?.[1] ?? 1.0;
        score *= brandMult;

        if (r.brand.toLowerCase() === sourceBrand) {
          score *= 0.4;
        }

        return { ...r, score, sharedNotes: [...new Set(matched)] };
      });

      scored.sort((a, b) => b.score - a.score);

      const brandCount: Record<string, number> = {};
      const limited = scored.filter(r => {
        const isSameBrand = r.brand.toLowerCase() === sourceBrand;
        const maxPerBrand = isSameBrand ? 1 : 2;
        brandCount[r.brand] = (brandCount[r.brand] || 0) + 1;
        return brandCount[r.brand] <= maxPerBrand;
      });

      const sameBrand = limited.filter(r => r.brand.toLowerCase() === sourceBrand);
      const diffBrand = limited.filter(r => r.brand.toLowerCase() !== sourceBrand);
      const diverseResults = [...diffBrand.slice(0, 9), ...sameBrand.slice(0, 1)].slice(0, 10);
      diverseResults.sort((a, b) => b.score - a.score);

      const maxScore = diverseResults.length > 0 ? Math.max(...diverseResults.map(r => r.score)) : 1;
      const withPct = diverseResults.map(r => ({
        ...r,
        matchPct: Math.min(95, Math.max(10, Math.round((r.score / Math.max(maxScore * 1.15, 1)) * 85 + 10))),
      }));

      setSimilarResults(withPct);
    } catch (err) {
      console.log('Find similar error:', err);
      Alert.alert('Error', 'Failed to find similar fragrances. Please try again.');
    } finally {
      setSimilarLoading(false);
    }
  }, [collection, tasteProfile]);

  const altCacheRef = useRef<{ item: CollectionItem; results: SearchResult[] } | null>(null);

  const handleFindAlternatives = useCallback(async (item: CollectionItem, budgetOverride?: number) => {
    const activeBudget = budgetOverride ?? budget;
    console.log('Finding alternatives for:', item.perfume_name, 'budget:', activeBudget);
    setAltSource(item);
    setAltLoading(true);
    setAltResults([]);
    setAltExpandedIndex(null);
    try {
      let allUnique: SearchResult[];

      if (altCacheRef.current && altCacheRef.current.item.id === item.id) {
        allUnique = altCacheRef.current.results;
      } else {
        const noteFreq: Record<string, number> = {};
        collection.forEach(c => {
          [...(c.top_notes ?? []), ...(c.heart_notes ?? []), ...(c.base_notes ?? [])].forEach(n => {
            noteFreq[n] = (noteFreq[n] || 0) + 1;
          });
        });
        const total = collection.length || 1;
        const idf = (note: string) => Math.log((total + 1) / ((noteFreq[note] || 0) + 1));

        const noteWeights: { note: string; weight: number }[] = [];
        (item.base_notes ?? []).forEach(n => noteWeights.push({ note: n, weight: 3.5 * idf(n) }));
        (item.heart_notes ?? []).forEach(n => noteWeights.push({ note: n, weight: 2.0 * idf(n) }));
        (item.top_notes ?? []).forEach(n => noteWeights.push({ note: n, weight: 1.0 * idf(n) }));
        noteWeights.sort((a, b) => b.weight - a.weight);
        const searchNotes = noteWeights.slice(0, 4).map(nw => nw.note);

        const allSearchResults: SearchResult[] = [];
        for (const note of searchNotes.length > 0 ? searchNotes : [item.perfume_name]) {
          const results = await searchFragrances(note, 20);
          allSearchResults.push(...results);
        }

        const ownedSet = new Set(collection.map(c => `${c.perfume_name}|${c.perfume_brand}`));
        const sourceKey = `${item.perfume_name}|${item.perfume_brand}`;
        const seen = new Set<string>();
        allUnique = allSearchResults.filter(r => {
          const key = `${r.name}|${r.brand}`;
          if (key === sourceKey || ownedSet.has(key) || seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        altCacheRef.current = { item, results: allUnique };
      }

      const noteFreq2: Record<string, number> = {};
      collection.forEach(c => {
        [...(c.top_notes ?? []), ...(c.heart_notes ?? []), ...(c.base_notes ?? [])].forEach(n => {
          noteFreq2[n] = (noteFreq2[n] || 0) + 1;
        });
      });
      const total2 = collection.length || 1;
      const idf2 = (note: string) => Math.log((total2 + 1) / ((noteFreq2[note] || 0) + 1));
      const noteWeights2: { note: string; weight: number }[] = [];
      (item.base_notes ?? []).forEach(n => noteWeights2.push({ note: n, weight: 3.5 * idf2(n) }));
      (item.heart_notes ?? []).forEach(n => noteWeights2.push({ note: n, weight: 2.0 * idf2(n) }));
      (item.top_notes ?? []).forEach(n => noteWeights2.push({ note: n, weight: 1.0 * idf2(n) }));

      const priceFiltered = allUnique.filter(r => {
        if (!r.price) return false;
        const priceNum = parseFloat(r.price.replace(/[^0-9.]/g, ''));
        if (isNaN(priceNum)) return false;
        return priceNum <= activeBudget;
      });

      const scored = priceFiltered.map(r => {
        let score = 0;
        const matched: string[] = [];
        noteWeights2.forEach(({ note, weight }) => {
          if ((r.baseNotes || []).includes(note)) { score += weight * 4; matched.push(note); }
          else if ((r.heartNotes || []).includes(note)) { score += weight * 2.5; matched.push(note); }
          else if ((r.topNotes || []).includes(note)) { score += weight * 1; matched.push(note); }
        });

        const uniqueMatches = [...new Set(matched)];
        if (uniqueMatches.length >= 3) score *= 1.4;
        else if (uniqueMatches.length >= 2) score *= 1.15;

        return { ...r, score, sharedNotes: [...new Set(matched)] };
      });

      scored.sort((a, b) => b.score - a.score);

      const brandCount: Record<string, number> = {};
      const limited = scored.filter(r => {
        brandCount[r.brand] = (brandCount[r.brand] || 0) + 1;
        return brandCount[r.brand] <= 1;
      });

      const topAlt = limited.slice(0, 8);
      const maxAltScore = topAlt.length > 0 ? Math.max(...topAlt.map(r => r.score)) : 1;
      const altWithPct = topAlt.map(r => ({
        ...r,
        matchPct: Math.min(95, Math.max(5, Math.round((r.score / Math.max(maxAltScore * 1.1, 1)) * 90 + 5))),
      }));

      setAltResults(altWithPct);
    } catch (err) {
      console.log('Find alternatives error:', err);
      Alert.alert('Error', 'Failed to find alternatives.');
    } finally {
      setAltLoading(false);
    }
  }, [collection, budget]);

  const budgetRef = useRef(budget);
  useEffect(() => {
    if (budgetRef.current !== budget && altSource) {
      budgetRef.current = budget;
      void handleFindAlternatives(altSource, budget);
    }
    budgetRef.current = budget;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget]);

  const addToWishlistMutation = useMutation({
    mutationFn: async (item: SearchResult) => {
      if (!user?.id) throw new Error('Not logged in');
      await supabase.from('user_wishlists').insert({
        user_id: user.id,
        perfume_name: item.name,
        perfume_brand: item.brand,
        image_url: item.imageUrl,
        priority: 1,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wishlist', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['recommendations'] });
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

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
          <Text style={[styles.title, { color: colors.text }]}>For You</Text>
          <TouchableOpacity
            style={[styles.quizBtn, { borderColor: colors.border }]}
            onPress={() => setShowQuiz(true)}
          >
            <Sparkle size={14} color={colors.accent} />
            <Text style={[styles.quizBtnText, { color: colors.accent }]}>Take Quiz</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.infoHeader}>
            <Sparkle size={18} color={colors.accent} />
            <Text style={[styles.infoTitle, { color: colors.text }]}>Smart Picks</Text>
          </View>
          <Text style={[styles.infoSub, { color: colors.subtext }]}>
            74K+ fragrances · Matched to your taste profile
          </Text>
        </View>

        {recommendationsQuery.isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : recommendations.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.subtext }]}>
              Add more perfumes to your collection to get personalized recommendations!
            </Text>
          </View>
        ) : (
          recommendations.map((rec, i) => (
            <View key={`${rec.name}-${rec.brand}-${i}`} style={[styles.recCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.recAccent, { backgroundColor: colors.accent }]} />
              <View style={styles.recContent}>
                <View style={styles.recTop}>
                  {rec.imageUrl && (
                    <Image source={{ uri: forceHttps(rec.imageUrl) ?? undefined }} style={styles.recImage} resizeMode="contain" />
                  )}
                  <View style={styles.recInfo}>
                    <Text style={[styles.recName, { color: colors.text }]}>{rec.name}</Text>
                    <Text style={[styles.recBrand, { color: colors.subtext }]}>{rec.brand}</Text>
                    {rec.concentration && (
                      <Text style={[styles.recConc, { color: colors.subtext }]}>
                        {rec.concentration}{rec.year ? ` · ${rec.year}` : ''}
                      </Text>
                    )}
                    {rec.rating && (
                      <View style={styles.ratingRow}>
                        <Star size={12} color="#F5A623" weight="fill" />
                        <Text style={styles.ratingText}>{parseFloat(rec.rating).toFixed(1)}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.recMatch}>
                    <Text style={[styles.recMatchPct, { color: colors.accent }]}>{rec.matchPct}%</Text>
                    <Text style={[styles.recMatchLabel, { color: colors.subtext }]}>match</Text>
                  </View>
                </View>

                {rec.sharedNotes.length > 0 && (
                  <View style={styles.sharedNotesRow}>
                    {rec.sharedNotes.slice(0, 5).map((note: string, j: number) => (
                      <View key={j} style={[styles.sharedNoteChip, { backgroundColor: colors.chip, borderColor: colors.border }]}>
                        <Text style={[styles.sharedNoteText, { color: colors.text }]}>{note}</Text>
                      </View>
                    ))}
                    {rec.sharedNotes.length > 5 && (
                      <View style={[styles.sharedNoteChip, { backgroundColor: colors.chip }]}>
                        <Text style={[styles.sharedNoteText, { color: colors.subtext }]}>+{rec.sharedNotes.length - 5}</Text>
                      </View>
                    )}
                  </View>
                )}

                <View style={styles.recActions}>
                  <TouchableOpacity
                    style={styles.notesToggle}
                    onPress={() => setExpandedIndex(expandedIndex === i ? null : i)}
                  >
                    <Text style={[styles.notesToggleText, { color: colors.subtext }]}>Notes</Text>
                    {expandedIndex === i ? <CaretUp size={14} color={colors.subtext} /> : <CaretDown size={14} color={colors.subtext} />}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.wishlistBtn, { borderColor: colors.border }]}
                    onPress={() => addToWishlistMutation.mutate(rec as any)}
                  >
                    <Heart size={14} color={colors.accent} />
                    <Text style={[styles.wishlistBtnText, { color: colors.accent }]}>Wishlist</Text>
                  </TouchableOpacity>
                </View>

                {expandedIndex === i && (
                  <View style={styles.expandedNotes}>
                    {(rec.topNotes?.length ?? 0) > 0 && (
                      <>
                        <Text style={[styles.noteLabel, { color: colors.accent }]}>Top</Text>
                        <Text style={[styles.noteList, { color: colors.text }]}>{rec.topNotes?.join(', ')}</Text>
                      </>
                    )}
                    {(rec.heartNotes?.length ?? 0) > 0 && (
                      <>
                        <Text style={[styles.noteLabel, { color: '#E91E63' }]}>Heart</Text>
                        <Text style={[styles.noteList, { color: colors.text }]}>{rec.heartNotes?.join(', ')}</Text>
                      </>
                    )}
                    {(rec.baseNotes?.length ?? 0) > 0 && (
                      <>
                        <Text style={[styles.noteLabel, { color: '#9B59B6' }]}>Base</Text>
                        <Text style={[styles.noteList, { color: colors.text }]}>{rec.baseNotes?.join(', ')}</Text>
                      </>
                    )}
                  </View>
                )}
              </View>
            </View>
          ))
        )}

        {!isPro && !profile?.is_pro && recommendations.length >= 5 && (
          <View style={[styles.proGate, { borderColor: colors.accent + '40' }]}>
            <Text style={styles.proGateEmoji}>✨</Text>
            <Text style={[styles.proGateText, { color: colors.accent }]}>
              {12 - 5} more picks hidden
            </Text>
            <Text style={[styles.proGateSub, { color: colors.subtext }]}>
              Upgrade to Pro for unlimited AI recommendations
            </Text>
            <TouchableOpacity
              style={[styles.proGateBtn, { backgroundColor: colors.accent }]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push('/paywall' as any);
              }}
              activeOpacity={0.8}
            >
              <Crown size={16} color="#fff" weight="fill" />
              <Text style={styles.proGateBtnText}>Upgrade to Pro</Text>
            </TouchableOpacity>
          </View>
        )}

        {collection.length > 0 && (
          <View style={styles.similarSection}>
            <Text style={[styles.similarTitle, { color: colors.text }]}>Find Similar To...</Text>
            <View style={[styles.discoveryBadge, { backgroundColor: colors.accent + '15' }]}>
              <Text style={[styles.discoveryText, { color: colors.accent }]}>Discovery</Text>
            </View>
            <Text style={[styles.similarSub, { color: colors.subtext }]}>
              Pick a fragrance you love and we'll find 10 similar ones from 74K+ fragrances.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.similarScroll}>
              {collection.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.similarCard, {
                    backgroundColor: similarSource?.id === item.id ? colors.accent + '15' : colors.card,
                    borderColor: similarSource?.id === item.id ? colors.accent : colors.border,
                  }]}
                  onPress={() => handleFindSimilar(item)}
                >
                  {item.image_url && (
                    <Image source={{ uri: forceHttps(item.image_url) ?? undefined }} style={styles.similarImage} resizeMode="contain" />
                  )}
                  <Text style={[styles.similarName, { color: colors.text }]} numberOfLines={1}>{item.perfume_name}</Text>
                  <Text style={[styles.similarBrand, { color: colors.subtext }]} numberOfLines={1}>{item.perfume_brand}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {similarSource && (
              <View style={styles.similarResultsSection}>
                <View style={styles.similarResultsHeader}>
                  <Text style={[styles.similarResultsTitle, { color: colors.text }]}>
                    Similar to {similarSource.perfume_name}
                  </Text>
                  <TouchableOpacity onPress={() => { setSimilarSource(null); setSimilarResults([]); }}>
                    <X size={20} color={colors.subtext} />
                  </TouchableOpacity>
                </View>

                {similarLoading ? (
                  <View style={styles.similarLoadingContainer}>
                    <ActivityIndicator color={colors.accent} size="small" />
                    <Text style={[styles.similarLoadingText, { color: colors.subtext }]}>Searching 74K+ fragrances...</Text>
                  </View>
                ) : similarResults.length === 0 ? (
                  <View style={[styles.similarEmptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.emptyText, { color: colors.subtext }]}>No similar fragrances found. Try another one!</Text>
                  </View>
                ) : (
                  similarResults.map((res, idx) => (
                    <View key={`${res.name}-${res.brand}-${idx}`} style={[styles.recCard, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 0 }]}>
                      <View style={[styles.recAccent, { backgroundColor: colors.accent }]} />
                      <View style={styles.recContent}>
                        <View style={styles.recTop}>
                          {res.imageUrl && (
                            <Image source={{ uri: forceHttps(res.imageUrl) ?? undefined }} style={styles.recImage} resizeMode="contain" />
                          )}
                          <View style={styles.recInfo}>
                            <Text style={[styles.recName, { color: colors.text }]}>{res.name}</Text>
                            <Text style={[styles.recBrand, { color: colors.subtext }]}>{res.brand}</Text>
                            {res.concentration && (
                              <Text style={[styles.recConc, { color: colors.subtext }]}>
                                {res.concentration}{res.year ? ` · ${res.year}` : ''}
                              </Text>
                            )}
                            {res.rating && (
                              <View style={styles.ratingRow}>
                                <Star size={12} color="#F5A623" weight="fill" />
                                <Text style={styles.ratingText}>{parseFloat(res.rating).toFixed(1)}</Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.recMatch}>
                            <Text style={[styles.recMatchPct, { color: colors.accent }]}>{res.matchPct}%</Text>
                            <Text style={[styles.recMatchLabel, { color: colors.subtext }]}>similar</Text>
                          </View>
                        </View>

                        {res.sharedNotes.length > 0 && (
                          <View style={styles.sharedNotesRow}>
                            {res.sharedNotes.slice(0, 5).map((note: string, j: number) => (
                              <View key={j} style={[styles.sharedNoteChip, { backgroundColor: colors.accent + '12', borderColor: colors.accent + '30' }]}>
                                <Text style={[styles.sharedNoteText, { color: colors.accent }]}>{note}</Text>
                              </View>
                            ))}
                            {res.sharedNotes.length > 5 && (
                              <View style={[styles.sharedNoteChip, { backgroundColor: colors.chip }]}>
                                <Text style={[styles.sharedNoteText, { color: colors.subtext }]}>+{res.sharedNotes.length - 5}</Text>
                              </View>
                            )}
                          </View>
                        )}

                        <View style={styles.recActions}>
                          <TouchableOpacity
                            style={styles.notesToggle}
                            onPress={() => setSimilarExpandedIndex(similarExpandedIndex === idx ? null : idx)}
                          >
                            <Text style={[styles.notesToggleText, { color: colors.subtext }]}>Notes</Text>
                            {similarExpandedIndex === idx ? <CaretUp size={14} color={colors.subtext} /> : <CaretDown size={14} color={colors.subtext} />}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.wishlistBtn, { borderColor: colors.border }]}
                            onPress={() => addToWishlistMutation.mutate(res as any)}
                          >
                            <Heart size={14} color={colors.accent} />
                            <Text style={[styles.wishlistBtnText, { color: colors.accent }]}>Wishlist</Text>
                          </TouchableOpacity>
                        </View>

                        {similarExpandedIndex === idx && (
                          <View style={styles.expandedNotes}>
                            {(res.topNotes?.length ?? 0) > 0 && (
                              <>
                                <Text style={[styles.noteLabel, { color: colors.accent }]}>Top</Text>
                                <Text style={[styles.noteList, { color: colors.text }]}>{res.topNotes?.join(', ')}</Text>
                              </>
                            )}
                            {(res.heartNotes?.length ?? 0) > 0 && (
                              <>
                                <Text style={[styles.noteLabel, { color: '#E91E63' }]}>Heart</Text>
                                <Text style={[styles.noteList, { color: colors.text }]}>{res.heartNotes?.join(', ')}</Text>
                              </>
                            )}
                            {(res.baseNotes?.length ?? 0) > 0 && (
                              <>
                                <Text style={[styles.noteLabel, { color: '#9B59B6' }]}>Base</Text>
                                <Text style={[styles.noteList, { color: colors.text }]}>{res.baseNotes?.join(', ')}</Text>
                              </>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        )}

        {collection.length > 0 && (
          <View style={styles.similarSection}>
            <Text style={[styles.similarTitle, { color: colors.text }]}>Find Alternatives by Price</Text>
            <View style={[styles.discoveryBadge, { backgroundColor: '#4CAF50' + '15' }]}>
              <Text style={[styles.discoveryText, { color: '#4CAF50' }]}>Budget</Text>
            </View>
            <Text style={[styles.similarSub, { color: colors.subtext }]}>
              Pick a fragrance and find alternatives within your budget.
            </Text>

            <View style={styles.budgetRow}>
              {[50, 100, 150, 250, 500].map(b => (
                <TouchableOpacity
                  key={b}
                  style={[styles.budgetChip, {
                    backgroundColor: budget === b ? '#4CAF50' : colors.chip,
                    borderColor: budget === b ? '#4CAF50' : colors.border,
                  }]}
                  onPress={() => setBudget(b)}
                >
                  <Text style={[styles.budgetChipText, { color: budget === b ? '#fff' : colors.text }]}>${b}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.similarScroll}>
              {collection.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.similarCard, {
                    backgroundColor: altSource?.id === item.id ? '#4CAF50' + '15' : colors.card,
                    borderColor: altSource?.id === item.id ? '#4CAF50' : colors.border,
                  }]}
                  onPress={() => handleFindAlternatives(item)}
                >
                  {item.image_url && (
                    <Image source={{ uri: forceHttps(item.image_url) ?? undefined }} style={styles.similarImage} resizeMode="contain" />
                  )}
                  <Text style={[styles.similarName, { color: colors.text }]} numberOfLines={1}>{item.perfume_name}</Text>
                  <Text style={[styles.similarBrand, { color: colors.subtext }]} numberOfLines={1}>{item.perfume_brand}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {altSource && (
              <View style={styles.similarResultsSection}>
                <View style={styles.similarResultsHeader}>
                  <Text style={[styles.similarResultsTitle, { color: colors.text }]}>
                    Alternatives for {altSource.perfume_name} (under ${budget})
                  </Text>
                  <TouchableOpacity onPress={() => { setAltSource(null); setAltResults([]); }}>
                    <X size={20} color={colors.subtext} />
                  </TouchableOpacity>
                </View>

                {altLoading ? (
                  <View style={styles.similarLoadingContainer}>
                    <ActivityIndicator color="#4CAF50" size="small" />
                    <Text style={[styles.similarLoadingText, { color: colors.subtext }]}>Searching 74K+ fragrances...</Text>
                  </View>
                ) : altResults.length === 0 ? (
                  <View style={[styles.similarEmptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.emptyText, { color: colors.subtext }]}>No alternatives found within budget. Try a higher amount!</Text>
                  </View>
                ) : (
                  altResults.map((res, idx) => (
                    <View key={`alt-${res.name}-${res.brand}-${idx}`} style={[styles.recCard, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 0 }]}>
                      <View style={[styles.recAccent, { backgroundColor: '#4CAF50' }]} />
                      <View style={styles.recContent}>
                        <View style={styles.recTop}>
                          {res.imageUrl && (
                            <Image source={{ uri: forceHttps(res.imageUrl) ?? undefined }} style={styles.recImage} resizeMode="contain" />
                          )}
                          <View style={styles.recInfo}>
                            <Text style={[styles.recName, { color: colors.text }]}>{res.name}</Text>
                            <Text style={[styles.recBrand, { color: colors.subtext }]}>{res.brand}</Text>
                            {res.concentration && (
                              <Text style={[styles.recConc, { color: colors.subtext }]}>
                                {res.concentration}{res.year ? ` · ${res.year}` : ''}
                              </Text>
                            )}
                            {res.price && (
                              <Text style={[styles.recConc, { color: '#4CAF50', fontWeight: '600' as const }]}>{/^[\d.]/.test(res.price) ? `${res.price}` : res.price}</Text>
                            )}
                            {res.rating && (
                              <View style={styles.ratingRow}>
                                <Star size={12} color="#F5A623" weight="fill" />
                                <Text style={styles.ratingText}>{parseFloat(res.rating).toFixed(1)}</Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.recMatch}>
                            <Text style={[styles.recMatchPct, { color: '#4CAF50' }]}>{res.matchPct}%</Text>
                            <Text style={[styles.recMatchLabel, { color: colors.subtext }]}>match</Text>
                          </View>
                        </View>

                        {res.sharedNotes.length > 0 && (
                          <View style={styles.sharedNotesRow}>
                            {res.sharedNotes.slice(0, 5).map((note: string, j: number) => (
                              <View key={j} style={[styles.sharedNoteChip, { backgroundColor: '#4CAF50' + '12', borderColor: '#4CAF50' + '30' }]}>
                                <Text style={[styles.sharedNoteText, { color: '#4CAF50' }]}>{note}</Text>
                              </View>
                            ))}
                          </View>
                        )}

                        <View style={styles.recActions}>
                          <TouchableOpacity
                            style={styles.notesToggle}
                            onPress={() => setAltExpandedIndex(altExpandedIndex === idx ? null : idx)}
                          >
                            <Text style={[styles.notesToggleText, { color: colors.subtext }]}>Notes</Text>
                            {altExpandedIndex === idx ? <CaretUp size={14} color={colors.subtext} /> : <CaretDown size={14} color={colors.subtext} />}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.wishlistBtn, { borderColor: colors.border }]}
                            onPress={() => addToWishlistMutation.mutate(res as any)}
                          >
                            <Heart size={14} color="#4CAF50" />
                            <Text style={[styles.wishlistBtnText, { color: '#4CAF50' }]}>Wishlist</Text>
                          </TouchableOpacity>
                        </View>

                        {altExpandedIndex === idx && (
                          <View style={styles.expandedNotes}>
                            {(res.topNotes?.length ?? 0) > 0 && (
                              <>
                                <Text style={[styles.noteLabel, { color: colors.accent }]}>Top</Text>
                                <Text style={[styles.noteList, { color: colors.text }]}>{res.topNotes?.join(', ')}</Text>
                              </>
                            )}
                            {(res.heartNotes?.length ?? 0) > 0 && (
                              <>
                                <Text style={[styles.noteLabel, { color: '#E91E63' }]}>Heart</Text>
                                <Text style={[styles.noteList, { color: colors.text }]}>{res.heartNotes?.join(', ')}</Text>
                              </>
                            )}
                            {(res.baseNotes?.length ?? 0) > 0 && (
                              <>
                                <Text style={[styles.noteLabel, { color: '#9B59B6' }]}>Base</Text>
                                <Text style={[styles.noteList, { color: colors.text }]}>{res.baseNotes?.join(', ')}</Text>
                              </>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={showQuiz} animationType="slide" presentationStyle="pageSheet">
        <QuizModal onClose={() => setShowQuiz(false)} />
      </Modal>
    </View>
  );
}

function QuizModal({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<string[][]>([[], [], [], []]);

  const steps = [
    {
      title: 'Which scent families appeal to you?',
      subtitle: "Pick all that you're drawn to",
      options: [
        { emoji: '🍋', label: 'Fresh & Citrus', sub: 'Clean, bright, zesty' },
        { emoji: '🌹', label: 'Floral', sub: 'Romantic, feminine, blooming' },
        { emoji: '🌲', label: 'Woody & Earthy', sub: 'Deep, grounded, natural' },
        { emoji: '🕌', label: 'Warm & Oriental', sub: 'Rich, exotic, sensual' },
        { emoji: '🌶️', label: 'Spicy', sub: 'Bold, warming, intense' },
        { emoji: '🍫', label: 'Gourmand', sub: 'Sweet, edible, indulgent' },
        { emoji: '🪵', label: 'Oud & Leather', sub: 'Smoky, animalic, luxurious' },
        { emoji: '🌊', label: 'Aquatic & Green', sub: 'Cool, fresh, outdoorsy' },
      ],
    },
    {
      title: 'What notes do you love?',
      subtitle: 'Pick your favorites',
      options: [
        { emoji: '🫐', label: 'Vanilla' }, { emoji: '🌹', label: 'Rose' },
        { emoji: '🍊', label: 'Bergamot' }, { emoji: '🪵', label: 'Sandalwood' },
        { emoji: '🌿', label: 'Vetiver' }, { emoji: '🍯', label: 'Amber' },
        { emoji: '🌸', label: 'Jasmine' }, { emoji: '🔥', label: 'Oud' },
      ],
    },
    {
      title: 'When do you usually wear fragrance?',
      subtitle: 'Select your main occasions',
      options: [
        { emoji: '💼', label: 'Office' }, { emoji: '🌙', label: 'Date Night' },
        { emoji: '☀️', label: 'Everyday' }, { emoji: '🎉', label: 'Special Events' },
        { emoji: '🏖️', label: 'Summer Days' }, { emoji: '❄️', label: 'Winter Nights' },
      ],
    },
    {
      title: 'What matters most to you?',
      subtitle: 'Choose your priorities',
      options: [
        { emoji: '⏳', label: 'Long lasting' }, { emoji: '💨', label: 'Strong projection' },
        { emoji: '🤫', label: 'Subtle & intimate' }, { emoji: '💎', label: 'Unique & niche' },
        { emoji: '💰', label: 'Great value' }, { emoji: '🎯', label: 'Versatile' },
      ],
    },
  ];

  const toggleSelection = (label: string) => {
    setSelections(prev => {
      const current = [...prev];
      const stepSel = [...current[step]];
      if (stepSel.includes(label)) {
        current[step] = stepSel.filter(s => s !== label);
      } else {
        current[step] = [...stepSel, label];
      }
      return current;
    });
  };

  return (
    <View style={[styles.quizContainer, { backgroundColor: colors.background }]}>
      <View style={[styles.quizHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.quizTitle, { color: colors.text }]}>Scent Quiz</Text>
        <TouchableOpacity onPress={onClose}>
          <X size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.progressBar, { backgroundColor: colors.chip }]}>
        <View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${((step + 1) / steps.length) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.quizContent}>
        <Text style={[styles.stepLabel, { color: colors.accent }]}>Step {step + 1} of {steps.length}</Text>
        <Text style={[styles.quizQuestion, { color: colors.text }]}>{steps[step].title}</Text>
        <Text style={[styles.quizSubtitle, { color: colors.subtext }]}>{steps[step].subtitle}</Text>

        <View style={styles.quizOptions}>
          {steps[step].options.map(opt => {
            const selected = selections[step].includes(opt.label);
            return (
              <TouchableOpacity
                key={opt.label}
                style={[styles.quizOption, {
                  backgroundColor: selected ? colors.accent + '15' : colors.card,
                  borderColor: selected ? colors.accent : colors.border,
                }]}
                onPress={() => toggleSelection(opt.label)}
              >
                <Text style={styles.quizOptionEmoji}>{opt.emoji}</Text>
                <Text style={[styles.quizOptionLabel, { color: colors.text }]}>{opt.label}</Text>
                {'sub' in opt && opt.sub && (
                  <Text style={[styles.quizOptionSub, { color: colors.subtext }]}>{opt.sub}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.quizFooter, { borderTopColor: colors.border }]}>
        {step > 0 && (
          <TouchableOpacity style={[styles.quizBackBtn, { borderColor: colors.border }]} onPress={() => setStep(step - 1)}>
            <Text style={[styles.quizBackText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.quizNextBtn, { backgroundColor: colors.accent, flex: step === 0 ? 1 : undefined }]}
          onPress={() => {
            if (step < steps.length - 1) {
              setStep(step + 1);
            } else {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onClose();
            }
          }}
        >
          <Text style={styles.quizNextText}>{step === steps.length - 1 ? 'Finish' : 'Next'}</Text>
        </TouchableOpacity>
      </View>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16, gap: 8 },
  backBtn: { padding: 4 },
  title: { fontSize: 24, fontWeight: '700' as const, flex: 1 },
  quizBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  quizBtnText: { fontSize: 13, fontWeight: '600' as const },
  infoCard: { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  infoTitle: { fontSize: 16, fontWeight: '700' as const },
  infoSub: { fontSize: 13, lineHeight: 18 },
  emptyCard: { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center' },
  emptyText: { textAlign: 'center', fontSize: 15, lineHeight: 22 },
  recCard: { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, marginBottom: 12, overflow: 'hidden', flexDirection: 'row' },
  recAccent: { width: 4 },
  recContent: { flex: 1, padding: 16 },
  recTop: { flexDirection: 'row', gap: 12 },
  recImage: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#f5f5f5' },
  recInfo: { flex: 1 },
  recName: { fontSize: 16, fontWeight: '700' as const },
  recBrand: { fontSize: 13, marginTop: 2 },
  recConc: { fontSize: 12, marginTop: 4 },
  recMatch: { alignItems: 'flex-end' },
  recMatchPct: { fontSize: 22, fontWeight: '700' as const },
  recMatchLabel: { fontSize: 11 },
  sharedNotesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  sharedNoteChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  sharedNoteText: { fontSize: 12 },
  recActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: '#eee' },
  notesToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  notesToggleText: { fontSize: 13 },
  wishlistBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  wishlistBtnText: { fontSize: 13, fontWeight: '600' as const },
  expandedNotes: { marginTop: 10 },
  noteLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.5, marginTop: 6 },
  noteList: { fontSize: 13, lineHeight: 20 },
  proGate: { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', padding: 24, alignItems: 'center', marginBottom: 24 },
  proGateEmoji: { fontSize: 28, marginBottom: 8 },
  proGateText: { fontSize: 16, fontWeight: '700' as const },
  proGateSub: { fontSize: 13, marginTop: 4, textAlign: 'center', marginBottom: 14 },
  proGateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
  proGateBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' as const },
  similarSection: { paddingHorizontal: 20, marginTop: 8 },
  similarTitle: { fontSize: 20, fontWeight: '700' as const },
  discoveryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginTop: 4 },
  discoveryText: { fontSize: 12, fontWeight: '600' as const },
  similarSub: { fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 12 },
  similarScroll: { gap: 12, paddingBottom: 10 },
  similarCard: { width: 120, borderRadius: 14, borderWidth: 1, padding: 10, alignItems: 'center' },
  similarImage: { width: 60, height: 60, borderRadius: 8, marginBottom: 8 },
  similarName: { fontSize: 12, fontWeight: '600' as const, textAlign: 'center' },
  similarBrand: { fontSize: 11, textAlign: 'center', marginTop: 2 },
  similarResultsSection: { marginTop: 20 },
  similarResultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  similarResultsTitle: { fontSize: 17, fontWeight: '700' as const, flex: 1 },
  similarLoadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 30 },
  similarLoadingText: { fontSize: 14 },
  similarEmptyCard: { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center' },
  budgetRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  budgetChip: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  budgetChipText: { fontSize: 14, fontWeight: '600' as const },
  ratingRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 4 },
  ratingText: { fontSize: 12, fontWeight: '600' as const, color: '#F5A623' },
  quizContainer: { flex: 1 },
  quizHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  quizTitle: { fontSize: 20, fontWeight: '700' as const },
  progressBar: { height: 4, marginHorizontal: 20, borderRadius: 2, marginTop: 16 },
  progressFill: { height: '100%', borderRadius: 2 },
  quizContent: { padding: 20, paddingBottom: 40 },
  stepLabel: { fontSize: 13, fontWeight: '600' as const, marginBottom: 8 },
  quizQuestion: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  quizSubtitle: { fontSize: 15, marginTop: 6, marginBottom: 20 },
  quizOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quizOption: { width: '48%', borderRadius: 16, borderWidth: 1, padding: 16 },
  quizOptionEmoji: { fontSize: 28, marginBottom: 8 },
  quizOptionLabel: { fontSize: 15, fontWeight: '700' as const },
  quizOptionSub: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  quizFooter: { flexDirection: 'row', padding: 20, gap: 12, borderTopWidth: 1 },
  quizBackBtn: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  quizBackText: { fontSize: 16, fontWeight: '600' as const },
  quizNextBtn: { flex: 1, padding: 14, borderRadius: 14, alignItems: 'center' },
  quizNextText: { color: '#fff', fontSize: 16, fontWeight: '700' as const },
});

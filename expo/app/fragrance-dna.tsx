import React, { useMemo, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  Share as RNShare,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { CaretLeft, DownloadSimple, ShareNetwork, Sparkle } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { CollectionItem, WearDiaryEntry, SCENT_FAMILIES } from '@/lib/types';

type ActionState = 'idle' | 'saving' | 'sharing';

export default function FragranceDNAScreen() {
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cardRef = useRef<View>(null);
  const [actionState, setActionState] = useState<ActionState>('idle');

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

  const items = useMemo(() => collectionQuery.data ?? [], [collectionQuery.data]);
  const wearEntries = useMemo(() => wearsQuery.data ?? [], [wearsQuery.data]);

  const topNotes = useMemo(() => {
    const noteCounts: Record<string, number> = {};
    items.forEach(c => {
      [...(c.top_notes ?? []), ...(c.heart_notes ?? []), ...(c.base_notes ?? [])].forEach(n => {
        noteCounts[n] = (noteCounts[n] || 0) + 1;
      });
    });
    return Object.entries(noteCounts).sort(([, a], [, b]) => b - a).slice(0, 8);
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
      .filter(f => f.count > 0)
      .sort((a, b) => b.count - a.count);

    const top3 = sorted.slice(0, 3);
    let tagline = 'Your scent story starts here';
    if (top3.length >= 3) {
      tagline = `${top3[0].name} soul · ${top3[1].name} heart · ${top3[2].name} echo`;
    } else if (top3.length === 2) {
      tagline = `${top3[0].name} soul · ${top3[1].name} heart`;
    } else if (top3.length === 1) {
      tagline = `A pure ${top3[0].name} signature`;
    }

    return { families: sorted, tagline, top: top3[0] };
  }, [items]);

  const mostWorn = useMemo(() => {
    const counts: Record<string, { name: string; brand: string; count: number }> = {};
    wearEntries.forEach(w => {
      const key = `${w.perfume_name}|${w.perfume_brand}`;
      if (!counts[key]) counts[key] = { name: w.perfume_name, brand: w.perfume_brand, count: 0 };
      counts[key].count++;
    });
    const sorted = Object.values(counts).sort((a, b) => b.count - a.count);
    if (sorted[0]) return sorted[0];
    const fav = items.find(c => c.is_favorite);
    if (fav) return { name: fav.perfume_name, brand: fav.perfume_brand, count: 0 };
    const first = items[0];
    return first ? { name: first.perfume_name, brand: first.perfume_brand, count: 0 } : null;
  }, [wearEntries, items]);

  const topBrand = useMemo(() => {
    const brandCounts: Record<string, number> = {};
    items.forEach(c => {
      brandCounts[c.perfume_brand] = (brandCounts[c.perfume_brand] || 0) + 1;
    });
    const sorted = Object.entries(brandCounts).sort(([, a], [, b]) => b - a);
    return sorted[0]?.[0] ?? '—';
  }, [items]);

  const mood = useMemo(() => {
    const top = olfactoryProfile.top;
    if (!top) return 'Mysterious';
    const moods: Record<string, string> = {
      Citrus: 'Radiant',
      Floral: 'Romantic',
      Woody: 'Grounded',
      Oriental: 'Magnetic',
      Fresh: 'Effortless',
      Spicy: 'Bold',
      Gourmand: 'Indulgent',
      Leather: 'Rebellious',
    };
    return moods[top.name] ?? 'Distinctive';
  }, [olfactoryProfile]);

  const handleCapture = useCallback(async (): Promise<string | null> => {
    if (!cardRef.current) return null;
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
      });
      return uri;
    } catch (e) {
      console.log('capture failed', e);
      return null;
    }
  }, []);

  const handleDownload = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionState('saving');
    try {
      const uri = await handleCapture();
      if (!uri) {
        Alert.alert('Oops', 'Could not capture your DNA card. Try again.');
        return;
      }

      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = uri;
        a.download = `fragrance-dna-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to save your DNA card.');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved!', 'Your Fragrance DNA was saved to your photo library.');
    } catch (e) {
      console.log('download failed', e);
      Alert.alert('Error', 'Could not save the card. Try again.');
    } finally {
      setActionState('idle');
    }
  }, [handleCapture]);

  const handleShare = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionState('sharing');
    try {
      const uri = await handleCapture();
      if (!uri) {
        Alert.alert('Oops', 'Could not capture your DNA card. Try again.');
        return;
      }

      const message = `My Fragrance DNA — ${olfactoryProfile.tagline}. Build yours on ScentBuddy → scentbuddy.io`;

      if (Platform.OS === 'web') {
        await RNShare.share({ message });
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share your Fragrance DNA',
          UTI: 'public.png',
        });
      } else {
        await RNShare.share({ url: uri, message });
      }
    } catch (e) {
      console.log('share failed', e);
    } finally {
      setActionState('idle');
    }
  }, [handleCapture, olfactoryProfile.tagline]);

  if (collectionQuery.isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#c49a6c" style={{ marginTop: 80 }} />
      </View>
    );
  }

  const displayName =
    profile?.display_name || profile?.username || user?.email?.split('@')[0] || 'You';
  const year = new Date().getFullYear();
  const totalFamilies = olfactoryProfile.families.reduce((s, f) => s + f.count, 0) || 1;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} testID="back-btn">
          <CaretLeft size={22} color="#f0ebe5" weight="bold" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fragrance DNA</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 140, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <View collapsable={false} ref={cardRef} style={styles.cardWrapper}>
          <LinearGradient
            colors={['#1a120a', '#0d0905', '#1c1008']}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['#c49a6c33', 'transparent']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.9, y: 0.6 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.orbTopRight} />
          <View style={styles.orbBottomLeft} />

          <View style={styles.cardInner}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <Sparkle size={12} color="#0d0905" weight="fill" />
              </View>
              <Text style={styles.brandText}>SCENTBUDDY</Text>
              <View style={styles.brandDivider} />
              <Text style={styles.brandYear}>{year}</Text>
            </View>

            <Text style={styles.nameText}>{displayName}</Text>
            <Text style={styles.heroTitle}>FRAGRANCE</Text>
            <Text style={styles.heroTitleAccent}>DNA</Text>

            <View style={styles.taglinePill}>
              <Text style={styles.taglineText}>{olfactoryProfile.tagline}</Text>
            </View>

            {olfactoryProfile.families.length > 0 && (
              <View style={styles.spectrumSection}>
                <Text style={styles.sectionLabel}>OLFACTORY SPECTRUM</Text>
                <View style={styles.spectrumBar}>
                  {olfactoryProfile.families.map((f, idx) => {
                    const width = `${(f.count / totalFamilies) * 100}%` as const;
                    return (
                      <View
                        key={f.name}
                        style={{
                          width,
                          height: '100%',
                          backgroundColor: f.color,
                          borderTopLeftRadius: idx === 0 ? 10 : 0,
                          borderBottomLeftRadius: idx === 0 ? 10 : 0,
                          borderTopRightRadius: idx === olfactoryProfile.families.length - 1 ? 10 : 0,
                          borderBottomRightRadius: idx === olfactoryProfile.families.length - 1 ? 10 : 0,
                        }}
                      />
                    );
                  })}
                </View>
                <View style={styles.spectrumLegend}>
                  {olfactoryProfile.families.slice(0, 4).map(f => (
                    <View key={f.name} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: f.color }]} />
                      <Text style={styles.legendText}>
                        {f.name} <Text style={styles.legendPct}>{f.percentage}%</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {mostWorn && (
              <View style={styles.signatureCard}>
                <LinearGradient
                  colors={['#c49a6c22', '#c49a6c08']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.signatureLabel}>SIGNATURE SCENT</Text>
                <Text style={styles.signatureName} numberOfLines={2}>
                  {mostWorn.name}
                </Text>
                <Text style={styles.signatureBrand}>{mostWorn.brand}</Text>
              </View>
            )}

            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{items.length}</Text>
                <Text style={styles.statLabel}>BOTTLES</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{wearEntries.length}</Text>
                <Text style={styles.statLabel}>WEARS</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBlock}>
                <Text style={styles.statValue} numberOfLines={1}>{mood}</Text>
                <Text style={styles.statLabel}>MOOD</Text>
              </View>
            </View>

            {topNotes.length > 0 && (
              <View style={styles.notesSection}>
                <Text style={styles.sectionLabel}>NOTE PALETTE</Text>
                <View style={styles.notesGrid}>
                  {topNotes.map(([note, count], idx) => (
                    <View
                      key={note}
                      style={[
                        styles.noteChip,
                        idx === 0 && styles.noteChipHero,
                      ]}
                    >
                      <Text
                        style={[
                          styles.noteChipText,
                          idx === 0 && styles.noteChipTextHero,
                        ]}
                      >
                        {note}
                      </Text>
                      <Text
                        style={[
                          styles.noteChipCount,
                          idx === 0 && styles.noteChipCountHero,
                        ]}
                      >
                        ×{count}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.bottomMetaRow}>
              <View style={styles.metaBlock}>
                <Text style={styles.metaLabel}>HOUSE OF CHOICE</Text>
                <Text style={styles.metaValue} numberOfLines={1}>{topBrand}</Text>
              </View>
              <View style={styles.metaBlock}>
                <Text style={styles.metaLabel}>FAMILY</Text>
                <Text style={[styles.metaValue, { color: olfactoryProfile.top?.color ?? '#c49a6c' }]} numberOfLines={1}>
                  {olfactoryProfile.top?.name ?? '—'}
                </Text>
              </View>
            </View>

            <View style={styles.footer}>
              <View style={styles.footerDivider} />
              <View style={styles.footerRow}>
                <Text style={styles.footerBrand}>SCENTBUDDY</Text>
                <Text style={styles.footerCta}>Build yours →</Text>
              </View>
            </View>
          </View>
        </View>

        {items.length === 0 && (
          <View style={styles.emptyHint}>
            <Text style={styles.emptyHintText}>
              Add fragrances to your collection to unlock your personalized DNA card.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 14 }]}>
        <LinearGradient
          colors={['#0d0b0800', '#0d0b08ee', '#0d0b08']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnGhost]}
          onPress={handleDownload}
          disabled={actionState !== 'idle' || items.length === 0}
          activeOpacity={0.85}
          testID="download-dna"
        >
          {actionState === 'saving' ? (
            <ActivityIndicator color="#c49a6c" size="small" />
          ) : (
            <>
              <DownloadSimple size={18} color="#c49a6c" weight="bold" />
              <Text style={styles.actionBtnGhostText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnPrimary]}
          onPress={handleShare}
          disabled={actionState !== 'idle' || items.length === 0}
          activeOpacity={0.85}
          testID="share-dna"
        >
          {actionState === 'sharing' ? (
            <ActivityIndicator color="#0d0905" size="small" />
          ) : (
            <>
              <ShareNetwork size={18} color="#0d0905" weight="bold" />
              <Text style={styles.actionBtnPrimaryText}>Share your DNA</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0b08' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1510',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#f0ebe5',
    fontSize: 17,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  cardWrapper: {
    marginHorizontal: 16,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#c49a6c33',
    shadowColor: '#c49a6c',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 10,
  },
  cardInner: { padding: 24, paddingTop: 28 },
  orbTopRight: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#c49a6c',
    opacity: 0.08,
  },
  orbBottomLeft: {
    position: 'absolute',
    bottom: -100,
    left: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#8b5030',
    opacity: 0.1,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#c49a6c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    color: '#c49a6c',
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 2,
  },
  brandDivider: { width: 1, height: 10, backgroundColor: '#c49a6c55' },
  brandYear: { color: '#8b7a68', fontSize: 11, fontWeight: '700' as const, letterSpacing: 1 },
  nameText: {
    color: '#c49a6c',
    fontSize: 13,
    fontWeight: '600' as const,
    marginTop: 18,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#f0ebe5',
    fontSize: 44,
    fontWeight: '900' as const,
    letterSpacing: -1,
    marginTop: 4,
    lineHeight: 46,
  },
  heroTitleAccent: {
    color: '#c49a6c',
    fontSize: 44,
    fontWeight: '900' as const,
    letterSpacing: -1,
    lineHeight: 46,
    fontStyle: 'italic',
  },
  taglinePill: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: '#c49a6c15',
    borderWidth: 1,
    borderColor: '#c49a6c40',
  },
  taglineText: {
    color: '#e8d8c0',
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.3,
  },
  sectionLabel: {
    color: '#8b7a68',
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 2,
    marginBottom: 10,
  },
  spectrumSection: { marginTop: 26 },
  spectrumBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1a1510',
  },
  spectrumLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: {
    color: '#d8c8b0',
    fontSize: 11,
    fontWeight: '600' as const,
  },
  legendPct: { color: '#8b7a68', fontWeight: '700' as const },
  signatureCard: {
    marginTop: 22,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#c49a6c30',
    overflow: 'hidden',
    backgroundColor: '#14100a',
  },
  signatureLabel: {
    color: '#c49a6c',
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 2,
  },
  signatureName: {
    color: '#f0ebe5',
    fontSize: 22,
    fontWeight: '800' as const,
    marginTop: 6,
    letterSpacing: -0.3,
  },
  signatureBrand: {
    color: '#8b7a68',
    fontSize: 13,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 22,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#c49a6c22',
  },
  statBlock: { flex: 1, alignItems: 'center' },
  statValue: {
    color: '#f0ebe5',
    fontSize: 22,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  statLabel: {
    color: '#8b7a68',
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
    marginTop: 4,
  },
  statDivider: { width: 1, backgroundColor: '#c49a6c22' },
  notesSection: { marginTop: 22 },
  notesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  noteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: '#1a1510',
    borderWidth: 1,
    borderColor: '#2a2318',
  },
  noteChipHero: {
    backgroundColor: '#c49a6c',
    borderColor: '#c49a6c',
  },
  noteChipText: {
    color: '#e8d8c0',
    fontSize: 12,
    fontWeight: '600' as const,
    textTransform: 'capitalize',
  },
  noteChipTextHero: { color: '#0d0905', fontWeight: '800' as const },
  noteChipCount: {
    color: '#8b7a68',
    fontSize: 11,
    fontWeight: '700' as const,
  },
  noteChipCountHero: { color: '#0d0905' },
  bottomMetaRow: { flexDirection: 'row', marginTop: 20, gap: 12 },
  metaBlock: { flex: 1 },
  metaLabel: {
    color: '#8b7a68',
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
  },
  metaValue: {
    color: '#f0ebe5',
    fontSize: 15,
    fontWeight: '700' as const,
    marginTop: 4,
  },
  footer: { marginTop: 26 },
  footerDivider: { height: 1, backgroundColor: '#c49a6c22', marginBottom: 16 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerBrand: {
    color: '#c49a6c',
    fontSize: 13,
    fontWeight: '800' as const,
    letterSpacing: 2.5,
  },
  footerUrl: {
    color: '#8b7a68',
    fontSize: 11,
    fontWeight: '600' as const,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  footerCta: {
    color: '#f0ebe5',
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  emptyHint: {
    marginHorizontal: 24,
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#1a1510',
    borderWidth: 1,
    borderColor: '#2a2318',
  },
  emptyHintText: {
    color: '#8b7a68',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
  },
  actionBtnGhost: {
    paddingHorizontal: 20,
    backgroundColor: '#1a1510',
    borderWidth: 1,
    borderColor: '#c49a6c40',
  },
  actionBtnGhostText: {
    color: '#c49a6c',
    fontSize: 15,
    fontWeight: '700' as const,
  },
  actionBtnPrimary: {
    flex: 1,
    backgroundColor: '#c49a6c',
    shadowColor: '#c49a6c',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  actionBtnPrimaryText: {
    color: '#0d0905',
    fontSize: 15,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
});

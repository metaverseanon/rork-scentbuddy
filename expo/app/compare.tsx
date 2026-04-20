import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { CaretLeft, ArrowsLeftRight, X, CaretDown, Star, Drop, Heart, Stack } from 'phosphor-react-native';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase, forceHttps } from '@/lib/supabase';
import { CollectionItem } from '@/lib/types';

export default function CompareScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [leftItem, setLeftItem] = useState<CollectionItem | null>(null);
  const [rightItem, setRightItem] = useState<CollectionItem | null>(null);
  const [showPicker, setShowPicker] = useState<'left' | 'right' | null>(null);

  const collectionQuery = useQuery({
    queryKey: ['collection', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', user.id)
        .order('perfume_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CollectionItem[];
    },
    enabled: !!user?.id,
  });

  const collection = collectionQuery.data ?? [];

  const comparison = useMemo(() => {
    if (!leftItem || !rightItem) return null;

    const leftNotes = new Set([
      ...(leftItem.top_notes ?? []),
      ...(leftItem.heart_notes ?? []),
      ...(leftItem.base_notes ?? []),
    ]);
    const rightNotes = new Set([
      ...(rightItem.top_notes ?? []),
      ...(rightItem.heart_notes ?? []),
      ...(rightItem.base_notes ?? []),
    ]);

    const shared = [...leftNotes].filter(n => rightNotes.has(n));
    const onlyLeft = [...leftNotes].filter(n => !rightNotes.has(n));
    const onlyRight = [...rightNotes].filter(n => !leftNotes.has(n));

    return { shared, onlyLeft, onlyRight };
  }, [leftItem, rightItem]);

  const renderNoteRow = (label: string, leftNotes: string[], rightNotes: string[], icon: React.ReactNode, accentColor: string, bgColor: string) => {
    if (leftNotes.length === 0 && rightNotes.length === 0) return null;
    const allNotes = Array.from(new Set([...leftNotes, ...rightNotes]));
    return (
      <View style={[styles.noteTableSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.noteTableHeader}>
          {icon}
          <Text style={[styles.noteTableLabel, { color: accentColor }]}>{label}</Text>
        </View>
        <View style={[styles.noteTableRow, { borderBottomColor: colors.border }]}>
          <View style={[styles.noteTableCell, { borderRightColor: colors.border, borderRightWidth: 1 }]}>
            <Text style={[styles.noteTableCellHeader, { color: colors.subtext }]} numberOfLines={1}>{leftItem?.perfume_name}</Text>
          </View>
          <View style={styles.noteTableCell}>
            <Text style={[styles.noteTableCellHeader, { color: colors.subtext }]} numberOfLines={1}>{rightItem?.perfume_name}</Text>
          </View>
        </View>
        {allNotes.map((note) => {
          const inLeft = leftNotes.includes(note);
          const inRight = rightNotes.includes(note);
          const isShared = inLeft && inRight;
          return (
            <View key={note} style={[styles.noteTableRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.noteTableCell, { borderRightColor: colors.border, borderRightWidth: 1 }]}>
                {inLeft && (
                  <View style={[styles.noteTag, { backgroundColor: isShared ? '#E8F5E9' : bgColor, borderColor: isShared ? '#4CAF50' : accentColor }]}>
                    <Text style={[styles.noteTagText, { color: isShared ? '#2E7D32' : accentColor }]}>{note}</Text>
                  </View>
                )}
              </View>
              <View style={styles.noteTableCell}>
                {inRight && (
                  <View style={[styles.noteTag, { backgroundColor: isShared ? '#E8F5E9' : bgColor, borderColor: isShared ? '#4CAF50' : accentColor }]}>
                    <Text style={[styles.noteTagText, { color: isShared ? '#2E7D32' : accentColor }]}>{note}</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

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
          <Text style={[styles.title, { color: colors.text }]}>Compare</Text>
        </View>

        <View style={styles.selectorRow}>
          <View style={styles.selectorCol}>
            <Text style={[styles.selectorLabel, { color: colors.subtext }]}>FIRST PERFUME</Text>
            <TouchableOpacity
              style={[styles.selectorBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowPicker('left')}
            >
              <Text style={[styles.selectorText, { color: leftItem ? colors.text : colors.subtext }]} numberOfLines={1}>
                {leftItem ? leftItem.perfume_name : '— Select —'}
              </Text>
              <CaretDown size={16} color={colors.subtext} />
            </TouchableOpacity>
          </View>

          <View style={styles.swapIcon}>
            <ArrowsLeftRight size={20} color={colors.subtext} />
          </View>

          <View style={styles.selectorCol}>
            <Text style={[styles.selectorLabel, { color: colors.subtext }]}>SECOND PERFUME</Text>
            <TouchableOpacity
              style={[styles.selectorBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowPicker('right')}
            >
              <Text style={[styles.selectorText, { color: rightItem ? colors.text : colors.subtext }]} numberOfLines={1}>
                {rightItem ? rightItem.perfume_name : '— Select —'}
              </Text>
              <CaretDown size={16} color={colors.subtext} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.imageRow}>
          <View style={[styles.imageCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {leftItem?.image_url ? (
              <Image source={{ uri: forceHttps(leftItem.image_url) ?? undefined }} style={styles.perfumeImage} resizeMode="contain" />
            ) : (
              <Text style={[styles.placeholderText, { color: colors.subtext }]}>Select a perfume</Text>
            )}
          </View>
          <View style={[styles.imageCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {rightItem?.image_url ? (
              <Image source={{ uri: forceHttps(rightItem.image_url) ?? undefined }} style={styles.perfumeImage} resizeMode="contain" />
            ) : (
              <Text style={[styles.placeholderText, { color: colors.subtext }]}>Select a perfume</Text>
            )}
          </View>
        </View>

        {leftItem && rightItem && comparison && (
          <>
            <View style={styles.ratingCompare}>
              <View style={[styles.ratingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.ratingName, { color: colors.text }]} numberOfLines={1}>{leftItem.perfume_name}</Text>
                <Text style={[styles.ratingBrand, { color: colors.subtext }]}>{leftItem.perfume_brand}</Text>
                {leftItem.rating ? (
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map(r => (
                      <Star key={r} size={16} color="#FFD700" weight={(leftItem.rating ?? 0) >= r ? 'fill' : 'regular'} />
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.noRating, { color: colors.subtext }]}>Not rated</Text>
                )}
                {leftItem.concentration && (
                  <Text style={[styles.concText, { color: colors.accent }]}>{leftItem.concentration}</Text>
                )}
              </View>
              <View style={[styles.ratingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.ratingName, { color: colors.text }]} numberOfLines={1}>{rightItem.perfume_name}</Text>
                <Text style={[styles.ratingBrand, { color: colors.subtext }]}>{rightItem.perfume_brand}</Text>
                {rightItem.rating ? (
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map(r => (
                      <Star key={r} size={16} color="#FFD700" weight={(rightItem.rating ?? 0) >= r ? 'fill' : 'regular'} />
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.noRating, { color: colors.subtext }]}>Not rated</Text>
                )}
                {rightItem.concentration && (
                  <Text style={[styles.concText, { color: colors.accent }]}>{rightItem.concentration}</Text>
                )}
              </View>
            </View>

            {comparison.shared.length > 0 && (
              <View style={[styles.summaryBar, { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' }]}>
                <Text style={[styles.summaryText, { color: '#2E7D32' }]}>
                  {comparison.shared.length} shared · {comparison.onlyLeft.length} unique to left · {comparison.onlyRight.length} unique to right
                </Text>
              </View>
            )}

            {renderNoteRow(
              'Top Notes',
              leftItem.top_notes ?? [],
              rightItem.top_notes ?? [],
              <Drop size={16} color="#5B8DEF" />,
              '#5B8DEF',
              '#E3F2FD'
            )}

            {renderNoteRow(
              'Heart Notes',
              leftItem.heart_notes ?? [],
              rightItem.heart_notes ?? [],
              <Heart size={16} color="#E91E63" />,
              '#E91E63',
              '#FCE4EC'
            )}

            {renderNoteRow(
              'Base Notes',
              leftItem.base_notes ?? [],
              rightItem.base_notes ?? [],
              <Stack size={16} color="#8D6E63" />,
              '#8D6E63',
              '#EFEBE9'
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={showPicker !== null} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select Perfume</Text>
            <TouchableOpacity onPress={() => setShowPicker(null)}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {collection.map(item => (
              <TouchableOpacity
                key={item.id}
                style={[styles.pickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  if (showPicker === 'left') setLeftItem(item);
                  else setRightItem(item);
                  setShowPicker(null);
                }}
              >
                {item.image_url && (
                  <Image source={{ uri: forceHttps(item.image_url) ?? undefined }} style={styles.pickerImage} resizeMode="contain" />
                )}
                <View style={styles.pickerInfo}>
                  <Text style={[styles.pickerName, { color: colors.text }]}>{item.perfume_name}</Text>
                  <Text style={[styles.pickerBrand, { color: colors.subtext }]}>{item.perfume_brand}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 20 },
  backBtn: { padding: 4, marginRight: 8 },
  title: { fontSize: 24, fontWeight: '700' as const },
  selectorRow: { flexDirection: 'row', paddingHorizontal: 20, alignItems: 'flex-end', gap: 8, marginBottom: 16 },
  selectorCol: { flex: 1 },
  selectorLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.5, marginBottom: 6 },
  selectorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, borderWidth: 1 },
  selectorText: { fontSize: 14, flex: 1 },
  swapIcon: { paddingBottom: 14 },
  imageRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 16 },
  imageCard: { flex: 1, height: 160, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', padding: 10 },
  perfumeImage: { width: '100%', height: '100%' },
  placeholderText: { fontSize: 14, textAlign: 'center' },
  ratingCompare: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 16 },
  ratingCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14 },
  ratingName: { fontSize: 14, fontWeight: '700' as const },
  ratingBrand: { fontSize: 12, marginTop: 2, marginBottom: 8 },
  starsRow: { flexDirection: 'row', gap: 2 },
  noRating: { fontSize: 13 },
  concText: { fontSize: 12, fontWeight: '600' as const, marginTop: 8 },
  summaryBar: { marginHorizontal: 20, borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 14 },
  summaryText: { fontSize: 13, fontWeight: '600' as const, textAlign: 'center' },
  noteTableSection: { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 14 },
  noteTableHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  noteTableLabel: { fontSize: 15, fontWeight: '700' as const },
  noteTableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  noteTableCell: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', minHeight: 40 },
  noteTableCellHeader: { fontSize: 12, fontWeight: '600' as const, textAlign: 'center' },
  noteTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  noteTagText: { fontSize: 12, fontWeight: '500' as const },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 20, fontWeight: '700' as const },
  modalContent: { padding: 20, paddingBottom: 40 },
  pickerCard: { flexDirection: 'row', padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8, alignItems: 'center', gap: 12 },
  pickerImage: { width: 48, height: 48, borderRadius: 8 },
  pickerInfo: { flex: 1 },
  pickerName: { fontSize: 15, fontWeight: '600' as const },
  pickerBrand: { fontSize: 13, marginTop: 2 },
});

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { RefreshCw } from 'lucide-react-native';
import { CollectionItem } from '@/lib/types';
import { forceHttps } from '@/lib/supabase';
import { useTheme } from '@/providers/ThemeProvider';
import { processFragranceImage } from '@/lib/image-processing';
import { useAuth } from '@/providers/AuthProvider';
import { useQueryClient } from '@tanstack/react-query';

const COLUMNS = 5;
const SHELF_LINE_HEIGHT = 4;
const BOTTLE_ASPECT = 1.35;


interface ShelfViewProps {
  items: CollectionItem[];
  onItemPress: (item: CollectionItem) => void;
}

function ShelfBottle({ item, size, onPress }: {
  item: CollectionItem;
  size: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const imageUrl = item.clean_image_url
    ? forceHttps(item.clean_image_url)
    : item.image_url
      ? forceHttps(item.image_url)
      : null;

  const containerHeight = size * BOTTLE_ASPECT;

  return (
    <TouchableOpacity
      style={[styles.bottleContainer, { width: size, height: containerHeight }]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      {imageUrl ? (
        <View style={[styles.bottleCanvas, { width: size, height: containerHeight }]}>
          <Image
            source={{ uri: imageUrl }}
            style={[styles.bottleImage, {
              width: size,
              height: containerHeight,
            }]}
            contentFit="contain"
            contentPosition="bottom center"
            transition={150}
          />
        </View>
      ) : (
        <View style={[styles.bottlePlaceholder, { backgroundColor: colors.chip, width: size * 0.6, height: containerHeight * 0.6 }]}>
          <Text style={styles.bottlePlaceholderText}>🧴</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const MemoizedShelfBottle = React.memo(ShelfBottle);

function ShelfRow({ items, bottleSize, onItemPress, shelfColor }: {
  items: CollectionItem[];
  bottleSize: number;
  onItemPress: (item: CollectionItem) => void;
  shelfColor: string;
}) {
  return (
    <View style={styles.shelfRow}>
      <View style={styles.bottlesRow}>
        {items.map((item) => (
          <MemoizedShelfBottle
            key={item.id}
            item={item}
            size={bottleSize}
            onPress={() => onItemPress(item)}
          />
        ))}
        {Array.from({ length: COLUMNS - items.length }).map((_, i) => (
          <View key={`empty-${i}`} style={{ width: bottleSize, height: bottleSize * BOTTLE_ASPECT }} />
        ))}
      </View>
      <View style={[styles.shelfLine, { backgroundColor: shelfColor }]} />
      <View style={[styles.shelfShadow, { backgroundColor: shelfColor + '15' }]} />
    </View>
  );
}

const MemoizedShelfRow = React.memo(ShelfRow);

export default function ShelfView({ items, onItemPress }: ShelfViewProps) {
  const { width: screenWidth } = useWindowDimensions();
  const { colors, themeName } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [processingCount, setProcessingCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const horizontalPadding = 12;
  const totalWidth = screenWidth - horizontalPadding * 2;
  const bottleSize = Math.floor(totalWidth / COLUMNS);

  const isDark = themeName === 'noir';
  const shelfColor = isDark ? '#3d8b7a' : '#5fb3a1';
  const bgColor = isDark ? '#0a0908' : '#1a1815';

  const rows = useMemo(() => {
    const result: CollectionItem[][] = [];
    for (let i = 0; i < items.length; i += COLUMNS) {
      result.push(items.slice(i, i + COLUMNS));
    }
    return result;
  }, [items]);

  const unprocessedCount = useMemo(() =>
    items.filter(item => item.image_url && !item.clean_image_url).length,
    [items]
  );

  const totalWithImages = useMemo(() =>
    items.filter(item => item.image_url).length,
    [items]
  );

  const handleProcessAll = useCallback(async (forceAll = false) => {
    if (!user?.id || isProcessing) return;
    setIsProcessing(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const unprocessed = forceAll
      ? items.filter(item => item.image_url)
      : items.filter(item => item.image_url && !item.clean_image_url);
    let processed = 0;

    let failed = 0;
    for (const item of unprocessed) {
      try {
        console.log('[SHELF] Processing item:', item.id, item.perfume_name);
        const result = await processFragranceImage(user.id, item.id, item.image_url!);
        if (result) {
          processed++;
        } else {
          failed++;
          console.log('[SHELF] Processing returned null for item:', item.id);
        }
        setProcessingCount(processed + failed);
      } catch (error) {
        failed++;
        console.log('[SHELF] Error processing item:', item.id, error);
      }
    }

    setIsProcessing(false);
    setProcessingCount(0);
    void queryClient.invalidateQueries({ queryKey: ['collection', user.id] });

    if (processed > 0) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (failed > 0) {
        Alert.alert('Partial Success', `Cleaned ${processed} images. ${failed} failed.`);
      }
    } else if (failed > 0) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Processing Failed', 'Could not remove backgrounds. Check your connection and try again.');
    }
  }, [user?.id, items, isProcessing, queryClient]);

  return (
    <View style={[styles.shelfContainer, { backgroundColor: bgColor }]}>
      <View style={[styles.shelfHeader, { borderBottomColor: shelfColor + '30' }]}>
        <View style={styles.shelfHeaderLeft}>
          <Text style={styles.shelfTitle}>
            My Shelf
          </Text>
          <Text style={styles.shelfCount}>({items.length})</Text>
        </View>
        {totalWithImages > 0 && (
          <TouchableOpacity
            style={[styles.processBtn, { backgroundColor: shelfColor + '20', borderColor: shelfColor + '40' }]}
            onPress={() => handleProcessAll(unprocessedCount === 0)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <ActivityIndicator size="small" color={shelfColor} />
                <Text style={[styles.processBtnText, { color: shelfColor }]}>
                  {processingCount}/{unprocessedCount || totalWithImages}
                </Text>
              </>
            ) : (
              <>
                <RefreshCw size={14} color={shelfColor} />
                <Text style={[styles.processBtnText, { color: shelfColor }]}>
                  {unprocessedCount > 0 ? `Clean ${unprocessedCount} images` : 'Re-clean images'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.shelfContent, { paddingHorizontal: horizontalPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((rowItems, index) => (
          <MemoizedShelfRow
            key={index}
            items={rowItems}
            bottleSize={bottleSize}
            onItemPress={onItemPress}
            shelfColor={shelfColor}
          />
        ))}
        {items.length === 0 && (
          <View style={styles.emptyShelf}>
            <Text style={styles.emptyShelfText}>No bottles on your shelf yet</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shelfContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  shelfHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  shelfHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shelfTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#e8e0d5',
  },
  shelfCount: {
    fontSize: 14,
    color: '#8b7a68',
    fontWeight: '600' as const,
  },
  processBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  processBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  shelfContent: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  shelfRow: {
    marginBottom: 2,
  },
  bottlesRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  shelfLine: {
    height: SHELF_LINE_HEIGHT,
    borderRadius: 2,
    marginTop: -1,
  },
  shelfShadow: {
    height: 8,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  bottleContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bottleCanvas: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bottleImage: {
  },
  bottlePlaceholder: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottlePlaceholderText: {
    fontSize: 20,
  },

  emptyShelf: {
    padding: 40,
    alignItems: 'center',
  },
  emptyShelfText: {
    color: '#8b7a68',
    fontSize: 15,
  },
});

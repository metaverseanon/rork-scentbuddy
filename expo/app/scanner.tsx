import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Flashlight, Scan, Check, Drop, Heart, Camera, ArrowCounterClockwise } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { generateObject } from '@rork-ai/toolkit-sdk';
import { z } from 'zod';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { supabase, searchFragrances, forceHttps } from '@/lib/supabase';
import { SearchResult } from '@/lib/types';

type ScanMode = 'barcode' | 'photo';

export default function ScannerScreen() {
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [scannedData, setScannedData] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [addedItems, setAddedItems] = useState<Record<string, 'collection' | 'wishlist' | 'both'>>({});
  const [cameraReady, setCameraReady] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('barcode');
  const [identifiedName, setIdentifiedName] = useState<string | null>(null);
  const [takingPhoto, setTakingPhoto] = useState(false);

  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [scanLineAnim, pulseAnim]);

  const isValidProductBarcode = useCallback((data: string): boolean => {
    const cleaned = data.trim();
    if (!/^\d+$/.test(cleaned)) return false;
    if ([8, 12, 13, 14].includes(cleaned.length)) return true;
    return false;
  }, []);

  const [invalidScan, setInvalidScan] = useState(false);

  const handleBarCodeScanned = useCallback(async (data: string) => {
    if (scannedData === data) return;
    if (scanMode !== 'barcode') return;
    console.log('Barcode scanned:', data);

    if (!isValidProductBarcode(data)) {
      console.log('Invalid product barcode, ignoring:', data);
      setInvalidScan(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => setInvalidScan(false), 3000);
      return;
    }

    setScannedData(data);
    setInvalidScan(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setSearching(true);
    try {
      const results = await searchFragrances(data, 10);
      setSearchResults(results);
    } catch (err) {
      console.log('Search from barcode error:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [scannedData, isValidProductBarcode, scanMode]);

  const handlePhotoCapture = useCallback(async (base64: string) => {
    console.log('Photo captured, sending to AI for recognition...');
    setSearching(true);
    setScannedData('photo');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const result = await generateObject({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: `data:image/jpg;base64,${base64}`,
              },
              {
                type: 'text',
                text: 'Look at this image of a perfume bottle. Identify the perfume name and brand from any text, labels, or design you can see on the bottle. If you cannot identify a specific perfume, make your best guess based on what you see. Return the perfume name and brand.',
              },
            ],
          },
        ],
        schema: z.object({
          name: z.string().describe('The name of the perfume'),
          brand: z.string().describe('The brand of the perfume'),
          confidence: z.enum(['high', 'medium', 'low']).describe('How confident you are in the identification'),
        }),
      });

      console.log('AI identified perfume:', result);
      const searchQuery = `${result.name} ${result.brand}`;
      setIdentifiedName(searchQuery);

      const results = await searchFragrances(searchQuery, 10);

      if (results.length === 0) {
        const brandResults = await searchFragrances(result.brand, 10);
        if (brandResults.length > 0) {
          setSearchResults(brandResults);
        } else {
          const nameResults = await searchFragrances(result.name, 10);
          setSearchResults(nameResults);
        }
      } else {
        setSearchResults(results);
      }
    } catch (err) {
      console.log('AI recognition error:', err);
      Alert.alert('Recognition Failed', 'Could not identify the perfume. Try taking a clearer photo or use barcode mode.');
      setScannedData(null);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const addToCollection = useMutation({
    mutationFn: async (result: SearchResult) => {
      if (!user?.id) throw new Error('Not logged in');
      const isPro = profile?.is_pro ?? false;

      if (!isPro) {
        const { count } = await supabase
          .from('user_collections')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        if ((count ?? 0) >= 20) {
          throw new Error('Free accounts are limited to 20 perfumes. Upgrade to Pro!');
        }
      }

      const { error } = await supabase.from('user_collections').insert({
        user_id: user.id,
        perfume_name: result.name,
        perfume_brand: result.brand,
        concentration: result.concentration || null,
        top_notes: result.topNotes || [],
        heart_notes: result.heartNotes || [],
        base_notes: result.baseNotes || [],
        image_url: result.imageUrl || null,
        is_favorite: false,
        date_added: new Date().toISOString(),
        status: 'owned',
        fill_level: 100,
      });
      if (error) throw error;

      await supabase.from('activity_feed').insert({
        user_id: user.id,
        activity_type: 'added_perfume',
        perfume_name: result.name,
        perfume_brand: result.brand,
      });
    },
    onSuccess: (_data, result) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const key = `${result.name}-${result.brand}`;
      setAddedItems(prev => {
        const current = prev[key];
        return { ...prev, [key]: current === 'wishlist' ? 'both' : 'collection' };
      });
      void queryClient.invalidateQueries({ queryKey: ['collection', user?.id] });
    },
  });

  const addToWishlist = useMutation({
    mutationFn: async (result: SearchResult) => {
      if (!user?.id) throw new Error('Not logged in');

      const { error } = await supabase.from('user_wishlists').insert({
        user_id: user.id,
        perfume_name: result.name,
        perfume_brand: result.brand,
        concentration: result.concentration || null,
        image_url: result.imageUrl || null,
        notes: [...(result.topNotes || []), ...(result.heartNotes || []), ...(result.baseNotes || [])],
        priority: 3,
      });
      if (error) throw error;

      await supabase.from('activity_feed').insert({
        user_id: user.id,
        activity_type: 'wishlisted_perfume',
        perfume_name: result.name,
        perfume_brand: result.brand,
      });
    },
    onSuccess: (_data, result) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const key = `${result.name}-${result.brand}`;
      setAddedItems(prev => {
        const current = prev[key];
        return { ...prev, [key]: current === 'collection' ? 'both' : 'wishlist' };
      });
      void queryClient.invalidateQueries({ queryKey: ['wishlist', user?.id] });
    },
  });

  const resetScan = useCallback(() => {
    setScannedData(null);
    setSearchResults([]);
    setSearching(false);
    setAddedItems({});
    setInvalidScan(false);
    setIdentifiedName(null);
    setTakingPhoto(false);
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.webFallback, { paddingTop: insets.top }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.webContent}>
            <View style={[styles.webIconWrap, { backgroundColor: colors.accent + '15' }]}>
              <Scan size={48} color={colors.accent} />
            </View>
            <Text style={[styles.webTitle, { color: colors.text }]}>Scanner Not Available</Text>
            <Text style={[styles.webSub, { color: colors.subtext }]}>
              Scanning requires a native device.{'\n'}Please use the app on your phone to scan perfume barcodes or bottles.
            </Text>
            <TouchableOpacity
              style={[styles.webBtn, { backgroundColor: colors.accent }]}
              onPress={() => router.back()}
            >
              <Text style={styles.webBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const CameraModule = require('expo-camera');
  const { CameraView, useCameraPermissions } = CameraModule;

  return (
    <ScannerWithCamera
      CameraView={CameraView}
      useCameraPermissions={useCameraPermissions}
      colors={colors}
      insets={insets}
      router={router}
      torchOn={torchOn}
      setTorchOn={setTorchOn}
      scannedData={scannedData}
      searching={searching}
      searchResults={searchResults}
      addedItems={addedItems}
      cameraReady={cameraReady}
      setCameraReady={setCameraReady}
      scanLineAnim={scanLineAnim}
      pulseAnim={pulseAnim}
      handleBarCodeScanned={handleBarCodeScanned}
      handlePhotoCapture={handlePhotoCapture}
      addToCollection={addToCollection}
      addToWishlist={addToWishlist}
      resetScan={resetScan}
      invalidScan={invalidScan}
      scanMode={scanMode}
      setScanMode={setScanMode}
      identifiedName={identifiedName}
      takingPhoto={takingPhoto}
      setTakingPhoto={setTakingPhoto}
    />
  );
}

function ScannerWithCamera({
  CameraView,
  useCameraPermissions,
  colors,
  insets,
  router,
  torchOn,
  setTorchOn,
  scannedData,
  searching,
  searchResults,
  addedItems,
  cameraReady,
  setCameraReady,
  scanLineAnim,
  pulseAnim,
  handleBarCodeScanned,
  handlePhotoCapture,
  addToCollection,
  addToWishlist,
  resetScan,
  invalidScan,
  scanMode,
  setScanMode,
  identifiedName,
  takingPhoto,
  setTakingPhoto,
}: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const onTakePhoto = useCallback(async () => {
    if (!cameraRef.current || !cameraReady || takingPhoto) return;
    console.log('Taking photo for AI recognition...');
    setTakingPhoto(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.6,
        skipProcessing: false,
      });

      if (photo?.base64) {
        await handlePhotoCapture(photo.base64);
      } else {
        console.log('No base64 data in photo');
        Alert.alert('Error', 'Failed to capture photo. Please try again.');
      }
    } catch (err) {
      console.log('Take picture error:', err);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    } finally {
      setTakingPhoto(false);
    }
  }, [cameraReady, takingPhoto, handlePhotoCapture, setTakingPhoto]);

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        <View style={[styles.permissionWrap, { paddingTop: insets.top }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <X size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.permissionContent}>
            <Scan size={56} color={colors.accent} />
            <Text style={styles.permissionTitle}>Camera Access Needed</Text>
            <Text style={styles.permissionSub}>
              Allow camera access to scan perfume barcodes or take photos of bottles to identify them.
            </Text>
            <TouchableOpacity
              style={[styles.permissionBtn, { backgroundColor: colors.accent }]}
              onPress={requestPermission}
            >
              <Text style={styles.permissionBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const scanLineTranslate = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 200],
  });

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchOn}
        onCameraReady={() => setCameraReady(true)}
        barcodeScannerSettings={scanMode === 'barcode' ? {
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
        } : undefined}
        onBarcodeScanned={scanMode === 'barcode' && !scannedData ? (result: any) => {
          if (result?.data) {
            void handleBarCodeScanned(result.data);
          }
        } : undefined}
      />

      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topBarBtn} onPress={() => router.back()}>
            <X size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>
            {scanMode === 'barcode' ? 'Scan Barcode' : 'Photo Identify'}
          </Text>
          <TouchableOpacity style={styles.topBarBtn} onPress={() => setTorchOn(!torchOn)}>
            {torchOn ? (
              <Flashlight size={22} color="#fff" weight="fill" />
            ) : (
              <Flashlight size={22} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {!scannedData && (
          <View style={styles.modeToggleWrap}>
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  scanMode === 'barcode' && { backgroundColor: colors.accent },
                ]}
                onPress={() => setScanMode('barcode')}
              >
                <Scan size={16} color={scanMode === 'barcode' ? '#fff' : 'rgba(255,255,255,0.7)'} />
                <Text style={[
                  styles.modeBtnText,
                  scanMode === 'barcode' && styles.modeBtnTextActive,
                ]}>Barcode</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  scanMode === 'photo' && { backgroundColor: colors.accent },
                ]}
                onPress={() => setScanMode('photo')}
              >
                <Camera size={16} color={scanMode === 'photo' ? '#fff' : 'rgba(255,255,255,0.7)'} />
                <Text style={[
                  styles.modeBtnText,
                  scanMode === 'photo' && styles.modeBtnTextActive,
                ]}>Photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!scannedData && scanMode === 'barcode' && (
          <View style={styles.scanArea}>
            <Animated.View style={[styles.scanFrame, { transform: [{ scale: pulseAnim }] }]}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              <Animated.View
                style={[styles.scanLine, {
                  backgroundColor: colors.accent,
                  transform: [{ translateY: scanLineTranslate }],
                }]}
              />
            </Animated.View>
            <Text style={styles.scanHint}>Point at a perfume barcode</Text>
            {invalidScan && (
              <View style={styles.invalidBadge}>
                <Text style={styles.invalidText}>Not a product barcode — try the barcode on the perfume box</Text>
              </View>
            )}
          </View>
        )}

        {!scannedData && scanMode === 'photo' && (
          <View style={styles.photoArea}>
            <View style={styles.photoFrameOuter}>
              <Animated.View style={[styles.photoFrame, { transform: [{ scale: pulseAnim }] }]}>
                <View style={[styles.photoCorner, styles.photoCornerTL, { borderColor: colors.accent }]} />
                <View style={[styles.photoCorner, styles.photoCornerTR, { borderColor: colors.accent }]} />
                <View style={[styles.photoCorner, styles.photoCornerBL, { borderColor: colors.accent }]} />
                <View style={[styles.photoCorner, styles.photoCornerBR, { borderColor: colors.accent }]} />
              </Animated.View>
            </View>
            <Text style={styles.photoHint}>
              Point at a perfume bottle and tap the button
            </Text>
            <Text style={styles.photoSubHint}>
              AI will read the label and identify it
            </Text>
            <TouchableOpacity
              style={[styles.captureBtn, { borderColor: colors.accent }]}
              onPress={onTakePhoto}
              disabled={takingPhoto || !cameraReady}
              activeOpacity={0.7}
            >
              <View style={[styles.captureBtnInner, {
                backgroundColor: takingPhoto ? 'rgba(255,255,255,0.3)' : colors.accent,
              }]}>
                {takingPhoto ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Camera size={28} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
          </View>
        )}

        {scannedData && (
          <View style={styles.resultsContainer}>
            <View style={styles.resultsHeader}>
              <View style={[styles.scannedBadge, { backgroundColor: colors.accent }]}>
                {scannedData === 'photo' ? (
                  <Camera size={14} color="#fff" />
                ) : (
                  <Scan size={14} color="#fff" />
                )}
                <Text style={styles.scannedBadgeText} numberOfLines={1}>
                  {scannedData === 'photo'
                    ? (identifiedName ? `Found: ${identifiedName}` : 'Analyzing photo...')
                    : `Scanned: ${scannedData}`}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.scanAgainBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
                onPress={resetScan}
              >
                <ArrowCounterClockwise size={14} color="#fff" />
                <Text style={styles.scanAgainText}>Again</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.resultsScroll}
              contentContainerStyle={styles.resultsScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {searching ? (
                <View style={styles.searchingWrap}>
                  <ActivityIndicator color={colors.accent} size="large" />
                  <Text style={styles.searchingText}>
                    {scannedData === 'photo' ? 'Identifying perfume...' : 'Searching fragrances...'}
                  </Text>
                  {scannedData === 'photo' && (
                    <Text style={styles.searchingSubText}>
                      AI is reading the bottle label
                    </Text>
                  )}
                </View>
              ) : searchResults.length === 0 ? (
                <View style={styles.noResultsWrap}>
                  <Text style={styles.noResultsText}>
                    {scannedData === 'photo'
                      ? 'Could not identify this perfume.'
                      : 'No matching fragrances found for this barcode.'}
                  </Text>
                  <Text style={styles.noResultsHint}>
                    {scannedData === 'photo'
                      ? 'Try taking a clearer photo with the label visible, or switch to barcode mode.'
                      : 'Try scanning a different barcode or take a photo of the bottle instead.'}
                  </Text>
                </View>
              ) : (
                searchResults.map((result: SearchResult, i: number) => {
                  const itemKey = `${result.name}-${result.brand}`;
                  const addedState = addedItems[itemKey];
                  const inCollection = addedState === 'collection' || addedState === 'both';
                  const inWishlist = addedState === 'wishlist' || addedState === 'both';
                  return (
                    <View key={i} style={styles.resultCard}>
                      {result.imageUrl && (
                        <Image
                          source={{ uri: forceHttps(result.imageUrl) ?? undefined }}
                          style={styles.resultImage}
                          resizeMode="contain"
                        />
                      )}
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultName} numberOfLines={1}>{result.name}</Text>
                        <Text style={styles.resultBrand} numberOfLines={1}>{result.brand}</Text>
                        {result.concentration && (
                          <Text style={[styles.resultConc, { color: colors.accent }]}>{result.concentration}</Text>
                        )}
                      </View>
                      <View style={styles.resultActions}>
                        <TouchableOpacity
                          style={[styles.addResultBtn, {
                            backgroundColor: inCollection ? '#4CAF50' : colors.accent,
                          }]}
                          onPress={() => {
                            if (!inCollection) addToCollection.mutate(result);
                          }}
                          disabled={inCollection || addToCollection.isPending}
                        >
                          {addToCollection.isPending && !inCollection ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : inCollection ? (
                            <Check size={16} color="#fff" />
                          ) : (
                            <Drop size={16} color="#fff" />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.addResultBtn, {
                            backgroundColor: inWishlist ? '#E91E63' : 'rgba(255,255,255,0.25)',
                          }]}
                          onPress={() => {
                            if (!inWishlist) addToWishlist.mutate(result);
                          }}
                          disabled={inWishlist || addToWishlist.isPending}
                        >
                          {addToWishlist.isPending && !inWishlist ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Heart size={16} color="#fff" weight={inWishlist ? 'fill' : 'regular'} />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  topBarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700' as const,
  },
  modeToggleWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14,
    padding: 3,
    gap: 2,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  modeBtnText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  modeBtnTextActive: {
    color: '#fff',
  },
  scanArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 240,
    height: 240,
    position: 'relative' as const,
  },
  corner: {
    position: 'absolute' as const,
    width: 30,
    height: 30,
    borderColor: '#fff',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  scanLine: {
    position: 'absolute' as const,
    left: 10,
    right: 10,
    height: 2,
    borderRadius: 1,
    top: 20,
  },
  scanHint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontWeight: '600' as const,
    marginTop: 24,
  },
  photoArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFrameOuter: {
    marginBottom: 24,
  },
  photoFrame: {
    width: 260,
    height: 320,
    position: 'relative' as const,
  },
  photoCorner: {
    position: 'absolute' as const,
    width: 36,
    height: 36,
  },
  photoCornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 12,
  },
  photoCornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 12,
  },
  photoCornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 12,
  },
  photoCornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 12,
  },
  photoHint: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 17,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  photoSubHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '500' as const,
    marginTop: 6,
    textAlign: 'center' as const,
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  captureBtnInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsContainer: {
    flex: 1,
    paddingTop: 16,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  scannedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  scannedBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600' as const,
    flex: 1,
  },
  scanAgainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  scanAgainText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600' as const,
  },
  resultsScroll: {
    flex: 1,
  },
  resultsScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  resultImage: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#1a1a1a',
  },
  resultBrand: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  resultConc: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600' as const,
  },
  resultActions: {
    flexDirection: 'row' as const,
    gap: 6,
  },
  addResultBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchingWrap: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 12,
  },
  searchingText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600' as const,
  },
  searchingSubText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500' as const,
  },
  noResultsWrap: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  noResultsText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  invalidBadge: {
    marginTop: 16,
    backgroundColor: 'rgba(231, 76, 60, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    maxWidth: 280,
  },
  invalidText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
  noResultsHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center' as const,
    marginTop: 8,
    lineHeight: 20,
  },
  closeBtn: {
    position: 'absolute' as const,
    top: 60,
    left: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webFallback: {
    flex: 1,
  },
  webContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  webIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  webTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    marginBottom: 12,
  },
  webSub: {
    fontSize: 15,
    textAlign: 'center' as const,
    lineHeight: 22,
    marginBottom: 28,
  },
  webBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  webBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  permissionWrap: {
    flex: 1,
  },
  permissionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  permissionTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700' as const,
    marginTop: 20,
    marginBottom: 12,
  },
  permissionSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    textAlign: 'center' as const,
    lineHeight: 22,
    marginBottom: 28,
  },
  permissionBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
  },
});

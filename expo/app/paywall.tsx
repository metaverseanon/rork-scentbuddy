import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Check, Crown, Sparkle, Star, ArrowCounterClockwise } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { PurchasesPackage } from 'react-native-purchases';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { useTheme } from '@/providers/ThemeProvider';

const PRO_FEATURES = [
  { icon: '♾️', title: 'Unlimited Collection', desc: 'No limits on fragrances you can track' },
  { icon: '🤖', title: 'AI Recommendations', desc: 'Personalized scent suggestions' },
  { icon: '📊', title: 'Full Analytics', desc: 'Deep insights into your wearing habits' },
  { icon: '🎯', title: 'Advanced Goals', desc: 'Set and track fragrance goals' },
  { icon: '🔍', title: 'Compare Tool', desc: 'Side-by-side fragrance comparison' },
  { icon: '☁️', title: 'Cloud Sync', desc: 'Seamless sync across all devices' },
];

const IOS_MONTHLY_PRODUCT_ID = 'sb_monthly';
const IOS_YEARLY_PRODUCT_ID = 'sb_yearly';

function isAnnualPlan(pkg: PurchasesPackage | null): boolean {
  if (!pkg) return false;
  return pkg.product.identifier === IOS_YEARLY_PRODUCT_ID || pkg.identifier === '$rc_annual' || pkg.packageType === 'ANNUAL';
}

function isMonthlyPlan(pkg: PurchasesPackage | null): boolean {
  if (!pkg) return false;
  return pkg.product.identifier === IOS_MONTHLY_PRODUCT_ID || pkg.identifier === '$rc_monthly' || pkg.packageType === 'MONTHLY';
}

function formatPrice(pkg: PurchasesPackage): string {
  const product = pkg.product;
  if (product.priceString) return product.priceString;
  return isAnnualPlan(pkg) ? '$41.94' : '$6.99';
}

function getPeriodLabel(pkg: PurchasesPackage): string {
  if (isAnnualPlan(pkg)) return 'year';
  if (isMonthlyPlan(pkg)) return 'month';
  return 'period';
}

function getSavingsText(packages: PurchasesPackage[]): string | null {
  const annual = packages.find(isAnnualPlan);
  if (!annual) return null;
  return 'Save 50%';
}

export default function PaywallScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    packages,
    isLoadingOfferings,
    purchasePackage,
    isPurchasing,
    restorePurchases,
    isRestoring,
    isPro,
    rcConfigured,
    rcConfigurationError,
    refetchOfferings,
  } = useRevenueCat();

  const [selectedPkg, setSelectedPkg] = useState<PurchasesPackage | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const crownScale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.spring(crownScale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim, crownScale]);

  useEffect(() => {
    if (packages.length > 0 && !selectedPkg) {
      const annual = packages.find(isAnnualPlan);
      setSelectedPkg(annual ?? packages[0]);
    }
  }, [packages, selectedPkg]);

  useEffect(() => {
    if (isPro) {
      Alert.alert('Welcome to Pro!', 'You now have full access to all Scent Buddy Pro features.', [
        { text: 'Awesome!', onPress: () => router.back() },
      ]);
    }
  }, [isPro, router]);

  const handlePurchase = useCallback(async () => {
    if (!selectedPkg) return;
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await purchasePackage(selectedPkg);
    } catch (error: any) {
      if (!error.userCancelled) {
        Alert.alert('Purchase Failed', error.message || 'Something went wrong. Please try again.');
      }
    }
  }, [selectedPkg, purchasePackage]);

  const handleRestore = useCallback(async () => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await restorePurchases();
      Alert.alert('Restore Complete', isPro ? 'Your Pro subscription has been restored!' : 'No active subscription found.');
    } catch (error: any) {
      Alert.alert('Restore Failed', error.message || 'Could not restore purchases. Please try again.');
    }
  }, [restorePurchases, isPro]);

  const savingsText = getSavingsText(packages);

  const isDark = colors.background === '#0d0b08';
  const gradientTop = isDark ? '#1a1510' : '#faf7f2';
  const goldAccent = '#D4A574';
  const goldLight = '#F5E6D3';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.chip }]}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <X size={20} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleRestore} disabled={isRestoring}>
          <Text style={[styles.restoreText, { color: colors.subtext }]}>
            {isRestoring ? 'Restoring...' : 'Restore'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.heroSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Animated.View style={[styles.crownContainer, { backgroundColor: goldAccent + '15', transform: [{ scale: crownScale }] }]}>
            <Crown size={48} color={goldAccent} weight="fill" />
          </Animated.View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>
            Scent Buddy <Text style={{ color: goldAccent }}>Pro</Text>
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.subtext }]}>
            Unlock the full fragrance experience
          </Text>
        </Animated.View>

        <View style={styles.featuresGrid}>
          {PRO_FEATURES.map((feature, i) => (
            <Animated.View
              key={feature.title}
              style={[
                styles.featureCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: fadeAnim,
                  transform: [{ translateY: Animated.multiply(slideAnim, new Animated.Value(1 + i * 0.15)) }],
                },
              ]}
            >
              <Text style={styles.featureIcon}>{feature.icon}</Text>
              <View style={styles.featureText}>
                <Text style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
                <Text style={[styles.featureDesc, { color: colors.subtext }]}>{feature.desc}</Text>
              </View>
              <Check size={18} color={goldAccent} weight="bold" />
            </Animated.View>
          ))}
        </View>

        {isLoadingOfferings ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={goldAccent} />
            <Text style={[styles.loadingText, { color: colors.subtext }]}>Loading plans...</Text>
          </View>
        ) : packages.length === 0 ? (
          <View style={styles.loadingContainer}>
            {Platform.OS === 'web' ? (
              <>
                <Text style={[styles.webNotice, { color: colors.text }]}>Subscriptions available on mobile</Text>
                <Text style={[styles.loadingText, { color: colors.subtext }]}>
                  Scan the QR code to open the app on your device and subscribe there.
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.loadingText, { color: colors.subtext }]}>
                  {!rcConfigured
                    ? 'Subscriptions are reconnecting'
                    : 'No plans available right now'}
                </Text>
                <Text style={[styles.hintText, { color: colors.subtext }]}>
                  {!rcConfigured
                    ? rcConfigurationError ?? 'Tap retry to reconnect to subscriptions.'
                    : 'Make sure you have an internet connection and try again'}
                </Text>
                <TouchableOpacity
                  style={[styles.retryBtn, { borderColor: colors.border }]}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    void refetchOfferings();
                  }}
                >
                  <ArrowCounterClockwise size={16} color={colors.accent} />
                  <Text style={[styles.retryBtnText, { color: colors.accent }]}>Retry</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <View style={styles.packagesSection}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>Choose your plan</Text>
            {packages.map((pkg) => {
              const isSelected = selectedPkg?.identifier === pkg.identifier;
              const isAnnual = isAnnualPlan(pkg);
              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={[
                    styles.packageCard,
                    {
                      backgroundColor: isSelected ? goldAccent + '10' : colors.card,
                      borderColor: isSelected ? goldAccent : colors.border,
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                  onPress={() => {
                    setSelectedPkg(pkg);
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.packageLeft}>
                    <View style={[styles.radioOuter, { borderColor: isSelected ? goldAccent : colors.border }]}>
                      {isSelected && <View style={[styles.radioInner, { backgroundColor: goldAccent }]} />}
                    </View>
                    <View>
                      <View style={styles.packageNameRow}>
                        <Text style={[styles.packageName, { color: colors.text }]}>
                          {isAnnual ? 'Yearly' : 'Monthly'}
                        </Text>
                        {isAnnual && savingsText && (
                          <View style={[styles.savingsBadge, { backgroundColor: goldAccent }]}>
                            <Text style={styles.savingsBadgeText}>{savingsText}</Text>
                          </View>
                        )}
                      </View>

                    </View>
                  </View>
                  <View style={styles.packageRight}>
                    <Text style={[styles.packagePrice, { color: colors.text }]}>
                      {formatPrice(pkg)}
                    </Text>
                    <Text style={[styles.packagePeriod, { color: colors.subtext }]}>
                      /{getPeriodLabel(pkg)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[styles.purchaseBtn, { backgroundColor: goldAccent, opacity: (!selectedPkg || isPurchasing) ? 0.6 : 1 }]}
          onPress={handlePurchase}
          disabled={!selectedPkg || isPurchasing}
          activeOpacity={0.85}
        >
          {isPurchasing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Sparkle size={20} color="#fff" weight="fill" />
              <Text style={styles.purchaseBtnText}>
                Continue with {isAnnualPlan(selectedPkg) ? 'Yearly' : 'Monthly'}
              </Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={[styles.legalText, { color: colors.subtext }]}>
          Cancel anytime · Subscription auto-renews
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  heroSection: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 28,
  },
  crownContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 16,
    marginTop: 6,
  },
  featuresGrid: {
    gap: 8,
    marginBottom: 28,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  featureIcon: {
    fontSize: 24,
    width: 36,
    textAlign: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  featureDesc: {
    fontSize: 13,
    marginTop: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
  },
  packagesSection: {
    gap: 10,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  packageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
  },
  packageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  packageNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  packageName: {
    fontSize: 17,
    fontWeight: '700' as const,
  },
  packageSubline: {
    fontSize: 12,
    marginTop: 2,
  },
  savingsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  savingsBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800' as const,
  },
  packageRight: {
    alignItems: 'flex-end',
  },
  packagePrice: {
    fontSize: 18,
    fontWeight: '800' as const,
  },
  packagePeriod: {
    fontSize: 13,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  purchaseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  purchaseBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800' as const,
  },
  legalText: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 10,
  },
  webNotice: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 8,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  hintText: {
    fontSize: 13,
    textAlign: 'center' as const,
    marginTop: 4,
    paddingHorizontal: 20,
  },
});

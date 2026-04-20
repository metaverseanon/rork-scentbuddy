import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Drop,
  BookOpen,
  Users,
  ChartBar,
  Sparkle,
  ArrowRight,
  Scan,
  Check,
  Target,
  Bell,
  Gift,
  Crown,
} from 'phosphor-react-native';
import { QUIZ_STEPS, ONBOARDING_QUIZ_KEY, QuizResults } from '@/constants/quiz';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ONBOARDING_KEY = 'scentbuddy_onboarding_done';

interface OnboardingPage {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  iconColor: string;
  gradientColors: [string, string];
  emoji: string;
}

const PAGES: OnboardingPage[] = [
  {
    title: 'Your Fragrance\nCollection',
    subtitle: 'Catalog every bottle you own. Track notes, seasons, occasions, and never forget a scent again.',
    icon: Drop,
    iconColor: '#c49a6c',
    gradientColors: ['#1a1410', '#2a2015'],
    emoji: '✨',
  },
  {
    title: 'Daily Wear\nDiary',
    subtitle: 'Log what you wear each day. Build streaks, track moods, and discover your scent patterns over time.',
    icon: BookOpen,
    iconColor: '#4CAF50',
    gradientColors: ['#0f1a12', '#1a2a1e'],
    emoji: '📖',
  },
  {
    title: 'Community\n& Discovery',
    subtitle: 'See what others are wearing, follow fellow enthusiasts, and sniff fragrances from their collections.',
    icon: Users,
    iconColor: '#5B8DEF',
    gradientColors: ['#0f1420', '#1a2030'],
    emoji: '👃',
  },
  {
    title: 'Scan &\nDiscover',
    subtitle: 'Point your camera at any perfume barcode to instantly identify it and add it to your collection or wishlist.',
    icon: Scan,
    iconColor: '#FF6B6B',
    gradientColors: ['#1a0f0f', '#2a1818'],
    emoji: '📷',
  },
  {
    title: 'Smart\nInsights',
    subtitle: 'Get personalized stats, seasonal recommendations, and compare fragrances side by side.',
    icon: ChartBar,
    iconColor: '#E8A838',
    gradientColors: ['#1a1508', '#2a2510'],
    emoji: '✨',
  },
  {
    title: 'Goals &\nMilestones',
    subtitle: 'Set wear goals, build streaks, and unlock milestones as you explore your collection every day.',
    icon: Target,
    iconColor: '#E8A838',
    gradientColors: ['#1a1508', '#2a2010'],
    emoji: '🎯',
  },
  {
    title: 'Reminders\nThat Nudge',
    subtitle: 'Gentle daily reminders to log your wear so you never break a streak or forget a favorite.',
    icon: Bell,
    iconColor: '#8B5CF6',
    gradientColors: ['#140f1a', '#1f1828'],
    emoji: '🔔',
  },
  {
    title: 'Invite Friends,\nEarn Pro',
    subtitle: 'Share your referral link. Every 5 friends who join unlocks a free month of Scentbuddy Pro.',
    icon: Gift,
    iconColor: '#EC4899',
    gradientColors: ['#1a0f16', '#2a1823'],
    emoji: '🎁',
  },
  {
    title: 'Unlock\nScentbuddy Pro',
    subtitle: 'Unlimited goals, advanced stats, AI recommendations, and more. Go deeper into your fragrance journey.',
    icon: Crown,
    iconColor: '#c49a6c',
    gradientColors: ['#1a1308', '#2a2010'],
    emoji: '👑',
  },
];

const QUIZ_GRADIENT: [string, string] = ['#14100c', '#1e1814'];
const QUIZ_ACCENT = '#c49a6c';

interface OnboardingScreenProps {
  onComplete?: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [phase, setPhase] = useState<'features' | 'quiz'>('features');
  const [quizStep, setQuizStep] = useState(0);
  const [quizSelections, setQuizSelections] = useState<string[][]>(
    QUIZ_STEPS.map(() => [])
  );

  const fadeAnims = useRef(PAGES.map(() => new Animated.Value(0))).current;
  const slideAnims = useRef(PAGES.map(() => new Animated.Value(40))).current;
  const emojiScale = useRef(PAGES.map(() => new Animated.Value(0.3))).current;
  const emojiRotate = useRef(PAGES.map(() => new Animated.Value(-15))).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonSlide = useRef(new Animated.Value(20)).current;

  const quizFade = useRef(new Animated.Value(0)).current;
  const quizSlide = useRef(new Animated.Value(30)).current;

  const animatePage = useCallback((index: number) => {
    fadeAnims[index].setValue(0);
    slideAnims[index].setValue(40);
    emojiScale[index].setValue(0.3);
    emojiRotate[index].setValue(-15);

    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(emojiScale[index], {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
        Animated.timing(emojiRotate[index], {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(fadeAnims[index], {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnims[index], {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    if (index === PAGES.length - 1) {
      Animated.parallel([
        Animated.timing(buttonOpacity, {
          toValue: 1,
          duration: 400,
          delay: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(buttonSlide, {
          toValue: 0,
          duration: 400,
          delay: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [fadeAnims, slideAnims, emojiScale, emojiRotate, buttonOpacity, buttonSlide]);

  const animateQuizStep = useCallback(() => {
    quizFade.setValue(0);
    quizSlide.setValue(30);
    Animated.parallel([
      Animated.timing(quizFade, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(quizSlide, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [quizFade, quizSlide]);

  useEffect(() => {
    animatePage(0);
  }, [animatePage]);

  useEffect(() => {
    if (phase === 'quiz') {
      animateQuizStep();
    }
  }, [phase, quizStep, animateQuizStep]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (page !== currentPage && page >= 0 && page < PAGES.length) {
      setCurrentPage(page);
      animatePage(page);
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  }, [currentPage, animatePage]);

  const goToNext = useCallback(() => {
    if (currentPage < PAGES.length - 1) {
      const nextPage = currentPage + 1;
      scrollRef.current?.scrollTo({ x: nextPage * SCREEN_WIDTH, animated: true });
      setCurrentPage(nextPage);
      animatePage(nextPage);
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  }, [currentPage, animatePage]);

  const startQuiz = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setPhase('quiz');
    setQuizStep(0);
  }, []);

  const saveQuizAndFinish = useCallback(async () => {
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    const results: QuizResults = {
      scentFamilies: quizSelections[0],
      favoriteNotes: quizSelections[1],
      occasions: quizSelections[2],
      priorities: quizSelections[3],
      completedAt: new Date().toISOString(),
    };

    try {
      await AsyncStorage.setItem(ONBOARDING_QUIZ_KEY, JSON.stringify(results));
      console.log('Quiz results saved to AsyncStorage:', results);
    } catch (e) {
      console.log('Failed to save quiz results:', e);
    }

    if (onComplete) {
      onComplete();
    } else {
      try {
        await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      } catch (e) {
        console.log('Failed to save onboarding state:', e);
      }
      router.replace('/');
    }
  }, [quizSelections, router, onComplete]);

  const skipOnboarding = useCallback(async () => {
    if (onComplete) {
      onComplete();
    } else {
      try {
        await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      } catch (e) {
        console.log('Failed to save onboarding state:', e);
      }
      router.replace('/');
    }
  }, [router, onComplete]);

  const toggleQuizSelection = useCallback((label: string) => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setQuizSelections(prev => {
      const updated = [...prev];
      const stepSel = [...updated[quizStep]];
      if (stepSel.includes(label)) {
        updated[quizStep] = stepSel.filter(s => s !== label);
      } else {
        updated[quizStep] = [...stepSel, label];
      }
      return updated;
    });
  }, [quizStep]);

  const quizNext = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (quizStep < QUIZ_STEPS.length - 1) {
      setQuizStep(quizStep + 1);
    } else {
      void saveQuizAndFinish();
    }
  }, [quizStep, saveQuizAndFinish]);

  const quizBack = useCallback(() => {
    if (quizStep > 0) {
      setQuizStep(quizStep - 1);
    } else {
      setPhase('features');
    }
  }, [quizStep]);

  if (phase === 'quiz') {
    const currentQuizStep = QUIZ_STEPS[quizStep];
    const currentSelections = quizSelections[quizStep];
    const progress = ((quizStep + 1) / QUIZ_STEPS.length) * 100;

    return (
      <View style={styles.container}>
        <LinearGradient colors={QUIZ_GRADIENT} style={StyleSheet.absoluteFill} />

        <View style={[styles.quizTopBar, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={quizBack} style={styles.quizBackBtn}>
            <Text style={styles.quizBackText}>
              {quizStep === 0 ? 'Back' : 'Back'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={skipOnboarding} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.quizProgressContainer}>
          <View style={styles.quizProgressTrack}>
            <Animated.View
              style={[
                styles.quizProgressFill,
                { width: `${progress}%` },
              ]}
            />
          </View>
          <Text style={styles.quizStepLabel}>
            {quizStep + 1} / {QUIZ_STEPS.length}
          </Text>
        </View>

        <Animated.View
          style={[
            styles.quizContent,
            {
              opacity: quizFade,
              transform: [{ translateY: quizSlide }],
            },
          ]}
        >
          <Text style={styles.quizTitle}>{currentQuizStep.title}</Text>
          <Text style={styles.quizSubtitle}>{currentQuizStep.subtitle}</Text>

          <ScrollView
            style={styles.quizOptionsScroll}
            contentContainerStyle={styles.quizOptionsContainer}
            showsVerticalScrollIndicator={false}
          >
            {currentQuizStep.options.map((opt) => {
              const selected = currentSelections.includes(opt.label);
              return (
                <TouchableOpacity
                  key={opt.label}
                  style={[
                    styles.quizOption,
                    selected && styles.quizOptionSelected,
                  ]}
                  onPress={() => toggleQuizSelection(opt.label)}
                  activeOpacity={0.7}
                >
                  <View style={styles.quizOptionLeft}>
                    <Text style={styles.quizOptionEmoji}>{opt.emoji}</Text>
                    <View style={styles.quizOptionTextGroup}>
                      <Text style={[styles.quizOptionLabel, selected && styles.quizOptionLabelSelected]}>
                        {opt.label}
                      </Text>
                      {opt.sub ? (
                        <Text style={styles.quizOptionSub}>{opt.sub}</Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={[styles.quizCheckbox, selected && styles.quizCheckboxSelected]}>
                    {selected ? <Check size={14} color="#fff" weight="bold" /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>

        <View style={[styles.quizFooter, { paddingBottom: insets.bottom + 24 }]}>
          <TouchableOpacity
            style={[
              styles.quizContinueBtn,
              currentSelections.length === 0 && styles.quizContinueBtnDisabled,
            ]}
            onPress={quizNext}
            disabled={currentSelections.length === 0}
            activeOpacity={0.8}
          >
            <Text style={styles.quizContinueText}>
              {quizStep === QUIZ_STEPS.length - 1 ? 'Finish & Get Started' : 'Continue'}
            </Text>
            {quizStep === QUIZ_STEPS.length - 1 ? (
              <Sparkle size={18} color="#fff" />
            ) : (
              <ArrowRight size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.skipContainer, { top: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={skipOnboarding}
          style={styles.skipButton}
          testID="onboarding-skip"
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        bounces={false}
      >
        {PAGES.map((page, index) => {
          const IconComponent = page.icon;
          const rotation = emojiRotate[index].interpolate({
            inputRange: [-15, 0],
            outputRange: ['-15deg', '0deg'],
          });

          return (
            <View key={index} style={styles.page}>
              <LinearGradient
                colors={page.gradientColors}
                style={styles.pageGradient}
              >
                <View style={[styles.pageContent, { paddingTop: insets.top + 80 }]}>
                  <Animated.View
                    style={[
                      styles.emojiContainer,
                      {
                        transform: [
                          { scale: emojiScale[index] },
                          { rotate: rotation },
                        ],
                      },
                    ]}
                  >
                    <View style={[styles.emojiCircle, { borderColor: page.iconColor + '30' }]}>
                      <View style={[styles.emojiInner, { backgroundColor: page.iconColor + '15' }]}>
                        <Text style={styles.emoji}>{page.emoji}</Text>
                      </View>
                    </View>
                    <View style={[styles.iconBadge, { backgroundColor: page.iconColor }]}>
                      <IconComponent size={18} color="#fff" />
                    </View>
                  </Animated.View>

                  <Animated.View
                    style={{
                      opacity: fadeAnims[index],
                      transform: [{ translateY: slideAnims[index] }],
                    }}
                  >
                    <Text style={styles.title}>{page.title}</Text>
                    <Text style={styles.subtitle}>{page.subtitle}</Text>
                  </Animated.View>
                </View>

                <View style={styles.decorativeDotsContainer}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.decorativeDot,
                        {
                          backgroundColor: page.iconColor + '08',
                          width: 60 + i * 20,
                          height: 60 + i * 20,
                          left: (i % 2 === 0 ? -20 : SCREEN_WIDTH - 80) + (i * 15),
                          top: 200 + i * 80,
                          borderRadius: (60 + i * 20) / 2,
                        },
                      ]}
                    />
                  ))}
                </View>
              </LinearGradient>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.dotsRow}>
          {PAGES.map((page, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor: index === currentPage ? page.iconColor : 'rgba(255,255,255,0.2)',
                  width: index === currentPage ? 28 : 8,
                },
              ]}
            />
          ))}
        </View>

        {currentPage < PAGES.length - 1 ? (
          <TouchableOpacity
            style={[styles.nextButton, { backgroundColor: PAGES[currentPage].iconColor }]}
            onPress={goToNext}
            activeOpacity={0.8}
            testID="onboarding-next"
          >
            <ArrowRight size={22} color="#fff" />
          </TouchableOpacity>
        ) : (
          <Animated.View style={{ opacity: buttonOpacity, transform: [{ translateY: buttonSlide }] }}>
            <TouchableOpacity
              style={[styles.getStartedButton, { backgroundColor: QUIZ_ACCENT }]}
              onPress={startQuiz}
              activeOpacity={0.8}
              testID="onboarding-start"
            >
              <Sparkle size={20} color="#fff" />
              <Text style={styles.getStartedText}>Take Scent Quiz</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0b08',
  },
  skipContainer: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  skipButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skipText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '600' as const,
  },
  page: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  pageGradient: {
    flex: 1,
  },
  pageContent: {
    flex: 1,
    paddingHorizontal: 32,
    zIndex: 2,
  },
  emojiContainer: {
    alignSelf: 'flex-start',
    marginBottom: 40,
  },
  emojiCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 48,
  },
  iconBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#1a1410',
  },
  title: {
    fontSize: 38,
    fontWeight: '700' as const,
    color: '#fff',
    letterSpacing: -1,
    lineHeight: 46,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 26,
    maxWidth: 300,
  },
  decorativeDotsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  decorativeDot: {
    position: 'absolute',
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  getStartedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 28,
    gap: 10,
  },
  getStartedText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700' as const,
  },

  quizTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  quizBackBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  quizBackText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '600' as const,
  },
  quizProgressContainer: {
    paddingHorizontal: 24,
    paddingTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quizProgressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  quizProgressFill: {
    height: '100%',
    backgroundColor: QUIZ_ACCENT,
    borderRadius: 2,
  },
  quizStepLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '600' as const,
    minWidth: 32,
    textAlign: 'right' as const,
  },
  quizContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  quizTitle: {
    fontSize: 32,
    fontWeight: '700' as const,
    color: '#fff',
    letterSpacing: -0.5,
    lineHeight: 40,
    marginBottom: 8,
  },
  quizSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 24,
  },
  quizOptionsScroll: {
    flex: 1,
  },
  quizOptionsContainer: {
    gap: 10,
    paddingBottom: 20,
  },
  quizOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  quizOptionSelected: {
    backgroundColor: 'rgba(196, 154, 108, 0.12)',
    borderColor: 'rgba(196, 154, 108, 0.4)',
  },
  quizOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  quizOptionEmoji: {
    fontSize: 26,
  },
  quizOptionTextGroup: {
    flex: 1,
  },
  quizOptionLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.8)',
  },
  quizOptionLabelSelected: {
    color: '#fff',
  },
  quizOptionSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  quizCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizCheckboxSelected: {
    backgroundColor: QUIZ_ACCENT,
    borderColor: QUIZ_ACCENT,
  },
  quizFooter: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  quizContinueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: QUIZ_ACCENT,
    borderRadius: 16,
    paddingVertical: 16,
    gap: 8,
  },
  quizContinueBtnDisabled: {
    opacity: 0.4,
  },
  quizContinueText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700' as const,
  },
});

import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/providers/ThemeProvider';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AnimatedSplashProps {
  onFinish: () => void;
}

const FRAGRANCE_WORDS = [
  'Bergamot', 'Patchouli', 'Vetiver', 'Amber', 'Saffron',
  'Cedar', 'Rose', 'Sandalwood', 'Jasmine', 'Vanilla',
  'Tobacco', 'Oud', 'Musk', 'Lavender', 'Tonka',
  'Iris', 'Neroli', 'Incense', 'Cardamom', 'Tuberose',
  'Pepper', 'Orchid', 'Suede', 'Leather', 'Violet',
  'Citrus', 'Honey', 'Fig', 'Cashmere',
];

const NUM_NOTES = 22;

interface SplashNote {
  id: number;
  word: string;
  fontSize: number;
  startX: number;
  startY: number;
  rotation: number;
  opacity: Animated.Value;
  translateX: Animated.Value;
  translateY: Animated.Value;
  scale: Animated.Value;
  delay: number;
  driftX: number;
  driftY: number;
}

function createNotes(): SplashNote[] {
  const shuffled = [...FRAGRANCE_WORDS].sort(() => Math.random() - 0.5);
  return Array.from({ length: NUM_NOTES }).map((_, i) => ({
    id: i,
    word: shuffled[i % shuffled.length],
    fontSize: 9 + Math.random() * 5,
    startX: Math.random() * (SCREEN_WIDTH - 80),
    startY: Math.random() * (SCREEN_HEIGHT - 40),
    rotation: (Math.random() - 0.5) * 40,
    opacity: new Animated.Value(0),
    translateX: new Animated.Value(0),
    translateY: new Animated.Value(0),
    scale: new Animated.Value(0.6),
    delay: i * 60 + Math.random() * 300,
    driftX: (Math.random() - 0.5) * 80,
    driftY: (Math.random() - 0.5) * 60,
  }));
}

export default function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const { colors, themeName } = useTheme();
  const isDark = themeName === 'noir';

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslateY = useRef(new Animated.Value(12)).current;
  const lineWidth = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const scentOpacity = useRef(new Animated.Value(1)).current;
  const buddyOpacity = useRef(new Animated.Value(0)).current;
  const buddyTranslateX = useRef(new Animated.Value(-10)).current;

  const notes = useRef(createNotes()).current;

  const accentColor = colors.accent;
  const textColor = isDark ? '#f0ebe5' : colors.text;
  const subtextColor = isDark ? '#8b7a68' : colors.subtext;
  const noteColor = isDark ? 'rgba(196, 154, 108, 0.12)' : 'rgba(196, 154, 108, 0.10)';
  const noteBorder = isDark ? 'rgba(196, 154, 108, 0.25)' : 'rgba(196, 154, 108, 0.20)';
  const noteTextColor = isDark ? '#c49a6c' : '#a07d54';

  const gradientColors: [string, string, string] = isDark
    ? ['#0d0b08', '#14100a', '#0d0b08']
    : [colors.background, colors.card, colors.background];

  const startAnimations = useCallback(() => {
    const noteAnimations = notes.map((n) =>
      Animated.sequence([
        Animated.delay(n.delay),
        Animated.parallel([
          Animated.timing(n.opacity, {
            toValue: 0.5 + Math.random() * 0.3,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(n.scale, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(n.translateX, {
            toValue: n.driftX,
            duration: 2500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(n.translateY, {
            toValue: n.driftY,
            duration: 2500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    Animated.parallel(noteAnimations).start();

    const logoSequence = Animated.sequence([
      Animated.delay(500),

      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(scentOpacity, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),

      Animated.delay(150),

      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 1,
          useNativeDriver: true,
        }),
        Animated.timing(buddyOpacity, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(buddyTranslateX, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),

      Animated.timing(lineWidth, {
        toValue: 1,
        duration: 400,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),

      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(taglineTranslateY, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),

      Animated.delay(500),

      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 350,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    logoSequence.start(() => {
      onFinish();
    });
  }, [
    logoOpacity, logoScale, taglineOpacity, taglineTranslateY,
    lineWidth, containerOpacity, scentOpacity,
    buddyOpacity, buddyTranslateX, notes, onFinish,
  ]);

  useEffect(() => {
    startAnimations();
  }, [startAnimations]);

  const animatedLineWidth = lineWidth.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 60],
  });

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFill} />

      {notes.map((n) => (
        <Animated.View
          key={n.id}
          style={[
            styles.note,
            {
              left: n.startX,
              top: n.startY,
              backgroundColor: noteColor,
              borderColor: noteBorder,
              opacity: n.opacity,
              transform: [
                { translateX: n.translateX },
                { translateY: n.translateY },
                { rotate: `${n.rotation}deg` },
                { scale: n.scale },
              ],
            },
          ]}
        >
          <Text style={[styles.noteText, { fontSize: n.fontSize, color: noteTextColor }]}>
            {n.word}
          </Text>
        </Animated.View>
      ))}

      <View style={styles.content}>
        <Animated.View
          style={[
            styles.logoRow,
            {
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Animated.Text
            style={[
              styles.logoText,
              {
                color: accentColor,
                opacity: scentOpacity,
              },
            ]}
          >
            Scent
          </Animated.Text>
          <Animated.Text
            style={[
              styles.logoText,
              {
                color: textColor,
                opacity: buddyOpacity,
                transform: [{ translateX: buddyTranslateX }],
              },
            ]}
          >
            Buddy
          </Animated.Text>
        </Animated.View>

        <View style={styles.lineContainer}>
          <Animated.View
            style={[
              styles.accentLine,
              {
                backgroundColor: accentColor,
                width: animatedLineWidth,
              },
            ]}
          />
        </View>

        <Animated.Text
          style={[
            styles.tagline,
            {
              color: subtextColor,
              opacity: taglineOpacity,
              transform: [{ translateY: taglineTranslateY }],
            },
          ]}
        >
          Your personal fragrance companion
        </Animated.Text>
      </View>

      <View style={styles.bottomDecor}>
        <Text style={[styles.versionText, { color: subtextColor + '60' }]}>
          ✦
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    position: 'absolute' as const,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  noteText: {
    fontWeight: '600' as const,
    letterSpacing: 1.5,
  },
  content: {
    alignItems: 'center',
    zIndex: 10,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  logoText: {
    fontSize: 42,
    fontWeight: '700' as const,
    letterSpacing: -1.5,
  },
  lineContainer: {
    height: 3,
    marginTop: 14,
    marginBottom: 14,
    alignItems: 'center',
  },
  accentLine: {
    height: 2.5,
    borderRadius: 2,
  },
  tagline: {
    fontSize: 15,
    fontWeight: '500' as const,
    letterSpacing: 0.3,
  },
  bottomDecor: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 14,
    letterSpacing: 4,
  },
});

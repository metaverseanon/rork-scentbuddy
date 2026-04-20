import React, { useEffect, useRef, useMemo } from 'react';
import { View, Animated, Dimensions, StyleSheet, Easing } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const FRAGRANCE_WORDS = [
  'Bergamot', 'Patchouli', 'Vetiver', 'Amber', 'Saffron',
  'Cedar', 'Rose', 'Sandalwood', 'Jasmine', 'Vanilla',
  'Tobacco', 'Oud', 'Musk', 'Lavender', 'Tonka',
  'Iris', 'Neroli', 'Incense', 'Cardamom', 'Tuberose',
  'Pepper', 'Orchid', 'Suede', 'Leather', 'Violet',
  'Citrus', 'Honey', 'Fig', 'Cashmere',
];

interface FloatingWord {
  id: number;
  word: string;
  fontSize: number;
  startX: number;
  startY: number;
  rotation: number;
  translateX: Animated.Value;
  translateY: Animated.Value;
  opacity: Animated.Value;
  driftDuration: number;
  delay: number;
}

const NUM_WORDS = 28;

export default function FloatingNotes() {
  const animationsStarted = useRef(false);

  const words = useMemo<FloatingWord[]>(() => {
    const result: FloatingWord[] = [];
    const shuffled = [...FRAGRANCE_WORDS].sort(() => Math.random() - 0.5);

    for (let i = 0; i < NUM_WORDS; i++) {
      const word = shuffled[i % shuffled.length];
      const fontSize = 9 + Math.random() * 5;
      const startX = Math.random() * (SCREEN_WIDTH - 80);
      const startY = Math.random() * (SCREEN_HEIGHT - 40);
      const rotation = (Math.random() - 0.5) * 40;
      const driftDuration = 8000 + Math.random() * 7000;
      const delay = i * 80 + Math.random() * 400;

      result.push({
        id: i,
        word,
        fontSize,
        startX,
        startY,
        rotation,
        translateX: new Animated.Value(0),
        translateY: new Animated.Value(0),
        opacity: new Animated.Value(0),
        driftDuration,
        delay,
      });
    }
    return result;
  }, []);

  useEffect(() => {
    if (animationsStarted.current) return;
    animationsStarted.current = true;

    words.forEach((item) => {
      const targetOpacity = 0.45 + Math.random() * 0.35;

      Animated.timing(item.opacity, {
        toValue: targetOpacity,
        duration: 1200 + Math.random() * 800,
        delay: item.delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        startDrift(item, targetOpacity);
      });
    });
  }, [words]);

  const startDrift = (item: FloatingWord, baseOpacity: number) => {
    const drift = () => {
      const nextX = (Math.random() - 0.5) * 100;
      const nextY = (Math.random() - 0.5) * 70;
      const dur = 6000 + Math.random() * 8000;
      const nextOpacity = baseOpacity * (0.6 + Math.random() * 0.6);

      Animated.parallel([
        Animated.timing(item.translateX, {
          toValue: nextX,
          duration: dur,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(item.translateY, {
          toValue: nextY,
          duration: dur,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(item.opacity, {
          toValue: Math.max(0.25, Math.min(nextOpacity, 0.8)),
          duration: dur,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]).start(() => drift());
    };

    const initialX = (Math.random() - 0.5) * 70;
    const initialY = (Math.random() - 0.5) * 50;

    Animated.parallel([
      Animated.timing(item.translateX, {
        toValue: initialX,
        duration: item.driftDuration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(item.translateY, {
        toValue: initialY,
        duration: item.driftDuration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]).start(() => drift());
  };

  return (
    <View style={styles.container} pointerEvents="none">
      {words.map((item) => (
        <Animated.View
          key={item.id}
          style={[
            styles.bubble,
            {
              left: item.startX,
              top: item.startY,
              opacity: item.opacity,
              transform: [
                { translateX: item.translateX },
                { translateY: item.translateY },
                { rotate: `${item.rotation}deg` },
              ],
            },
          ]}
        >
          <Animated.Text
            style={[
              styles.floatingWord,
              { fontSize: item.fontSize },
            ]}
          >
            {item.word}
          </Animated.Text>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 0,
  },
  bubble: {
    position: 'absolute' as const,
    backgroundColor: 'rgba(196, 154, 108, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196, 154, 108, 0.25)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  floatingWord: {
    color: '#c49a6c',
    fontWeight: '600' as const,
    letterSpacing: 1.5,
  },
});

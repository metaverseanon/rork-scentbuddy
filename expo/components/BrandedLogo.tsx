import React from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';

interface BrandedLogoProps {
  fontSize?: number;
  style?: TextStyle;
}

const DARK_THEMES = ['noir'];

export default function BrandedLogo({ fontSize = 36, style }: BrandedLogoProps) {
  const { colors, themeName } = useTheme();
  const isDark = DARK_THEMES.includes(themeName);
  const buddyColor = isDark ? '#ffffff' : '#1a1410';

  return (
    <Text style={[styles.base, { fontSize }, style]}>
      <Text style={{ color: colors.accent }}>Scent</Text>
      <Text style={{ color: buddyColor }}>Buddy</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontWeight: '700' as const,
    letterSpacing: -1,
  },
});

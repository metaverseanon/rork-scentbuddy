import React, { useEffect, useState, useMemo, useCallback } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES } from '@/constants/themes';
import { ThemeName, ThemeColors, CurrencyCode } from '@/lib/types';

const THEME_KEY = 'scentbuddy_theme';
const CURRENCY_KEY = 'scentbuddy_currency';

export const [ThemeProvider, useTheme] = createContextHook(() => {
  const [themeName, setThemeNameState] = useState<ThemeName>('noir');
  const [currency, setCurrencyState] = useState<CurrencyCode>('EUR');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [savedTheme, savedCurrency] = await Promise.all([
          AsyncStorage.getItem(THEME_KEY),
          AsyncStorage.getItem(CURRENCY_KEY),
        ]);
        if (savedTheme && savedTheme in THEMES) {
          setThemeNameState(savedTheme as ThemeName);
        }
        if (savedCurrency) {
          setCurrencyState(savedCurrency as CurrencyCode);
        }
      } catch (e) {
        console.log('Failed to load theme/currency:', e);
      }
      setLoaded(true);
    };
    void load();
  }, []);

  const setThemeName = useCallback(async (name: ThemeName) => {
    setThemeNameState(name);
    await AsyncStorage.setItem(THEME_KEY, name);
  }, []);

  const setCurrency = useCallback(async (code: CurrencyCode) => {
    setCurrencyState(code);
    await AsyncStorage.setItem(CURRENCY_KEY, code);
  }, []);

  const colors = useMemo<ThemeColors>(() => THEMES[themeName], [themeName]);

  return useMemo(() => ({
    themeName,
    setThemeName,
    colors,
    currency,
    setCurrency,
    loaded,
  }), [themeName, setThemeName, colors, currency, setCurrency, loaded]);
});

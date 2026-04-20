import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Tabs, usePathname } from 'expo-router';
import { Sparkle, Drop, Heart, Users, Gear } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';

export default function TabLayout() {
  const { colors, themeName } = useTheme();
  const { session } = useAuth();
  const pathname = usePathname();
  const prevPathname = useRef(pathname);
  const isAuthenticated = !!session;

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      const prevTab = getTabFromPath(prevPathname.current);
      const currentTab = getTabFromPath(pathname);
      prevPathname.current = pathname;

      if (prevTab !== currentTab) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  }, [pathname]);

  const isDark = themeName === 'noir';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.subtext,
        tabBarStyle: isAuthenticated ? {
          backgroundColor: isDark ? '#1a1510' : colors.card,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        } : { display: 'none' as const },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600' as const,
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Sparkle size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: 'Collection',
          tabBarIcon: ({ color, size }) => <Drop size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          title: 'Wishlist',
          tabBarIcon: ({ color, size }) => <Heart size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size }) => <Gear size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

function getTabFromPath(path: string): string {
  if (path === '/' || path.startsWith('/home')) return 'home';
  if (path.startsWith('/collection')) return 'collection';
  if (path.startsWith('/wishlist')) return 'wishlist';
  if (path.startsWith('/community')) return 'community';
  if (path.startsWith('/account')) return 'account';
  return path;
}

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Share,
  Image,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { X, Camera, Trash, Bell, Drop, User, Fire, Target, Trophy, Timer, Recycle, ChartBar, Brain, ShieldCheck, FileText, Question, PaperPlaneTilt, CaretRight, Gift, ArrowCounterClockwise } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { supabase } from '@/lib/supabase';
import { ThemeName, CurrencyCode, CURRENCY_SYMBOLS } from '@/lib/types';
import { AVATAR_EMOJIS } from '@/constants/themes';
import ProfileAvatar from '@/components/ProfileAvatar';
import { useNotifications, sendLocalNotification } from '@/providers/NotificationProvider';
import { useRouter } from 'expo-router';
import { REFERRAL_GOAL } from '@/lib/referrals';

const THEME_OPTIONS: { key: ThemeName; label: string; colors: [string, string] }[] = [
  { key: 'classic', label: 'Classic', colors: ['#f5f0e8', '#c49a6c'] },
  { key: 'noir', label: 'Noir', colors: ['#1a1510', '#c49a6c'] },
  { key: 'rose', label: 'Rosé', colors: ['#fdf6f6', '#c4706c'] },
  { key: 'sage', label: 'Sage', colors: ['#f6faf6', '#6c9c6c'] },
];

const CURRENCIES: CurrencyCode[] = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD', 'SEK'];

const NOTE_CATEGORIES = [
  { family: 'Citrus', emoji: '🍋', notes: ['Bergamot', 'Lemon', 'Orange', 'Grapefruit', 'Lime', 'Neroli', 'Mandarin', 'Yuzu'] },
  { family: 'Floral', emoji: '🌹', notes: ['Rose', 'Jasmine', 'Lily', 'Violet', 'Iris', 'Tuberose', 'Lavender', 'Peony', 'Magnolia'] },
  { family: 'Woody', emoji: '🌲', notes: ['Sandalwood', 'Cedar', 'Vetiver', 'Patchouli', 'Oud', 'Birch', 'Guaiac'] },
  { family: 'Oriental', emoji: '✨', notes: ['Vanilla', 'Amber', 'Tonka', 'Incense', 'Musk', 'Benzoin', 'Myrrh'] },
  { family: 'Fresh', emoji: '💧', notes: ['Aquatic', 'Marine', 'Mint', 'Green Tea', 'Cucumber', 'Ozone'] },
  { family: 'Spicy', emoji: '🌶️', notes: ['Pepper', 'Cardamom', 'Cinnamon', 'Ginger', 'Saffron', 'Clove', 'Nutmeg'] },
  { family: 'Gourmand', emoji: '🍫', notes: ['Caramel', 'Coffee', 'Chocolate', 'Honey', 'Almond', 'Praline', 'Toffee'] },
  { family: 'Leather', emoji: '🪶', notes: ['Leather', 'Tobacco', 'Smoke', 'Suede'] },
];

export default function AccountScreen() {
  const { user, profile, signOut, deleteAccount, updateProfile } = useAuth();
  const { colors, themeName, setThemeName, currency, setCurrency } = useTheme();
  const { settings: notifSettings, updateSetting, permissionGranted, requestPermission } = useNotifications();
  const { isPro, restorePurchases, isRestoring, customerInfo } = useRevenueCat();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPrefsModal, setShowPrefsModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const collectionQuery = useQuery({
    queryKey: ['collection-count', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase.from('user_collections').select('id').eq('user_id', user.id);
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const wearsQuery = useQuery({
    queryKey: ['wears-count', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase.from('wear_diary').select('id').eq('user_id', user.id);
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const wishlistQuery = useQuery({
    queryKey: ['wishlist-count', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase.from('user_wishlists').select('id').eq('user_id', user.id);
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }, [signOut]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? This will remove all your data including your collection, wishlists, wear diary, and profile. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'This is permanent. All your data will be deleted forever.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      await deleteAccount();
                      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } catch (err: any) {
                      console.log('Account deletion error:', err);
                      Alert.alert('Error', err?.message || 'Failed to delete account. Please try again.');
                    } finally {
                      setDeleting(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [deleteAccount]);

  const handleInvite = useCallback(async () => {
    try {
      await Share.share({
        message: 'Check out ScentBuddy \u2014 the best way to track your fragrance collection! https://scentbuddy.io',
      });
    } catch {
      console.log('Share error');
    }
  }, []);

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.authPrompt}>
          <Text style={[styles.authTitle, { color: colors.text }]}>Sign in to access your account</Text>
        </View>
      </View>
    );
  }

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
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.text }]}>Account</Text>

        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.avatarWrapper}>
            <ProfileAvatar
              avatarUrl={profile?.avatar_url}
              avatarEmoji={profile?.avatar_emoji}
              size={80}
              backgroundColor={colors.chip}
            />
          </View>
          <Text style={[styles.displayName, { color: colors.text }]}>
            {profile?.display_name || profile?.username || 'User'}
          </Text>
          <Text style={[styles.usernameText, { color: colors.subtext }]}>
            {profile?.username}
          </Text>
          <Text style={[styles.emailText, { color: colors.subtext }]}>
            {profile?.email || user.email}
          </Text>
          <View style={styles.profileActions}>
            <TouchableOpacity
              style={[styles.editBtn, { borderColor: colors.border }]}
              onPress={() => setShowEditModal(true)}
            >
              <Text style={[styles.editBtnText, { color: colors.text }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.signOutBtn, { borderColor: '#E74C3C' }]}
              onPress={handleSignOut}
            >
              <Text style={styles.signOutBtnText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {!isPro && (
          <TouchableOpacity
            style={[styles.proCard, { backgroundColor: colors.card, borderColor: colors.accent + '40' }]}
            onPress={() => router.push('/paywall' as any)}
            activeOpacity={0.8}
          >
            <View style={[styles.proIcon, { backgroundColor: '#FFF3E0' }]}>
              <Text style={styles.proIconText}>⚡</Text>
            </View>
            <View style={styles.proInfo}>
              <Text style={[styles.proTitle, { color: colors.text }]}>Upgrade to Pro</Text>
              <Text style={[styles.proSubtitle, { color: colors.subtext }]}>
                Unlimited collection · AI picks{'\n'}· Full analytics
              </Text>
            </View>
            <CaretRight size={18} color={colors.accent} />
          </TouchableOpacity>
        )}

        {isPro && (
          <View style={[styles.proActiveCard, { backgroundColor: colors.card, borderColor: colors.accent + '40' }]}>
            <View style={[styles.proIcon, { backgroundColor: colors.accent + '15' }]}>
              <Text style={styles.proIconText}>👑</Text>
            </View>
            <View style={styles.proInfo}>
              <Text style={[styles.proTitle, { color: colors.accent }]}>Scent Buddy Pro</Text>
              <Text style={[styles.proSubtitle, { color: colors.subtext }]}>You have full access to all features</Text>
            </View>
          </View>
        )}

        <View style={[styles.statsRow]}>
          {[
            { label: 'Collection', value: collectionQuery.data?.length ?? 0, color: colors.accent },
            { label: 'Wears', value: wearsQuery.data?.length ?? 0, color: '#5B8DEF' },
            { label: 'Wishlist', value: wishlistQuery.data?.length ?? 0, color: '#E74C3C' },
          ].map((stat, i) => (
            <View key={i} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.subtext }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Note Preferences</Text>
          <Text style={[styles.sectionSub, { color: colors.subtext }]}>
            Set your favorite notes for better recommendations
          </Text>
          {profile?.favorite_note ? (
            <View style={styles.currentPrefsRow}>
              {profile.favorite_note.split(',').slice(0, 5).map((note, i) => (
                <View key={i} style={[styles.currentPrefChip, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '30' }]}>
                  <Text style={[styles.currentPrefText, { color: colors.accent }]}>{note.trim()}</Text>
                </View>
              ))}
              {profile.favorite_note.split(',').length > 5 && (
                <Text style={[styles.morePrefsText, { color: colors.subtext }]}>+{profile.favorite_note.split(',').length - 5} more</Text>
              )}
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.prefBtn, { borderColor: colors.border }]}
            onPress={() => setShowPrefsModal(true)}
          >
            <Text style={[styles.prefBtnText, { color: colors.accent }]}>Edit Preferences</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Theme</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.themeOption, themeName === t.key && styles.themeOptionActive]}
                onPress={() => {
                  void setThemeName(t.key);
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <View style={[styles.themeSwatch]}>
                  <View style={[styles.themeSwatchHalf, { backgroundColor: t.colors[0], borderTopLeftRadius: 10, borderBottomLeftRadius: 10 }]} />
                  <View style={[styles.themeSwatchHalf, { backgroundColor: t.colors[1], borderTopRightRadius: 10, borderBottomRightRadius: 10 }]} />
                </View>
                <Text style={[styles.themeLabel, { color: themeName === t.key ? colors.accent : colors.subtext }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Currency</Text>
          <View style={styles.currencyGrid}>
            {CURRENCIES.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.currencyChip, {
                  backgroundColor: currency === c ? colors.accent + '15' : colors.chip,
                  borderColor: currency === c ? colors.accent : colors.border,
                }]}
                onPress={() => {
                  void setCurrency(c);
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text style={[styles.currencySymbol, { color: currency === c ? colors.accent : colors.text }]}>
                  {CURRENCY_SYMBOLS[c]}
                </Text>
                <Text style={[styles.currencyCode, { color: currency === c ? colors.accent : colors.subtext }]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Notifications</Text>
          <Text style={[styles.sectionSub, { color: colors.subtext }]}>
            Control what notifications you receive
          </Text>
          {!permissionGranted && (
            <TouchableOpacity
              style={[styles.enableNotifBtn, { backgroundColor: colors.accent }]}
              onPress={() => void requestPermission()}
            >
              <Bell size={16} color="#fff" />
              <Text style={styles.enableNotifBtnText}>Enable Notifications</Text>
            </TouchableOpacity>
          )}
          <NotifToggle
            label="Sniff Alerts"
            subtitle="When someone sniffs your perfume"
            icon={<Drop size={22} color={colors.accent} weight="fill" />}
            enabled={notifSettings.sniffAlerts}
            onToggle={(v) => void updateSetting('sniffAlerts', v)}
            colors={colors}
          />
          <NotifToggle
            label="Follow Alerts"
            subtitle="When someone follows you"
            icon={<User size={22} color={colors.accent} weight="fill" />}
            enabled={notifSettings.followAlerts}
            onToggle={(v) => void updateSetting('followAlerts', v)}
            colors={colors}
          />
          <NotifToggle
            label="Diary Reminder"
            subtitle="Daily at 1:00 PM to log your wear"
            icon={<Fire size={22} color={colors.accent} weight="fill" />}
            enabled={notifSettings.diaryReminder}
            onToggle={(v) => void updateSetting('diaryReminder', v)}
            colors={colors}
          />
          <NotifToggle
            label="Goal Reminders"
            subtitle="Progress updates on your fragrance goals"
            icon={<Target size={22} color={colors.accent} weight="fill" />}
            enabled={notifSettings.goalReminders}
            onToggle={(v) => void updateSetting('goalReminders', v)}
            colors={colors}
          />
          <NotifToggle
            label="Collection Milestones"
            subtitle="Celebrate when you hit collection milestones"
            icon={<Trophy size={22} color={colors.accent} weight="fill" />}
            enabled={notifSettings.collectionMilestones}
            onToggle={(v) => void updateSetting('collectionMilestones', v)}
            colors={colors}
          />
          <NotifToggle
            label="Streak Reminders"
            subtitle="Morning nudge to keep your streak alive"
            icon={<Timer size={22} color={colors.accent} weight="fill" />}
            enabled={notifSettings.streakReminders}
            onToggle={(v) => void updateSetting('streakReminders', v)}
            colors={colors}
          />
          <NotifToggle
            label="Forgotten Bottles"
            subtitle="Rediscover fragrances you haven't worn lately"
            icon={<Recycle size={22} color={colors.accent} weight="fill" />}
            enabled={notifSettings.forgottenBottles}
            onToggle={(v) => void updateSetting('forgottenBottles', v)}
            colors={colors}
          />
          <NotifToggle
            label="Weekly Recap"
            subtitle="Sunday summary of your weekly fragrance activity"
            icon={<ChartBar size={22} color={colors.accent} weight="fill" />}
            enabled={notifSettings.weeklyRecap}
            onToggle={(v) => void updateSetting('weeklyRecap', v)}
            colors={colors}
          />
          <NotifToggle
            label="Quiz Follow-ups"
            subtitle="Recommendations based on your scent profile"
            icon={<Brain size={22} color={colors.accent} weight="fill" />}
            enabled={notifSettings.quizFollowUps}
            onToggle={(v) => void updateSetting('quizFollowUps', v)}
            colors={colors}
          />
          {permissionGranted && (
            <TouchableOpacity
              style={[styles.testNotifBtn, { borderColor: colors.border }]}
              onPress={() => {
                void sendLocalNotification(
                  'ScentBuddy Test',
                  'Push notifications are working! 🎉',
                  { type: 'test' }
                );
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Alert.alert('Test Sent', 'You should see a notification appear shortly.');
              }}
            >
              <Text style={[styles.testNotifBtnText, { color: colors.subtext }]}>Send Test Notification</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.referralCard, { backgroundColor: colors.card, borderColor: colors.accent + '40' }]}
          onPress={() => router.push('/referrals' as any)}
          activeOpacity={0.8}
        >
          <View style={[styles.referralIconWrap, { backgroundColor: colors.accent + '15' }]}>
            <Gift size={28} color={colors.accent} weight="fill" />
          </View>
          <View style={styles.referralCardInfo}>
            <Text style={[styles.referralCardTitle, { color: colors.text }]}>Referral Program</Text>
            <Text style={[styles.referralCardSub, { color: colors.subtext }]}>
              Invite {REFERRAL_GOAL} friends & get Pro free!
            </Text>
          </View>
          <CaretRight size={18} color={colors.subtext} />
        </TouchableOpacity>

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Invite a Friend</Text>
          <Text style={[styles.sectionSub, { color: colors.subtext }]}>
            Share <Text style={{ color: colors.accent }}>Scent</Text><Text style={{ color: colors.text }}>Buddy</Text> with fellow fragrance lovers
          </Text>
          <TouchableOpacity style={[styles.prefBtn, { borderColor: colors.border }]} onPress={handleInvite}>
            <Text style={[styles.prefBtnText, { color: colors.text }]}>Send Invite</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Support & Legal</Text>
          <SupportRow
            icon={<Question size={20} color={colors.accent} weight="fill" />}
            label="Help Center"
            onPress={() => void Linking.openURL('https://scentbuddy.io/help')}
            colors={colors}
          />
          <SupportRow
            icon={<PaperPlaneTilt size={20} color={colors.accent} weight="fill" />}
            label="Send Feedback"
            onPress={() => setShowFeedbackModal(true)}
            colors={colors}
          />
          <SupportRow
            icon={<ShieldCheck size={20} color={colors.accent} weight="fill" />}
            label="Privacy Policy"
            onPress={() => void Linking.openURL('https://scentbuddy.io/privacy')}
            colors={colors}
          />
          <SupportRow
            icon={<FileText size={20} color={colors.accent} weight="fill" />}
            label="Terms of Use"
            onPress={() => void Linking.openURL('https://scentbuddy.io/terms')}
            colors={colors}
          />
          <SupportRow
            icon={<ArrowCounterClockwise size={20} color={colors.accent} weight="fill" />}
            label={isRestoring ? 'Restoring...' : 'Restore Purchases'}
            onPress={() => {
              void restorePurchases().then(() => {
                Alert.alert('Done', isPro ? 'Your Pro subscription has been restored!' : 'No active subscription found.');
              }).catch(() => {
                Alert.alert('Error', 'Could not restore purchases.');
              });
            }}
            colors={colors}
          />
          <SupportRow
            icon={<Trash size={20} color="#E74C3C" weight="fill" />}
            label={deleting ? 'Deleting Account...' : 'Delete Account'}
            onPress={handleDeleteAccount}
            colors={colors}
            isLast
            destructive
          />
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.versionText, { color: colors.subtext }]}>
            <Text style={{ color: colors.accent }}>Scent</Text><Text style={{ color: colors.text }}>Buddy</Text> v1.0 · 74K+ fragrances · Cloud synced
          </Text>
        </View>
      </ScrollView>

      <EditProfileModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        profile={profile}
        updateProfile={updateProfile}
        userId={user.id}
      />

      <NotePreferencesModal
        visible={showPrefsModal}
        onClose={() => setShowPrefsModal(false)}
        currentNotes={profile?.favorite_note || ''}
        updateProfile={updateProfile}
      />

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        userEmail={profile?.email || user.email || ''}
        userName={profile?.display_name || profile?.username || ''}
      />
    </View>
  );
}

function NotePreferencesModal({ visible, onClose, currentNotes, updateProfile }: {
  visible: boolean;
  onClose: () => void;
  currentNotes: string;
  updateProfile: (updates: any) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);

  React.useEffect(() => {
    if (currentNotes) {
      setSelected(new Set(currentNotes.split(',').map(n => n.trim()).filter(Boolean)));
    } else {
      setSelected(new Set());
    }
  }, [currentNotes]);

  const toggleNote = useCallback((note: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(note)) {
        next.delete(note);
      } else {
        next.add(note);
      }
      return next;
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const toggleFamily = useCallback((family: string) => {
    setExpandedFamily(prev => prev === family ? null : family);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ favorite_note: Array.from(selected).join(',') });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save preferences');
    }
    setSaving(false);
  };

  const familySelectedCount = useCallback((familyNotes: string[]) => {
    return familyNotes.filter(n => selected.has(n)).length;
  }, [selected]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Note Preferences</Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.prefsContent} showsVerticalScrollIndicator={false}>
          <Text style={[styles.prefsHint, { color: colors.subtext }]}>
            Select the notes you love — this helps us recommend fragrances you'll enjoy.
          </Text>

          {selected.size > 0 && (
            <View style={styles.selectedSummary}>
              <Text style={[styles.selectedCount, { color: colors.accent }]}>
                {selected.size} note{selected.size !== 1 ? 's' : ''} selected
              </Text>
              <TouchableOpacity onPress={() => { setSelected(new Set()); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                <Text style={[styles.clearAllText, { color: colors.subtext }]}>Clear all</Text>
              </TouchableOpacity>
            </View>
          )}

          {NOTE_CATEGORIES.map(cat => {
            const count = familySelectedCount(cat.notes);
            const isExpanded = expandedFamily === cat.family;
            return (
              <View key={cat.family} style={[styles.familyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.familyHeader}
                  onPress={() => toggleFamily(cat.family)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.familyEmoji}>{cat.emoji}</Text>
                  <View style={styles.familyInfo}>
                    <Text style={[styles.familyName, { color: colors.text }]}>{cat.family}</Text>
                    {count > 0 && (
                      <View style={[styles.familyBadge, { backgroundColor: colors.accent + '20' }]}>
                        <Text style={[styles.familyBadgeText, { color: colors.accent }]}>{count}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.familyChevron, { color: colors.subtext }]}>{isExpanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {isExpanded && (
                  <View style={styles.notesGrid}>
                    {cat.notes.map(note => {
                      const isSelected = selected.has(note);
                      return (
                        <TouchableOpacity
                          key={note}
                          style={[styles.noteChip, {
                            backgroundColor: isSelected ? colors.accent + '18' : colors.chip,
                            borderColor: isSelected ? colors.accent : colors.border,
                          }]}
                          onPress={() => toggleNote(note)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.noteChipText, { color: isSelected ? colors.accent : colors.text }]}>
                            {note}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        <View style={[styles.prefsFooter, { borderTopColor: colors.border }]}>
          <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={onClose}>
            <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.accent }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save Preferences</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function FeedbackModal({ visible, onClose, userEmail, userName }: {
  visible: boolean;
  onClose: () => void;
  userEmail: string;
  userName: string;
}) {
  const { colors } = useTheme();
  const [subject, setSubject] = useState('General Feedback');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const SUBJECT_OPTIONS = ['General Feedback', 'Bug Report', 'Feature Request', 'Other'];

  const handleSend = useCallback(async () => {
    if (!message.trim()) {
      Alert.alert('Missing Message', 'Please write your feedback before sending.');
      return;
    }
    setSending(true);
    try {
      const body = `From: ${userName} (${userEmail})\n\nSubject: ${subject}\n\n${message.trim()}`;
      const mailtoUrl = `mailto:info@scentbuddy.io?subject=${encodeURIComponent('ScentBuddy - ' + subject)}&body=${encodeURIComponent(body)}`;
      await Linking.openURL(mailtoUrl);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMessage('');
      setSubject('General Feedback');
      onClose();
    } catch {
      Alert.alert('Error', 'Could not open email client. Please email us directly at info@scentbuddy.io');
    } finally {
      setSending(false);
    }
  }, [message, subject, userName, userEmail, onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Send Feedback</Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={[styles.feedbackHint, { color: colors.subtext }]}>
            We'd love to hear from you! Your feedback helps us improve ScentBuddy.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.accent }]}>Category</Text>
            <View style={styles.subjectGrid}>
              {SUBJECT_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.subjectChip, {
                    backgroundColor: subject === opt ? colors.accent + '15' : colors.chip,
                    borderColor: subject === opt ? colors.accent : colors.border,
                  }]}
                  onPress={() => {
                    setSubject(opt);
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[styles.subjectChipText, { color: subject === opt ? colors.accent : colors.text }]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.accent }]}>Your Message</Text>
            <TextInput
              style={[styles.fieldInput, {
                backgroundColor: colors.chip,
                color: colors.text,
                borderColor: colors.border,
                height: 160,
                textAlignVertical: 'top',
              }]}
              value={message}
              onChangeText={setMessage}
              multiline
              placeholder="Tell us what's on your mind..."
              placeholderTextColor={colors.subtext}
            />
          </View>

          <Text style={[styles.feedbackDisclaimer, { color: colors.subtext }]}>
            This will open your email app with the feedback pre-filled and send it to info@scentbuddy.io
          </Text>

          <View style={styles.editActions}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={onClose}
            >
              <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.accent }]}
              onPress={handleSend}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Send Feedback</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function SupportRow({ icon, label, onPress, colors, isLast = false, destructive = false }: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  colors: any;
  isLast?: boolean;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.supportRow, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={styles.supportRowIcon}>{icon}</View>
      <Text style={[styles.supportRowLabel, { color: destructive ? '#E74C3C' : colors.text }]}>{label}</Text>
      <CaretRight size={16} color={destructive ? '#E74C3C' : colors.subtext} />
    </TouchableOpacity>
  );
}

function NotifToggle({ label, subtitle, icon, enabled, onToggle, colors }: {
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  colors: any;
}) {
  return (
    <View style={[styles.notifToggleRow, { borderBottomColor: colors.border }]}>
      <View style={styles.notifToggleIconWrap}>{icon}</View>
      <View style={styles.notifToggleInfo}>
        <Text style={[styles.notifToggleLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.notifToggleSub, { color: colors.subtext }]}>{subtitle}</Text>
      </View>
      <TouchableOpacity
        style={[styles.notifToggleBtn, { backgroundColor: enabled ? colors.accent : colors.chip }]}
        onPress={() => {
          onToggle(!enabled);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        activeOpacity={0.8}
      >
        <View style={[styles.notifToggleKnob, { alignSelf: enabled ? 'flex-end' as const : 'flex-start' as const }]} />
      </TouchableOpacity>
    </View>
  );
}

async function uploadAvatarImage(userId: string, uri: string): Promise<string> {
  console.log('Starting avatar upload for user:', userId);

  const response = await fetch(uri);
  const blob = await response.blob();

  const fileExt = 'jpg';
  const filePath = `${userId}/avatar.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    console.log('Upload error:', uploadError);
    throw new Error('Failed to upload image: ' + uploadError.message);
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl + '?t=' + Date.now();
  console.log('Avatar uploaded, public URL:', publicUrl);
  return publicUrl;
}

function EditProfileModal({ visible, onClose, profile, updateProfile, userId }: {
  visible: boolean;
  onClose: () => void;
  profile: any;
  updateProfile: (updates: any) => Promise<void>;
  userId: string;
}) {
  const { colors } = useTheme();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [favoriteNote, setFavoriteNote] = useState(profile?.favorite_note || '');
  const [avatarEmoji, setAvatarEmoji] = useState(profile?.avatar_emoji || '🧴');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null);
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  React.useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
      setFavoriteNote(profile.favorite_note || '');
      setAvatarEmoji(profile.avatar_emoji || '🧴');
      setAvatarUrl(profile.avatar_url || null);
      setLocalImageUri(null);
    }
  }, [profile]);

  const pickImage = useCallback(async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photo library to set a profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        console.log('Image picked:', result.assets[0].uri);
        setLocalImageUri(result.assets[0].uri);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (err) {
      console.log('Image picker error:', err);
      Alert.alert('Error', 'Could not open image picker');
    }
  }, []);

  const takePhoto = useCallback(async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission needed', 'Please allow camera access to take a profile picture.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        console.log('Photo taken:', result.assets[0].uri);
        setLocalImageUri(result.assets[0].uri);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (err) {
      console.log('Camera error:', err);
      Alert.alert('Error', 'Could not open camera');
    }
  }, []);

  const handlePickImageOption = useCallback(() => {
    if (Platform.OS === 'web') {
      void pickImage();
      return;
    }

    Alert.alert('Profile Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: () => void takePhoto() },
      { text: 'Choose from Library', onPress: () => void pickImage() },
      ...(avatarUrl || localImageUri
        ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: () => { setLocalImageUri(null); setAvatarUrl(null); } }]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [pickImage, takePhoto, avatarUrl, localImageUri]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let finalAvatarUrl = avatarUrl;

      if (localImageUri) {
        setUploading(true);
        try {
          finalAvatarUrl = await uploadAvatarImage(userId, localImageUri);
        } catch (uploadErr: any) {
          console.log('Avatar upload failed:', uploadErr);
          Alert.alert('Upload failed', 'Profile saved without image. ' + (uploadErr?.message || ''));
        }
        setUploading(false);
      }

      await updateProfile({
        display_name: displayName,
        username,
        bio,
        favorite_note: favoriteNote,
        avatar_emoji: avatarEmoji,
        avatar_url: finalAvatarUrl,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save');
    }
    setSaving(false);
  };

  const displayImageUri = localImageUri || avatarUrl;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Profile</Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={handlePickImageOption} activeOpacity={0.8}>
              <View style={styles.avatarEditContainer}>
                {displayImageUri ? (
                  <Image source={{ uri: displayImageUri }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatarLarge, { backgroundColor: colors.chip }]}>
                    <Text style={styles.avatarLargeEmoji}>{avatarEmoji}</Text>
                  </View>
                )}
                <View style={[styles.cameraBadge, { backgroundColor: colors.accent }]}>
                  <Camera size={16} color="#fff" />
                </View>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePickImageOption}>
              <Text style={[styles.changePhotoText, { color: colors.accent }]}>
                {displayImageUri ? 'Change Photo' : 'Add Photo'}
              </Text>
            </TouchableOpacity>

            {displayImageUri && (
              <TouchableOpacity
                style={styles.removePhotoBtn}
                onPress={() => {
                  setLocalImageUri(null);
                  setAvatarUrl(null);
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Trash size={14} color="#E74C3C" />
                <Text style={styles.removePhotoText}>Remove Photo</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.emojiPickerSection}>
            <Text style={[styles.emojiHint, { color: colors.subtext }]}>
              {displayImageUri ? 'Fallback emoji (shown if no photo):' : 'Or pick an emoji avatar:'}
            </Text>
            <View style={styles.emojiGrid}>
              {AVATAR_EMOJIS.map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.emojiOption, {
                    backgroundColor: avatarEmoji === emoji ? colors.accent + '20' : colors.chip,
                    borderColor: avatarEmoji === emoji ? colors.accent : colors.border,
                  }]}
                  onPress={() => setAvatarEmoji(emoji)}
                >
                  <Text style={styles.emojiOptionText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.accent }]}>Display Name</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border }]}
              value={displayName}
              onChangeText={setDisplayName}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.accent }]}>Username</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border }]}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.accent }]}>Bio</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border, height: 80, textAlignVertical: 'top' }]}
              value={bio}
              onChangeText={setBio}
              multiline
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.accent }]}>Favorite Note</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border }]}
              value={favoriteNote}
              onChangeText={setFavoriteNote}
            />
          </View>

          <View style={styles.editActions}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={onClose}
            >
              <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.accent }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <View style={styles.savingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  {uploading && <Text style={styles.uploadingText}>Uploading...</Text>}
                </View>
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
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
  title: { fontSize: 28, fontWeight: '700' as const, paddingHorizontal: 20, marginBottom: 20 },
  profileCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarWrapper: {
    marginBottom: 12,
  },
  displayName: { fontSize: 22, fontWeight: '700' as const },
  usernameText: { fontSize: 15, marginTop: 2 },
  emailText: { fontSize: 14, marginTop: 4 },
  profileActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  editBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  editBtnText: { fontSize: 15, fontWeight: '600' as const },
  signOutBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  signOutBtnText: { fontSize: 15, fontWeight: '600' as const, color: '#E74C3C' },
  proCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  proActiveCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  proIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proIconText: { fontSize: 22 },
  proInfo: { flex: 1 },
  proTitle: { fontSize: 16, fontWeight: '700' as const },
  proSubtitle: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  proPrice: { fontSize: 15, fontWeight: '700' as const },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  statValue: { fontSize: 24, fontWeight: '700' as const },
  statLabel: { fontSize: 12, marginTop: 2 },
  sectionCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700' as const, marginBottom: 4 },
  sectionSub: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  prefBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  prefBtnText: { fontSize: 14, fontWeight: '600' as const },
  themeRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  themeOption: { alignItems: 'center' },
  themeOptionActive: {},
  themeSwatch: {
    width: 56,
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeSwatchHalf: { flex: 1 },
  themeLabel: { fontSize: 12, marginTop: 6, fontWeight: '600' as const },
  currencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  currencyChip: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    alignItems: 'center',
  },
  currencySymbol: { fontSize: 15, fontWeight: '700' as const },
  currencyCode: { fontSize: 13 },
  versionText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  authPrompt: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  authTitle: { fontSize: 18, textAlign: 'center' },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 20, fontWeight: '700' as const },
  modalContent: { padding: 20, paddingBottom: 40 },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarEditContainer: {
    position: 'relative' as const,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e0d8ce',
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLargeEmoji: { fontSize: 48 },
  cameraBadge: {
    position: 'absolute' as const,
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  changePhotoText: {
    fontSize: 15,
    fontWeight: '600' as const,
    marginTop: 10,
  },
  removePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  removePhotoText: {
    fontSize: 13,
    color: '#E74C3C',
    fontWeight: '500' as const,
  },
  emojiPickerSection: { alignItems: 'center', marginBottom: 24 },
  emojiHint: { fontSize: 14, marginBottom: 10 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emojiOptionText: { fontSize: 22 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '700' as const, marginBottom: 6 },
  fieldInput: { borderRadius: 12, padding: 12, fontSize: 15, borderWidth: 1 },
  editActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  cancelBtnText: { fontSize: 16, fontWeight: '600' as const },
  saveBtn: { flex: 1, padding: 14, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' as const },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadingText: { color: '#fff', fontSize: 13 },
  currentPrefsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  currentPrefChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  currentPrefText: { fontSize: 12, fontWeight: '600' as const },
  morePrefsText: { fontSize: 12, alignSelf: 'center', marginLeft: 4 },
  prefsContent: { padding: 20, paddingBottom: 20 },
  prefsHint: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  selectedSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  selectedCount: { fontSize: 15, fontWeight: '700' as const },
  clearAllText: { fontSize: 14, fontWeight: '500' as const },
  familyCard: { borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' as const },
  familyHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  familyEmoji: { fontSize: 24 },
  familyInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  familyName: { fontSize: 16, fontWeight: '600' as const },
  familyBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  familyBadgeText: { fontSize: 12, fontWeight: '700' as const },
  familyChevron: { fontSize: 12 },
  notesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  noteChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  noteChipText: { fontSize: 14, fontWeight: '500' as const },
  prefsFooter: { flexDirection: 'row', padding: 20, gap: 12, borderTopWidth: 1 },
  enableNotifBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
  },
  enableNotifBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' as const },
  notifToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  notifToggleIconWrap: { width: 28, alignItems: 'center' as const, justifyContent: 'center' as const },
  notifToggleInfo: { flex: 1 },
  notifToggleLabel: { fontSize: 15, fontWeight: '600' as const },
  notifToggleSub: { fontSize: 12, marginTop: 2 },
  notifToggleBtn: {
    width: 52,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifToggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  testNotifBtn: {
    alignItems: 'center' as const,
    paddingVertical: 12,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  testNotifBtnText: {
    fontSize: 13,
    fontWeight: '500' as const,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  supportRowIcon: {
    width: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  supportRowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500' as const,
  },
  feedbackHint: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  feedbackDisclaimer: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 20,
    textAlign: 'center' as const,
  },
  subjectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  subjectChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  subjectChipText: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  referralCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    gap: 14,
  },
  referralIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  referralCardInfo: {
    flex: 1,
  },
  referralCardTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  referralCardSub: {
    fontSize: 13,
    marginTop: 2,
  },
});

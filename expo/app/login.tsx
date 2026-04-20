import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeSlash, Check, X, WarningCircle } from 'phosphor-react-native';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { supabase } from '@/lib/supabase';
import FloatingNotes from '@/components/FloatingNotes';
import BrandedLogo from '@/components/BrandedLogo';

interface PasswordRule {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number', test: (pw) => /[0-9]/.test(pw) },
];

export default function LoginScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [referralCode, setReferralCode] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const usernameTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(40)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(60)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;

  const { signIn, signUp, signInLoading, signUpLoading } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    Animated.stagger(200, [
      Animated.parallel([
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(headerSlide, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(formSlide, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [headerOpacity, headerSlide, formOpacity, formSlide]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isSignUp ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [isSignUp, fadeAnim]);

  const checkUsername = useCallback((value: string) => {
    if (usernameTimeout.current) clearTimeout(usernameTimeout.current);
    if (!value.trim() || value.trim().length < 3) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    usernameTimeout.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', value.trim().toLowerCase())
          .maybeSingle();
        if (error) {
          console.log('Username check error:', error);
          setUsernameStatus('idle');
          return;
        }
        setUsernameStatus(data ? 'taken' : 'available');
      } catch (err) {
        console.log('Username check failed:', err);
        setUsernameStatus('idle');
      }
    }, 500);
  }, []);

  const handleUsernameChange = useCallback((value: string) => {
    const sanitized = value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    setUsername(sanitized);
    checkUsername(sanitized);
  }, [checkUsername]);

  const allPasswordRulesPassed = PASSWORD_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (isSignUp) {
      if (!username.trim()) {
        Alert.alert('Error', 'Please enter a username');
        return;
      }
      if (!displayName.trim()) {
        Alert.alert('Error', 'Please enter your name');
        return;
      }
      if (!allPasswordRulesPassed) {
        Alert.alert('Error', 'Password does not meet all requirements');
        return;
      }
      if (!passwordsMatch) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }
      if (usernameStatus === 'taken') {
        Alert.alert('Error', 'This username is already taken');
        return;
      }
      if (usernameStatus === 'checking') {
        Alert.alert('Please wait', 'Checking username availability...');
        return;
      }
    }
    try {
      if (isSignUp) {
        await signUp({
          email: email.trim(),
          password,
          username: username.trim(),
          displayName: displayName.trim(),
          referralCode: referralCode.trim() || undefined,
        });
      } else {
        await signIn({ email: email.trim(), password });
      }
      router.replace('/(tabs)/(home)' as any);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Something went wrong');
    }
  };

  const isLoading = signInLoading || signUpLoading;

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: 'https://scentbuddy.io/reset-password',
      });
      if (error) throw error;
      Alert.alert('Check your email', 'We sent you a password reset link. Please check your inbox.', [
        { text: 'OK', onPress: () => setShowForgotPassword(false) },
      ]);
      setForgotEmail('');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send reset email');
    } finally {
      setForgotLoading(false);
    }
  };

  const canSubmitSignUp =
    email.trim() &&
    password.trim() &&
    username.trim() &&
    displayName.trim() &&
    allPasswordRulesPassed &&
    passwordsMatch &&
    usernameStatus !== 'taken' &&
    usernameStatus !== 'checking';

  const canSubmitSignIn = email.trim() && password.trim();
  const canSubmit = isSignUp ? canSubmitSignUp : canSubmitSignIn;

  const renderUsernameIndicator = () => {
    if (usernameStatus === 'idle') return null;
    if (usernameStatus === 'checking') {
      return (
        <View style={styles.usernameStatusRow}>
          <ActivityIndicator size="small" color={colors.subtext} />
          <Text style={[styles.usernameStatusText, { color: colors.subtext }]}>Checking...</Text>
        </View>
      );
    }
    if (usernameStatus === 'available') {
      return (
        <View style={styles.usernameStatusRow}>
          <Check size={14} color="#34c759" />
          <Text style={[styles.usernameStatusText, { color: '#34c759' }]}>Available</Text>
        </View>
      );
    }
    return (
      <View style={styles.usernameStatusRow}>
        <WarningCircle size={14} color="#ff3b30" />
        <Text style={[styles.usernameStatusText, { color: '#ff3b30' }]}>Username taken</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <FloatingNotes />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.header, { opacity: headerOpacity, transform: [{ translateY: headerSlide }] }]}>
            <View style={[styles.headerBackdrop, { backgroundColor: colors.background }]}>
              <BrandedLogo fontSize={36} />
              <Text style={[styles.subtitle, { color: colors.subtext }]}>
                Your fragrance journey starts here
              </Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: formOpacity, transform: [{ translateY: formSlide }] }]}>
            <Text style={[styles.formTitle, { color: colors.text }]}>
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </Text>

            {isSignUp && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.subtext }]}>Name</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border }]}
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Your display name"
                    placeholderTextColor={colors.subtext}
                    autoCapitalize="words"
                    testID="displayname-input"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.subtext }]}>Username</Text>
                  <View style={styles.inputWithIcon}>
                    <TextInput
                      style={[
                        styles.input,
                        styles.inputFull,
                        {
                          backgroundColor: colors.chip,
                          color: colors.text,
                          borderColor: usernameStatus === 'taken' ? '#ff3b30' : usernameStatus === 'available' ? '#34c759' : colors.border,
                        },
                      ]}
                      value={username}
                      onChangeText={handleUsernameChange}
                      placeholder="choose_a_username"
                      placeholderTextColor={colors.subtext}
                      autoCapitalize="none"
                      autoCorrect={false}
                      testID="username-input"
                    />
                  </View>
                  {renderUsernameIndicator()}
                </View>
              </>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.subtext }]}>Email</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border }]}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={colors.subtext}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                testID="email-input"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.subtext }]}>Password</Text>
              <View style={styles.inputWithIcon}>
                <TextInput
                  style={[styles.input, styles.inputFull, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border, paddingRight: 48 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.subtext}
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  testID="password-input"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {showPassword ? (
                    <EyeSlash size={20} color={colors.subtext} />
                  ) : (
                    <Eye size={20} color={colors.subtext} />
                  )}
                </TouchableOpacity>
              </View>

              {isSignUp && password.length > 0 && (
                <View style={styles.rulesContainer}>
                  {PASSWORD_RULES.map((rule) => {
                    const passed = rule.test(password);
                    return (
                      <View key={rule.label} style={styles.ruleRow}>
                        {passed ? (
                          <Check size={13} color="#34c759" />
                        ) : (
                          <X size={13} color={colors.subtext} />
                        )}
                        <Text
                          style={[
                            styles.ruleText,
                            { color: passed ? '#34c759' : colors.subtext },
                          ]}
                        >
                          {rule.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {isSignUp && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.subtext }]}>Referral Code (Optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border }]}
                  value={referralCode}
                  onChangeText={(v) => setReferralCode(v.toUpperCase())}
                  placeholder="e.g. JOHN-A1B2"
                  placeholderTextColor={colors.subtext}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  testID="referral-code-input"
                />
                <Text style={[styles.ruleText, { color: colors.subtext, marginTop: 4 }]}>
                  Have a friend's code? Enter it to help them earn Pro!
                </Text>
              </View>
            )}

            {isSignUp && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.subtext }]}>Confirm Password</Text>
                <View style={styles.inputWithIcon}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.inputFull,
                      {
                        backgroundColor: colors.chip,
                        color: colors.text,
                        borderColor: confirmPassword.length > 0
                          ? (passwordsMatch ? '#34c759' : '#ff3b30')
                          : colors.border,
                        paddingRight: 48,
                      },
                    ]}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="••••••••"
                    placeholderTextColor={colors.subtext}
                    secureTextEntry={!showConfirmPassword}
                    textContentType="password"
                    testID="confirm-password-input"
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {showConfirmPassword ? (
                      <EyeSlash size={20} color={colors.subtext} />
                    ) : (
                      <Eye size={20} color={colors.subtext} />
                    )}
                  </TouchableOpacity>
                </View>
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <View style={styles.ruleRow}>
                    <X size={13} color="#ff3b30" />
                    <Text style={[styles.ruleText, { color: '#ff3b30' }]}>Passwords do not match</Text>
                  </View>
                )}
                {passwordsMatch && (
                  <View style={styles.ruleRow}>
                    <Check size={13} color="#34c759" />
                    <Text style={[styles.ruleText, { color: '#34c759' }]}>Passwords match</Text>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.submitBtn,
                { backgroundColor: colors.accent },
                (!canSubmit || isLoading) && { opacity: 0.6 },
              ]}
              onPress={handleSubmit}
              disabled={isLoading || !canSubmit}
              activeOpacity={0.8}
              testID="submit-button"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </Text>
              )}
            </TouchableOpacity>

            {!isSignUp && (
              <TouchableOpacity
                onPress={() => {
                  setShowForgotPassword(true);
                  setForgotEmail(email);
                }}
                style={styles.forgotBtn}
              >
                <Text style={[styles.forgotText, { color: colors.accent }]}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => {
                setIsSignUp(!isSignUp);
                setPassword('');
                setConfirmPassword('');
                setShowPassword(false);
                setShowConfirmPassword(false);
                setUsernameStatus('idle');
                setReferralCode('');
              }}
              style={styles.toggleBtn}
            >
              <Text style={[styles.toggleText, { color: colors.subtext }]}>
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <Text style={{ color: colors.accent, fontWeight: '600' as const }}>
                  {isSignUp ? 'Sign In' : 'Sign Up'}
                </Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {showForgotPassword && (
            <View style={[styles.forgotOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
              <View style={[styles.forgotCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.forgotTitle, { color: colors.text }]}>Reset Password</Text>
                <Text style={[styles.forgotSubtitle, { color: colors.subtext }]}>
                  Enter your email and we'll send you a link to reset your password.
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.chip, color: colors.text, borderColor: colors.border, marginBottom: 16 }]}
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  placeholder="your@email.com"
                  placeholderTextColor={colors.subtext}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  testID="forgot-email-input"
                />
                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: colors.accent }, forgotLoading && { opacity: 0.6 }]}
                  onPress={handleForgotPassword}
                  disabled={forgotLoading}
                  activeOpacity={0.8}
                >
                  {forgotLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitText}>Send Reset Link</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowForgotPassword(false)}
                  style={styles.forgotCancelBtn}
                >
                  <Text style={[styles.forgotCancelText, { color: colors.subtext }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    padding: 24,
    paddingTop: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    zIndex: 2,
  },
  headerBackdrop: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 24,
  },
  subtitle: {
    fontSize: 16,
    marginTop: 8,
  },
  formCard: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    marginBottom: 24,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
  },
  inputFull: {
    flex: 1,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rulesContainer: {
    marginTop: 10,
    gap: 4,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  ruleText: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
  usernameStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  usernameStatusText: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
  submitBtn: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700' as const,
  },
  forgotBtn: {
    marginTop: 12,
    alignItems: 'center',
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  toggleBtn: {
    marginTop: 20,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 15,
  },
  forgotOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 10,
  },
  forgotCard: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    width: '100%',
    maxWidth: 400,
  },
  forgotTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 8,
    textAlign: 'center',
  },
  forgotSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  forgotCancelBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  forgotCancelText: {
    fontSize: 15,
    fontWeight: '500' as const,
  },
});

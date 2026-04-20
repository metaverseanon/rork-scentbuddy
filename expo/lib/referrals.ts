import { supabase } from '@/lib/supabase';

export const REFERRAL_GOAL = 5;
export const REFERRAL_SHARE_URL = 'https://scentbuddy.io/join';

export async function grantReferralProViaRevenueCat(userId: string): Promise<{ granted: number } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('grant-referral-pro', {
      body: { userId },
    });
    if (error) {
      console.log('[referrals] grant-referral-pro error:', error);
      return null;
    }
    console.log('[referrals] grant-referral-pro response:', data);
    return data as { granted: number };
  } catch (e) {
    console.log('[referrals] grant-referral-pro threw:', e);
    return null;
  }
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code: string;
  status: 'pending' | 'completed';
  created_at: string;
  completed_at: string | null;
  referred_profile?: {
    display_name: string | null;
    username: string | null;
    avatar_emoji: string | null;
    avatar_url: string | null;
  };
}

export interface ReferralStats {
  referralCode: string;
  totalReferred: number;
  completedReferrals: number;
  rewardGranted: boolean;
  monthsEarned: number;
  proExpiresAt: string | null;
  nextRewardIn: number;
  currentCycleProgress: number;
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) {
    d.setUTCDate(0);
  }
  return d.toISOString();
}

export function generateReferralCode(username: string | null, userId: string): string {
  const base = username || userId.slice(0, 6);
  const suffix = userId.slice(-4).toUpperCase();
  return `${base.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${suffix}`;
}

export async function getOrCreateReferralCode(userId: string, username: string | null): Promise<string> {
  console.log('Getting or creating referral code for user:', userId);

  const { data: existing } = await supabase
    .from('user_referrals')
    .select('referral_code')
    .eq('referrer_id', userId)
    .limit(1)
    .maybeSingle();

  if (existing?.referral_code) {
    console.log('Found existing referral code:', existing.referral_code);
    return existing.referral_code;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .single();

  if (profile?.referral_code) {
    console.log('Found referral code on profile:', profile.referral_code);
    return profile.referral_code;
  }

  const code = generateReferralCode(username, userId);
  console.log('Generated new referral code:', code);

  await supabase
    .from('profiles')
    .update({ referral_code: code })
    .eq('id', userId);

  return code;
}

export async function fetchReferralStats(userId: string): Promise<ReferralStats> {
  console.log('Fetching referral stats for user:', userId);

  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code, is_pro, pro_expires_at, referral_reward_months')
    .eq('id', userId)
    .single();

  const referralCode = profile?.referral_code || '';

  const { data: referrals, error } = await supabase
    .from('user_referrals')
    .select('id, status')
    .eq('referrer_id', userId);

  if (error) {
    console.log('Error fetching referrals:', error);
  }

  const totalReferred = referrals?.length ?? 0;
  const completedReferrals = referrals?.filter(r => r.status === 'completed').length ?? 0;

  const monthsEarned = profile?.referral_reward_months ?? Math.floor(completedReferrals / REFERRAL_GOAL);
  const currentCycleProgress = completedReferrals % REFERRAL_GOAL;
  const nextRewardIn = REFERRAL_GOAL - currentCycleProgress;
  const proExpiresAt = profile?.pro_expires_at ?? null;
  const hasActiveReward = !!proExpiresAt && new Date(proExpiresAt) > new Date();

  return {
    referralCode,
    totalReferred,
    completedReferrals,
    rewardGranted: hasActiveReward || (profile?.is_pro ?? false),
    monthsEarned,
    proExpiresAt,
    nextRewardIn,
    currentCycleProgress,
  };
}

export async function fetchReferralsList(userId: string): Promise<Referral[]> {
  console.log('Fetching referrals list for user:', userId);

  const { data, error } = await supabase
    .from('user_referrals')
    .select(`
      id,
      referrer_id,
      referred_id,
      referral_code,
      status,
      created_at,
      completed_at,
      referred_profile:profiles!user_referrals_referred_id_fkey(
        display_name,
        username,
        avatar_emoji,
        avatar_url
      )
    `)
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.log('Error fetching referrals list:', error);
    return [];
  }

  return (data as unknown as Referral[]) ?? [];
}

export async function trackReferralSignUp(
  referralCode: string,
  newUserId: string
): Promise<boolean> {
  console.log('Tracking referral sign-up with code:', referralCode, 'for user:', newUserId);

  const { data: referrer } = await supabase
    .from('profiles')
    .select('id')
    .eq('referral_code', referralCode.trim().toUpperCase())
    .maybeSingle();

  if (!referrer) {
    console.log('No referrer found for code:', referralCode);
    return false;
  }

  if (referrer.id === newUserId) {
    console.log('User tried to use their own referral code');
    return false;
  }

  const { error: insertError } = await supabase
    .from('user_referrals')
    .insert({
      referrer_id: referrer.id,
      referred_id: newUserId,
      referral_code: referralCode.trim().toUpperCase(),
      status: 'completed',
      completed_at: new Date().toISOString(),
    });

  if (insertError) {
    console.log('Error inserting referral:', insertError);
    return false;
  }

  const { data: referrals } = await supabase
    .from('user_referrals')
    .select('id')
    .eq('referrer_id', referrer.id)
    .eq('status', 'completed');

  const completedCount = referrals?.length ?? 0;
  console.log('Referrer now has', completedCount, 'completed referrals');

  if (completedCount > 0 && completedCount % REFERRAL_GOAL === 0) {
    console.log('Referrer hit a new reward milestone! Triggering RC grant for:', referrer.id);
    await grantReferralProViaRevenueCat(referrer.id);
  }

  return true;
}

export function getReferralShareMessage(code: string): string {
  return `Join me on ScentBuddy — the best way to track your fragrance collection! Use my referral code: ${code}\n\n${REFERRAL_SHARE_URL}?ref=${code}`;
}

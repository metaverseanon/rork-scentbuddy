// Supabase Edge Function: grant-referral-pro
// Grants a RevenueCat promotional entitlement ("Scent Buddy Pro") to a user
// when they have earned unclaimed referral rewards.
//
// Flow:
//   1. Client calls with { userId } (the REFERRER's id).
//   2. Function counts completed referrals and compares against
//      profiles.referral_reward_months (already-granted months).
//   3. Any delta (earned - granted) is granted via RevenueCat promotional
//      entitlements, one month at a time.
//   4. profiles.referral_reward_months is incremented to match.
//
// Secrets required on the Supabase project:
//   - REVENUECAT_SECRET_API_KEY (sk_...)
// Auto-injected by Supabase:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const ENTITLEMENT_ID = 'Scent Buddy Pro';
const RC_API_BASE = 'https://api.revenuecat.com/v1';
const REFERRAL_GOAL = 5;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const rcSecret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!rcSecret) return json({ error: 'RC secret not configured' }, 500);
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Supabase not configured' }, 500);

    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = body?.userId;
    if (!userId) return json({ error: 'Missing userId' }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile, error: pErr } = await admin
      .from('profiles')
      .select('id, pro_expires_at, referral_reward_months, pro_since')
      .eq('id', userId)
      .single();

    if (pErr || !profile) {
      console.log('Profile fetch error:', pErr);
      return json({ error: 'Profile not found' }, 404);
    }

    const { count: completedCount } = await admin
      .from('user_referrals')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', userId)
      .eq('status', 'completed');

    const completed = completedCount ?? 0;
    const earnedMonths = Math.floor(completed / REFERRAL_GOAL);
    const granted = profile.referral_reward_months ?? 0;
    const delta = Math.max(0, earnedMonths - granted);

    console.log('Referral state:', { userId, completed, earnedMonths, granted, delta });

    if (delta === 0) {
      return json({ success: true, granted: 0, earnedMonths, message: 'Nothing to grant' });
    }

    // Cap per call for safety
    const toGrant = Math.min(delta, 12);

    for (let i = 0; i < toGrant; i++) {
      const url = `${RC_API_BASE}/subscribers/${encodeURIComponent(userId)}/entitlements/${encodeURIComponent(
        ENTITLEMENT_ID,
      )}/promotional`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${rcSecret}`,
          'Content-Type': 'application/json',
          'X-Platform': 'ios',
        },
        body: JSON.stringify({ duration: 'monthly' }),
      });
      const text = await res.text();
      if (!res.ok) {
        console.log('RC grant failed:', res.status, text);
        return json({ error: 'RC grant failed', status: res.status, details: text }, 502);
      }
    }

    // Mirror into profiles table so the UI can render progress/expiry immediately.
    const now = new Date();
    const current = profile.pro_expires_at ? new Date(profile.pro_expires_at) : null;
    const base = current && current > now ? current : now;
    const newExpiry = new Date(base);
    newExpiry.setUTCMonth(newExpiry.getUTCMonth() + toGrant);

    await admin
      .from('profiles')
      .update({
        is_pro: true,
        pro_since: profile.pro_since ?? now.toISOString(),
        pro_source: 'referral',
        pro_expires_at: newExpiry.toISOString(),
        referral_reward_months: granted + toGrant,
      })
      .eq('id', userId);

    console.log('Granted', toGrant, 'month(s) of Pro to', userId);

    return json({
      success: true,
      granted: toGrant,
      earnedMonths,
      newExpiry: newExpiry.toISOString(),
    });
  } catch (e) {
    console.log('grant-referral-pro error:', e);
    return json({ error: (e as Error).message ?? 'Unknown error' }, 500);
  }
});

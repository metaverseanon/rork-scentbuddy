// Supabase Edge Function: appsflyer-track-event
// Forwards app events to AppsFlyer via the S2S Events API.
//
// Docs: https://dev.appsflyer.com/hc/reference/post_inappevent-app-id
//
// Secrets required on the Supabase project:
//   - APPSFLYER_DEV_KEY        (from AppsFlyer dashboard -> App Settings -> SDK Integration)
//
// Client call shape:
//   POST /appsflyer-track-event
//   {
//     event: "af_purchase",
//     event_id?: string,
//     platform?: "ios" | "android",
//     app_version?: string,
//     os_version?: string,
//     user?: {
//       external_id?: string,          // customer_user_id
//       email?: string,
//       appsflyer_id?: string,
//       idfa?: string,
//       idfv?: string,                 // iOS
//       advertising_id?: string,       // Android GAID
//       ip?: string,
//       user_agent?: string,
//     },
//     properties?: {
//       value?: number,
//       currency?: string,
//       content_id?: string,
//       content_type?: string,
//       [k: string]: unknown,
//     }
//   }

// deno-lint-ignore-file no-explicit-any

const IOS_APP_STORE_ID = 'id6761390616';
const IOS_BUNDLE_ID = 'app.rork.0kxdwz3d5g57j5m9vjhxs';
const ANDROID_PACKAGE = 'app.rork.0kxdwz3d5g57j5m9vjhxs';

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

function formatEventTime(d: Date): string {
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  const ms = pad(d.getUTCMilliseconds(), 3);
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}.${ms}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const devKey =
      Deno.env.get('APPSFLYER_DEV_KEY') ??
      Deno.env.get('EXPO_PUBLIC_APPSFLYER_DEV_KEY');

    if (!devKey) {
      return json({ error: 'APPSFLYER_DEV_KEY not configured' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const event: string | undefined = body?.event;
    if (!event) return json({ error: 'Missing event' }, 400);

    const platform: string = (body?.platform as string | undefined) ?? 'ios';
    const u = body?.user ?? {};
    const p = body?.properties ?? {};

    const appId = platform === 'android' ? ANDROID_PACKAGE : IOS_APP_STORE_ID;
    const bundleId = platform === 'android' ? ANDROID_PACKAGE : IOS_BUNDLE_ID;

    const fwdIp =
      u.ip ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      undefined;
    const userAgent = u.user_agent || req.headers.get('user-agent') || undefined;

    const eventValueObj: Record<string, unknown> = {};
    if (typeof p.value === 'number') eventValueObj.af_revenue = p.value;
    if (p.currency) eventValueObj.af_currency = p.currency;
    if (p.content_id) eventValueObj.af_content_id = p.content_id;
    if (p.content_type) eventValueObj.af_content_type = p.content_type;
    for (const [k, v] of Object.entries(p)) {
      if (['value', 'currency', 'content_id', 'content_type'].includes(k)) continue;
      eventValueObj[k] = v;
    }

    const payload: Record<string, unknown> = {
      appsflyer_id:
        u.appsflyer_id ||
        u.idfv ||
        u.advertising_id ||
        u.external_id ||
        crypto.randomUUID(),
      eventName: event,
      eventValue: JSON.stringify(eventValueObj),
      eventTime: formatEventTime(new Date()),
      eventCurrency: p.currency ?? 'USD',
      bundleIdentifier: bundleId,
      app_version_name: body?.app_version,
      os_version: body?.os_version,
    };

    if (u.external_id) payload.customer_user_id = String(u.external_id);
    if (u.idfa) payload.idfa = u.idfa;
    if (u.idfv) payload.idfv = u.idfv;
    if (u.advertising_id) payload.advertising_id = u.advertising_id;
    if (fwdIp) payload.ip = fwdIp;
    if (userAgent) payload.user_agent = userAgent;
    if (body?.event_id) payload.event_custom_id = body.event_id;
    if (typeof p.value === 'number') payload.eventRevenue = p.value;

    const endpoint = `https://api3.appsflyer.com/inappevent/${appId}`;

    console.log('[appsflyer-track-event] Sending to', endpoint, JSON.stringify(payload));

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authentication: devKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep as text
    }

    if (!res.ok) {
      console.log('[appsflyer-track-event] AppsFlyer error:', res.status, parsed);
      return json({ success: false, status: res.status, details: parsed }, 502);
    }

    console.log('[appsflyer-track-event] Success:', res.status);
    return json({ success: true, response: parsed });
  } catch (e) {
    console.log('[appsflyer-track-event] Error:', e);
    return json({ error: (e as Error).message ?? 'Unknown error' }, 500);
  }
});

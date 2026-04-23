// Supabase Edge Function: tiktok-track-event
// Forwards app events to TikTok Events API (server-to-server).
//
// Docs: https://business-api.tiktok.com/portal/docs?id=1771101303285761
//
// Secrets required on the Supabase project:
//   - TIKTOK_ACCESS_TOKEN  (from TikTok Events Manager -> Events API tab)
//   - TIKTOK_APP_ID        (the TikTok App ID, e.g. 7630509545810411528)
//
// Client call shape:
//   POST /tiktok-track-event
//   {
//     event: "CompletePayment",
//     event_id: "uuid-...",                 // optional, for dedupe
//     user: {
//       external_id?: string,               // hashed by us if not already
//       email?: string,
//       phone?: string,
//       ip?: string,                        // otherwise req IP used
//       user_agent?: string,
//       ttclid?: string,
//       ttp?: string,                       // web cookie if any
//       idfa?: string,                      // iOS IDFA (raw)
//       idfv?: string,                      // iOS IDFV (raw)
//       gaid?: string,                      // Android GAID
//     },
//     properties?: {
//       value?: number,
//       currency?: string,
//       content_id?: string,
//       content_type?: string,
//       description?: string,
//       [k: string]: unknown,
//     }
//   }

// deno-lint-ignore-file no-explicit-any

const TIKTOK_ENDPOINT = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

// Hardcoded fallbacks so TikTok's app verification scanner always sees the correct IDs.
const DEFAULT_TIKTOK_APP_ID = '7630509545810411528';
const IOS_APP_STORE_ID = '6761390616';
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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isSha256(v: string | undefined): boolean {
  return !!v && /^[a-f0-9]{64}$/i.test(v);
}

async function maybeHash(v: string | undefined): Promise<string | undefined> {
  if (!v) return undefined;
  if (isSha256(v)) return v.toLowerCase();
  return await sha256Hex(v);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const accessToken = Deno.env.get('TIKTOK_ACCESS_TOKEN');
    const appId = Deno.env.get('TIKTOK_APP_ID') ?? DEFAULT_TIKTOK_APP_ID;

    if (!accessToken) return json({ error: 'TIKTOK_ACCESS_TOKEN not configured' }, 500);

    const body = await req.json().catch(() => ({}));
    const event: string | undefined = body?.event;
    if (!event) return json({ error: 'Missing event' }, 400);

    const eventId: string | undefined = body?.event_id;
    const u = body?.user ?? {};
    const p = body?.properties ?? {};

    const fwdIp =
      u.ip ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      undefined;
    const userAgent = u.user_agent || req.headers.get('user-agent') || undefined;

    const user: Record<string, unknown> = {
      ip: fwdIp,
      user_agent: userAgent,
      ttclid: u.ttclid,
      ttp: u.ttp,
    };

    const email = await maybeHash(u.email);
    const phone = await maybeHash(u.phone);
    const externalId = await maybeHash(u.external_id);

    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (externalId) user.external_id = externalId;
    if (u.idfa) user.idfa = u.idfa;
    if (u.idfv) user.idfv = u.idfv;
    if (u.gaid) user.gaid = u.gaid;

    const properties: Record<string, unknown> = { ...p };
    if (typeof p.value === 'number') properties.value = p.value;
    if (p.currency) properties.currency = p.currency;
    if (p.content_id) {
      properties.contents = [
        {
          content_id: p.content_id,
          content_type: p.content_type ?? 'product',
        },
      ];
    }

    const platform: string = (body?.platform as string | undefined) ?? 'ios';
    const appVersion: string | undefined = body?.app_version;
    const osVersion: string | undefined = body?.os_version;

    const appInfo =
      platform === 'android'
        ? {
            app_id: ANDROID_PACKAGE,
            app_name: 'ScentBuddy',
            app_version: appVersion,
            platform: 'Android',
            os_version: osVersion,
          }
        : {
            app_id: IOS_APP_STORE_ID,
            app_name: 'ScentBuddy',
            app_bundle_id: IOS_BUNDLE_ID,
            app_version: appVersion,
            platform: 'iOS',
            os_version: osVersion,
          };

    const payload = {
      event_source: 'app',
      event_source_id: appId,
      data: [
        {
          event,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          user,
          properties,
          app: appInfo,
        },
      ],
    };

    console.log('[tiktok-track-event] Sending:', JSON.stringify(payload));

    const res = await fetch(TIKTOK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Access-Token': accessToken,
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

    if (!res.ok || (parsed && parsed.code && parsed.code !== 0)) {
      console.log('[tiktok-track-event] TikTok error:', res.status, parsed);
      return json({ success: false, status: res.status, details: parsed }, 502);
    }

    console.log('[tiktok-track-event] Success:', parsed?.request_id ?? '');
    return json({ success: true, response: parsed });
  } catch (e) {
    console.log('[tiktok-track-event] Error:', e);
    return json({ error: (e as Error).message ?? 'Unknown error' }, 500);
  }
});

import { supabase } from '@/lib/supabase';

export async function createFollowNotification(followerId: string, followerName: string, targetUserId: string) {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: targetUserId,
      sender_id: followerId,
      type: 'follow',
      message: `${followerName} started following you`,
      read: false,
    });
    if (error) {
      console.log('[NOTIF] Error inserting follow notification:', error);
    } else {
      console.log('[NOTIF] Follow notification created for user:', targetUserId);
    }
    await sendPushToUser(targetUserId, 'New Follower', `${followerName} started following you`, { type: 'follow', senderId: followerId });
  } catch (err) {
    console.log('[NOTIF] Error creating follow notification:', err);
  }
}

export async function createSniffNotification(
  snifferId: string,
  snifferName: string,
  targetUserId: string,
  perfumeName: string,
  perfumeBrand: string,
) {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: targetUserId,
      sender_id: snifferId,
      type: 'sniff',
      message: `${snifferName} sniffed your ${perfumeName}`,
      perfume_name: perfumeName,
      perfume_brand: perfumeBrand,
      read: false,
    });
    if (error) {
      console.log('[NOTIF] Error inserting sniff notification:', error);
    } else {
      console.log('[NOTIF] Sniff notification created for user:', targetUserId);
    }
    await sendPushToUser(targetUserId, 'Someone sniffed your perfume!', `${snifferName} sniffed your ${perfumeName}`, { type: 'sniff', senderId: snifferId });
  } catch (err) {
    console.log('[NOTIF] Error creating sniff notification:', err);
  }
}

export async function sendPushToUser(targetUserId: string, title: string, body: string, data?: Record<string, string>) {
  try {
    console.log('[PUSH-SEND] Sending push to user:', targetUserId, 'title:', title);

    const rpcSent = await sendPushViaRpc(targetUserId, title, body, data);
    if (rpcSent) {
      console.log('[PUSH-SEND] Push sent via RPC function');
      return;
    }

    console.log('[PUSH-SEND] RPC not available, trying direct token read...');
    const { data: tokens, error } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', targetUserId);

    if (error) {
      console.log('[PUSH-SEND] Error fetching tokens:', error.message, error.code);
      if (error.code === '42P01') {
        console.log('[PUSH-SEND] push_tokens table does not exist!');
      }
      if (error.code === '42501' || error.message?.includes('policy') || error.message?.includes('permission')) {
        console.log('[PUSH-SEND] RLS policy is blocking token read.');
        console.log('[PUSH-SEND] FIX: Create a Supabase RPC function "send_push_notification" or add a SELECT policy on push_tokens for authenticated users.');
        console.log('[PUSH-SEND] SQL to create RPC function:');
        console.log(`[PUSH-SEND] CREATE OR REPLACE FUNCTION send_push_notification(target_user_id uuid, push_title text, push_body text, push_data jsonb DEFAULT '{}')
RETURNS void AS $$
DECLARE
  token_row RECORD;
BEGIN
  FOR token_row IN SELECT token FROM push_tokens WHERE user_id = target_user_id
  LOOP
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      body := jsonb_build_object('to', token_row.token, 'sound', 'default', 'title', push_title, 'body', push_body, 'data', push_data)
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`);
      }
      return;
    }

    if (!tokens?.length) {
      console.log('[PUSH-SEND] No tokens found for user:', targetUserId);
      return;
    }

    console.log('[PUSH-SEND] Found', tokens.length, 'token(s) for user:', targetUserId);

    for (const tokenRow of tokens) {
      const pushToken = tokenRow.token;
      if (!pushToken) continue;

      await sendExpoPush(pushToken, title, body, data);
    }
  } catch (err: any) {
    console.log('[PUSH-SEND] Exception:', err?.message || err);
  }
}

async function sendPushViaRpc(targetUserId: string, title: string, body: string, data?: Record<string, string>): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('send_push_notification', {
      target_user_id: targetUserId,
      push_title: title,
      push_body: body,
      push_data: data ?? {},
    });

    if (error) {
      if (error.message?.includes('function') && (error.message?.includes('does not exist') || error.code === '42883')) {
        console.log('[PUSH-SEND] RPC function not found, falling back to direct approach');
        return false;
      }
      console.log('[PUSH-SEND] RPC error:', error.message);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function sendExpoPush(pushToken: string, title: string, body: string, data?: Record<string, string>) {
  try {
    console.log('[PUSH-SEND] Sending to Expo API, token:', pushToken.substring(0, 25) + '...');

    const message = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data: data ?? {},
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('[PUSH-SEND] Expo API response:', JSON.stringify(result));

    if (result?.data?.status === 'error') {
      console.log('[PUSH-SEND] Delivery error:', result.data.message, result.data.details);
      if (result.data.details?.error === 'DeviceNotRegistered') {
        console.log('[PUSH-SEND] Device no longer registered, should clean up token');
      }
    } else if (result?.data?.status === 'ok') {
      console.log('[PUSH-SEND] Successfully queued for delivery');
    }
  } catch (err: any) {
    console.log('[PUSH-SEND] Expo API error:', err?.message || err);
  }
}

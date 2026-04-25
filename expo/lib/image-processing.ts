import { supabase } from './supabase';

const REMOVAL_AI_API_URL = 'https://api.removal.ai/3.0/remove';
const REMOVAL_AI_API_KEY = process.env.EXPO_PUBLIC_REMOVAL_AI_API_KEY || '';
const BUCKET_NAME = 'clean-bottles';
const MAX_RETRIES = 2;

export async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
  try {
    console.log('[IMAGE-PROCESSING] Fetching image:', imageUrl);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.log('[IMAGE-PROCESSING] Failed to fetch image:', response.status);
      return null;
    }
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64 ?? null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.log('[IMAGE-PROCESSING] Error fetching image as base64:', error);
    return null;
  }
}

export async function removeBackground(imageUrl: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    console.log('[IMAGE-PROCESSING] Starting background removal via removal.ai for:', imageUrl);
    console.log('[IMAGE-PROCESSING] API key present:', !!REMOVAL_AI_API_KEY, 'length:', REMOVAL_AI_API_KEY.length);

    const imageBlob = await fetchImageAsBlob(imageUrl);
    if (!imageBlob) {
      console.log('[IMAGE-PROCESSING] Failed to download source image');
      return null;
    }
    console.log('[IMAGE-PROCESSING] Downloaded source image, size:', imageBlob.size, 'type:', imageBlob.type);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      console.log(`[IMAGE-PROCESSING] Attempt ${attempt + 1}/${MAX_RETRIES + 1}`);

      try {
        const formData = new FormData();
        const fileExt = imageBlob.type?.includes('png') ? 'png' : 'jpg';
        const file = {
          uri: imageUrl,
          type: imageBlob.type || 'image/jpeg',
          name: `image.${fileExt}`,
        } as any;
        formData.append('image_file', file);

        console.log('[IMAGE-PROCESSING] Sending request with image_file upload');

        const response = await fetch(REMOVAL_AI_API_URL, {
          method: 'POST',
          headers: {
            'Rm-Token': REMOVAL_AI_API_KEY,
          },
          body: formData,
        });

        console.log('[IMAGE-PROCESSING] Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'unknown');
          console.log('[IMAGE-PROCESSING] removal.ai API error:', response.status, errorText);
          if (attempt < MAX_RETRIES) continue;
          return null;
        }

        const contentType = response.headers.get('content-type') || '';
        console.log('[IMAGE-PROCESSING] Response content-type:', contentType);

        if (contentType.includes('image/')) {
          console.log('[IMAGE-PROCESSING] Got direct image response');
          const blob = await response.blob();
          console.log('[IMAGE-PROCESSING] Response blob size:', blob.size);
          const base64 = await blobToBase64(blob);
          if (!base64) {
            console.log('[IMAGE-PROCESSING] Failed to convert blob to base64');
            if (attempt < MAX_RETRIES) continue;
            return null;
          }
          console.log('[IMAGE-PROCESSING] Background removal complete (direct image), base64 length:', base64.length);
          return { base64, mimeType: 'image/png' };
        }

        const responseText = await response.text();
        console.log('[IMAGE-PROCESSING] removal.ai raw response:', responseText.substring(0, 500));

        let data: any;
        try {
          data = JSON.parse(responseText);
        } catch {
          console.log('[IMAGE-PROCESSING] Failed to parse JSON response');
          if (attempt < MAX_RETRIES) continue;
          return null;
        }

        console.log('[IMAGE-PROCESSING] removal.ai JSON keys:', Object.keys(data));

        const resultUrl = data.url || data.preview || data.high_resolution || data.result_url || data.image_url;
        if (!resultUrl) {
          console.log('[IMAGE-PROCESSING] No result URL found in response:', JSON.stringify(data).substring(0, 300));
          if (attempt < MAX_RETRIES) continue;
          return null;
        }

        console.log('[IMAGE-PROCESSING] removal.ai result URL:', resultUrl);

        const resultResponse = await fetch(resultUrl);
        if (!resultResponse.ok) {
          console.log('[IMAGE-PROCESSING] Failed to fetch result image:', resultResponse.status);
          if (attempt < MAX_RETRIES) continue;
          return null;
        }

        const resultBlob = await resultResponse.blob();
        const base64 = await blobToBase64(resultBlob);

        if (!base64) {
          console.log('[IMAGE-PROCESSING] Failed to convert result to base64');
          if (attempt < MAX_RETRIES) continue;
          return null;
        }

        console.log('[IMAGE-PROCESSING] Background removal complete via removal.ai');
        return { base64, mimeType: 'image/png' };
      } catch (innerError) {
        console.log(`[IMAGE-PROCESSING] Attempt ${attempt + 1} error:`, innerError);
        if (attempt < MAX_RETRIES) continue;
        return null;
      }
    }

    return null;
  } catch (error) {
    console.log('[IMAGE-PROCESSING] Error removing background:', error);
    return null;
  }
}

async function fetchImageAsBlob(imageUrl: string): Promise<Blob | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    return await response.blob();
  } catch (error) {
    console.log('[IMAGE-PROCESSING] Error fetching image as blob:', error);
    return null;
  }
}

function blobToBase64(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const b64 = result.split(',')[1];
      resolve(b64 ?? null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export async function uploadCleanImage(
  userId: string,
  itemId: string,
  base64Data: string,
  mimeType: string,
): Promise<string | null> {
  try {
    const ext = mimeType.includes('png') ? 'png' : 'webp';
    const filePath = `${userId}/${itemId}.${ext}`;
    console.log('[IMAGE-PROCESSING] Uploading clean image to:', filePath);

    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, byteArray, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.log('[IMAGE-PROCESSING] Upload error:', uploadError.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const cacheBustedUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    console.log('[IMAGE-PROCESSING] Upload success, URL:', cacheBustedUrl);
    return cacheBustedUrl;
  } catch (error) {
    console.log('[IMAGE-PROCESSING] Error uploading clean image:', error);
    return null;
  }
}

function trimTransparentPixels(base64Data: string): string {
  console.log('[IMAGE-PROCESSING] Trim skipped to keep production publish bundle lean');
  return base64Data;
}

export async function processFragranceImage(
  userId: string,
  itemId: string,
  imageUrl: string,
): Promise<string | null> {
  try {
    console.log('[IMAGE-PROCESSING] Processing fragrance image for item:', itemId);

    const result = await removeBackground(imageUrl);
    if (!result) {
      console.log('[IMAGE-PROCESSING] Background removal failed');
      return null;
    }

    const finalBase64 = trimTransparentPixels(result.base64);
    console.log('[IMAGE-PROCESSING] Using trimmed image, base64 length:', finalBase64.length);

    const publicUrl = await uploadCleanImage(userId, itemId, finalBase64, result.mimeType);
    if (!publicUrl) {
      console.log('[IMAGE-PROCESSING] Upload failed');
      return null;
    }

    const { error } = await supabase
      .from('user_collections')
      .update({ clean_image_url: publicUrl })
      .eq('id', itemId);

    if (error) {
      console.log('[IMAGE-PROCESSING] DB update error:', error.message);
    } else {
      console.log('[IMAGE-PROCESSING] DB updated with clean_image_url');
    }

    return publicUrl;
  } catch (error) {
    console.log('[IMAGE-PROCESSING] Error in processFragranceImage:', error);
    return null;
  }
}

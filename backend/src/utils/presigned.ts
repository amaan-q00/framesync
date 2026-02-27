import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Signer, BUCKET_NAME } from '../config/storage';

const LONG_EXPIRES = 604800; // 7 days

function extractKeyFromLegacyUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    const pathPrefix = `${BUCKET_NAME}/`;
    if (path.startsWith(pathPrefix)) return path.slice(pathPrefix.length);
    if (path.startsWith('avatars/') || path.startsWith('thumbnails/') || path.startsWith('videos/')) return path;
  } catch {
    /* ignore */
  }
  return null;
}

export async function toPresignedAssetUrl(
  keyOrUrl: string | null | undefined,
  expiresIn = LONG_EXPIRES
): Promise<string | null> {
  if (!keyOrUrl || typeof keyOrUrl !== 'string') return null;
  let key = keyOrUrl;
  if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
    const extracted = extractKeyFromLegacyUrl(keyOrUrl);
    if (!extracted) return keyOrUrl;
    key = extracted;
  }
  const cmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  return getSignedUrl(s3Signer, cmd, { expiresIn });
}

export async function toPresignedThumbnailUrl(key: string | null | undefined): Promise<string | null> {
  return toPresignedAssetUrl(key, LONG_EXPIRES);
}

export async function toPresignedSegmentUrl(key: string): Promise<string> {
  return (await toPresignedAssetUrl(key, LONG_EXPIRES)) ?? key;
}

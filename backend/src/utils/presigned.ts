import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Signer, BUCKET_NAME } from '../config/storage';

const LONG_EXPIRES = 604800; // 7 days

/** Extract S3 key from legacy full URL (path-style or virtual-hosted). */
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

/**
 * If keyOrUrl is our S3 key (avatars/, thumbnails/, videos/), return a presigned URL.
 * If it's a legacy full URL to our bucket, extract key and presign.
 * If it's an external URL (e.g. Google avatar), return as-is.
 */
export async function toPresignedAssetUrl(
  keyOrUrl: string | null | undefined,
  expiresIn = LONG_EXPIRES
): Promise<string | null> {
  if (!keyOrUrl || typeof keyOrUrl !== 'string') return null;
  let key = keyOrUrl;
  if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
    const extracted = extractKeyFromLegacyUrl(keyOrUrl);
    if (!extracted) return keyOrUrl; // external URL (e.g. Google)
    key = extracted;
  }
  const cmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  return getSignedUrl(s3Signer, cmd, { expiresIn });
}

/**
 * Presigned URL for thumbnails/avatars (longer expiry for static assets).
 */
export async function toPresignedThumbnailUrl(key: string | null | undefined): Promise<string | null> {
  return toPresignedAssetUrl(key, LONG_EXPIRES);
}

/**
 * Presigned URL for HLS segments (shorter expiry for streaming).
 */
export async function toPresignedSegmentUrl(key: string): Promise<string> {
  return (await toPresignedAssetUrl(key, LONG_EXPIRES)) ?? key;
}

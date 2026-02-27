const TOKEN_KEY = 'fs_token';
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7;

export function setToken(token: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${TOKEN_MAX_AGE}; secure; samesite=lax`;
}

export function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_KEY}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearToken(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

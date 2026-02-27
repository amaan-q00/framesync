const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', '10minutemail.net', 'guerrillamail.com', 'guerrillamail.org',
  'mailinator.com', 'mailinator.net', 'tempmail.com', 'tempmail.net', 'throwaway.email',
  'fakeinbox.com', 'trashmail.com', 'yopmail.com', 'getnada.com', 'temp-mail.org',
  'maildrop.cc', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'spam4.me',
  'dispostable.com', 'mailnesia.com', 'tempail.com', 'mohmal.com', 'emailondeck.com',
]);

function getDomainFromEmail(email: string): string {
  const part = email.split('@')[1];
  return part ? part.toLowerCase() : '';
}

export function isValidEmailFormat(email: string): boolean {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_EMAIL_LENGTH && EMAIL_REGEX.test(trimmed);
}

export function isDisposableEmail(email: string): boolean {
  if (typeof email !== 'string') return true;
  const domain = getDomainFromEmail(email.trim());
  return domain.length > 0 && DISPOSABLE_DOMAINS.has(domain);
}

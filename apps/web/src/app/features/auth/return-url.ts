/** Only same-app paths are allowed as post-login redirects (no open redirects). */
export function safeReturnUrl(url: string | undefined | null, fallback = '/home'): string {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return fallback;
  if (url.startsWith('/login') || url.startsWith('/register')) return fallback;
  return url;
}

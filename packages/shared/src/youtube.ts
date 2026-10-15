const ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts the video id from a YouTube link (watch, youtu.be, embed, shorts, live) or a bare
 * id. Returns null for anything else, so only real YouTube ids are ever stored or embedded.
 */
export function parseYoutubeId(input: string): string | null {
  const raw = input.trim();
  if (ID.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  let candidate: string | null = null;
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, first, second] = url.pathname.split('/');
    if (first === 'watch') candidate = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(first ?? '')) candidate = second ?? null;
  }
  return candidate && ID.test(candidate) ? candidate : null;
}

/** Returns true when the URL is a mock/placeholder endpoint (CI) rather than a real Supabase project. Hostname-exact to avoid false-skipping real refs containing "mock" as substring. */
export function isMockSupabaseUrl(url: string): boolean {
  if (!url) return true;
  const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return url.toLowerCase(); } })();
  return host === 'mock.supabase.co' || host.includes('placeholder') || host === 'localhost' || host === '127.0.0.1';
}
export function hasLiveAnonCreds(url: string, anonKey: string): boolean {
  return Boolean(url && anonKey) && anonKey !== 'placeholder-key' && !isMockSupabaseUrl(url);
}
export function hasLiveAdminCreds(url: string, serviceKey: string): boolean {
  return Boolean(url && serviceKey) && serviceKey !== 'placeholder-key' && !isMockSupabaseUrl(url);
}

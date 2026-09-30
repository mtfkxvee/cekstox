import Constants from 'expo-constants';
import { Platform } from 'react-native';

const REPO = 'mtfkxvee/cekstox';
// Link "latest" GitHub selalu mengarah ke rilis terbaru (tanpa API, jadi tidak kena rate limit).
const LATEST = `https://github.com/${REPO}/releases/latest/download`;

export const APK_URL = `${LATEST}/cekstox.apk`;
export const currentVersion: string = Constants.expoConfig?.version ?? '0.0.0';

export type UpdateInfo = { version: string; notes?: string };

const parts = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
export function isNewer(remote: string, local: string) {
  const a = parts(remote);
  const b = parts(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** Cek version.json di rilis GitHub terbaru. Mengembalikan info jika ada versi yang lebih baru, selain itu null. */
export async function checkUpdate(): Promise<UpdateInfo | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const res = await fetch(`${LATEST}/version.json?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.version && isNewer(j.version, currentVersion) ? { version: j.version, notes: j.notes } : null;
  } catch {
    return null;
  }
}

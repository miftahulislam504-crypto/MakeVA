import type { Auth } from './types';

const KEY = 'remotion-cloud:auth';

export function saveAuth(auth: Auth, remember: boolean): void {
  try {
    window.localStorage.removeItem(KEY);
    window.sessionStorage.removeItem(KEY);
    const store = remember ? window.localStorage : window.sessionStorage;
    store.setItem(KEY, JSON.stringify(auth));
  } catch {
    // Storage can be unavailable (private mode). The session still works.
  }
}

export function loadAuth(): Auth | null {
  try {
    const raw =
      window.localStorage.getItem(KEY) ?? window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Auth>;
    if (typeof data.username === 'string' && typeof data.token === 'string') {
      return { username: data.username, token: data.token };
    }
  } catch {
    // ignore
  }
  return null;
}

export function clearAuth(): void {
  try {
    window.localStorage.removeItem(KEY);
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * The JWT from POST /auth/login, kept in localStorage so it survives reloads and is shared by all tabs.
 * Listeners are told whenever the token changes: here, or in another tab (via the `storage` event).
 */
const TOKEN_KEY = 'rag_access_token';

type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();

/** Seconds since the epoch at which the token expires, or null if it can't be read */
const expiryOf = (token: string): number | null => {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp: unknown = JSON.parse(json).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
};

const isExpired = (token: string): boolean => {
  const exp = expiryOf(token);
  return exp !== null && exp * 1000 <= Date.now();
};

const read = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

/** The saved token, or null if there is none or it has expired (an expired one is removed) */
export const getToken = (): string | null => {
  const token = read();
  if (token && isExpired(token)) {
    clearToken();
    return null;
  }
  return token;
};

export const setToken = (token: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // storage blocked: the login works until the page is reloaded
  }
  listeners.forEach((l) => l(token));
};

export const clearToken = (): void => {
  const had = read() !== null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing to remove
  }
  if (had) listeners.forEach((l) => l(null));
};

/** Calls `listener` with the new token (or null) on login/logout in this tab or any other tab */
export const subscribeToken = (listener: Listener): (() => void) => {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === TOKEN_KEY || e.key === null) listener(getToken());
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
};

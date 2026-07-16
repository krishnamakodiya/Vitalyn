export type Session = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
};

const storageKey = 'vitalyn.session';

export function loadSession(): Session | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(storageKey, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(storageKey);
}


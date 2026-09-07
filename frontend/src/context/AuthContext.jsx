import { createContext, useContext, useEffect, useState, useCallback } from 'react';

// localStorage keys — kept in one place so we can rename them safely
const STORAGE = {
  profile: 'tbai.user',        // Google profile (sub, email, name, picture)
  accounts: 'tbai.accounts',   // mock email/password accounts (local-only demo)
  session:  'tbai.session',    // active email/password session token
  role:     'tbai.role',       // chosen role for current session
};

// AuthContext shape:
//   user           — Google profile (or null)
//   role           — 'hub' | 'seeker' | 'employer' | null
//   mode           — 'closed' | 'role' | 'auth'   (what the modal currently shows)
//   openAuth()     — open the modal at 'role' step
//   closeAuth()    — close the modal
//   selectRole(r)  — advance from role selection to login/register
//   backToRoles()  — go back from login/register to role selection
//   signIn()       — success callback (Google or email/password)
//   signOut()      — clear user + session
const AuthContext = createContext(null);

// Read an account list (or empty array) from localStorage
function readAccounts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE.accounts) || '[]');
  } catch {
    return [];
  }
}

// Tiny non-cryptographic hash so we don't store plain passwords in localStorage.
// NOT real security — replace with a backend in production.
function hashPassword(pw) {
  let h = 0;
  for (let i = 0; i < pw.length; i += 1) {
    h = (h << 5) - h + pw.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [mode, setMode] = useState('closed'); // 'closed' | 'role' | 'auth'

  // Rehydrate from localStorage so refreshes keep the user signed in
  useEffect(() => {
    try {
      const profile = localStorage.getItem(STORAGE.profile);
      if (profile) setUser(JSON.parse(profile));
      const r = localStorage.getItem(STORAGE.role);
      if (r) setRole(r);
    } catch {
      // ignore corrupted entries
    }
  }, []);

  // Open the modal — always starts at role selection
  const openAuth = useCallback(() => {
    setMode('role');
  }, []);

  const closeAuth = useCallback(() => setMode('closed'), []);

  // User picked a role → advance to login/register
  const selectRole = useCallback((r) => {
    setRole(r);
    localStorage.setItem(STORAGE.role, r);
    setMode('auth');
  }, []);

  // Back button from login/register → return to role selection
  const backToRoles = useCallback(() => setMode('role'), []);

  // ───── Auth actions ─────

  // Google OAuth success: persist profile, close modal
  const signInWithGoogle = useCallback((googleProfile) => {
    localStorage.setItem(STORAGE.profile, JSON.stringify(googleProfile));
    setUser(googleProfile);
    setMode('closed');
  }, []);

  // Email/password register — creates a new account if email is unused
  const registerWithEmail = useCallback(
    ({ name, email, password }) => {
      const accounts = readAccounts();
      const exists = accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
      if (exists) {
        return { ok: false, error: 'An account with that email already exists. Try signing in.' };
      }
      const newAccount = { name, email, passwordHash: hashPassword(password) };
      localStorage.setItem(
        STORAGE.accounts,
        JSON.stringify([...accounts, newAccount])
      );
      localStorage.setItem(STORAGE.session, email);
      setUser({ sub: email, email, name, picture: null });
      setMode('closed');
      return { ok: true };
    },
    []
  );

  // Email/password login — checks against stored accounts
  const loginWithEmail = useCallback(({ email, password }) => {
    const accounts = readAccounts();
    const account = accounts.find(
      (a) => a.email.toLowerCase() === email.toLowerCase()
    );
    if (!account || account.passwordHash !== hashPassword(password)) {
      return { ok: false, error: 'Invalid email or password.' };
    }
    localStorage.setItem(STORAGE.session, email);
    setUser({ sub: email, email, name: account.name, picture: null });
    setMode('closed');
    return { ok: true };
  }, []);

  // Sign out — clear session + profile but keep registered accounts so they can log back in
  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE.profile);
    localStorage.removeItem(STORAGE.session);
    setUser(null);
    setRole(null);
  }, []);

  const value = {
    user,
    role,
    mode,
    openAuth,
    closeAuth,
    selectRole,
    backToRoles,
    signInWithGoogle,
    registerWithEmail,
    loginWithEmail,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
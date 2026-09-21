import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { ensureKeys } from '../lib/e2e.js';
import { setupPush, teardownPush } from '../lib/push.js';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const STORAGE = {
  token: 'tbai.token',
  role: 'tbai.role',
  adminToken: 'tbai.adminToken',
  adminRole: 'tbai.adminRole',
};

const AuthContext = createContext(null);

// Generate (if needed) the browser's E2E public key and store it so other
// people can start a secure chat with this account right away.
function registerChatKey(token) {
  if (!token) return;
  ensureKeys(token).catch(() => {});
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [adminRole, setAdminRole] = useState(null);
  const [mode, setMode] = useState('closed');
  const [loading, setLoading] = useState(true);

  // Rehydrate from localStorage on mount
  useEffect(() => {
    const rehydrate = async () => {
      try {
        const validate = async (token) => {
          const res = await fetch(`${API_URL}/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            return data.user;
          }
          return null;
        };

        // Regular session (hub / seeker / employer)
        const token = localStorage.getItem(STORAGE.token);
        const savedRole = localStorage.getItem(STORAGE.role);
        if (token && savedRole && savedRole !== 'admin') {
          const u = await validate(token);
          if (u) {
            setUser(u);
            setRole(savedRole);
            registerChatKey(token);
          } else {
            localStorage.removeItem(STORAGE.token);
            localStorage.removeItem(STORAGE.role);
          }
        } else if (token && savedRole === 'admin') {
          // Legacy admin session stored in the regular keys → migrate to its own keys
          localStorage.removeItem(STORAGE.token);
          localStorage.removeItem(STORAGE.role);
          localStorage.setItem(STORAGE.adminToken, token);
          localStorage.setItem(STORAGE.adminRole, savedRole);
        }

        // Admin session (separate keys so tabs stay independent)
        const adminToken = localStorage.getItem(STORAGE.adminToken);
        const adminRoleSaved = localStorage.getItem(STORAGE.adminRole);
        if (adminToken && adminRoleSaved === 'admin') {
          const u = await validate(adminToken);
          if (u) {
            setAdminUser(u);
            setAdminRole('admin');
          } else {
            localStorage.removeItem(STORAGE.adminToken);
            localStorage.removeItem(STORAGE.adminRole);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    rehydrate();
  }, []);

  // Keep this device's push subscription in sync with the signed-in user:
  // subscribe on login (every logged-in session), unsubscribe on sign out.
  useEffect(() => {
    const token = localStorage.getItem(STORAGE.token);
    if (user && token) {
      setupPush(token).catch(() => {});
    } else if (!user && !adminUser) {
      teardownPush(localStorage.getItem(STORAGE.token)).catch(() => {});
    }
  }, [user, adminUser]);

  // Some browsers only allow the notification-permission prompt inside a user
  // gesture — retry once on the first tap/keystroke of a logged-in session.
  useEffect(() => {
    if (!user) return undefined;
    if (!('Notification' in window) || Notification.permission !== 'default') return undefined;
    const attempt = () => {
      const token = localStorage.getItem(STORAGE.token);
      if (token) setupPush(token).catch(() => {});
    };
    window.addEventListener('pointerdown', attempt, { once: true });
    window.addEventListener('keydown', attempt, { once: true });
    return () => {
      window.removeEventListener('pointerdown', attempt);
      window.removeEventListener('keydown', attempt);
    };
  }, [user]);

  const openAuth = useCallback(() => {
    setMode('role');
  }, []);

  const closeAuth = useCallback(() => setMode('closed'), []);

  const selectRole = useCallback((r) => {
    setRole(r);
    localStorage.setItem(STORAGE.role, r);
    setMode('auth');
  }, []);

  const backToRoles = useCallback(() => setMode('role'), []);

  // Register with backend API. New accounts must accept the Terms and verify
  // their email with a 6-digit code, so this returns `verification` when the
  // code still needs to be entered (the user stays logged in meanwhile).
  const registerWithEmail = useCallback(async ({ name, email, password, hubRef, termsAccepted }) => {
    try {
      const res = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role, hubRef: hubRef || null, termsAccepted }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.message || 'Registration failed' };
      }

      localStorage.setItem(STORAGE.token, data.token);
      localStorage.setItem(STORAGE.role, data.user.role);
      setRole(data.user.role);
      setUser(data.user);
      if (!data.verification?.needed) {
        setMode('closed');
        registerChatKey(data.token);
      } else {
        // Email code step at the sign-up screen — mode stays open so the OTP
        // view can take over, but only when the user came through the modal.
        if (mode !== 'auth') setMode('closed');
      }
      return { ok: true, user: data.user, verification: data.verification };
    } catch (err) {
      return { ok: false, error: 'Could not connect to server. Please try again.' };
    }
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Login with backend API. When the account has 2FA on, or hasn't been
  // verified yet, the server sends a code first and no session is created
  // until it's entered via verifyOtp.
  const loginWithEmail = useCallback(async ({ email, password, role: roleOverride }) => {
    try {
      const roleParam = roleOverride || role;
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: roleParam }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.message || 'Login failed' };
      }

      if (data.requiresOtp) {
        return {
          ok: true,
          requiresOtp: true,
          purpose: data.purpose || 'login',
          email: data.email,
          sent: data.sent,
        };
      }

      localStorage.setItem(STORAGE.token, data.token);
      setUser(data.user);
      setRole(data.user.role);
      localStorage.setItem(STORAGE.role, data.user.role);
      setMode('closed');
      registerChatKey(data.token);
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: 'Could not connect to server. Please try again.' };
    }
  }, [role]);

  // Submit an emailed code. `purpose` is 'verify' right after signing up or
  // 'login' mid-sign-in (that flow returns a session token to finish logging in).
  const verifyOtp = useCallback(async ({ code, purpose, email, role: roleOverride }) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem(STORAGE.token);
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/verify-otp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          code,
          purpose,
          ...(token ? {} : { email, role: roleOverride }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.message || 'Verification failed' };
      }

      const finalUser = data.user || (user ? { ...user, emailVerified: true } : null);
      if (data.token) {
        localStorage.setItem(STORAGE.token, data.token);
        setUser(data.user);
        setRole(data.user.role);
        localStorage.setItem(STORAGE.role, data.user.role);
        setMode('closed');
        registerChatKey(data.token);
      } else if (data.user) {
        setUser(data.user);
      }
      return { ok: true, user: finalUser };
    } catch (err) {
      return { ok: false, error: 'Could not connect to server. Please try again.' };
    }
  }, [user, role]);

  // Ask the server for a fresh code (wrong/expired code, or a lost email).
  const resendOtp = useCallback(async ({ purpose, email, role: roleOverride }) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem(STORAGE.token);
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/resend-otp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ purpose, ...(token ? {} : { email, role: roleOverride }) }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.message || 'Could not resend the code' };
      }
      return { ok: true, sent: data.sent };
    } catch (err) {
      return { ok: false, error: 'Could not connect to server. Please try again.' };
    }
  }, []);

  // Password reset — request an emailed reset code for an account (email +
  // role, identical to how login resolves the account).
  const requestPasswordReset = useCallback(async ({ email, role: roleOverride }) => {
    try {
      const res = await fetch(`${API_URL}/request-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: roleOverride || role }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.message || 'Could not request a reset code' };
      }
      return { ok: true, sent: data.sent };
    } catch (err) {
      return { ok: false, error: 'Could not connect to server. Please try again.' };
    }
  }, [role]);

  // Redeem the reset code and set a new password in one step.
  const resetPassword = useCallback(async ({ code, email, role: roleOverride, password }) => {
    try {
      const res = await fetch(`${API_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, email, role: roleOverride || role, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.message || 'Could not reset your password' };
      }
      return { ok: true, message: data.message };
    } catch (err) {
      return { ok: false, error: 'Could not connect to server. Please try again.' };
    }
  }, [role]);

  // Google sign-in / sign-up. The raw ID token is verified server-side; new
  // emails are registered using the selected role (with the emailed code step)
  // and returning emails are logged into their existing account.
  const signInWithGoogle = useCallback(async ({ idToken, termsAccepted = false }) => {
    try {
      const res = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, role, termsAccepted }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.message || 'Google sign-in failed' };
      }

      if (data.requiresOtp) {
        return {
          ok: true,
          requiresOtp: true,
          purpose: data.purpose || 'login',
          email: data.email,
          sent: data.sent,
        };
      }

      localStorage.setItem(STORAGE.token, data.token);
      localStorage.setItem(STORAGE.role, data.user.role);
      setUser(data.user);
      setRole(data.user.role);

      if (data.verification?.needed) {
        // Brand-new Google account → the emailed verification code must be
        // entered first (same step as email sign-up).
        if (mode !== 'auth') setMode('closed');
        return { ok: true, user: data.user, verification: data.verification };
      }

      setMode('closed');
      registerChatKey(data.token);
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: 'Could not connect to server. Please try again.' };
    }
  }, [role, mode]);

  const signOut = useCallback(() => {
    teardownPush(localStorage.getItem(STORAGE.token)).catch(() => {});
    localStorage.removeItem(STORAGE.token);
    localStorage.removeItem(STORAGE.role);
    setUser(null);
    setRole(null);
  }, []);

  // Merge latest server state into the logged-in user (e.g. after onboarding
  // completes so routing knows onboardingDone is now true).
  const updateUser = useCallback((patch) => {
    setUser((u) => (u ? { ...u, ...patch } : u));
    return patch;
  }, []);

  // Admin session is stored under separate keys so the admin panel and the
  // public site never share auth state across tabs.
  const adminLogin = useCallback(async ({ email, password }) => {
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: 'admin' }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.message || 'Login failed' };
      }

      localStorage.setItem(STORAGE.adminToken, data.token);
      localStorage.setItem(STORAGE.adminRole, data.user.role);
      setAdminUser(data.user);
      setAdminRole(data.user.role);
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: 'Could not connect to server. Please try again.' };
    }
  }, []);

  const adminSignOut = useCallback(() => {
    localStorage.removeItem(STORAGE.adminToken);
    localStorage.removeItem(STORAGE.adminRole);
    setAdminUser(null);
    setAdminRole(null);
  }, []);

  const value = {
    user,
    role,
    adminUser,
    adminRole,
    mode,
    loading,
    openAuth,
    closeAuth,
    selectRole,
    backToRoles,
    signInWithGoogle,
    loginWithEmail,
    registerWithEmail,
    verifyOtp,
    resendOtp,
    requestPasswordReset,
    resetPassword,
    signOut,
    updateUser,
    adminLogin,
    adminSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

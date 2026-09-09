import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { ensureKeys } from '../lib/e2e.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

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

  // Register with backend API
  const registerWithEmail = useCallback(async ({ name, email, password, hubRef }) => {
    try {
      const res = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role, hubRef: hubRef || null }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.message || 'Registration failed' };
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

  // Login with backend API
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

  // Google sign-in — stores profile locally (can be extended to call backend)
  const signInWithGoogle = useCallback((googleProfile) => {
    setUser(googleProfile);
    setMode('closed');
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE.token);
    localStorage.removeItem(STORAGE.role);
    setUser(null);
    setRole(null);
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
    signOut,
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

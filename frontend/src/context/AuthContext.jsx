import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const STORAGE = {
  token: 'tbai.token',
  role: 'tbai.role',
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [mode, setMode] = useState('closed');
  const [loading, setLoading] = useState(true);

  // Rehydrate from localStorage on mount
  useEffect(() => {
    const rehydrate = async () => {
      try {
        const token = localStorage.getItem(STORAGE.token);
        const savedRole = localStorage.getItem(STORAGE.role);

        if (token && savedRole) {
          setRole(savedRole);
          // Fetch the full user profile from the backend
          const res = await fetch(`${API_URL}/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
          } else {
            // Token invalid/expired → clear stored state
            localStorage.removeItem(STORAGE.token);
            localStorage.removeItem(STORAGE.role);
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
  const registerWithEmail = useCallback(async ({ name, email, password }) => {
    try {
      const res = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
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
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: 'Could not connect to server. Please try again.' };
    }
  }, [role]);

  // Login with backend API
  const loginWithEmail = useCallback(async ({ email, password }) => {
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
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

  const value = {
    user,
    role,
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

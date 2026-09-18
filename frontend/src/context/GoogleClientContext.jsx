import { createContext, useContext, useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Provides the Google OAuth client ID used for the account sign-in button.
// It prefers the credentials the admin saved under SiteConfig('oauth'), then
// falls back to VITE_GOOGLE_CLIENT_ID, then to a demo placeholder.
const GoogleClientContext = createContext({ clientId: '', configured: false });

export function useGoogleClient() {
  return useContext(GoogleClientContext);
}

export function GoogleClientProvider({ children }) {
  const [adminClientId, setAdminClientId] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/oauth/config`);
        if (!res.ok) return;
        const data = await res.json();
        const id = String(data?.google?.clientId || '').trim();
        if (active && id) setAdminClientId(id);
      } catch (err) {
        console.warn('Could not load OAuth config from the backend:', err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const envId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const resolved = adminClientId || envId || 'demo-client-id.apps.googleusercontent.com';
  const configured =
    !!adminClientId ||
    (!!envId &&
      !envId.startsWith('your-client-id') &&
      !envId.startsWith('demo-client-id'));

  return (
    <GoogleClientContext.Provider value={{ clientId: resolved, configured }}>
      {children}
    </GoogleClientContext.Provider>
  );
}
// Web Push helpers for the TalentriX PWA. Handles service-worker registration,
// device subscription and the URL-safe VAPID key conversion required by the
// browser Push API.

const API_URL = import.meta.env.VITE_API_URL || '/api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Is the site running as an installed app (added to home screen)? Firefox
// exposes navigator.standalone for iOS; matchMedia covers Android/desktop.
export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export function isIos() {
  return (
    /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  );
}

// Register the service worker if needed. Returns the active registration.
// Dev is skipped: Vite serves the raw (unbundled) sw.js which needs the
// workbox bundle that only exists in production builds.
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  if (import.meta.env.DEV) return null;
  const reg = await navigator.serviceWorker.register('/sw.js');
  return reg;
}

// Subscribe this device so the backend can send popup notifications. Called
// when someone is logged in on the PWA. Safe to call repeatedly — it becomes
// a no-op once a working subscription exists.
export async function setupPush(token) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const reg = await registerServiceWorker();
    if (!reg || !reg.pushManager) return;

    const permission = Notification.permission;
    if (permission === 'denied') return;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      if (permission === 'default') {
        try {
          const granted = await Notification.requestPermission();
          if (granted !== 'granted') return;
        } catch {
          return; // prompt needs a user gesture in some browsers — try later
        }
      }

      const res = await fetch(`${API_URL}/push/vapid-public-key`);
      if (!res.ok) return;
      const { publicKey } = await res.json();
      if (!publicKey) return;

      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    if (token) {
      await fetch(`${API_URL}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
    }
  } catch (err) {
    // Non-fatal: the app still works, just without phone popups for this device.
    console.error('Push setup error:', err && err.message);
  }
}

// Tear down this device's subscription (used on sign out).
export async function teardownPush(token) {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.pushManager) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    if (token) {
      const endpoint = encodeURIComponent(sub.endpoint);
      await fetch(`${API_URL}/push/subscribe?endpoint=${endpoint}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    await sub.unsubscribe().catch(() => {});
  } catch (err) {
    // ignore
  }
}
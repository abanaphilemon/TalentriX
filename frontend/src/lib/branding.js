// Keeps the browser-tab favicon (and iOS home-screen icon link) in sync with
// the brand logo saved in the admin panel — the icon is never stuck on a
// hard-coded mark and updates simultaneously with the header logo.

const ICON_SELECTOR = 'link[rel="icon"]';
const TOUCH_SELECTOR = 'link[rel="apple-touch-icon"]';

const isDataUrl = (url) => typeof url === 'string' && url.startsWith('data:');

// Apply the uploaded logo to the favicon + apple-touch-icon. Passing an empty
// value resets back to the neutral shipped favicon (which has no letters).
export function applyBrandFavicon(logo) {
  const value = logo || '';

  const icon = document.querySelector(ICON_SELECTOR);
  if (icon) {
    if (value) {
      // Cache-bust remote URLs so an updated logo shows immediately; data URLs
      // are already unique per upload so they need no suffix.
      icon.href = isDataUrl(value)
        ? value
        : `${value}${value.includes('?') ? '&' : '?'}t=${Date.now()}`;
    } else {
      icon.href = '/favicon.svg';
    }
  }

  const touch = document.querySelector(TOUCH_SELECTOR);
  if (touch) {
    touch.href = value || '/icons/apple-touch-icon.png';
  }
}
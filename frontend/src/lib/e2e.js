// Browser-side E2E encryption for the secure chat.
// ECDH P-256 derives a shared secret between the two participants, then
// AES-GCM encrypts each message. The private key never leaves this browser;
// the server only ever sees ciphertext.

const KEY_STORE = 'tbai.e2e.private';
const KEY_PUB = 'tbai.e2e.public';
const API_URL = import.meta.env.VITE_API_URL || '/api';

function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function loadJwk() {
  try {
    const jwk = JSON.parse(localStorage.getItem(KEY_STORE) || 'null');
    if (jwk && jwk.kty === 'EC' && jwk.crv === 'P-256') return jwk;
  } catch {
    // ignore
  }
  return null;
}

async function importPrivFromJwk(jwk, extractable = false) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, extractable, ['deriveBits']);
}

async function deriveKey(jwk, peerPubB64) {
  const priv = await importPrivFromJwk(jwk, false);
  const peer = await crypto.subtle.importKey('spki', b64ToBuf(peerPubB64), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, priv, 256);
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// Load this account's chat keypair. Keys are generated and stored by the
// backend (so chat always works with no setup), so we fetch the authoritative
// keypair from GET /api/chat/keys and cache a copy locally for offline use.
export async function ensureKeys(token) {
  if (token) {
    try {
      const res = await fetch(`${API_URL}/chat/keys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        if (d.privateJwk && d.pubkey) {
          localStorage.setItem(KEY_STORE, JSON.stringify(d.privateJwk));
          localStorage.setItem(KEY_PUB, d.pubkey);
          return { jwk: d.privateJwk, pubB64: d.pubkey, isNew: false };
        }
      }
    } catch {
      // offline — fall through to the cached copy if we have one
    }
  }
  const jwk = loadJwk();
  const pubB64 = (() => {
    try {
      return localStorage.getItem(KEY_PUB) || '';
    } catch {
      return '';
    }
  })();
  if (jwk && pubB64) return { jwk, pubB64, isNew: false };
  throw new Error('No chat keys available');
}

export function hasKeys() {
  return !!loadJwk();
}

export async function encryptMessage(jwk, peerPubB64, text) {
  const key = await deriveKey(jwk, peerPubB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { iv: bufToB64(iv), ct: bufToB64(ct) };
}

export async function decryptMessage(jwk, peerPubB64, ivB64, ctB64) {
  const key = await deriveKey(jwk, peerPubB64);
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(ivB64) }, key, b64ToBuf(ctB64));
  return new TextDecoder().decode(buf);
}

export function formatWhen(d) {
  const t = new Date(d);
  const now = new Date();
  const sameDay = t.toDateString() === now.toDateString();
  if (sameDay) {
    return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return t.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
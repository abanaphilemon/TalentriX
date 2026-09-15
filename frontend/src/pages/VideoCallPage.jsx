import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Monitor,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ArrowLeft,
  Clock,
  Settings,
  X,
  Wifi,
  WifiOff,
  RefreshCw,
  Maximize,
  Minimize,
  LayoutGrid,
  Users,
  FlipHorizontal2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/* -------------------------------------------------------------------------- */
/*  Environment detection                                                      */
/* -------------------------------------------------------------------------- */
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 0;
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const canGetDisplayMedia = typeof navigator.mediaDevices?.getDisplayMedia === 'function';

/* -------------------------------------------------------------------------- */
/*  ICE servers — STUN always, TURN optional (fetched from backend)            */
/* -------------------------------------------------------------------------- */
const DEFAULT_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

const CONNECTION_TIMEOUT_MS = 45_000;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY_MS = 2000;
const POLL_FAST_MS = 1500;
const POLL_SLOW_MS = 3000;
const CONTROLS_IDLE_MS = 5000; // desktop auto-hide delay
const TRACK_HEALTH_CHECK_MS = 3000;
const REMOTE_LEFT_TIMEOUT_MS = 15_000; // if disconnected > 15s with no track, assume left

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */
const fmt = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

function getConnQuality(pc) {
  if (!pc) return null;
  const stats = pc._lastStats;
  if (!stats) return null;
  const { rtt, packetsLost, packetsReceived } = stats;
  if (rtt === null) return null;
  if (rtt < 100 && packetsLost === 0) return 'good';
  if (rtt < 300 && packetsLost < packetsReceived * 0.05) return 'fair';
  return 'poor';
}

function isTrackDead(track) {
  return !track || track.readyState === 'ended' || track.muted;
}

function isRemoteScreenShare(stream) {
  if (!stream) return false;
  const vt = stream.getVideoTracks()[0];
  if (!vt) return false;
  const s = vt.getSettings();
  // displaySurface is set when sharing screen/tab/window
  if (s.displaySurface && s.displaySurface !== 'none') return true;
  // Heuristic: screen shares are typically landscape and wide
  if (s.width && s.height && s.width > s.height * 1.3) return true;
  return false;
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                             */
/* -------------------------------------------------------------------------- */
export default function VideoCallPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, adminUser, adminRole, loading } = useAuth();

  const isAdmin = adminRole === 'admin';
  const token = isAdmin ? localStorage.getItem('tbai.adminToken') : localStorage.getItem('tbai.token');
  const currentName = isAdmin ? adminUser?.name : user?.name;

  /* ── State ──────────────────────────────────────────────────────────── */
  const [status, setStatus] = useState('connecting');
  const statusRef = useRef('connecting');
  const updateStatus = (s) => { statusRef.current = s; setStatus(s); };

  const [err, setErr] = useState('');
  const [interview, setInterview] = useState(null);
  const [otherName, setOtherName] = useState(isAdmin ? currentName || 'Admin' : 'Site Administrator');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [remoteLeft, setRemoteLeft] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [connQuality, setConnQuality] = useState(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [devices, setDevices] = useState({ cameras: [], mics: [] });
  const [selectedCam, setSelectedCam] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const [toasts, setToasts] = useState([]);
  const [iceServers, setIceServers] = useState(DEFAULT_ICE_SERVERS);
  const [shareError, setShareError] = useState('');
  const [controlsShown, setControlsShown] = useState(true);
  const [mainView, setMainView] = useState('remote'); // mobile: remote | self
  const [viewMode, setViewMode] = useState('speaker'); // desktop: speaker | gallery
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [remoteIsScreenShare, setRemoteIsScreenShare] = useState(false);

  /* ── Refs ───────────────────────────────────────────────────────────── */
  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const localWrapRef = useRef(null);
  const remoteWrapRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const appliedOfferRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pollRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const timerRef = useRef(null);
  const connectionTimerRef = useRef(null);
  const reconnectCountRef = useRef(0);
  const addedCandidatesRef = useRef(new Set());
  const offererRef = useRef(false);
  const remoteOfferAppliedRef = useRef(false);
  const iceRestartCountRef = useRef(0);
  const cancelledRef = useRef(false);
  const mainViewRef = useRef('remote');
  const viewModeRef = useRef('speaker');
  const facingModeRef = useRef('user');
  const camTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const controlsTimerRef = useRef(null);
  const healthCheckRef = useRef(null);
  const remoteDisconnectTimerRef = useRef(null);
  const controlsShownRef = useRef(true);
  const stageRef = useRef(null);

  /* ── Toast helper ───────────────────────────────────────────────────── */
  const addToast = useCallback((msg, type = 'info', durationMs = 4000) => {
    const t = { id: Date.now() + Math.random(), msg, type };
    setToasts((prev) => [...prev, t]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), durationMs);
  }, []);

  const setMainViewSafe = (v) => {
    mainViewRef.current = v;
    [localWrapRef, remoteWrapRef].forEach((r) => {
      if (!r.current) return;
      r.current.style.left = '';
      r.current.style.top = '';
      r.current.style.right = '';
      r.current.style.bottom = '';
      r.current.style.zIndex = '';
    });
    setMainView(v);
  };
  const setViewModeSafe = (v) => { viewModeRef.current = v; setViewMode(v); };

  /* ── Controls show/hide logic ────────────────────────────────────────── */
  const showControls = useCallback(() => {
    controlsShownRef.current = true;
    setControlsShown(true);
    // Reset the auto-hide timer (desktop only)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (!isMobile) {
      controlsTimerRef.current = setTimeout(() => {
        if (statusRef.current === 'active') {
          controlsShownRef.current = false;
          setControlsShown(false);
        }
      }, CONTROLS_IDLE_MS);
    }
  }, []);

  const hideControls = useCallback(() => {
    if (isMobile) return; // on mobile, tapping the stage toggles instead
    controlsShownRef.current = false;
    setControlsShown(false);
  }, []);

  /* ── Device enumeration ─────────────────────────────────────────────── */
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cameras = all.filter((d) => d.kind === 'videoinput');
      const mics = all.filter((d) => d.kind === 'audioinput');
      setDevices({ cameras, mics });
    } catch { /* ignore — permissions not yet granted */ }
  }, []);

  useEffect(() => {
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
      return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
    }
  }, [refreshDevices]);

  /* ── Fetch TURN servers from backend config ─────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/interview/iceServers`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('public iceServers unavailable');
        const data = await res.json();
        const configured = data?.value;
        if (Array.isArray(configured) && configured.length > 0) {
          setIceServers(configured);
        } else if (configured?.iceServers && Array.isArray(configured.iceServers)) {
          setIceServers(configured.iceServers);
        }
      } catch {
        try {
          const res = await fetch(`${API_URL}/admin/config/iceServers`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const configured = data?.value;
            if (Array.isArray(configured) && configured.length > 0) {
              setIceServers(configured);
            } else if (configured?.iceServers && Array.isArray(configured.iceServers)) {
              setIceServers(configured.iceServers);
            }
          }
        } catch { /* use defaults */ }
      }
    })();
  }, [token]);

  /* ── Fullscreen tracking ────────────────────────────────────────────── */
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();
      } else if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch { /* ignore */ }
  }, []);

  /* ── Keep screen awake during call ──────────────────────────────────── */
  useEffect(() => {
    let wl = null;
    const requestWake = () => {
      if (!('wakeLock' in navigator)) return;
      navigator.wakeLock.request('screen')
        .then((l) => { wl = l; })
        .catch(() => { wl = null; });
    };
    requestWake();
    const onVis = () => { if (document.visibilityState === 'visible' && !wl) requestWake(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (wl) wl.release().catch(() => {});
    };
  }, []);

  /* ── Controls auto-hide + show on mouse/touch ──────────────────────── */
  // Desktop: auto-hide after idle, re-show on mouse move / pointer down / touch
  useEffect(() => {
    if (isMobile) return; // mobile uses tap-to-toggle

    const stage = stageRef.current;
    const onPointer = () => showControls();
    const onKeyDown = (e) => {
      // Any key press re-shows controls
      if (!e.target.closest('input, textarea')) showControls();
    };

    // Show on mouse/pointer movement anywhere in the stage
    if (stage) {
      stage.addEventListener('mousemove', onPointer);
      stage.addEventListener('pointerdown', onPointer);
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      if (stage) {
        stage.removeEventListener('mousemove', onPointer);
        stage.removeEventListener('pointerdown', onPointer);
      }
      document.removeEventListener('keydown', onKeyDown);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [showControls]);

  // Kick off the initial auto-hide timer when status becomes active
  useEffect(() => {
    if (status === 'active' && !isMobile) showControls();
  }, [status, showControls]);

  /* ── WebRTC helpers ─────────────────────────────────────────────────── */
  const resetPeerState = () => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onsignalingstatechange = null;
      try { pcRef.current.close(); } catch { /* ignore */ }
    }
    pcRef.current = null;
    remoteOfferAppliedRef.current = false;
    appliedOfferRef.current = null;
    addedCandidatesRef.current = new Set();
    iceRestartCountRef.current = 0;
  };

  const cleanup = () => {
    clearInterval(pollRef.current);
    clearInterval(statsIntervalRef.current);
    clearInterval(healthCheckRef.current);
    clearTimeout(connectionTimerRef.current);
    clearTimeout(timerRef.current);
    clearTimeout(controlsTimerRef.current);
    clearTimeout(remoteDisconnectTimerRef.current);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    resetPeerState();
  };

  const getSignalState = async () => {
    const res = await fetch(`${API_URL}/interviews/${id}/signal`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Could not reach the signaling server');
    return res.json();
  };

  const postSignal = async (body) => {
    const res = await fetch(`${API_URL}/interviews/${id}/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Could not send signaling data');
  };

  const postIce = async (kind, candidate) => {
    try {
      await fetch(`${API_URL}/interviews/${id}/ice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind, candidate }),
      });
    } catch { /* best-effort */ }
  };

  const applyCandidates = (list) => {
    const pc = pcRef.current;
    if (!pc) return;
    for (const raw of list || []) {
      if (addedCandidatesRef.current.has(raw)) continue;
      addedCandidatesRef.current.add(raw);
      try {
        const parsed = JSON.parse(raw);
        pc.addIceCandidate(new RTCIceCandidate(parsed)).catch(() => {});
      } catch { /* ignore malformed */ }
    }
  };

  /* ── Stats collection for connection quality ────────────────────────── */
  const collectStats = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') return;
    try {
      const stats = await pc.getStats();
      let rtt = null;
      let packetsLost = 0;
      let packetsReceived = 0;
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          rtt = report.currentRoundTripTime ?? null;
        }
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          packetsLost = report.packetsLost ?? 0;
          packetsReceived = report.packetsReceived ?? 0;
        }
      });
      pc._lastStats = { rtt, packetsLost, packetsReceived };
      setConnQuality(getConnQuality(pc));
    } catch { /* ignore */ }
  }, []);

  /* ── Wire connection state handlers ─────────────────────────────────── */
  const wireConnectionState = useCallback((pc) => {
    pc.onconnectionstatechange = () => {
      const cs = pc.connectionState;
      if (cs === 'connected' && statusRef.current !== 'active') {
        clearTimeout(connectionTimerRef.current);
        clearTimeout(remoteDisconnectTimerRef.current);
        setReconnecting(false);
        setReconnectAttempt(0);
        reconnectCountRef.current = 0;
        iceRestartCountRef.current = 0;
        updateStatus('active');
      } else if (cs === 'disconnected') {
        if (statusRef.current === 'active' && !cancelledRef.current) {
          // Start a timer: if still disconnected after REMOTE_LEFT_TIMEOUT_MS, assume peer left
          if (!remoteDisconnectTimerRef.current) {
            remoteDisconnectTimerRef.current = setTimeout(() => {
              if (pcRef.current && pcRef.current.connectionState === 'disconnected' && !cancelledRef.current) {
                addToast('The other person appears to have left the call.', 'error', 8000);
                setRemoteLeft(true);
                remoteDisconnectTimerRef.current = null;
              }
            }, REMOTE_LEFT_TIMEOUT_MS);
          }
          // Also try reconnecting immediately
          handleDisconnect(pc, cs);
        }
      } else if (cs === 'failed') {
        if (statusRef.current === 'active' && !cancelledRef.current) {
          addToast('The other person has left the call.', 'error', 8000);
          setRemoteLeft(true);
          updateStatus('ended');
        }
      } else if (cs === 'closed') {
        if (statusRef.current === 'active' && !cancelledRef.current) {
          setRemoteLeft(true);
          updateStatus('ended');
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      if (iceState === 'failed') {
        addToast('Connection lost — attempting reconnect…', 'error');
        if (statusRef.current === 'active' && !cancelledRef.current) {
          attemptIceRestart(pc);
        }
      }
    };
  }, [addToast]);

  /* ── Disconnect handling + reconnection ─────────────────────────────── */
  const handleDisconnect = useCallback(async (pc, reason) => {
    if (reconnectCountRef.current >= MAX_RECONNECT_ATTEMPTS) {
      addToast(`Could not reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`, 'error');
      updateStatus('ended');
      return;
    }
    setReconnecting(true);
    reconnectCountRef.current += 1;
    setReconnectAttempt(reconnectCountRef.current);
    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectCountRef.current - 1);
    addToast(`Connection lost (${reason}). Reconnecting in ${Math.round(delay / 1000)}s…`, 'info', delay);
    await sleep(delay);
    if (cancelledRef.current) return;
    try {
      await attemptIceRestart(pc);
    } catch {
      addToast('Reconnect failed — ending call', 'error');
      updateStatus('ended');
    }
  }, [addToast]);

  const attemptIceRestart = useCallback(async (pc) => {
    if (!pc || pc.signalingState === 'closed') return;
    iceRestartCountRef.current += 1;
    try {
      if (offererRef.current) {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        await postSignal({ kind: 'offer', sdp: pc.localDescription.sdp });
      } else {
        await pc.createOffer({ iceRestart: true }).then(async (offer) => {
          await pc.setLocalDescription(offer);
          await postSignal({ kind: 'offer', sdp: pc.localDescription.sdp });
          offererRef.current = true;
        });
      }
    } catch { /* ignore — will retry */ }
  }, []);

  /* ── Peer wiring ────────────────────────────────────────────────────── */
  const wirePeer = useCallback((pc, onRemoteStream) => {
    pc.ontrack = (e) => {
      if (e.streams && e.streams[0]) {
        if (!remoteJoined) setRemoteJoined(true);
        clearTimeout(remoteDisconnectTimerRef.current);
        setRemoteLeft(false);
        onRemoteStream(e.streams[0]);

        // Detect screen share on remote stream
        const checkScreen = () => setRemoteIsScreenShare(isRemoteScreenShare(e.streams[0]));
        checkScreen();
        // Re-check when track settings change
        e.streams[0].getTracks().forEach((t) => {
          t.addEventListener('settingschanged', checkScreen);
        });
      }
    };

    // Detect remote tracks ending (peer left)
    pc.ontrack = ((orig) => (e) => {
      orig(e);
      if (e.streams && e.streams[0]) {
        e.streams[0].getTracks().forEach((t) => {
          t.addEventListener('ended', () => {
            if (cancelledRef.current) return;
            const remaining = e.streams[0].getTracks().filter((tr) => tr.readyState === 'live');
            if (remaining.length === 0) {
              addToast('The other person has left the call.', 'error', 8000);
              setRemoteLeft(true);
            }
          });
        });
      }
    })(pc.ontrack);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        postIce(offererRef.current ? 'offer' : 'answer', JSON.stringify(e.candidate));
      }
    };
    wireConnectionState(pc);
  }, [wireConnectionState, remoteJoined, addToast]);

  const attachRemoteStream = useCallback((stream) => {
    remoteStreamRef.current = stream;
    if (remoteRef.current) remoteRef.current.srcObject = stream;
  }, []);

  // Callback refs re-attach the current stream when the <video> element
  // remounts (e.g. toggling speaker/gallery view), so the picture never
  // goes blank. Without this, srcObject is only set when the stream
  // changes, leaving the fresh element with no stream.
  const setLocalVideoEl = useCallback((el) => {
    localRef.current = el;
    if (el && localStreamRef.current) el.srcObject = localStreamRef.current;
  }, []);
  const setRemoteVideoEl = useCallback((el) => {
    remoteRef.current = el;
    if (el && remoteStreamRef.current) el.srcObject = remoteStreamRef.current;
  }, []);

  /* ── Offer/answer creation ──────────────────────────────────────────── */
  const createPeer = useCallback((stream, iceOverride) => {
    const pc = new RTCPeerConnection({ iceServers: iceOverride || iceServers });
    wirePeer(pc, attachRemoteStream);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    return pc;
  }, [iceServers, wirePeer, attachRemoteStream]);

  const becomeOfferer = async (stream) => {
    const pc = createPeer(stream);
    pcRef.current = pc;
    offererRef.current = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await postSignal({ kind: 'offer', sdp: pc.localDescription.sdp });
  };

  const becomeAnswerer = async (stream, sdp) => {
    const pc = createPeer(stream);
    pcRef.current = pc;
    offererRef.current = false;
    await pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await postSignal({ kind: 'answer', sdp: pc.localDescription.sdp });
  };

  /* ── Reconcile — poll signaling and apply remote SDP + ICE ──────────── */
  const reconcile = useCallback(async (stream) => {
    if (cancelledRef.current) return;
    let state;
    try { state = await getSignalState(); } catch { return; }

    const pc = pcRef.current;
    if (!pc) return;

    if (offererRef.current) {
      // We published the (newest) offer — apply the matching answer when it lands.
      if (state.answer && !pc.remoteDescription) {
        try { await pc.setRemoteDescription({ type: 'answer', sdp: state.answer }); }
        catch (e) { console.warn('setRemoteDescription(answer) failed:', e); }
      }
      applyCandidates(state.answerCandidates);
      return;
    }

    // We are (or may become) the answerer. If the offer sitting in the room
    // differs from the one we already answered — which happens when both
    // sides ended the call and then re-joined without rescheduling, letting
    // the admin publish a fresh offer — rebuild the connection against the
    // new offer so the call actually connects again.
    if (state.offer && state.offer !== appliedOfferRef.current) {
      if (appliedOfferRef.current) {
        resetPeerState();
        const npc = createPeer(stream);
        pcRef.current = npc;
        if (cancelledRef.current) return;
      }
      const npc = pcRef.current;
      if (!npc) return;
      appliedOfferRef.current = state.offer;
      remoteOfferAppliedRef.current = true;
      try {
        if (!npc.remoteDescription) {
          await npc.setRemoteDescription({ type: 'offer', sdp: state.offer });
        }
        const answer = await npc.createAnswer();
        await npc.setLocalDescription(answer);
        await postSignal({ kind: 'answer', sdp: npc.localDescription.sdp });
      } catch (e) { console.warn('answer creation failed:', e); }
    }
    applyCandidates(state.offerCandidates);
  }, [id, token]);

  /* ── Open camera/mic with device selection support ──────────────────── */
  const openMedia = useCallback(async (camId, micId, facing) => {
    const constraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };

    if (micId) {
      constraints.audio.deviceId = { exact: micId };
    }
    if (camId) {
      constraints.video = { deviceId: { exact: camId } };
    } else if (facing || isMobile) {
      constraints.video = {
        facingMode: { ideal: facing || 'user' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      };
    } else {
      constraints.video = { width: { ideal: 1280 }, height: { ideal: 720 } };
    }

    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    }
  }, []);

  /* ── Shared video track swap helper ─────────────────────────────────── */
  const replaceVideoTrack = useCallback(async (newTrack) => {
    const ls = localStreamRef.current;
    const oldTrack = ls?.getVideoTracks()[0];
    if (ls && oldTrack) { ls.removeTrack(oldTrack); oldTrack.stop(); }
    if (ls) ls.addTrack(newTrack);
    if (localRef.current) localRef.current.srcObject = ls;
    const pc = pcRef.current;
    if (pc) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newTrack);
    }
    setCamOn(true);
  }, []);

  /* ── Recover dead camera track ──────────────────────────────────────── */
  const recoverCamera = useCallback(async () => {
    if (cancelledRef.current || isScreenShareActive()) return;
    try {
      const newStream = await openMedia(selectedCam, selectedMic, facingModeRef.current);
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack) {
        await replaceVideoTrack(newVideoTrack);
        addToast('Camera reconnected', 'success', 2000);
      }
    } catch {
      setCamOn(false);
      addToast('Could not re-acquire camera. Check browser permissions.', 'error');
    }
  }, [selectedCam, selectedMic, openMedia, replaceVideoTrack, addToast]);

  const isScreenShareActive = () => !!screenTrackRef.current;

  /* ── Switch camera/mic mid-call ─────────────────────────────────────── */
  const switchDevice = useCallback(async (kind, deviceId) => {
    if (kind === 'video') {
      setSelectedCam(deviceId);
      try {
        const newStream = await openMedia(deviceId, selectedMic);
        await replaceVideoTrack(newStream.getVideoTracks()[0]);
      } catch (e) {
        addToast('Could not switch camera: ' + (e.message || 'unknown error'), 'error');
      }
    } else {
      setSelectedMic(deviceId);
      try {
        const newStream = await openMedia(selectedCam, deviceId);
        const newTrack = newStream.getAudioTracks()[0];
        const oldTrack = localStreamRef.current?.getAudioTracks()[0];

        if (localStreamRef.current && oldTrack) {
          localStreamRef.current.removeTrack(oldTrack);
          oldTrack.stop();
          localStreamRef.current.addTrack(newTrack);
        } else if (localStreamRef.current) {
          localStreamRef.current.addTrack(newTrack);
        }

        const pc = pcRef.current;
        if (pc) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
          if (sender) await sender.replaceTrack(newTrack);
        }
        setMicOn(true);
      } catch (e) {
        addToast('Could not switch microphone: ' + (e.message || 'unknown error'), 'error');
      }
    }
  }, [selectedCam, selectedMic, openMedia, replaceVideoTrack, addToast]);

  /* ── Flip front/back camera (mobile) ────────────────────────────────── */
  const flipCamera = useCallback(async () => {
    const next = facingModeRef.current === 'user' ? 'environment' : 'user';
    facingModeRef.current = next;
    try {
      const newStream = await openMedia('', selectedMic, next);
      await replaceVideoTrack(newStream.getVideoTracks()[0]);
    } catch (e) {
      facingModeRef.current = next === 'user' ? 'environment' : 'user';
      addToast('Could not switch camera: ' + (e.message || 'unknown error'), 'error');
    }
  }, [selectedMic, openMedia, replaceVideoTrack, addToast]);

  /* ── Main setup effect ──────────────────────────────────────────────── */
  useEffect(() => {
    cancelledRef.current = false;

    (async () => {
      // 1. Load interview context
      try {
        const url = isAdmin ? `${API_URL}/admin/interviews` : `${API_URL}/interviews/me`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Could not load the interview');
        }
        const data = await res.json();
        const found = (data.interviews || []).find((i) => String(i.id) === String(id));
        if (!found) throw new Error('Interview not found or has not been accepted yet');
        if (found.status !== 'accepted') throw new Error('This interview has not been accepted yet. Please wait for the admin to accept.');
        if (!cancelledRef.current) setInterview(found);
        if (isAdmin && found.user) setOtherName(found.user.name || 'User');
      } catch (e) {
        if (!cancelledRef.current) { setErr(e.message); updateStatus('error'); }
        return;
      }

      // 2. Refresh device list
      await refreshDevices();

      // 3. Open camera + mic
      let stream;
      try {
        stream = await openMedia(selectedCam, selectedMic);
      } catch (e) {
        if (cancelledRef.current) return;
        let msg = 'Could not access your camera or microphone.';
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          msg = 'Camera/microphone permission was denied. Please allow access in your browser settings and reload the page.';
        } else if (e.name === 'NotFoundError') {
          msg = 'No camera or microphone found. Please connect a device and try again.';
        } else if (e.name === 'NotReadableError') {
          msg = 'Your camera or microphone is in use by another application. Close other apps using the camera and try again.';
        } else if (e.name === 'OverconstrainedError') {
          msg = 'The requested camera/microphone is not available on this device. The default device will be used.';
          try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); }
          catch { setErr(msg); updateStatus('error'); return; }
        } else {
          msg = `Camera/microphone error: ${e.message || 'unknown'}. Check browser permissions and try again.`;
        }
        if (!stream) { setErr(msg); updateStatus('error'); return; }
      }
      if (cancelledRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

      localStreamRef.current = stream;
      if (localRef.current) localRef.current.srcObject = stream;

      // 4. Create peer connection
      try {
        if (isAdmin) {
          await becomeOfferer(stream);
        } else {
          const pc = createPeer(stream);
          pcRef.current = pc;
          offererRef.current = false;
        }
      } catch (e) {
        if (!cancelledRef.current) {
          setErr('Could not establish the video connection. Please check your network and try again.');
          updateStatus('error');
        }
        return;
      }

      // 5. Connection timeout
      connectionTimerRef.current = setTimeout(() => {
        if (statusRef.current === 'connecting' && !cancelledRef.current) {
          addToast('Connection is taking longer than expected…', 'info');
        }
      }, CONNECTION_TIMEOUT_MS);

      // 6. Start polling + stats + timer
      reconcile(stream);
      pollRef.current = setInterval(() => reconcile(stream), POLL_FAST_MS);
      // After 10s switch to slower polling
      setTimeout(() => {
        if (!cancelledRef.current && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = setInterval(() => reconcile(stream), POLL_SLOW_MS);
        }
      }, 10_000);
      statsIntervalRef.current = setInterval(collectStats, 3000);
      const t0 = Date.now();
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);

      // 7. Dead track health check — if the OS/browser kills the camera/mic
      //    we detect it within TRACK_HEALTH_CHECK_MS and attempt auto-recovery.
      healthCheckRef.current = setInterval(() => {
        if (cancelledRef.current) return;
        const ls = localStreamRef.current;
        if (!ls) return;

        const vt = ls.getVideoTracks()[0];
        const at = ls.getAudioTracks()[0];

        if (vt && vt.readyState === 'ended') {
          setCamOn(false);
          // Attempt recovery once
          recoverCamera();
        }
        if (at && at.readyState === 'ended') {
          setMicOn(false);
          addToast('Microphone was disconnected', 'error');
        }
      }, TRACK_HEALTH_CHECK_MS);
    })();

    return () => {
      cancelledRef.current = true;
      clearInterval(pollRef.current);
      clearInterval(statsIntervalRef.current);
      clearInterval(healthCheckRef.current);
      clearTimeout(connectionTimerRef.current);
      clearTimeout(timerRef.current);
      clearTimeout(controlsTimerRef.current);
      clearTimeout(remoteDisconnectTimerRef.current);
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
      resetPeerState();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAdmin]);

  /* ── Handle page visibility (mobile tab switch) ─────────────────────── */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && statusRef.current === 'active') {
        const pc = pcRef.current;
        if (pc && (pc.connectionState === 'disconnected' || pc.connectionState === 'failed')) {
          addToast('Reconnecting after tab switch…', 'info');
          attemptIceRestart(pc);
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [addToast, attemptIceRestart]);

  /* ── Handle track ended (user revoked permission mid-call) ──────────── */
  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const onTrackEnded = (e) => {
      if (cancelledRef.current) return;
      if (e.track.kind === 'video') {
        setCamOn(false);
        addToast('Camera was disconnected. Tap the camera button to try reconnecting.', 'error', 6000);
      } else if (e.track.kind === 'audio') {
        setMicOn(false);
        addToast('Microphone was disconnected', 'error');
      }
    };

    stream.addEventListener('trackended', onTrackEnded);
    return () => stream.removeEventListener('trackended', onTrackEnded);
  }, [addToast]);

  /* ── Keyboard shortcuts ─────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (statusRef.current !== 'connecting' && statusRef.current !== 'active') return;
      switch (e.key.toLowerCase()) {
        case 'm': toggleMic(); break;
        case 'v': toggleCam(); break;
        case 's': toggleShare(); break;
        case 'f': if (!isMobile) toggleFullscreen(); break;
        case 'escape': setShowEndConfirm(false); setShowSettings(false); break;
        case 'delete':
        case 'backspace':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); setShowEndConfirm(true); }
          break;
        default: break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micOn, camOn, sharing]);

  /* ── Control handlers ───────────────────────────────────────────────── */
  const toggleMic = () => {
    const ls = localStreamRef.current;
    if (!ls) return;
    const next = !micOn;
    ls.getAudioTracks().forEach((t) => { t.enabled = next; });
    setMicOn(next);
    if (!next) addToast('Microphone muted', 'info', 2000);
  };

  const toggleCam = async () => {
    const ls = localStreamRef.current;
    if (!ls) return;

    // If currently off — re-enable (may need to re-acquire a dead track)
    if (!camOn) {
      const existingTrack = ls.getVideoTracks()[0];
      if (existingTrack && existingTrack.readyState === 'live') {
        existingTrack.enabled = true;
        setCamOn(true);
      } else {
        // Track is dead — re-acquire a new camera stream
        await recoverCamera();
      }
      return;
    }

    // Turning camera off
    ls.getVideoTracks().forEach((t) => { t.enabled = false; });
    setCamOn(false);
    addToast('Camera off', 'info', 2000);
  };

  const restoreCameraTrack = async () => {
    const pc = pcRef.current;
    if (!pc || !localStreamRef.current) return;
    const camTrack = camTrackRef.current || localStreamRef.current.getVideoTracks()[0];
    if (camTrack) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(camTrack);
    }
  };

  const stopSharing = async () => {
    const ls = localStreamRef.current;
    if (screenTrackRef.current) {
      if (ls && screenTrackRef.current) ls.removeTrack(screenTrackRef.current);
      try { screenTrackRef.current.stop(); } catch { /* ignore */ }
      screenTrackRef.current = null;
    }
    const camTrack = camTrackRef.current;
    if (camTrack && ls && !ls.getVideoTracks().includes(camTrack)) {
      ls.addTrack(camTrack);
    }
    await restoreCameraTrack();
    camTrackRef.current = null;
    if (localRef.current && ls) localRef.current.srcObject = ls;
  };

  const toggleShare = async () => {
    const pc = pcRef.current;
    const ls = localStreamRef.current;
    if (!pc || !ls) return;

    if (sharing) {
      try { await stopSharing(); } catch (e) { console.warn('stopSharing failed:', e); }
      setSharing(false);
      setShareError('');
      return;
    }

    // Graceful fallback for unsupported environments
    if (!canGetDisplayMedia) {
      setShareError('Screen sharing is not supported on this device or browser. Please use a laptop or desktop with Chrome, Edge, or Firefox.');
      setTimeout(() => setShareError(''), 6000);
      return;
    }

    try {
      const shareConstraints = { video: { cursor: 'always' } };
      if (isMobile) shareConstraints.video.preferCurrentTab = true;

      const screen = await navigator.mediaDevices.getDisplayMedia(shareConstraints);
      const screenVideoTrack = screen.getVideoTracks()[0];

      if (!screenVideoTrack) {
        setShareError('Screen capture was denied.');
        setTimeout(() => setShareError(''), 4000);
        return;
      }

      // Keep the camera track so we can restore it when sharing ends
      const camTrack = ls.getVideoTracks()[0] || null;
      camTrackRef.current = camTrack;
      screenTrackRef.current = screenVideoTrack;
      if (camTrack) ls.removeTrack(camTrack);
      ls.addTrack(screenVideoTrack);

      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(screenVideoTrack);
      if (localRef.current) localRef.current.srcObject = ls;
      setSharing(true);
      setShareError('');

      screenVideoTrack.addEventListener('ended', async () => {
        if (cancelledRef.current) return;
        try { await stopSharing(); } catch { /* ignore */ }
        setSharing(false);
      });
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'AbortError') {
        // User cancelled — silent
      } else {
        setShareError('Screen sharing failed: ' + (e.message || 'unknown error'));
        setTimeout(() => setShareError(''), 4000);
      }
    }
  };

  const endCall = async (completed = false) => {
    setShowEndConfirm(false);
    clearInterval(pollRef.current);
    clearInterval(statsIntervalRef.current);
    clearInterval(healthCheckRef.current);
    clearTimeout(connectionTimerRef.current);
    clearTimeout(timerRef.current);
    clearTimeout(controlsTimerRef.current);
    clearTimeout(remoteDisconnectTimerRef.current);
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    resetPeerState();
    if (completed && isAdmin) {
      try {
        await fetch(`${API_URL}/admin/interviews/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'completed' }),
        });
      } catch { /* ignore */ }
    }
    updateStatus('ended');
  };

  /* ── Draggable PiP logic ────────────────────────────────────────────── */
  const makePipDrag = (elRef, isMiniRef) => {
    return (e) => {
      const mini = isMiniRef();
      if (!mini || !elRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = elRef.current.getBoundingClientRect();
      const start = {
        x: e.clientX,
        y: e.clientY,
        left: rect.left,
        top: rect.top,
        moved: false,
      };
      elRef.current.style.zIndex = '30';
      const onMove = (ev) => {
        if (!start) return;
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) start.moved = true;
        const w = elRef.current.offsetWidth;
        const h = elRef.current.offsetHeight;
        const maxX = window.innerWidth - w - 8;
        const maxY = window.innerHeight - h - 8;
        elRef.current.style.left = `${clamp(start.left + dx, 8, maxX)}px`;
        elRef.current.style.top = `${clamp(start.top + dy, 8, maxY)}px`;
        elRef.current.style.right = 'auto';
        elRef.current.style.bottom = 'auto';
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        const wasMoved = start.moved;
        setTimeout(() => {
          if (isMobile && !wasMoved && elRef.current) {
            setMainViewSafe(mainViewRef.current === 'remote' ? 'self' : 'remote');
            showControls();
          }
        }, 0);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    };
  };

  const localDown = makePipDrag(localWrapRef, () => (viewModeRef.current === 'speaker') && (isMobile ? mainViewRef.current === 'remote' : true));
  const remoteDown = makePipDrag(remoteWrapRef, () => isMobile && mainViewRef.current === 'self');

  /* ── Render helpers ─────────────────────────────────────────────────── */
  const qualityIcon = (q) => {
    if (q === 'poor') return <WifiOff className="w-3.5 h-3.5" />;
    return <Wifi className="w-3.5 h-3.5" />;
  };
  const qualityColor = (q) => (q === 'good' ? 'text-green-400' : q === 'fair' ? 'text-yellow-400' : 'text-red-400');

  /* ── Render ─────────────────────────────────────────────────────────── */
  if (loading) return <div className="h-[100dvh] bg-[#0b1220]" />;

  const inCall = status === 'connecting' || status === 'active';
  const gallery = !isMobile && viewMode === 'gallery' && status === 'active' && remoteJoined;

  const PIP_M = 'z-10 w-36 aspect-video rounded-xl ring-1 ring-white/25 shadow-2xl cursor-grab active:cursor-grabbing call-pip-drag';
  const PIP_D = 'z-10 w-56 sm:w-64 aspect-video rounded-2xl ring-1 ring-white/25 shadow-2xl cursor-grab active:cursor-grabbing call-pip-drag';

  const remoteClasses = isMobile
    ? (mainView === 'remote' ? 'inset-0' : `${PIP_M} right-3 bottom-28`)
    : 'inset-0';
  const localClasses = isMobile
    ? (mainView === 'self' ? 'inset-0' : `${PIP_M} right-3 bottom-28`)
    : `${PIP_D} right-4 bottom-24`;

  // Remote video class: screen shares use object-contain so the full content is visible
  const remoteVideoClass = remoteIsScreenShare
    ? 'w-full h-full object-contain bg-[#0a0e18]'
    : 'w-full h-full object-cover';

  return (
    <div className="h-[100dvh] min-h-[100svh] bg-[#0b1220] text-white flex flex-col overflow-hidden select-none">
      {/* ── Toasts ──────────────────────────────────────────────────── */}
      <div className="fixed top-4 inset-x-0 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ duration: 0.22 }}
              className={`px-4 py-2 rounded-xl text-sm font-medium shadow-lg backdrop-blur-xl pointer-events-auto max-w-[92vw]
                ${t.type === 'error' ? 'bg-red-600 text-white' : t.type === 'success' ? 'bg-green-600 text-white' : 'bg-[#1c2536]/90 text-white border border-white/10'}`}
            >
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className={`h-12 sm:h-14 px-3 sm:px-4 flex items-center justify-between bg-black/40 backdrop-blur border-b border-white/10 shrink-0 z-20 transition-opacity duration-300 ${controlsShown ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
          <span className="font-display font-bold text-sm truncate">Secure interview</span>
          {interview?.status === 'accepted' && interview?.proposedDate && (
            <span className="hidden md:inline-flex items-center gap-1 text-xs text-white/60 ml-1 shrink-0">
              <Clock className="w-3.5 h-3.5" />
              {new Date(interview.proposedDate).toLocaleDateString()} · {interview.proposedTime || '—'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-white/70 shrink-0 min-w-0">
          {status === 'active' && connQuality ? (
            <span className={`flex items-center gap-1.5 text-xs ${qualityColor(connQuality)}`}>
              {qualityIcon(connQuality)}
              <span className="hidden sm:inline capitalize">{connQuality}</span>
            </span>
          ) : (
            status === 'active' && (
              <span className="flex items-center gap-1.5 text-xs text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Live
              </span>
            )
          )}
          <span className="px-2 py-0.5 rounded-full bg-white/10 text-xs font-semibold truncate max-w-[9rem] sm:max-w-[12rem]">{otherName}</span>
        </div>
      </div>

      {/* ── Main stage ──────────────────────────────────────────────── */}
      <main
        ref={stageRef}
        className="flex-1 relative overflow-hidden bg-[#05070d]"
        onClick={inCall ? () => {
          // On mobile: toggle controls. On desktop: controls show/hide via pointer events.
          if (isMobile) setControlsShown((c) => !c);
        } : undefined}
      >
        {/* Active / connecting call */}
        {inCall && (
          <>
            {gallery ? (
              /* Gallery view (desktop) — both participants side by side */
              <div className="absolute inset-0 grid grid-cols-2 gap-1.5 sm:gap-2 p-1.5 sm:p-2">
                <div className="relative rounded-xl sm:rounded-2xl overflow-hidden bg-black ring-1 ring-white/10 min-w-0">
                  <video ref={setLocalVideoEl} autoPlay playsInline muted className="w-full h-full object-cover" />
                  {!camOn && (
                    <div className="absolute inset-0 bg-gradient-to-br from-[#1a2333] to-[#0b1220] flex items-center justify-center">
                      <VideoOff className="w-8 h-8 text-white/30" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 px-3 pt-8 pb-2 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-xs sm:text-sm font-semibold truncate">You {sharing && '· Sharing'}</span>
                  </div>
                  {!micOn && (
                    <div className="absolute top-2 left-2 w-7 h-7 rounded-full bg-red-600 flex items-center justify-center">
                      <MicOff className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
                <div className="relative rounded-xl sm:rounded-2xl overflow-hidden bg-black ring-1 ring-white/10 min-w-0">
                  <video ref={setRemoteVideoEl} autoPlay playsInline className={remoteVideoClass} />
                  {remoteIsScreenShare && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-primary/80 text-secondary text-[10px] font-bold backdrop-blur">
                      <Monitor className="w-3 h-3" /> Screen share
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 px-3 pt-8 pb-2 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-xs sm:text-sm font-semibold truncate">{otherName}</span>
                    {connQuality && (
                      <span className={`flex items-center gap-1 text-[10px] ml-auto ${qualityColor(connQuality)}`}>
                        {qualityIcon(connQuality)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Remote video — full screen OR floating PiP on mobile */}
                <div
                  ref={remoteWrapRef}
                  onPointerDown={remoteDown}
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute transition-all duration-300 overflow-hidden bg-black ${remoteClasses}`}
                >
                  <video ref={setRemoteVideoEl} autoPlay playsInline onClick={(e) => e.stopPropagation()} className={remoteVideoClass} />
                  {remoteIsScreenShare && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-primary/80 text-secondary text-[10px] font-bold backdrop-blur z-10">
                      <Monitor className="w-3 h-3" /> Screen share
                    </div>
                  )}
                  <div className={`absolute inset-x-0 bottom-0 pt-8 pb-1.5 px-2 bg-gradient-to-t from-black/70 to-transparent
                    ${mainView === 'remote' ? 'sm:pt-12 sm:pb-3 sm:px-3' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${remoteJoined && !remoteLeft ? 'bg-green-400' : 'bg-white/30'} ${remoteJoined && !remoteLeft ? '' : 'animate-pulse'}`} />
                      <span className={`truncate ${mainView === 'remote' ? 'text-xs sm:text-sm' : 'text-[10px]'} font-semibold`}>
                        {remoteLeft ? `${otherName} left` : remoteJoined ? otherName : 'Waiting…'}
                      </span>
                      {connQuality && mainView === 'remote' && status === 'active' && (
                        <span className={`flex items-center gap-1 text-[10px] ml-auto ${qualityColor(connQuality)}`}>{qualityIcon(connQuality)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Local video — full screen (mobile self view) OR floating PiP */}
                <div
                  ref={localWrapRef}
                  onPointerDown={localDown}
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute transition-all duration-300 overflow-hidden bg-black ${localClasses}`}
                >
                  <video ref={setLocalVideoEl} autoPlay playsInline muted onClick={(e) => e.stopPropagation()} className="w-full h-full object-cover" />
                  {!camOn && (
                    <div className="absolute inset-0 bg-gradient-to-br from-[#1a2333] to-[#0b1220] flex items-center justify-center">
                      <VideoOff className={mainView === 'self' ? 'w-10 h-10 text-white/30' : 'w-5 h-5 text-white/40'} />
                      {mainView === 'self' && (
                        <p className="absolute bottom-4 text-xs text-white/40">Camera is off</p>
                      )}
                    </div>
                  )}
                  <div className={`absolute inset-x-0 bottom-0 pt-6 pb-1 px-2 bg-gradient-to-t from-black/70 to-transparent
                    ${mainView === 'self' ? 'sm:pt-10 sm:pb-3 sm:px-3' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-green-400" />
                      <span className={`truncate ${mainView === 'self' ? 'text-xs sm:text-sm' : 'text-[10px]'} font-semibold`}>
                        You {sharing && '· Sharing screen'}
                      </span>
                    </div>
                  </div>
                  {!micOn && (
                    <div className="absolute top-2 left-2 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
                      <MicOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                  )}
                  {sharing && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-primary text-secondary text-[10px] font-bold shadow-lg">
                      <Monitor className="w-3 h-3" /> Sharing
                    </div>
                  )}
                  {isMobile && mainView === 'self' && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 backdrop-blur text-white/70 text-[10px] font-medium">
                      <FlipHorizontal2 className="w-3 h-3" /> Tap other video to switch
                    </div>
                  )}
                </div>

                {/* Waiting overlay */}
                {!remoteJoined && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 p-6 text-center call-waiting-bg">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-full bg-primary/30 call-pulse-ring" />
                      <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center text-secondary font-display font-bold text-3xl shadow-xl call-float">
                        {(otherName || '?').charAt(0).toUpperCase()}
                      </div>
                    </div>
                    {reconnecting ? (
                      <>
                        <div className="flex items-center gap-2 text-white/90 font-semibold">
                          <RefreshCw className="w-5 h-5 animate-spin text-primary" /> Reconnecting…
                        </div>
                        <p className="text-xs text-white/50">Attempt {reconnectAttempt} of {MAX_RECONNECT_ATTEMPTS} · had a brief internet hiccup</p>
                      </>
                    ) : (
                      <>
                        <p className="text-white/90 font-semibold">Waiting for {otherName || 'the other party'} to join…</p>
                        <p className="text-xs text-white/45 max-w-xs">Keep this tab open and allow camera &amp; microphone permissions.</p>
                      </>
                    )}
                  </div>
                )}

                {/* Remote left overlay */}
                {remoteLeft && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 p-6 text-center call-waiting-bg">
                    <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
                      <PhoneOff className="w-8 h-8 text-white/50" />
                    </div>
                    <p className="text-white/90 font-semibold text-lg">{otherName} left the call</p>
                    <p className="text-xs text-white/50 max-w-xs">The other person has disconnected from the interview.</p>
                    <button onClick={() => endCall(false)} className="mt-4 px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-semibold transition-colors">
                      Leave call
                    </button>
                  </div>
                )}

                {/* Screen share badge */}
                {sharing && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary text-secondary text-xs font-bold shadow-lg z-10">
                    <Monitor className="w-4 h-4" /> You are sharing your screen
                  </div>
                )}

                {/* Share error */}
                {shareError && (
                  <div className="absolute top-14 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-red-600/90 text-white text-xs font-medium z-10 max-w-xs text-center">
                    {shareError}
                  </div>
                )}

                {/* Timer */}
                <div className={`absolute px-3 py-1.5 rounded-full bg-black/50 text-xs font-mono font-semibold z-10 transition-opacity duration-300 ${controlsShown ? 'opacity-100' : 'opacity-0'}`} style={{ top: '1rem', right: '1rem' }}>
                  {fmt(elapsed)}
                </div>

                {/* Tap hint (desktop, first join) */}
                {!isMobile && remoteJoined && controlsShown && (
                  <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-[10px] text-white/30 transition-opacity duration-500 z-10 pointer-events-none hidden xl:block">
                    Move your mouse to show controls · Click to hide
                  </div>
                )}
              </>
            )}

            {/* ── Floating control bar (Zoom-style) ─────────────────── */}
            <div className="absolute inset-x-0 bottom-0 z-30 flex items-end justify-center pointer-events-none pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
              <motion.div
                initial={false}
                onClick={(e) => e.stopPropagation()}
                animate={{ y: controlsShown ? 0 : 110, opacity: controlsShown ? 1 : 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                className={`pointer-events-auto flex items-center gap-1 sm:gap-1.5 rounded-2xl sm:rounded-3xl bg-[#151c2e]/90 backdrop-blur-2xl border border-white/10 px-1.5 sm:px-3 py-2 shadow-2xl max-w-[calc(100vw-1.5rem)] overflow-x-auto ${controlsShown ? '' : 'pointer-events-none opacity-0'}`}
              >
                <button onClick={toggleMic} title={micOn ? 'Mute (M)' : 'Unmute (M)'} aria-label={micOn ? 'Mute' : 'Unmute'} className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all active:scale-95 shrink-0 ${micOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
                  {micOn ? <Mic className="w-4 h-4 sm:w-5 sm:h-5" /> : <MicOff className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
                <button onClick={toggleCam} title={camOn ? 'Camera off (V)' : 'Camera on (V)'} aria-label={camOn ? 'Turn camera off' : 'Turn camera on'} className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all active:scale-95 shrink-0 ${camOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
                  {camOn ? <Video className="w-4 h-4 sm:w-5 sm:h-5" /> : <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
                <button onClick={toggleShare} title={sharing ? 'Stop sharing (S)' : 'Share screen (S)'} aria-label="Share screen" className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all active:scale-95 shrink-0 ${sharing ? 'bg-primary text-secondary' : canGetDisplayMedia ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white/5 text-white/40 cursor-not-allowed'}`}>
                  {sharing ? <Monitor className="w-4 h-4 sm:w-5 sm:h-5" /> : <MonitorUp className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>

                <div className="w-px h-7 bg-white/10 mx-0.5 shrink-0 hidden sm:block" />

                {isMobile && (
                  <button onClick={flipCamera} disabled={!camOn} title="Flip camera" aria-label="Flip camera" className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all active:scale-95 shrink-0 bg-white/10 hover:bg-white/20 text-white disabled:opacity-40">
                    <FlipHorizontal2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                )}
                <button onClick={() => setShowSettings(true)} title="Device settings" aria-label="Device settings" className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all active:scale-95 shrink-0 bg-white/10 hover:bg-white/20 text-white">
                  <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                {!isMobile && (
                  <button onClick={(e) => { e.stopPropagation(); setViewModeSafe(viewMode === 'speaker' ? 'gallery' : 'speaker'); }} title={viewMode === 'speaker' ? 'Gallery view' : 'Speaker view'} aria-label="Toggle view" className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all active:scale-95 shrink-0 bg-white/10 hover:bg-white/20 text-white">
                    {viewMode === 'speaker' ? <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5" /> : <Users className="w-4 h-4 sm:w-5 sm:h-5" />}
                  </button>
                )}
                {!isMobile && (
                  <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'} aria-label="Toggle fullscreen" className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all active:scale-95 shrink-0 bg-white/10 hover:bg-white/20 text-white">
                    {isFullscreen ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />}
                  </button>
                )}

                <div className="w-px h-7 bg-white/10 mx-0.5 shrink-0 hidden sm:block" />

                <button onClick={() => setShowEndConfirm(true)} title="End call" aria-label="End call" className="relative w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all active:scale-95 shrink-0 bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/40">
                  <PhoneOff className="w-4 h-4 sm:w-6 sm:h-6" />
                </button>
              </motion.div>
            </div>
          </>
        )}

        {/* ── Ended state ─────────────────────────────────────────────── */}
        {status === 'ended' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 call-waiting-bg">
            <div className="text-center max-w-md animate-pop-in">
              <div className="w-16 h-16 rounded-2xl bg-green-600/20 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <h1 className="font-display text-2xl font-bold">Call ended</h1>
              <p className="text-white/60 text-sm mt-2">
                {remoteLeft
                  ? `${otherName} has left the call.`
                  : isAdmin
                    ? 'You can mark the interview as complete so the user unlocks their dashboard.'
                    : 'Thank you for your interview. Once the admin confirms completion, your dashboard will unlock.'}
              </p>
              <div className="flex flex-col gap-2 mt-6">
                {isAdmin && (
                  <button onClick={() => endCall(true)} className="btn-primary w-full justify-center">Mark interview complete &amp; unlock dashboard</button>
                )}
                <button onClick={() => navigate(isAdmin ? '/admin' : '/interview')} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-semibold transition-colors">
                  <ArrowLeft className="w-4 h-4" /> {isAdmin ? 'Back to admin panel' : 'Back to interview page'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Error state ─────────────────────────────────────────────── */}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-red-600/20 flex items-center justify-center mx-auto mb-5">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
              <h1 className="font-display text-2xl font-bold">Could not start the call</h1>
              <p className="text-white/60 text-sm mt-2">{err}</p>
              <button onClick={() => navigate(isAdmin ? '/admin' : '/interview')} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-semibold transition-colors mt-6">
                <ArrowLeft className="w-4 h-4" /> Go back
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Settings modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-4"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ y: 50, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 60, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="bg-[#1a1f2e] rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-sm shadow-2xl border border-white/10 sm:pb-8 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-lg">Device settings</h3>
                <button onClick={() => setShowSettings(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10"><X className="w-4 h-4" /></button>
              </div>
              <label className="block text-sm text-white/60 mb-1.5">Camera</label>
              <select value={selectedCam} onChange={(e) => switchDevice('video', e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm outline-none mb-4 appearance-none">
                <option value="">Default camera</option>
                {devices.cameras.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 8)}`}</option>))}
              </select>
              <label className="block text-sm text-white/60 mb-1.5">Microphone</label>
              <select value={selectedMic} onChange={(e) => switchDevice('audio', e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm outline-none mb-4 appearance-none">
                <option value="">Default microphone</option>
                {devices.mics.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 8)}`}</option>))}
              </select>
              <p className="text-xs text-white/40">Changes take effect immediately.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── End-call confirmation ───────────────────────────────────── */}
      <AnimatePresence>
        {showEndConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setShowEndConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="bg-[#1a1f2e] rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-white/10 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-16 h-16 rounded-2xl bg-red-600/20 flex items-center justify-center mx-auto mb-4">
                <PhoneOff className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="font-display font-bold text-lg mb-2">End this call?</h3>
              <p className="text-sm text-white/60 mb-6">Both parties will be disconnected.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowEndConfirm(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-semibold transition-colors">Cancel</button>
                <button onClick={() => endCall(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-semibold transition-colors">End call</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
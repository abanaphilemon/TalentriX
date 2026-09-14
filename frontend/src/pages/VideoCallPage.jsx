import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Monitor,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ArrowLeft,
  Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] };

export default function VideoCallPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, adminUser, adminRole, loading } = useAuth();

  const isAdmin = adminRole === 'admin';
  const token = isAdmin ? localStorage.getItem('tbai.adminToken') : localStorage.getItem('tbai.token');
  const currentName = isAdmin ? adminUser?.name : user?.name;

  const [status, setStatus] = useState('connecting');
  const statusRef = useRef('connecting');
  const updateStatus = (s) => {
    statusRef.current = s;
    setStatus(s);
  }; // connecting | active | ended | error
  const [err, setErr] = useState('');
  const [interview, setInterview] = useState(null);
  const [otherName, setOtherName] = useState(isAdmin ? currentName || 'Admin' : 'Site Administrator');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pollRef = useRef(null);
  const addedCandidatesRef = useRef(new Set());
  const offererRef = useRef(false);
  const remoteOfferAppliedRef = useRef(false);

  const resetPeerState = () => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      try { pcRef.current.close(); } catch { /* ignore */ }
    }
    pcRef.current = null;
    remoteOfferAppliedRef.current = false;
    addedCandidatesRef.current = new Set();
  };

  const cleanup = () => {
    clearInterval(pollRef.current);
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

  // Add remote-track/state handlers to the peer connection.
  const wirePeer = (pc, onRemoteStream) => {
    pc.ontrack = (e) => {
      if (e.streams && e.streams[0]) {
        onRemoteStream(e.streams[0]);
        setRemoteJoined(true);
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' && statusRef.current === 'connecting') {
        updateStatus('active');
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        postIce(offererRef.current ? 'offer' : 'answer', JSON.stringify(e.candidate));
      }
    };
  };

  const attachRemoteHelp = (stream) => {
    if (remoteRef.current) remoteRef.current.srcObject = stream;
  };

  // Offerer (admin) creates the offer once media is ready.
  const becomeOfferer = async (stream) => {
    const pc = new RTCPeerConnection({ iceServers: [STUN] });
    pcRef.current = pc;
    offererRef.current = true;
    wirePeer(pc, attachRemoteHelp);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await postSignal({ kind: 'offer', sdp: pc.localDescription.sdp });
  };

  // Answerer (user) builds the answer once both media + remote offer are ready.
  const becomeAnswerer = async (stream, sdp) => {
    const pc = new RTCPeerConnection({ iceServers: [STUN] });
    pcRef.current = pc;
    offererRef.current = false;
    wirePeer(pc, attachRemoteHelp);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    await pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await postSignal({ kind: 'answer', sdp: pc.localDescription.sdp });
  };

  const reconcile = async (stream) => {
    let state;
    try {
      state = await getSignalState();
    } catch { return; }

    if (!pcRef.current) return;

    if (offererRef.current) {
      // Offerer: apply answerer's answer + their ICE candidates.
      if (state.answer && !pcRef.current.remoteDescription) {
        try {
          await pcRef.current.setRemoteDescription({ type: 'answer', sdp: state.answer });
        } catch { /* ignore */ }
      }
      applyCandidates(state.answerCandidates);
    } else {
      // Answerer: apply the offer then produce an answer.
      if (state.offer && !remoteOfferAppliedRef.current) {
        remoteOfferAppliedRef.current = true;
        try {
          if (!pcRef.current.remoteDescription) {
            await pcRef.current.setRemoteDescription({ type: 'offer', sdp: state.offer });
          }
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          await postSignal({ kind: 'answer', sdp: pcRef.current.localDescription.sdp });
        } catch { /* ignore concurrency */ }
      }
      applyCandidates(state.offerCandidates);
    }
  };

  const startTimer = () => {
    const t0 = Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - t0) / 1000));
    tick();
    const iv = setInterval(tick, 1000);
    return iv;
  };

  useEffect(() => {
    let cancelled = false;
    let timerIv;

    (async () => {
      // Load interview context (role-aware) so we know the other party + can join the room.
      try {
        const url = isAdmin ? `${API_URL}/admin/interviews` : `${API_URL}/interviews/me`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Could not load the interview');
        const data = await res.json();
        const list = isAdmin ? data.interviews : data.interviews;
        const found = (list || []).find((i) => String(i.id) === String(id));
        if (!found) throw new Error('Interview not found');
        if (!cancelled) setInterview(found);
        if (isAdmin && found.user) setOtherName(found.user.name || 'User');
      } catch (e) {
        if (!cancelled) {
          setErr(e.message || 'Could not load the interview');
          updateStatus('error');
        }
        return;
      }

      // Camera + mic.
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        if (!cancelled) {
          setErr('Could not access your camera or microphone. Check browser permissions and try again.');
          updateStatus('error');
        }
        return;
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      localStreamRef.current = stream;
      if (localRef.current) localRef.current.srcObject = stream;

      // In this pairing the admin is always the caller (offerer).
      if (isAdmin) {
        await becomeOfferer(stream);
      } else {
        // Answerer: just create the peer; reconcile() will build the answer.
        const pc = new RTCPeerConnection({ iceServers: [STUN] });
        pcRef.current = pc;
        offererRef.current = false;
        wirePeer(pc, attachRemoteHelp);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      }

      setTimeout(() => reconcile(stream), 500);
      pollRef.current = setInterval(() => reconcile(stream), 2500);
      timerIv = startTimer();
    })();

    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
      clearInterval(timerIv);
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
      resetPeerState();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAdmin]);

  const fmt = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const toggleMic = () => {
    const ls = localStreamRef.current;
    if (!ls) return;
    const next = !micOn;
    ls.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  };

  const toggleCam = () => {
    const ls = localStreamRef.current;
    if (!ls) return;
    const next = !camOn;
    ls.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  };

  const toggleShare = async () => {
    const pc = pcRef.current;
    if (!pc) return;
    if (sharing) {
      // Stop sharing: swap back to the camera track.
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender && localStreamRef.current) {
        const camTrack = localStreamRef.current.getVideoTracks()[0];
        await sender.replaceTrack(camTrack || null);
      }
      setSharing(false);
      return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(screen.getVideoTracks()[0]);
      setSharing(true);
      screen.getVideoTracks()[0].addEventListener('ended', () => setSharing(false));
    } catch {
      // user cancelled the share dialog — keep current screen
    }
  };

  const endCall = async (completed = false) => {
    clearInterval(pollRef.current);
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

  if (loading) return <div className="min-h-screen bg-[#0b1220]" />;

  return (
    <div className="min-h-screen bg-[#0b1220] text-white flex flex-col">
      {/* Top bar */}
      <div className="h-14 px-4 flex items-center justify-between bg-black/40 backdrop-blur border-b border-white/10">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span className="font-display font-bold text-sm">Secure video interview</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-white/70">
          {interview?.status === 'accepted' && interview?.proposedDate && (
            <span className="hidden sm:inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {new Date(interview.proposedDate).toLocaleDateString()} · {interview.proposedTime || '—'}
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full bg-white/10 text-xs font-semibold">
            {otherName}
          </span>
        </div>
      </div>

      {/* Body */}
      {status === 'connecting' || status === 'active' ? (
        <>
          <div className="flex-1 relative overflow-hidden">
            {/* Remote (main) */}
            <video
              ref={remoteRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
            {!remoteJoined && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-black/70 to-black/40">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm text-white/70">Waiting for {otherName || 'the other party'} to join…</p>
                <p className="text-xs text-white/40 max-w-xs text-center">
                  Keep this tab open and make sure camera &amp; microphone permissions are allowed.
                </p>
              </div>
            )}

            {/* Local (picture-in-picture) */}
            <div className="absolute bottom-24 right-4 w-40 sm:w-52 aspect-video rounded-2xl overflow-hidden ring-1 ring-white/30 shadow-2xl">
              <video ref={localRef} autoPlay playsInline muted className="w-full h-full object-cover bg-black" />
              {!camOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-secondary/80">
                  <VideoOff className="w-6 h-6" />
                </div>
              )}
            </div>

            {/* Screen share badge */}
            {sharing && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary text-secondary text-xs font-bold shadow">
                <Monitor className="w-4 h-4" /> You are sharing your screen
              </div>
            )}

            {/* Timer */}
            <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-black/50 text-xs font-mono font-semibold">
              {fmt(elapsed)}
            </div>
          </div>

          {/* Controls */}
          <div className="h-20 flex items-center justify-center gap-3 bg-black/40 backdrop-blur border-t border-white/10">
            <button
              onClick={toggleMic}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                micOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-600 hover:bg-red-700'
              }`}
              title={micOn ? 'Mute microphone' : 'Unmute microphone'}
            >
              {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>
            <button
              onClick={toggleCam}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                camOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-600 hover:bg-red-700'
              }`}
              title={camOn ? 'Turn camera off' : 'Turn camera on'}
            >
              {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
            <button
              onClick={toggleShare}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                sharing ? 'bg-primary text-secondary' : 'bg-white/10 hover:bg-white/20'
              }`}
              title={sharing ? 'Stop screen sharing' : 'Share your screen'}
            >
              {sharing ? <Monitor className="w-5 h-5" /> : <MonitorUp className="w-5 h-5" />}
            </button>
            <button
              onClick={() => endCall(false)}
              className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
              title="End call"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </>
      ) : status === 'ended' ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-green-600/20 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h1 className="font-display text-2xl font-bold">Call ended</h1>
            <p className="text-white/60 text-sm mt-2">
              {isAdmin
                ? 'You can mark the interview as complete so the user unlocks their dashboard, then approve on the interviews page.'
                : 'Thank you for your interview. Once the admin confirms completion, your dashboard will unlock.'}
            </p>
            <div className="flex flex-col gap-2 mt-6">
              {isAdmin && (
                <button onClick={() => endCall(true)} className="btn-primary w-full justify-center">
                  Mark interview complete &amp; unlock dashboard
                </button>
              )}
              <button
                onClick={() => navigate(isAdmin ? '/admin' : '/interview')}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-semibold transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> {isAdmin ? 'Back to admin panel' : 'Back to interview page'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-red-600/20 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="font-display text-2xl font-bold">Could not start the call</h1>
            <p className="text-white/60 text-sm mt-2">{err}</p>
            <button
              onClick={() => navigate(isAdmin ? '/admin' : '/interview')}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-semibold transition-colors mt-6"
            >
              <ArrowLeft className="w-4 h-4" /> Go back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
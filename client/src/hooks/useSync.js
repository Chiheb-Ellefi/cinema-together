import { useEffect, useRef, useCallback, useState } from 'react';
import socket from '../services/socket';

// Thresholds for auto-resync
const SOFT_DRIFT = 2;   // seconds — silent snap
const HARD_DRIFT = 8;   // seconds — show toast + snap

export function useSync({ roomId, videoRef }) {
  const suppress   = useRef(false);          // prevent echo
  const posTimer   = useRef(null);           // position ping interval
  const [peers, setPeers]           = useState([]);
  const [notification, setNotif]    = useState(null);
  const [resyncing, setResyncing]   = useState(false);
  const notifTimer = useRef(null);

  const notify = useCallback((msg, dur = 3000) => {
    clearTimeout(notifTimer.current);
    setNotif(msg);
    notifTimer.current = setTimeout(() => setNotif(null), dur);
  }, []);

  const mute = useCallback((fn, ms = 350) => {
    suppress.current = true;
    fn();
    setTimeout(() => { suppress.current = false; }, ms);
  }, []);

  // ── Apply a remote position change ────────────────────────────────────────
  const applyPosition = useCallback((position, serverTime, shouldPlay) => {
    const v = videoRef.current; if (!v) return;
    const latency   = serverTime ? (Date.now() - serverTime) / 1000 : 0;
    const target    = position + latency;
    mute(() => {
      if (Math.abs(v.currentTime - target) > 0.6) v.currentTime = target;
      if (shouldPlay === true  && v.paused) v.play().catch(() => {});
      if (shouldPlay === false && !v.paused) v.pause();
    });
  }, [videoRef, mute]);

  // ── Socket listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    const u1 = socket.on('SYNC_PLAY', ({ position, serverTime, username }) => {
      applyPosition(position, serverTime, true);
      notify(`▶  ${username} resumed`);
    });

    const u2 = socket.on('SYNC_PAUSE', ({ position, serverTime, username }) => {
      applyPosition(position, serverTime, false);
      notify(`⏸  ${username} paused`);
    });

    const u3 = socket.on('SYNC_SEEK', ({ position, serverTime, username }) => {
      applyPosition(position, serverTime, null); // don't change play state
      notify(`⏩  ${username} jumped`);
    });

    const u4 = socket.on('SYNC_RESYNC', ({ position, serverTime, username }) => {
      setResyncing(true);
      applyPosition(position, serverTime, null);
      notify(`🔄  Resynced with ${username}`);
      setTimeout(() => setResyncing(false), 1200);
    });

    const u5 = socket.on('SYNC_WAIT', ({ username }) => {
      const v = videoRef.current;
      if (v && !v.paused) mute(() => v.pause());
      notify(`⏳  ${username} is buffering — paused`, 6000);
    });

    const u6 = socket.on('SYNC_RESUME', ({ username }) => {
      notify(`✓  ${username} ready`);
    });

    // Server drift check — compare our position with expected
    const u7 = socket.on('DRIFT_CHECK', ({ expected, serverTime }) => {
      const v = videoRef.current; if (!v || suppress.current) return;
      const diff = Math.abs(v.currentTime - expected);
      if (diff > HARD_DRIFT) {
        setResyncing(true);
        mute(() => { v.currentTime = expected; });
        notify(`🔄  Auto-resynced (${diff.toFixed(0)}s off)`);
        setTimeout(() => setResyncing(false), 1200);
      } else if (diff > SOFT_DRIFT) {
        mute(() => { v.currentTime = expected; });
      }
    });

    const u8 = socket.on('PEER_JOINED', ({ username, memberCount }) => {
      setPeers(p => [...p.filter(x => x !== username), username]);
      notify(`👋  ${username} joined`);
    });

    const u9 = socket.on('PEER_LEFT', ({ username }) => {
      setPeers(p => p.filter(x => x !== username));
      notify(`${username} left`);
    });

    // On room join, set initial peers from member count
    const u10 = socket.on('JOINED', (msg) => {
      // Reset peers — we only know our own peers after others' events
      setPeers([]);
    });

    return () => { u1();u2();u3();u4();u5();u6();u7();u8();u9();u10(); };
  }, [roomId, videoRef, applyPosition, mute, notify]);

  // ── Periodic position ping (for server-side drift detection) ──────────────
  useEffect(() => {
    posTimer.current = setInterval(() => {
      const v = videoRef.current;
      if (!v || !roomId) return;
      socket.send({ type: 'POSITION_PING', roomId, position: v.currentTime });
    }, 4000);
    return () => clearInterval(posTimer.current);
  }, [roomId, videoRef]);

  // ── Actions — any peer can call these ─────────────────────────────────────
  const sendPlay = useCallback((position) => {
    if (suppress.current) return;
    socket.send({ type: 'PLAY', roomId, position });
  }, [roomId]);

  const sendPause = useCallback((position) => {
    if (suppress.current) return;
    socket.send({ type: 'PAUSE', roomId, position });
  }, [roomId]);

  const sendSeek = useCallback((position) => {
    if (suppress.current) return;
    socket.send({ type: 'SEEK', roomId, position });
  }, [roomId]);

  const sendResync = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    socket.send({ type: 'RESYNC', roomId, position: v.currentTime });
    notify('🔄  Resyncing everyone…');
  }, [roomId, videoRef, notify]);

  const sendBufferStart = useCallback(() => socket.send({ type: 'BUFFER_START', roomId }), [roomId]);
  const sendBufferEnd   = useCallback(() => socket.send({ type: 'BUFFER_END',   roomId }), [roomId]);

  return {
    peers, notification, resyncing,
    sendPlay, sendPause, sendSeek, sendResync,
    sendBufferStart, sendBufferEnd,
  };
}

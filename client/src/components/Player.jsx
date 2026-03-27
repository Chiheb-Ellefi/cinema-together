import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useSync } from '../hooks/useSync';
import { loadSubtitleFile, injectTrack, removeTrack } from '../services/subtitles';

// ── Icons ──────────────────────────────────────────────────────────────────
const Ico = {
  Play: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <polygon points="6,3 20,12 6,21"/>
    </svg>
  ),
  Pause: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <rect x="5" y="3" width="5" height="18" rx="1.5"/>
      <rect x="14" y="3" width="5" height="18" rx="1.5"/>
    </svg>
  ),
  Vol: ({ level }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17">
      <polygon points="3,9 3,15 7,15 13,20 13,4 7,9"/>
      {level > 0   && <path d="M16,9.5a5,5,0,0,1,0,5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round"/>}
      {level > 0.5 && <path d="M18.5,7a9,9,0,0,1,0,10" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round"/>}
    </svg>
  ),
  Mute: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17">
      <polygon points="3,9 3,15 7,15 13,20 13,4 7,9"/>
      <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  Resync: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
      <polyline points="1,4 1,10 7,10"/>
      <path d="M3.51,15a9,9,0,1,0,.49-4"/>
    </svg>
  ),
  Sub: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width="17" height="17">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <line x1="6" y1="10" x2="14" y2="10"/>
      <line x1="6" y1="14" x2="18" y2="14"/>
    </svg>
  ),
  SubOff: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width="17" height="17">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <line x1="6" y1="10" x2="14" y2="10" strokeOpacity="0.35"/>
      <line x1="6" y1="14" x2="18" y2="14" strokeOpacity="0.35"/>
      <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor"/>
    </svg>
  ),
  FS: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width="17" height="17">
      <polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/>
      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  ),
  ExitFS: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width="17" height="17">
      <polyline points="8,3 3,3 3,8"/><polyline points="21,8 21,3 16,3"/>
      <polyline points="3,16 3,21 8,21"/><polyline points="16,21 21,21 21,16"/>
    </svg>
  ),
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (s) => {
  if (!s || isNaN(s)) return '0:00';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
};

// ── Progress Bar ───────────────────────────────────────────────────────────
function ProgressBar({ videoRef, duration, onSeek }) {
  const trackRef  = useRef(null);
  const [hover, setHover]     = useState(null);
  const [drag, setDrag]       = useState(false);
  const [current, setCurrent] = useState(0);
  const [buffered, setBuffered] = useState([]);
  const raf = useRef(null);

  useEffect(() => {
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        setCurrent(v.currentTime);
        const ranges = [];
        for (let i = 0; i < v.buffered.length; i++)
          ranges.push({ s: v.buffered.start(i), e: v.buffered.end(i) });
        setBuffered(ranges);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [videoRef]);

  const posFrom = useCallback((clientX) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || !duration) return 0;
    return Math.max(0, Math.min((clientX - rect.left) / rect.width, 1)) * duration;
  }, [duration]);

  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div className="pb-wrap">
      <span className="pb-time">{fmt(current)}</span>
      <div
        ref={trackRef}
        className="pb-track seekable"
        onMouseMove={(e) => {
          setHover({ time: posFrom(e.clientX), x: e.clientX - (trackRef.current?.getBoundingClientRect().left || 0) });
          if (drag) onSeek?.(posFrom(e.clientX));
        }}
        onMouseDown={(e) => { setDrag(true); onSeek?.(posFrom(e.clientX)); }}
        onMouseUp={() => setDrag(false)}
        onMouseLeave={() => { setHover(null); setDrag(false); }}
      >
        <div className="pb-rail"/>
        {duration && buffered.map((r, i) => (
          <div key={i} className="pb-buf" style={{ left:`${(r.s/duration)*100}%`, width:`${((r.e-r.s)/duration)*100}%` }}/>
        ))}
        <div className="pb-fill" style={{ width:`${pct}%` }}/>
        <div className="pb-thumb" style={{ left:`${pct}%` }}/>
        {hover && (
          <div className="pb-tooltip" style={{ left: Math.max(22, Math.min(hover.x, (trackRef.current?.offsetWidth||0)-22)) }}>
            {fmt(hover.time)}
          </div>
        )}
      </div>
      <span className="pb-time">{fmt(duration)}</span>
    </div>
  );
}

// ── Subtitle picker button ─────────────────────────────────────────────────
function SubtitleBtn({ videoRef }) {
  const fileRef     = useRef(null);
  const [active, setActive] = useState(false);
  const [label, setLabel]   = useState('');

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await loadSubtitleFile(file);
      injectTrack(videoRef.current, url, file.name.replace(/\.[^.]+$/, ''));
      setActive(true);
      setLabel(file.name.replace(/\.[^.]+$/, '').slice(0, 18));
    } catch (err) {
      alert(err.message);
    }
    e.target.value = '';
  }, [videoRef]);

  const toggle = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (active) {
      // Hide subtitles
      for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = 'hidden';
      setActive(false);
    } else {
      // Show again or open picker
      let found = false;
      for (let i = 0; i < v.textTracks.length; i++) {
        if (v.textTracks[i].label === label) { v.textTracks[i].mode = 'showing'; found = true; }
      }
      if (found) setActive(true);
      else fileRef.current?.click();
    }
  }, [active, label, videoRef]);

  return (
    <div className="sub-wrap">
      <input ref={fileRef} type="file" accept=".vtt,.srt" style={{ display:'none' }} onChange={handleFile}/>
      <button
        className={`ctrl-btn sub-btn ${active ? 'sub-active' : ''}`}
        onClick={toggle}
        title={active ? `Subtitles: ${label} (click to hide)` : 'Load subtitles (.srt / .vtt)'}
      >
        {active ? <Ico.Sub/> : <Ico.SubOff/>}
      </button>
      {label && (
        <button
          className="sub-change-btn"
          onClick={() => fileRef.current?.click()}
          title="Change subtitle file"
        >
          {label}
        </button>
      )}
      {!label && (
        <button className="sub-change-btn ghost" onClick={() => fileRef.current?.click()}>
          + Subtitles
        </button>
      )}
    </div>
  );
}

// ── Main Player ────────────────────────────────────────────────────────────
export default function Player({ streamUrl, roomId, movieTitle }) {
  const videoRef  = useRef(null);
  const wrapRef   = useRef(null);
  const hideTimer = useRef(null);

  const [playing, setPlaying]   = useState(false);
  const [duration, setDuration] = useState(0);
  const [vol, setVol]           = useState(1);
  const [muted, setMuted]       = useState(false);
  const [fs, setFs]             = useState(false);
  const [showUI, setShowUI]     = useState(true);
  const [loaded, setLoaded]     = useState(false);

  const {
    peers, notification, resyncing,
    sendPlay, sendPause, sendSeek, sendResync,
    sendBufferStart, sendBufferEnd,
  } = useSync({ roomId, videoRef });

  // Load stream
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !streamUrl) return;
    v.src = streamUrl; v.load(); setLoaded(false);
  }, [streamUrl]);

  // Video events
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const onPlay    = () => setPlaying(true);
    const onPause   = () => setPlaying(false);
    const onDur     = () => { if (!isNaN(v.duration)) setDuration(v.duration); };
    const onCan     = () => { setLoaded(true); sendBufferEnd(); };
    const onWaiting = () => sendBufferStart();
    v.addEventListener('play',           onPlay);
    v.addEventListener('pause',          onPause);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('canplay',        onCan);
    v.addEventListener('waiting',        onWaiting);
    return () => {
      v.removeEventListener('play',           onPlay);
      v.removeEventListener('pause',          onPause);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('canplay',        onCan);
      v.removeEventListener('waiting',        onWaiting);
    };
  }, [sendBufferStart, sendBufferEnd]);

  // Fullscreen
  useEffect(() => {
    const fn = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fn);
    return () => document.removeEventListener('fullscreenchange', fn);
  }, []);

  // Auto-hide controls
  const ping = useCallback(() => {
    setShowUI(true);
    clearTimeout(hideTimer.current);
    if (playing) hideTimer.current = setTimeout(() => setShowUI(false), 3200);
  }, [playing]);
  useEffect(() => { if (!playing) setShowUI(true); }, [playing]);

  // ── Play / Pause toggle — anyone can trigger ─────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) {
      v.play().then(() => sendPlay(v.currentTime));
    } else {
      v.pause();
      sendPause(v.currentTime);
    }
  }, [sendPlay, sendPause]);

  // ── Seek ─────────────────────────────────────────────────────────────────
  const handleSeek = useCallback((pos) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = pos;
    sendSeek(pos);
  }, [sendSeek]);

  // ── Volume ───────────────────────────────────────────────────────────────
  const handleVol = useCallback((e) => {
    const v = parseFloat(e.target.value);
    setVol(v); setMuted(v === 0);
    if (videoRef.current) videoRef.current.volume = v;
  }, []);
  const toggleMute = useCallback(() => {
    const nm = !muted; setMuted(nm);
    if (videoRef.current) videoRef.current.muted = nm;
  }, [muted]);

  // ── Fullscreen ───────────────────────────────────────────────────────────
  const toggleFS = useCallback(() => {
    if (!document.fullscreenElement) wrapRef.current?.requestFullscreen();
    else document.exitFullscreen();
  }, []);

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space')      { e.preventDefault(); togglePlay(); }
      if (e.code === 'ArrowRight') { handleSeek(Math.min((videoRef.current?.currentTime||0)+10, duration)); }
      if (e.code === 'ArrowLeft')  { handleSeek(Math.max((videoRef.current?.currentTime||0)-10, 0)); }
      if (e.code === 'KeyF')       { toggleFS(); }
      if (e.code === 'KeyR')       { sendResync(); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [togglePlay, handleSeek, toggleFS, sendResync, duration]);

  return (
    <div
      ref={wrapRef}
      className={`player-shell ${showUI ? 'ui-on' : 'ui-off'} ${resyncing ? 'resyncing' : ''}`}
      onMouseMove={ping}
      onMouseLeave={() => { if (playing) setShowUI(false); }}
    >
      {/* ── Video ──────────────────────────────────────────────────────── */}
      <video
        ref={videoRef}
        className="player-video"
        onClick={togglePlay}
        playsInline preload="auto"
        crossOrigin="anonymous"
      />

      {/* ── Resync flash overlay ────────────────────────────────────────── */}
      {resyncing && <div className="resync-flash"/>}

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {!loaded && (
        <div className="player-loading">
          <div className="spinner-ring"/>
          <p>Loading stream…</p>
        </div>
      )}

      {/* ── Toast notification ───────────────────────────────────────────── */}
      {notification && (
        <div className="player-toast" key={notification}>{notification}</div>
      )}

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="player-top">
        <div className="player-title">
          <span className="title-text">{movieTitle || 'Movie Night'}</span>
        </div>
        <div className="peer-cluster">
          {peers.length > 0 ? peers.map(name => (
            <div key={name} className="peer-pill">
              <span className="peer-dot"/>
              <span>{name}</span>
            </div>
          )) : (
            <div className="peer-pill waiting">
              <span className="peer-dot"/>
              <span>Waiting for guest…</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom controls ─────────────────────────────────────────────── */}
      <div className="player-bottom">
        <ProgressBar videoRef={videoRef} duration={duration} onSeek={handleSeek}/>

        <div className="ctrl-row">
          {/* Left group */}
          <div className="ctrl-left">
            <button className="ctrl-btn play-btn" onClick={togglePlay}>
              {playing ? <Ico.Pause/> : <Ico.Play/>}
            </button>

            <div className="vol-wrap">
              <button className="ctrl-btn" onClick={toggleMute}>
                {muted || vol === 0 ? <Ico.Mute/> : <Ico.Vol level={vol}/>}
              </button>
              <div className="vol-slider-wrap">
                <input type="range" min="0" max="1" step="0.02"
                  value={muted ? 0 : vol} onChange={handleVol} className="vol-slider"/>
              </div>
            </div>

            {/* Resync button */}
            <button
              className={`ctrl-btn resync-btn ${resyncing ? 'spinning' : ''}`}
              onClick={sendResync}
              title="Resync everyone to your position (R)"
            >
              <Ico.Resync/>
            </button>
          </div>

          {/* Center — subtitle picker */}
          <div className="ctrl-center">
            <SubtitleBtn videoRef={videoRef}/>
          </div>

          {/* Right */}
          <div className="ctrl-right">
            <button className="ctrl-btn" onClick={toggleFS}>
              {fs ? <Ico.ExitFS/> : <Ico.FS/>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

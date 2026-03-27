import React, { useState, useEffect, useCallback, useRef } from 'react';
import Player from './components/Player';
import socket from './services/socket';
import './App.css';

const SERVER = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';
const api = (path) => `${SERVER.replace(/\/$/, '')}${path}`;

function FilmGrain() {
  return <div className="grain" aria-hidden="true"/>;
}
function FilmStrip() {
  return (
    <div className="filmstrip" aria-hidden="true">
      {Array.from({length: 18}).map((_,i) => <div key={i} className="frame"/>)}
    </div>
  );
}
function Steps({ current }) {
  const labels = ['Configure','Connect','Watch'];
  return (
    <div className="steps">
      {labels.map((l, i) => (
        <div key={l} className={`step ${i < current ? 'done' : i === current ? 'active' : ''}`}>
          <div className="step-num">{i < current ? '✓' : i+1}</div>
          <span>{l}</span>
          {i < labels.length-1 && <div className="step-line"/>}
        </div>
      ))}
    </div>
  );
}
function Field({ label, hint, ...props }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <input className="field-input" {...props}/>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
function Tabs({ value, onChange }) {
  return (
    <div className="tabs">
      {['host','guest'].map(t => (
        <button key={t} className={`tab ${value===t?'active':''}`} onClick={() => onChange(t)}>
          {t==='host' ? '🎬 Host' : '👁 Guest'}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [step, setStep]         = useState(0);
  const [tab, setTab]           = useState('host');
  const [connStatus, setConn]   = useState('idle');
  const [serverUrl, setServerUrl] = useState(SERVER);
  const [username, setUsername] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [movieTitle, setMovieTitle] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [copied, setCopied]     = useState(false);

  // Watch state
  const [roomId, setRoomId]         = useState('');
  const [finalTitle, setFinalTitle] = useState('');
  const [peerJoined, setPeerJoined] = useState(false);

  useEffect(() => {
    socket.connect(serverUrl);
    const u1 = socket.on('__open',  () => setConn('connected'));
    const u2 = socket.on('__close', () => setConn('idle'));
    const u3 = socket.on('PEER_JOINED', () => setPeerJoined(true));
    return () => { u1(); u2(); u3(); socket.disconnect(); };
  }, [serverUrl]);

  // Host: create room
  const handleCreate = useCallback(async (e) => {
    e.preventDefault();
    if (!streamUrl.trim()) return setError('Paste your Stremio stream URL');
    setBusy(true); setError('');
    try {
      const res  = await fetch(api('/room/create'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movieTitle: movieTitle || 'Movie Night' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await socket.waitOpen();
      socket.send({ type: 'JOIN', roomId: data.roomId, username: username || 'Host' });

      const unsub = socket.on('JOINED', (msg) => {
        unsub();
        setRoomId(msg.roomId);
        setFinalTitle(msg.movieTitle);
        setStep(1); // lobby — wait for guest
      });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }, [streamUrl, movieTitle, username]);

  // Guest: join room
  const handleJoin = useCallback(async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return setError('Enter the room code');
    if (!streamUrl.trim()) return setError('Paste your Stremio stream URL');
    setBusy(true); setError('');
    try {
      const res  = await fetch(api(`/room/${joinCode.toUpperCase()}`));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await socket.waitOpen();
      socket.send({ type: 'JOIN', roomId: data.roomId, username: username || 'Guest' });

      const unsub = socket.on('JOINED', (msg) => {
        unsub();
        setRoomId(msg.roomId);
        setFinalTitle(msg.movieTitle);
        setStep(2); // guest goes straight to watch
      });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }, [joinCode, streamUrl, username]);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(roomId);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  // ── Watch ───────────────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="watch-wrap">
        <FilmGrain/>
        <Player streamUrl={streamUrl} roomId={roomId} movieTitle={finalTitle}/>
        <div className="watch-code-bar">
          <span className="wcb-label">Room</span>
          <span className="wcb-code">{roomId}</span>
          <button className="wcb-copy" onClick={copyCode}>{copied ? '✓' : 'Copy'}</button>
        </div>
      </div>
    );
  }

  // ── Lobby ───────────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="home-wrap">
        <FilmGrain/>
        <FilmStrip/>
        <div className="card lobby-card">
          <Steps current={1}/>
          <div className="lobby-center">
            <h2 className="lobby-title">Room Ready</h2>
            <p className="lobby-sub">Share this code — both of you control playback</p>
            <div className="code-display">
              <span className="code-chars">{roomId}</span>
              <button className="code-copy-btn" onClick={copyCode}>{copied ? '✓ Copied' : 'Copy'}</button>
            </div>
            <div className={`guest-status ${peerJoined ? 'joined' : ''}`}>
              <span className="gs-dot"/>
              <span>{peerJoined ? 'Guest connected — ready!' : 'Waiting for guest to join…'}</span>
            </div>
            <div className="lobby-features">
              <div className="lf-item"><span>⏯</span><span>Anyone can play, pause or seek</span></div>
              <div className="lf-item"><span>🔄</span><span>Auto-resync if you drift apart</span></div>
              <div className="lf-item"><span>💬</span><span>Load .srt / .vtt subtitles locally</span></div>
            </div>
            <button className={`start-btn ${peerJoined ? 'ready' : 'waiting'}`} onClick={() => setStep(2)} disabled={!peerJoined}>
              {peerJoined ? 'Start Watching →' : 'Waiting for guest…'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Setup ───────────────────────────────────────────────────────────────
  return (
    <div className="home-wrap">
      <FilmGrain/>
      <FilmStrip/>
      <div className="home-layout">
        <div className="home-brand">
          <div className="brand-mark">
            <div className="brand-icon"><div className="reel"/></div>
          </div>
          <h1 className="brand-name">Cinelink</h1>
          <p className="brand-tagline">Synchronised watching,<br/>zero compromise.</p>
          <ul className="brand-features">
            <li><span className="feat-dot"/>Your Stremio stream, your machine</li>
            <li><span className="feat-dot"/>Anyone can play, pause or seek</li>
            <li><span className="feat-dot"/>Auto-resync if you drift apart</li>
            <li><span className="feat-dot"/>Local subtitles — .srt and .vtt</li>
            <li><span className="feat-dot"/>No video data leaves your device</li>
          </ul>
        </div>

        <div className="card setup-card">
          <Steps current={0}/>
          <div className="card-section">
            <Field label="Sync Server" value={serverUrl} onChange={e => setServerUrl(e.target.value)}
              placeholder="https://your-server.onrender.com"
              hint={connStatus === 'connected' ? '● Connected' : '○ Disconnected'}/>
          </div>
          <Tabs value={tab} onChange={setTab}/>

          {tab === 'host' ? (
            <form className="form" onSubmit={handleCreate}>
              <Field label="Your Name" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. Alex"/>
              <Field label="Movie Title" value={movieTitle} onChange={e => setMovieTitle(e.target.value)} placeholder="e.g. The Hangover"/>
              <Field label="Your Stremio Stream URL" value={streamUrl} onChange={e => setStreamUrl(e.target.value)}
                placeholder="http://127.0.0.1:11470/…/2"
                hint="In Stremio: right-click the playing video → Copy video address"/>
              {error && <div className="form-error">{error}</div>}
              <button type="submit" className="submit-btn" disabled={busy}>{busy ? 'Creating…' : 'Create Room →'}</button>
            </form>
          ) : (
            <form className="form" onSubmit={handleJoin}>
              <Field label="Your Name" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. Sofia"/>
              <Field label="Room Code" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="A1B2C3D4" style={{ letterSpacing:'0.18em', fontWeight:600, textAlign:'center' }}
                hint="Ask the host for their room code"/>
              <Field label="Your Stremio Stream URL" value={streamUrl} onChange={e => setStreamUrl(e.target.value)}
                placeholder="http://127.0.0.1:11470/…/2"
                hint="Your local URL for the same movie"/>
              {error && <div className="form-error">{error}</div>}
              <button type="submit" className="submit-btn" disabled={busy}>{busy ? 'Joining…' : 'Join Room →'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

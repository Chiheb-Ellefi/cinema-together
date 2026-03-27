# 🎬 Cinelink — Stremio Sync

Synchronised watching for two people using their own local Stremio streams.
No video data leaves either machine. Only tiny sync events go through the server.

```
You              Stremio → http://127.0.0.1:11470/...  → your browser video
Her              Stremio → http://127.0.0.1:11470/...  → her browser video
                                     ↕
                          Sync server (play/pause/seek only)
```

---

## Setup — 3 steps

### 1. Deploy the sync server to Render (free, once)

```bash
cd server && npm install
# Push to GitHub → Render → New Web Service → connect repo
# Build: npm install  |  Start: npm start  |  Plan: Free
```

Test: `curl https://your-server.onrender.com/health`

### 2. Run the client locally (both of you)

```bash
cd client && npm install

# With server URL pre-configured:
REACT_APP_SERVER_URL=https://your-server.onrender.com npm start
```

Or put it in `client/.env`:
```
REACT_APP_SERVER_URL=https://your-server.onrender.com
```

### 3. Get the Stremio stream URL

In Stremio, start playing the movie, then:
- Right-click the video → **Copy video address**
- Or in Stremio settings → look for the stream URL
- It looks like: `http://127.0.0.1:11470/hash.../2`

---

## Usage

**You (host):**
1. Open `http://localhost:3000`
2. Tab → **Host**
3. Enter movie title, paste your Stremio URL
4. Click **Create Room** → get a room code
5. Share the code with her
6. Wait for her to join → click **Start Watching**
7. Press play — she plays at the same moment

**Her (guest):**
1. Open `http://localhost:3000`  
2. Tab → **Guest**
3. Enter the room code + her own Stremio URL (same movie)
4. Click **Join Room** → goes straight to the player

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause (host only) |
| `→` | +10 seconds (host only) |
| `←` | −10 seconds (host only) |
| `F` | Toggle fullscreen |

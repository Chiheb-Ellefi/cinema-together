/**
 * subtitles.js — local subtitle file handling
 *
 * Accepts .vtt or .srt files, converts to .vtt blob URL,
 * injects as <track> into the video element.
 */

// Convert SRT text to WebVTT format
function srtToVtt(srt) {
  const vtt = srt
    .trim()
    // Normalise line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Replace SRT index lines (pure digits on their own line)
    // SRT timestamps use comma, VTT uses period
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

  return `WEBVTT\n\n${vtt}`;
}

/**
 * Load a subtitle File object and return an object URL pointing to a .vtt blob.
 * The caller is responsible for revoking the URL when done.
 */
export async function loadSubtitleFile(file) {
  const text = await file.text();
  const name = file.name.toLowerCase();

  let vttText;
  if (name.endsWith('.vtt')) {
    vttText = text;
  } else if (name.endsWith('.srt')) {
    vttText = srtToVtt(text);
  } else {
    throw new Error('Unsupported format — use .vtt or .srt');
  }

  const blob = new Blob([vttText], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}

/**
 * Inject a VTT object URL as a <track> into the given video element.
 * Removes any previously injected track first.
 */
export function injectTrack(videoEl, vttUrl, label = 'Subtitles', lang = 'en') {
  // Remove old tracks added by us
  const old = videoEl.querySelector('track[data-cinelink]');
  if (old) {
    old.remove();
    // Revoke previous blob URL if stored
    if (old.dataset.blobUrl) URL.revokeObjectURL(old.dataset.blobUrl);
  }

  if (!vttUrl) return; // remove-only call

  const track = document.createElement('track');
  track.kind    = 'subtitles';
  track.label   = label;
  track.srclang = lang;
  track.src     = vttUrl;
  track.default = true;
  track.setAttribute('data-cinelink', '1');
  track.dataset.blobUrl = vttUrl;

  videoEl.appendChild(track);

  // Force the track to be showing (browser may default to hidden)
  // Must wait a tick for the track to be registered
  setTimeout(() => {
    const tracks = videoEl.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].label === label) {
        tracks[i].mode = 'showing';
        break;
      }
    }
  }, 100);
}

/** Remove all injected tracks and revoke blob URLs */
export function removeTrack(videoEl) {
  injectTrack(videoEl, null);
}

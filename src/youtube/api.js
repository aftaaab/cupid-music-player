/**
 * YouTube playlist helpers.
 *
 * Two flows:
 *  1. By URL — yt-dlp scrapes any public/unlisted playlist. No sign-in, no API key.
 *  2. By Data API — the user is signed in via OAuth; we list their own playlists
 *     and items. Free Data API quota; no YouTube Premium required.
 *
 * Both return tracks with `videoId` so the player can skip the YT search step.
 */

import { getAccessToken } from './auth.js';

const API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Parse a YouTube playlist URL and return its playlist ID.
 *
 * Accepts:
 *   - https://www.youtube.com/playlist?list=PL...
 *   - https://music.youtube.com/playlist?list=PL...
 *   - https://youtu.be/<videoId>?list=PL...
 *   - PL... (bare ID)
 */
export function parsePlaylistUrl(input) {
  if (!input) return null;
  const trimmed = input.trim();

  // Bare ID — YouTube playlist IDs start with PL, LL, FL, RD, UU, UL, OL
  if (/^[A-Za-z0-9_-]{13,}$/.test(trimmed) && /^(PL|LL|FL|RD|UU|UL|OL)/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtu.be') {
      const list = url.searchParams.get('list');
      if (list) return list;
    }
  } catch {
    // not a URL
  }

  return null;
}

/**
 * Fetch a public/unlisted playlist by URL using yt-dlp in the main process.
 * Returns tracks shaped for the streaming player.
 */
export async function fetchPlaylistByUrl(playlistUrl) {
  if (!window.cupid?.youtubeFetchPlaylist) {
    throw new Error('YouTube playlist fetch is unavailable in this build');
  }

  const entries = await window.cupid.youtubeFetchPlaylist(playlistUrl);
  return entries.map((e) => ({
    title: e.title,
    artist: e.artist || '',
    art: `https://i.ytimg.com/vi/${e.videoId}/mqdefault.jpg`,
    uri: `youtube:video:${e.videoId}`,
    videoId: e.videoId,
  }));
}

// ── Data API (requires OAuth sign-in) ──────────────────────

async function ytApi(path, params = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in to YouTube');

  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Fetch the signed-in user's playlists.
 */
export async function fetchMyPlaylists() {
  const playlists = [];
  let pageToken;
  do {
    const data = await ytApi('/playlists', {
      part: 'snippet,contentDetails',
      mine: 'true',
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });
    for (const p of data.items || []) {
      const thumbs = p.snippet?.thumbnails || {};
      const thumb = thumbs.medium || thumbs.default || thumbs.high;
      playlists.push({
        id: p.id,
        name: p.snippet?.title || '(untitled)',
        image: thumb?.url || null,
        trackCount: p.contentDetails?.itemCount || 0,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  // Liked Videos isn't returned by playlists?mine=true — pull it from channels.
  try {
    const ch = await ytApi('/channels', { part: 'contentDetails', mine: 'true' });
    const likesId = ch.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
    if (likesId) {
      playlists.unshift({
        id: likesId,
        name: 'Liked Videos',
        image: null,
        trackCount: 0,
      });
    }
  } catch {
    // non-fatal
  }

  return playlists;
}

/**
 * Fetch tracks from a playlist by ID via the Data API.
 */
export async function fetchPlaylistTracks(playlistId) {
  const tracks = [];
  let pageToken;
  do {
    const data = await ytApi('/playlistItems', {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of data.items || []) {
      const videoId = item.contentDetails?.videoId;
      if (!videoId) continue;
      const snip = item.snippet || {};
      // Private/deleted videos surface as titles like "Private video" with no thumbnail
      if (snip.title === 'Private video' || snip.title === 'Deleted video') continue;
      const thumbs = snip.thumbnails || {};
      const thumb = thumbs.medium || thumbs.default || thumbs.high;
      tracks.push({
        title: snip.title || videoId,
        artist: snip.videoOwnerChannelTitle || snip.channelTitle || '',
        art: thumb?.url || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        uri: `youtube:video:${videoId}`,
        videoId,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return tracks;
}

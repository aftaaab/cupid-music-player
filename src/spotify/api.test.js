/**
 * Tests for fetchPlaylistTracks pagination.
 *
 * Verifies that playlists larger than one API page (100 tracks) are
 * fetched in full by following the `next` URL, instead of being capped
 * at the initial response.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPlaylistTracks } from './api.js';

vi.mock('./auth.js', () => ({
  getAccessToken: vi.fn(async () => 'fake-token'),
}));

const API_BASE = 'https://api.spotify.com/v1';
const PLAYLIST_ID = '37i9dQZF1DXcBWIGoYBM5M';

/** Build a normalised Spotify track entry as the API returns it. */
function makeTrack(i) {
  return {
    track: {
      name: `Track ${i}`,
      uri: `spotify:track:${i}`,
      artists: [{ name: `Artist ${i}` }],
      album: { images: [{ url: `https://img.example/${i}.jpg` }] },
    },
  };
}

/** JSON Response helper */
function jsonRes(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPlaylistTracks', () => {
  it('follows `next` pages and returns all tracks from a large playlist', async () => {
    const nextUrl = `${API_BASE}/playlists/${PLAYLIST_ID}/tracks?offset=100&limit=100`;
    const lastUrl = `${API_BASE}/playlists/${PLAYLIST_ID}/tracks?offset=200&limit=100`;

    const fetchMock = vi.fn(async (url) => {
      // Page 1: full playlist object, tracks nested under `tracks`
      if (url === `${API_BASE}/playlists/${PLAYLIST_ID}?market=from_token`) {
        return jsonRes({
          name: 'Big Playlist',
          tracks: {
            items: Array.from({ length: 100 }, (_, i) => makeTrack(i)),
            next: nextUrl,
          },
        });
      }
      // Page 2: bare paging object, items at top level
      if (url === nextUrl) {
        return jsonRes({
          items: Array.from({ length: 100 }, (_, i) => makeTrack(100 + i)),
          next: lastUrl,
        });
      }
      // Page 3: final page, next is null
      if (url === lastUrl) {
        return jsonRes({
          items: Array.from({ length: 50 }, (_, i) => makeTrack(200 + i)),
          next: null,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const tracks = await fetchPlaylistTracks(PLAYLIST_ID);

    // Before the fix this returned only the first 100
    expect(tracks).toHaveLength(250);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Order preserved across page boundaries
    expect(tracks[0]).toEqual({
      title: 'Track 0',
      artist: 'Artist 0',
      art: 'https://img.example/0.jpg',
      uri: 'spotify:track:0',
    });
    expect(tracks[99].title).toBe('Track 99');
    expect(tracks[100].title).toBe('Track 100');
    expect(tracks[249].title).toBe('Track 249');
  });

  it('handles the newer playlist shape where the paging object is under `items`', async () => {
    // Newer API responses replace the top-level `tracks` key with `items`
    // (itself a paging object pointing at the /playlists/{id}/items endpoint)
    const nextUrl = `${API_BASE}/playlists/${PLAYLIST_ID}/items?offset=100&limit=100&market=from_token`;

    const fetchMock = vi.fn(async (url) => {
      if (url === `${API_BASE}/playlists/${PLAYLIST_ID}?market=from_token`) {
        return jsonRes({
          name: 'Big Playlist',
          items: {
            href: `${API_BASE}/playlists/${PLAYLIST_ID}/items?offset=0&limit=100&market=from_token`,
            items: Array.from({ length: 100 }, (_, i) => makeTrack(i)),
            next: nextUrl,
          },
        });
      }
      if (url === nextUrl) {
        return jsonRes({
          items: Array.from({ length: 50 }, (_, i) => makeTrack(100 + i)),
          next: null,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const tracks = await fetchPlaylistTracks(PLAYLIST_ID);

    expect(tracks).toHaveLength(150);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tracks[0].title).toBe('Track 0');
    expect(tracks[149].title).toBe('Track 149');
  });

  it('throws a descriptive error on an unrecognised response shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes({ name: 'Weird', id: 'x' })));

    await expect(fetchPlaylistTracks(PLAYLIST_ID)).rejects.toThrow(
      'Spotify returned an unexpected playlist response',
    );
  });

  it('makes a single request when the playlist fits in one page', async () => {
    const fetchMock = vi.fn(async () =>
      jsonRes({
        tracks: {
          items: Array.from({ length: 3 }, (_, i) => makeTrack(i)),
          next: null,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const tracks = await fetchPlaylistTracks(PLAYLIST_ID);

    expect(tracks).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips null/unavailable track entries on every page', async () => {
    const nextUrl = `${API_BASE}/playlists/${PLAYLIST_ID}/tracks?offset=100&limit=100`;

    const fetchMock = vi.fn(async (url) => {
      if (url.includes('market=from_token') && !url.includes('/tracks')) {
        return jsonRes({
          tracks: {
            items: [makeTrack(0), { track: null }],
            next: nextUrl,
          },
        });
      }
      return jsonRes({
        items: [{ track: null }, makeTrack(1)],
        next: null,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const tracks = await fetchPlaylistTracks(PLAYLIST_ID);

    expect(tracks.map((t) => t.title)).toEqual(['Track 0', 'Track 1']);
  });

  it('throws on an API error response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    })));

    await expect(fetchPlaylistTracks(PLAYLIST_ID)).rejects.toThrow(
      'Spotify API error 404: Not found',
    );
  });
});

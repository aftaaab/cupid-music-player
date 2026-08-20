/**
 * Tests for Apple Music pagination.
 *
 * Verifies that playlists larger than one MusicKit page (100 tracks)
 * are fetched in full by following `next`/offset paging, instead of
 * being capped at the initial response.
 */

import { describe, it, expect, vi } from 'vitest';
import { fetchPlaylistTracks, fetchMyPlaylists } from './api.js';

const musicMock = vi.fn();

vi.mock('./auth.js', () => ({
  getMusicKit: vi.fn(() => ({ api: { music: (...args) => musicMock(...args) } })),
  initMusicKit: vi.fn(),
}));

vi.stubGlobal('window', {
  MusicKit: { formatArtworkURL: (art) => art.url },
});

/** Build a library track item as MusicKit returns it. */
function makeTrack(i) {
  return {
    id: `track-${i}`,
    attributes: {
      name: `Track ${i}`,
      artistName: `Artist ${i}`,
      artwork: { url: `https://img.example/${i}.jpg` },
    },
  };
}

/**
 * Serve `total` items in pages of `pageSize`, honouring the
 * { limit, offset } params and setting `next` while pages remain.
 */
function pagedApi(total, pageSize, makeItem) {
  return async (path, { limit, offset }) => {
    const size = Math.min(limit, pageSize);
    const items = [];
    for (let i = offset; i < Math.min(offset + size, total); i++) {
      items.push(makeItem(i));
    }
    const hasMore = offset + items.length < total;
    return {
      data: {
        data: items,
        ...(hasMore ? { next: `${path}?offset=${offset + items.length}` } : {}),
      },
    };
  };
}

describe('fetchPlaylistTracks', () => {
  it('follows paging and returns all tracks from a large playlist', async () => {
    musicMock.mockReset();
    musicMock.mockImplementation(pagedApi(250, 100, makeTrack));

    const tracks = await fetchPlaylistTracks('p.123');

    // Before the fix this returned only the first 100
    expect(tracks).toHaveLength(250);
    expect(musicMock).toHaveBeenCalledTimes(3);

    expect(tracks[0]).toEqual({
      title: 'Track 0',
      artist: 'Artist 0',
      art: 'https://img.example/0.jpg',
      uri: 'apple:track:track-0',
    });
    expect(tracks[99].title).toBe('Track 99');
    expect(tracks[100].title).toBe('Track 100');
    expect(tracks[249].title).toBe('Track 249');
  });

  it('makes a single request when the playlist fits in one page', async () => {
    musicMock.mockReset();
    musicMock.mockImplementation(pagedApi(3, 100, makeTrack));

    const tracks = await fetchPlaylistTracks('p.123');

    expect(tracks).toHaveLength(3);
    expect(musicMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchMyPlaylists', () => {
  it('follows paging past 100 playlists', async () => {
    musicMock.mockReset();
    musicMock.mockImplementation(pagedApi(120, 100, (i) => ({
      id: `pl-${i}`,
      attributes: { name: `Playlist ${i}`, trackCount: i },
    })));

    const playlists = await fetchMyPlaylists();

    expect(playlists).toHaveLength(120);
    expect(playlists[119]).toEqual({
      id: 'pl-119',
      name: 'Playlist 119',
      image: null,
      trackCount: 119,
    });
  });
});

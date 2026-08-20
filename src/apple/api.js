/**
 * Apple Music API helpers.
 *
 * Fetches user playlists and track data via MusicKit JS.
 */

import { getMusicKit, initMusicKit } from './auth.js';

/**
 * Fetch every page of an Apple Music library endpoint.
 *
 * MusicKit responses include a `next` path while more pages remain;
 * keep requesting with an increasing offset until it's gone.
 *
 * @param {object} mk MusicKit instance
 * @param {string} path API path, e.g. '/v1/me/library/playlists'
 * @returns {Promise<Array<object>>} concatenated `data` items from all pages
 */
async function fetchAllPages(mk, path) {
  const items = [];
  let offset = 0;

  while (true) {
    const response = await mk.api.music(path, { limit: 100, offset });
    const page = response.data;
    items.push(...page.data);
    if (!page.next || page.data.length === 0) break;
    offset += page.data.length;
  }

  return items;
}

/**
 * Fetch the user's Apple Music library playlists.
 *
 * @returns {Promise<Array<{ id: string, name: string, image: string|null, trackCount: number }>>}
 */
export async function fetchMyPlaylists() {
  const mk = getMusicKit() || await initMusicKit();

  const playlists = await fetchAllPages(mk, '/v1/me/library/playlists');

  return playlists.map((p) => ({
    id: p.id,
    name: p.attributes.name,
    image: p.attributes.artwork
      ? window.MusicKit.formatArtworkURL(p.attributes.artwork, 300, 300)
      : null,
    trackCount: p.attributes.trackCount || 0,
  }));
}

/**
 * Fetch tracks from an Apple Music library playlist.
 *
 * @param {string} playlistId
 * @returns {Promise<Array<{ title: string, artist: string, art: string|null, uri: string }>>}
 */
export async function fetchPlaylistTracks(playlistId) {
  const mk = getMusicKit() || await initMusicKit();

  const tracks = await fetchAllPages(mk, `/v1/me/library/playlists/${playlistId}/tracks`);

  return tracks
    .filter((t) => t.attributes)
    .map((t) => ({
      title: t.attributes.name,
      artist: t.attributes.artistName,
      art: t.attributes.artwork
        ? window.MusicKit.formatArtworkURL(t.attributes.artwork, 300, 300)
        : null,
      uri: `apple:track:${t.id}`,
    }));
}

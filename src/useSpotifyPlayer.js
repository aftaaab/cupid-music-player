/**
 * React hook for Spotify playback via YouTube audio streams.
 *
 * Spotify API supplies metadata/playlists; audio is fetched from YouTube
 * in the main process (cupid-audio:// protocol) and played via HTML5 Audio.
 *
 * Same interface as useAudioPlayer.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export default function useSpotifyPlayer(tracks, playMode = 'normal') {
  const audioRef = useRef(new Audio());
  const playModeRef = useRef(playMode);
  playModeRef.current = playMode;
  // Shared between prefetch, next(), and onEnded so we play what we warmed
  const nextIdxRef = useRef(null);
  const [trackIndex, setTrackIndex] = useState(0);

  // Reset to track 0 on playlist change, otherwise the stale index can be
  // out of bounds for the new playlist
  const prevTracksRef = useRef(tracks);
  if (prevTracksRef.current !== tracks) {
    prevTracksRef.current = tracks;
    nextIdxRef.current = null;
    setTrackIndex(0);
  }
  const [isPlaying, setIsPlaying] = useState(false);
  // Ref so the async load effect sees the latest value when it resolves,
  // not the one captured when it started
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('cupid-volume');
    return saved !== null ? parseFloat(saved) : 1;
  });
  const [muted, setMuted] = useState(false);

  const audio = audioRef.current;
  audio.volume = muted ? 0 : volume;
  audio.preload = 'auto';

  const track = tracks[trackIndex] ?? {
    title: 'No track',
    artist: '',
    art: null,
    uri: null,
  };

  // ── Load track when index or tracks change ────────────────
  useEffect(() => {
    if (tracks.length === 0) return;
    const t = tracks[trackIndex];
    if (!t) return;

    let cancelled = false;
    setLoading(true);

    async function loadStream() {
      try {
        const url = t.videoId
          ? await window.cupid.getStreamUrlById(t.videoId)
          : await window.cupid.getStreamUrl(t.title, t.artist);
        if (cancelled) return;
        // setting src triggers loading; an explicit audio.load() would reset it
        audio.src = url;
        if (isPlayingRef.current) {
          audio.play().catch(() => {});
        }
      } catch (err) {
        console.error('Failed to get stream:', err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStream();

    return () => { cancelled = true; };
  }, [trackIndex, tracks]);

  // ── Precompute next index + prefetch surrounding tracks ───
  useEffect(() => {
    if (tracks.length === 0) {
      nextIdxRef.current = null;
      return;
    }

    const prefetched = new Set([trackIndex]);
    const prefetch = (idx) => {
      if (idx < 0 || idx >= tracks.length || prefetched.has(idx)) return;
      const t = tracks[idx];
      if (!t) return;
      prefetched.add(idx);
      if (t.videoId) {
        window.cupid.getStreamUrlById(t.videoId).catch(() => {});
      } else {
        window.cupid.getStreamUrl(t.title, t.artist).catch(() => {});
      }
    };

    let nextIdx;
    if (playMode === 'shuffle' && tracks.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * tracks.length);
      } while (nextIdx === trackIndex);
    } else {
      nextIdx = (trackIndex + 1) % tracks.length;
    }
    nextIdxRef.current = nextIdx;

    prefetch(nextIdx);

    // Shuffle's second hop is unpredictable, so only look ahead in linear mode
    if (playMode !== 'shuffle') {
      prefetch((trackIndex + 2) % tracks.length);
      prefetch((trackIndex - 1 + tracks.length) % tracks.length);
    }
  }, [trackIndex, tracks, playMode]);

  // ── Audio event listeners ─────────────────────────────────
  useEffect(() => {
    const onTimeUpdate = () => {
      // Throttle state updates: the clock only shows whole seconds and the
      // pixel progress bar can't resolve finer than ~1/400, so skipping
      // sub-threshold updates cuts full-app re-renders from ~4/s to ~1/s.
      const t = audio.currentTime;
      setCurrentTime((prev) => (Math.floor(prev) === Math.floor(t) ? prev : t));
      if (audio.duration) {
        const p = t / audio.duration;
        setProgress((prev) => (Math.abs(p - prev) < 0.0025 && p < 0.999 ? prev : p));
      }
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const onEnded = () => {
      if (playModeRef.current === 'repeat') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      setTrackIndex((prev) => {
        if (nextIdxRef.current !== null && nextIdxRef.current !== prev) {
          return nextIdxRef.current;
        }
        if (playModeRef.current === 'shuffle' && tracks.length > 1) {
          let next;
          do { next = Math.floor(Math.random() * tracks.length); } while (next === prev);
          return next;
        }
        return (prev + 1) % tracks.length;
      });
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [tracks.length]);

  // ── Playback controls ────────────────────────────────────

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const next = useCallback(() => {
    setTrackIndex((prev) => {
      // Prefer the precomputed next (matches what prefetch warmed)
      if (nextIdxRef.current !== null && nextIdxRef.current !== prev) {
        return nextIdxRef.current;
      }
      if (playModeRef.current === 'shuffle' && tracks.length > 1) {
        let n;
        do { n = Math.floor(Math.random() * tracks.length); } while (n === prev);
        return n;
      }
      return (prev + 1) % tracks.length;
    });
    setIsPlaying(true);
  }, [tracks.length]);

  const prev = useCallback(() => {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
    } else {
      setTrackIndex((prev) => (prev - 1 + tracks.length) % tracks.length);
    }
    setIsPlaying(true);
  }, [tracks.length]);

  const seek = useCallback((fraction) => {
    if (audio.duration) {
      audio.currentTime = Math.min(fraction, 1) * audio.duration;
    }
  }, []);

  const setVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    audio.volume = clamped;
    localStorage.setItem('cupid-volume', clamped);
    if (clamped > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      audio.volume = m ? volume : 0;
      return !m;
    });
  }, [volume]);

  return {
    track,
    trackIndex,
    isPlaying,
    progress,
    duration,
    currentTime,
    togglePlay,
    next,
    prev,
    seek,
    volume,
    setVolume,
    muted,
    toggleMute,
    loading,
  };
}

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Local audio player hook (HTML5 Audio).
 *
 * Tracks come from the user's editable playlist (audio/playlist.json),
 * loaded in App via window.cupid.getLocalPlaylist(). Files are resolved
 * to file:// URLs through getAudioPath so spaces/Unicode work correctly.
 */
export default function useAudioPlayer(tracks, playMode = 'normal', getAudioPath) {
  const audioRef = useRef(new Audio());
  const playModeRef = useRef(playMode);
  playModeRef.current = playMode;
  const [trackIndex, setTrackIndex] = useState(0);

  // Reset index when the playlist array changes (mirrors useSpotifyPlayer)
  const prevTracksRef = useRef(tracks);
  if (prevTracksRef.current !== tracks) {
    prevTracksRef.current = tracks;
    if (trackIndex >= tracks.length) setTrackIndex(0);
  }

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('cupid-volume');
    return saved !== null ? parseFloat(saved) : 1;
  });
  const [muted, setMuted] = useState(false);

  const track = tracks[trackIndex] ?? { title: 'No track', artist: '', file: '', art: null };
  const audio = audioRef.current;
  audio.volume = muted ? 0 : volume;

  // Load track when index or tracks change
  useEffect(() => {
    const t = tracks[trackIndex];
    if (!t || !t.file) return;

    let cancelled = false;
    (async () => {
      let src;
      if (getAudioPath) {
        src = await getAudioPath(t.file);
      } else {
        // Browser/preview fallback — Vite serves audio/ as publicDir
        src = `./${t.file}`;
      }
      if (cancelled || !src) return;
      audio.src = src;
      audio.load();
      setProgress(0);
      setCurrentTime(0);
      setDuration(0);
      if (isPlayingRef.current) {
        audio.play().catch(() => {});
      }
    })();

    return () => { cancelled = true; };
  }, [trackIndex, tracks]);

  // Time update listener
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
        if (tracks.length === 0) return 0;
        if (playModeRef.current === 'shuffle') {
          let next;
          do { next = Math.floor(Math.random() * tracks.length); } while (next === prev && tracks.length > 1);
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
  }, [tracks]);

  const play = useCallback(() => {
    audio.play().catch(() => {});
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    audio.pause();
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const next = useCallback(() => {
    setTrackIndex((prev) => {
      if (tracks.length === 0) return 0;
      if (playModeRef.current === 'shuffle' && tracks.length > 1) {
        let n;
        do { n = Math.floor(Math.random() * tracks.length); } while (n === prev);
        return n;
      }
      return (prev + 1) % tracks.length;
    });
  }, [tracks]);

  const prev = useCallback(() => {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
    } else {
      setTrackIndex((p) => {
        if (tracks.length === 0) return 0;
        return (p - 1 + tracks.length) % tracks.length;
      });
    }
  }, [tracks]);

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

  // ── Media Session: lock-screen / notification / media-key controls ──
  useEffect(() => {
    if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: track.title || 'Cupid Player',
      artist: track.artist || '',
      album: track.album || '',
      artwork: track.art ? [{ src: track.art, sizes: '600x600', type: 'image/jpeg' }] : [],
    });
  }, [track]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const safeSet = (action, handler) => {
      try { ms.setActionHandler(action, handler); } catch { /* unsupported action */ }
    };
    safeSet('play', play);
    safeSet('pause', pause);
    safeSet('previoustrack', prev);
    safeSet('nexttrack', next);
    safeSet('seekto', (details) => {
      if (audio.duration && details.seekTime != null) {
        audio.currentTime = details.seekTime;
      }
    });
    return () => {
      ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'].forEach((a) => safeSet(a, null));
    };
  }, [play, pause, prev, next]);

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
  };
}

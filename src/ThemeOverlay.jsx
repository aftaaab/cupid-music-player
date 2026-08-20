import { useMemo } from 'react';
import './themeOverlay.css';

/**
 * Ambient pixel-art animation layer for the purple (borahae) and love themes.
 * Hearts only drift while music is playing, fading in/out with playback so it
 * feels alive without ever covering the controls (pointer-events: none).
 */

// Classic 9x8 pixel heart, drawn as SVG rects so it stays crisp when scaled
function pixelHeartSvg(fill, shade) {
  const px = [
    [1, 0], [2, 0], [6, 0], [7, 0],
    [0, 1], [1, 1], [2, 1], [3, 1], [5, 1], [6, 1], [7, 1], [8, 1],
    [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2],
    [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3],
    [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4],
    [2, 5], [3, 5], [4, 5], [5, 5], [6, 5],
    [3, 6], [4, 6], [5, 6],
    [4, 7],
  ];
  const highlight = [[1, 1], [2, 1], [1, 2]];
  const rects = px
    .map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`)
    .concat(highlight.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${shade}"/>`))
    .join('');
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 8" shape-rendering="crispEdges">${rects}</svg>`
  )}`;
}

// 5x5 pixel sparkle (plus shape with center)
function pixelSparkleSvg(fill) {
  const px = [[2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3], [2, 4]];
  const rects = px.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`).join('');
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" shape-rendering="crispEdges">${rects}</svg>`
  )}`;
}

const SPRITES = {
  purple: {
    hearts: [pixelHeartSvg('#8f5fe8', '#c4a6f7'), pixelHeartSvg('#6d3fc4', '#a57bea')],
    sparkle: pixelSparkleSvg('#d9c6ff'),
    heartCount: 10,
    sparkleCount: 7,
  },
  love: {
    hearts: [pixelHeartSvg('#e8556d', '#f7a6b4'), pixelHeartSvg('#c22d46', '#e8556d')],
    sparkle: null,
    heartCount: 14,
    sparkleCount: 0,
  },
};

function makeParticles(theme) {
  const cfg = SPRITES[theme];
  if (!cfg) return null;
  const rand = (min, max) => min + Math.random() * (max - min);
  const hearts = Array.from({ length: cfg.heartCount }, (_, i) => ({
    id: `h${i}`,
    src: cfg.hearts[i % cfg.hearts.length],
    style: {
      left: `${rand(3, 92)}%`,
      '--sz': rand(7, 15),
      '--dur': `${rand(7, 14)}s`,
      '--delay': `${rand(0, 10)}s`,
      '--sway': `${rand(-9, 9)}vw`,
      '--op': rand(0.45, 0.85),
    },
  }));
  const sparkles = Array.from({ length: cfg.sparkleCount }, (_, i) => ({
    id: `s${i}`,
    src: cfg.sparkle,
    style: {
      left: `${rand(4, 92)}%`,
      top: `${rand(6, 88)}%`,
      '--sz': rand(4, 7),
      '--dur': `${rand(1.8, 3.6)}s`,
      '--delay': `${rand(0, 3)}s`,
    },
  }));
  return { hearts, sparkles };
}

export default function ThemeOverlay({ theme, isPlaying }) {
  const particles = useMemo(() => makeParticles(theme), [theme]);
  if (!particles) return null;

  return (
    <div className={`theme-overlay theme-overlay-${theme} ${isPlaying ? 'playing' : ''}`}>
      {theme === 'love' && <div className="fx-heartbeat" />}
      {particles.hearts.map((p) => (
        <img key={p.id} src={p.src} className="fx-heart" style={p.style} alt="" draggable={false} />
      ))}
      {particles.sparkles.map((p) => (
        <img key={p.id} src={p.src} className="fx-sparkle" style={p.style} alt="" draggable={false} />
      ))}
    </div>
  );
}

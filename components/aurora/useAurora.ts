"use client";
import { useEffect, useRef, useState } from 'react';
import type { AuroraHandle, AuroraMode } from './engine';

// Mounts the Aurora scene on a canvas inside a stage element. three.js is loaded with a
// dynamic import so it stays out of the first paint. Link and heading updates are written
// straight to DOM nodes to avoid re-rendering React on every frame.
export function useAurora(mode: AuroraMode) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLElement>(null);
  const handleRef = useRef<AuroraHandle | null>(null);
  const [noWebGL, setNoWebGL] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import('./engine')
      .then(({ createAurora }) => {
        if (cancelled || !canvasRef.current || !stageRef.current) return;
        const handle = createAurora(canvasRef.current, stageRef.current, {
          mode,
          onLink: (s) => { if (linkRef.current) linkRef.current.textContent = s; },
          onHeading: (d) => { if (headingRef.current) headingRef.current.textContent = String(d).padStart(3, '0') + '°'; },
        });
        handleRef.current = handle;
        if (handle) setReady(true); else setNoWebGL(true);
      })
      .catch(() => setNoWebGL(true));
    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
      setReady(false);
    };
  }, [mode]);

  return { canvasRef, stageRef, linkRef, headingRef, handleRef, noWebGL, ready };
}

// Bridge console clock and a slowly drifting position off Mumbai, as display flavour.
export function useBridgeClock() {
  const utcRef = useRef<HTMLElement>(null);
  const posRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const tick = () => {
      const d = new Date();
      if (utcRef.current) utcRef.current.textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
      const m = (Date.now() / 60000) % 60;
      if (posRef.current) posRef.current.textContent = `18°${(54.2 + m * 0.012).toFixed(2)}′N 072°${(48.7 + m * 0.04).toFixed(2)}′E`;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return { utcRef, posRef };
}

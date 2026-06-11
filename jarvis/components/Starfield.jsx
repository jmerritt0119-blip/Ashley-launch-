'use client';

import { useEffect, useRef } from 'react';

// A slow drifting starfield with a faint scanning grid. Pure ambience.
export default function Starfield() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let stars = [];
    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.floor((w * h) / 9000);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random() * 0.8 + 0.2,
        tw: Math.random() * Math.PI * 2,
      }));
    };

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);

      // faint grid
      ctx.strokeStyle = 'rgba(57, 199, 255, 0.04)';
      ctx.lineWidth = 1;
      const grid = 64;
      const offset = (t * 0.004) % grid;
      ctx.beginPath();
      for (let x = -offset; x < w; x += grid) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = -offset; y < h; y += grid) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // stars
      for (const s of stars) {
        s.y += s.z * 0.12;
        if (s.y > h) {
          s.y = 0;
          s.x = Math.random() * w;
        }
        const twinkle = 0.5 + 0.5 * Math.sin(t * 0.002 + s.tw);
        const alpha = 0.15 + s.z * 0.55 * twinkle;
        ctx.fillStyle = `rgba(180, 240, 255, ${alpha})`;
        ctx.fillRect(s.x, s.y, s.z * 1.6, s.z * 1.6);
      }

      raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ display: 'block' }}
    />
  );
}

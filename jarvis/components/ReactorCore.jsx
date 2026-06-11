'use client';

import { useEffect, useRef } from 'react';

// The arc reactor. A canvas of concentric rings, orbiting particles and a
// pulsing core whose colour and energy respond to `status`:
//   idle | listening | thinking | speaking
const PALETTE = {
  idle: { core: [125, 249, 255], ring: [57, 199, 255], spin: 0.4, pulse: 0.5, energy: 0.55 },
  listening: { core: [93, 255, 157], ring: [80, 230, 150], spin: 0.7, pulse: 1.1, energy: 0.85 },
  thinking: { core: [255, 180, 84], ring: [255, 150, 70], spin: 1.6, pulse: 1.4, energy: 0.95 },
  speaking: { core: [150, 235, 255], ring: [90, 210, 255], spin: 1.0, pulse: 1.8, energy: 1.0 },
};

export default function ReactorCore({ status = 'idle' }) {
  const canvasRef = useRef(null);
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let size = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Smoothed palette values so transitions between states glide.
    let cur = { ...PALETTE.idle, core: [...PALETTE.idle.core], ring: [...PALETTE.idle.ring] };

    const particles = Array.from({ length: 42 }, (_, i) => ({
      angle: (i / 42) * Math.PI * 2,
      radius: 0.62 + Math.random() * 0.28,
      speed: 0.2 + Math.random() * 0.8,
      sz: 0.6 + Math.random() * 1.6,
    }));

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = Math.min(canvas.clientWidth, canvas.clientHeight);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const lerp = (a, b, n) => a + (b - a) * n;

    const draw = (t) => {
      const target = PALETTE[statusRef.current] || PALETTE.idle;
      // ease the smoothed palette toward the target
      const k = 0.06;
      cur.spin = lerp(cur.spin, target.spin, k);
      cur.pulse = lerp(cur.pulse, target.pulse, k);
      cur.energy = lerp(cur.energy, target.energy, k);
      for (let i = 0; i < 3; i++) {
        cur.core[i] = lerp(cur.core[i], target.core[i], k);
        cur.ring[i] = lerp(cur.ring[i], target.ring[i], k);
      }

      const C = size / 2;
      const R = size * 0.42;
      const time = t * 0.001;
      const core = `${Math.round(cur.core[0])},${Math.round(cur.core[1])},${Math.round(cur.core[2])}`;
      const ring = `${Math.round(cur.ring[0])},${Math.round(cur.ring[1])},${Math.round(cur.ring[2])}`;

      // breathing pulse
      const pulse = 0.5 + 0.5 * Math.sin(time * cur.pulse * 2.0);
      const energy = cur.energy * (0.7 + 0.3 * pulse);

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(C, C);

      // outer glow halo
      const halo = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 1.25);
      halo.addColorStop(0, `rgba(${ring}, ${0.18 * energy})`);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.25, 0, Math.PI * 2);
      ctx.fill();

      // rotating outer ring with tick marks
      ctx.save();
      ctx.rotate(time * cur.spin * 0.5);
      ctx.strokeStyle = `rgba(${ring}, ${0.6 * energy})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.stroke();
      const ticks = 60;
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2;
        const long = i % 5 === 0;
        const r1 = R - (long ? 12 : 6);
        ctx.globalAlpha = (long ? 0.9 : 0.45) * energy;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * (R - 1), Math.sin(a) * (R - 1));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // counter-rotating mid ring with arc segments
      ctx.save();
      ctx.rotate(-time * cur.spin * 0.9);
      ctx.strokeStyle = `rgba(${core}, ${0.75 * energy})`;
      ctx.lineWidth = 2.5;
      const segs = 5;
      for (let i = 0; i < segs; i++) {
        const start = (i / segs) * Math.PI * 2 + 0.15;
        const end = start + (Math.PI * 2) / segs - 0.55;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.78, start, end);
        ctx.stroke();
      }
      ctx.restore();

      // inner thin ring
      ctx.strokeStyle = `rgba(${ring}, ${0.4 * energy})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.6, 0, Math.PI * 2);
      ctx.stroke();

      // orbiting particles
      for (const p of particles) {
        const a = p.angle + time * p.speed * cur.spin;
        const pr = R * p.radius;
        const x = Math.cos(a) * pr;
        const y = Math.sin(a) * pr;
        ctx.fillStyle = `rgba(${core}, ${0.8 * energy})`;
        ctx.beginPath();
        ctx.arc(x, y, p.sz, 0, Math.PI * 2);
        ctx.fill();
      }

      // glowing core
      const coreR = R * (0.34 + 0.06 * pulse);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
      grad.addColorStop(0, `rgba(255,255,255,${0.95 * energy})`);
      grad.addColorStop(0.35, `rgba(${core}, ${0.9 * energy})`);
      grad.addColorStop(1, `rgba(${ring}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.fill();

      // triangular core emblem (a nod to the reactor)
      ctx.save();
      ctx.rotate(time * cur.spin * 0.3);
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * energy})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * coreR * 0.55;
        const y = Math.sin(a) * coreR * 0.55;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      ctx.restore();
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
      className="h-full w-full"
      style={{ display: 'block' }}
    />
  );
}

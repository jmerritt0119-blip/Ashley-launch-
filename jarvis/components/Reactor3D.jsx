'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// A true 3D holographic arc reactor: emissive core, gimbal rings, particle
// shell and a hovering wireframe shell, all blown out with UnrealBloom.
// Colour and energy respond to `status`; the core swells with live mic level.
const PALETTE = {
  idle: { core: 0x9af2ff, ring: 0x39c7ff, bloom: 1.2, spin: 0.35 },
  listening: { core: 0x7dffb0, ring: 0x37e08a, bloom: 1.5, spin: 0.6 },
  thinking: { core: 0xffc46b, ring: 0xff9a45, bloom: 1.9, spin: 1.5 },
  speaking: { core: 0xa8ecff, ring: 0x59d2ff, bloom: 2.2, spin: 0.9 },
};

export default function Reactor3D({ status = 'idle', audioRef = null }) {
  const mountRef = useRef(null);
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // WebGL unavailable — wrapper handles the 2D fallback
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    const root = new THREE.Group();
    scene.add(root);

    // --- core ---------------------------------------------------------------
    const coreMat = new THREE.MeshBasicMaterial({ color: PALETTE.idle.core });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 3), coreMat);
    root.add(core);

    const glowMat = new THREE.MeshBasicMaterial({
      color: PALETTE.idle.core,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.25, 32, 32), glowMat);
    root.add(glow);

    // --- gimbal rings -------------------------------------------------------
    const ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.idle.ring });
    const rings = [];
    const ringDefs = [
      { r: 1.7, t: 0.025, rot: [Math.PI / 2.2, 0, 0] },
      { r: 2.05, t: 0.02, rot: [Math.PI / 2, Math.PI / 3, 0] },
      { r: 2.4, t: 0.018, rot: [Math.PI / 3, -Math.PI / 4, Math.PI / 6] },
    ];
    for (const d of ringDefs) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(d.r, d.t, 16, 160),
        ringMat
      );
      ring.rotation.set(...d.rot);
      ring.userData.spin = 0.3 + Math.random() * 0.5;
      ring.userData.axis = new THREE.Vector3(
        Math.random(),
        Math.random(),
        Math.random()
      ).normalize();
      root.add(ring);
      rings.push(ring);
    }

    // segmented inner ring (dashed look via many small boxes)
    const segGroup = new THREE.Group();
    const segMat = new THREE.MeshBasicMaterial({ color: PALETTE.idle.core });
    const segCount = 40;
    for (let i = 0; i < segCount; i++) {
      if (i % 2 === 0) continue;
      const a = (i / segCount) * Math.PI * 2;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), segMat);
      seg.position.set(Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0);
      seg.rotation.z = a;
      segGroup.add(seg);
    }
    root.add(segGroup);

    // --- particle shell -----------------------------------------------------
    const pCount = 600;
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const r = 1.6 + Math.random() * 1.4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pPos[i * 3 + 2] = r * Math.cos(phi) * 0.5;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: PALETTE.idle.core,
      size: 0.03,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(pGeo, pMat);
    root.add(particles);

    // --- hovering wireframe shell ------------------------------------------
    const shellMat = new THREE.MeshBasicMaterial({
      color: PALETTE.idle.ring,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(2.9, 1), shellMat);
    root.add(shell);

    // --- post-processing (bloom) -------------------------------------------
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.2, 0.6, 0.0);
    composer.addPass(bloom);

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // --- animation ----------------------------------------------------------
    const cur = new THREE.Color(PALETTE.idle.core);
    const curRing = new THREE.Color(PALETTE.idle.ring);
    const tgt = new THREE.Color();
    const tgtRing = new THREE.Color();
    let curBloom = PALETTE.idle.bloom;
    let curSpin = PALETTE.idle.spin;
    let smoothLevel = 0;
    let raf;
    const clock = new THREE.Clock();

    const animate = () => {
      const t = clock.getElapsedTime();
      const p = PALETTE[statusRef.current] || PALETTE.idle;
      tgt.set(p.core);
      tgtRing.set(p.ring);
      cur.lerp(tgt, 0.05);
      curRing.lerp(tgtRing, 0.05);
      curBloom += (p.bloom - curBloom) * 0.05;
      curSpin += (p.spin - curSpin) * 0.05;

      const level = audioRef && audioRef.current ? audioRef.current.level || 0 : 0;
      smoothLevel += (level - smoothLevel) * 0.25;

      coreMat.color.copy(cur);
      glowMat.color.copy(cur);
      segMat.color.copy(cur);
      pMat.color.copy(cur);
      ringMat.color.copy(curRing);
      shellMat.color.copy(curRing);

      const pulse = 1 + 0.06 * Math.sin(t * 3) + smoothLevel * 0.7;
      core.scale.setScalar(pulse);
      glow.scale.setScalar(1 + smoothLevel * 0.5 + 0.04 * Math.sin(t * 2));
      glowMat.opacity = 0.22 + smoothLevel * 0.5;
      bloom.strength = curBloom + smoothLevel * 1.6;

      core.rotation.y += 0.004 + curSpin * 0.002;
      core.rotation.x += 0.002;
      segGroup.rotation.z -= (0.01 + curSpin * 0.01);
      particles.rotation.y += 0.0009 + curSpin * 0.0006;
      particles.rotation.x += 0.0004;
      shell.rotation.y -= 0.001;
      shell.rotation.x += 0.0006;

      for (const ring of rings) {
        ring.rotateOnAxis(ring.userData.axis, ring.userData.spin * curSpin * 0.02);
      }

      // gentle parallax sway
      root.rotation.y = Math.sin(t * 0.3) * 0.12;
      root.rotation.x = Math.cos(t * 0.22) * 0.08;

      composer.render();
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      composer.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [audioRef]);

  return <div ref={mountRef} className="h-full w-full" />;
}

'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import ReactorCore from './ReactorCore';

// Load the WebGL reactor only on the client (Three.js touches window/DOM).
const Reactor3D = dynamic(() => import('./Reactor3D'), { ssr: false });

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export default function Reactor({ status, audioRef }) {
  // Start with the 2D core (safe for SSR + first paint), upgrade to 3D once
  // we've confirmed WebGL works.
  const [use3D, setUse3D] = useState(false);

  useEffect(() => {
    setUse3D(webglAvailable());
  }, []);

  return use3D ? (
    <Reactor3D status={status} audioRef={audioRef} />
  ) : (
    <ReactorCore status={status} audioRef={audioRef} />
  );
}

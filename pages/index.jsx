import dynamic from 'next/dynamic';

// Load the app client-side only (uses window/localStorage)
const LaunchApp = dynamic(() => import('../components/LaunchApp'), { ssr: false });

export default function Home() {
  return <LaunchApp />;
}

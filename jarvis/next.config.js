/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Export a fully static front-end (out/). The chat backend is a standalone
  // Netlify Function (netlify/functions/chat.mjs) mapped to /api/chat, so we
  // don't rely on the Next.js server runtime at all.
  output: 'export',
  images: { unoptimized: true },
};

module.exports = nextConfig;

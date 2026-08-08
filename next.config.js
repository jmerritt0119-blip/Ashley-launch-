/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    // A static preview build of the Phoenix app is served from public/phoenix/.
    return [{ source: "/phoenix", destination: "/phoenix/index.html", permanent: false }];
  },
};

module.exports = nextConfig;

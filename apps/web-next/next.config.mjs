/** @type {import('next').NextConfig} */
const API_TARGET = process.env.EDUCLINK_API_URL || 'http://localhost:3000';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${API_TARGET}/api/v1/:path*` },
      { source: '/healthz', destination: `${API_TARGET}/healthz` }
    ];
  }
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbo: false,   // Turbopack を完全に無効化
  },
  webpack: (config) => {
    return config;
  },
};

module.exports = nextConfig;

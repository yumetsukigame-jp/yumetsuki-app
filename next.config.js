/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbo: false,   // ← これがないと Turbopack は無効化されない
  },
  webpack: (config) => {
    return config;
  },
};

module.exports = nextConfig;

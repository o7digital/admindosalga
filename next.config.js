/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config, { nextRuntime }) {
    if (nextRuntime === 'edge') {
      // Next 13's inner-graph optimization removes crypto class parents used
      // by Clerk to sign authenticated middleware requests.
      config.optimization.innerGraph = false;
    }
    return config;
  },
};

module.exports = nextConfig;

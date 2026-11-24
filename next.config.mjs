import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
];

const nextConfig = {
  agentRules: false,
  reactStrictMode: true,
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // Contact used to live as a legal document; keep old links working.
  async redirects() {
    return [
      { source: '/legal/kontak', destination: '/kontak', permanent: true },
    ];
  },
};

export default nextConfig;

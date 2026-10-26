/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@fetch-doctor/shared'],
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  outputFileTracingIncludes: {
    '/api/scan': [
      './node_modules/@sparticuz/chromium/bin/*',
      '../../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/*',
      '../../node_modules/@sparticuz/chromium/bin/*',
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // SEC-006: baseline hardening. 'unsafe-inline' for script/style is
          // required by Next.js inline bootstrap scripts, the inline JSON-LD
          // block, and Tailwind-generated style tags.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;

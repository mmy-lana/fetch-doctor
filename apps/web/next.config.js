/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@fetch-doctor/shared'],
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
};
module.exports = nextConfig;

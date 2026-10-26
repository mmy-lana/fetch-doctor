import { MetadataRoute } from 'next';

// Stable timestamp: `new Date()` here made the sitemap advertise a new
// lastmod on every request, which misinforms crawlers. Bump this constant
// when the site content changes meaningfully.
const SITE_UPDATED = new Date('2026-10-25T00:00:00.000Z');

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://fetch-doctor.vercel.app',
      lastModified: SITE_UPDATED,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://fetch-doctor.vercel.app'),
  title: 'fetch-doctor — HTTP Request Profiler & Zombie Fetch Detector',
  description: 'Zero-dependency runtime HTTP request profiler, zombie fetch detector, and AbortSignal auditor for React and modern JavaScript web applications.',
  keywords: [
    'fetch-doctor',
    'fetch doctor',
    'zombie fetch',
    'zombie request detector',
    'abortcontroller leak',
    'abortsignal monitoring',
    'http profiler javascript',
    'react devtools network',
    'react 19 network diagnostics',
    'nextjs network audit',
    'puppeteer cdp auditor',
    'mmy-lana',
  ],
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
  },
  authors: [{ name: 'Muhammad Maulana Yusuf', url: 'https://github.com/mmy-lana' }],
  verification: {
    google: 'kHFv2qyOjv4Th7trKaPXsJom5ZKq5zYf_pZpdXYvA58',
  },
  openGraph: {
    title: 'fetch-doctor — HTTP Request Profiler & Zombie Fetch Detector',
    description: 'Diagnose zombie fetches, missing AbortSignals, and network latency bottlenecks in real time.',
    url: 'https://fetch-doctor.vercel.app',
    siteName: 'fetch-doctor',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'fetch-doctor — HTTP request profiler and zombie fetch detector',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'fetch-doctor — HTTP Profiler & Zombie Fetch Detector',
    description: 'Zero-dependency runtime network diagnostics and AbortSignal inspector for modern web apps.',
    images: ['/og-image.png'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'fetch-doctor',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Browser, Node.js',
  description: 'Zero-dependency runtime HTTP request profiler, zombie fetch detector, and AbortSignal inspector for React & modern web applications.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  url: 'https://fetch-doctor.vercel.app',
  codeRepository: 'https://github.com/mmy-lana/fetch-doctor',
  author: {
    '@type': 'Person',
    name: 'Muhammad Maulana Yusuf',
    url: 'https://github.com/mmy-lana',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* google-site-verification is rendered once via `metadata.verification`
            above — do not add a manual tag here (it produced a duplicate). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
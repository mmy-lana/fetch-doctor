import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'fetch-doctor — Network Lifecycle & Zombie Fetch Auditor',
  description: 'Zero-dependency auditor for zombie fetch requests, unhandled AbortControllers, and network race conditions in React 19 & Next.js.',
  keywords: [
    'fetch-doctor',
    'fetch doctor',
    'zombie fetch',
    'abortcontroller',
    'react 19',
    'nextjs network audit',
    'mmy-lana',
  ],
  authors: [{ name: 'Muhammad Maulana Yusuf', url: 'https://github.com/mmy-lana' }],
  verification: {
    google: 'kHFv2qyOjv4Th7trKaPXsJom5ZKq5zYf_pZpdXYvA58',
  },
  openGraph: {
    title: 'fetch-doctor — Network Lifecycle & Zombie Fetch Auditor',
    description: 'Diagnose zombie fetches, unhandled AbortControllers, and race conditions in real time.',
    url: 'https://fetch-doctor.vercel.app',
    siteName: 'fetch-doctor',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'fetch-doctor',
    description: 'Zero-dependency auditor for zombie fetches and AbortControllers.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
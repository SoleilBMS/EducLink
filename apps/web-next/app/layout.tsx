import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ui/ThemeProvider';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'EducLink — L’école connectée, intelligente et simplifiée',
  description:
    'EducLink est l’ERP scolaire SaaS nouvelle génération pour les écoles privées : gestion pédagogique, communication école-parents et IA intégrée.',
  metadataBase: new URL('http://localhost:3100'),
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
    apple: '/favicon.svg'
  },
  openGraph: {
    title: 'EducLink — L’école connectée, intelligente et simplifiée',
    description:
      'ERP SaaS éducatif premium : direction, enseignants, parents et élèves dans une expérience moderne.',
    images: ['/og-image.svg'],
    type: 'website',
    locale: 'fr_FR'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EducLink',
    description: 'L’école connectée, intelligente et simplifiée.',
    images: ['/og-image.svg']
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2563eb' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1020' }
  ],
  width: 'device-width',
  initialScale: 1
};

const THEME_INIT_SCRIPT = `(function(){try{var k='educlink-theme';var s=localStorage.getItem(k);var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

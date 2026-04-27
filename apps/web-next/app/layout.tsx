import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

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
  metadataBase: new URL('http://localhost:3100')
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}

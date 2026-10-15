import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pilotlane — Good apps start with real people',
  description:
    'A thoughtful workspace connecting app founders with real testers. Clear expectations, honest feedback, rewards agreed upfront. English and Spanish.',
  robots: { index: false, follow: false },
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = (await headers()).get('x-pilotlane-locale') === 'es' ? 'es' : 'en';
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}

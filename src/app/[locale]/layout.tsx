import type { Metadata } from 'next';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return locale === 'es'
    ? {
        title: 'Pilotlane — Las buenas apps empiezan con personas reales',
        description:
          'Conecta con testers reales. Tareas claras, opiniones honestas y recompensas acordadas. En español e inglés.',
      }
    : { title: 'Pilotlane — Good apps start with real people' };
}
export default function LocaleLayout({ children }: { children: React.ReactNode }) {
  return children;
}

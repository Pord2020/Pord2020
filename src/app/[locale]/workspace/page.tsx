import { notFound } from 'next/navigation';
import { Workspace } from '@/components/workspace';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'es') notFound();
  return <Workspace locale={locale} requiresAuth />;
}

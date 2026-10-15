import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
export default async function Home() {
  const language = (await headers()).get('accept-language') || '';
  redirect(language.startsWith('es') ? '/es' : '/en');
}

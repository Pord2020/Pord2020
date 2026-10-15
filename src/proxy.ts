import { NextRequest, NextResponse } from 'next/server';
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-pilotlane-locale', request.nextUrl.pathname.split('/')[1] === 'es' ? 'es' : 'en');
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ['/((?!api|_next/static|_next/image|icon.svg|favicon.ico).*)'] };

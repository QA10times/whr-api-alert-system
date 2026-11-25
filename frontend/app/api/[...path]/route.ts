// app/api/[...path]/route.ts — section 6.4 proxy to NestJS with the Bearer JWT
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function forward(req: Request, { params }: { params: { path: string[] } }) {
  const token = cookies().get('whr_session')?.value;
  const search = new URL(req.url).search;
  const target = `${process.env.API_INTERNAL_URL}/api/${params.path.map(encodeURIComponent).join('/')}${search}`;

  const headers = new Headers({ Accept: 'application/json' });
  const ct = req.headers.get('content-type');
  if (ct) headers.set('Content-Type', ct);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) headers.set('X-Forwarded-For', fwd); // backend audit log records the IP

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  let r: Response;
  try {
    r = await fetch(target, {
      method: req.method,
      headers,
      cache: 'no-store',
      body: hasBody ? await req.text() : undefined,
    });
  } catch {
    return NextResponse.json(
      { statusCode: 502, error: 'Bad Gateway', message: 'Couldn’t reach the server. Check your connection and try again.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const res = new NextResponse(r.status === 204 ? null : await r.text(), {
    status: r.status,
    headers: {
      'Content-Type': r.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
  if (r.status === 401) {
    res.cookies.delete('whr_session');
    res.cookies.delete('whr_user');
  }
  return res;
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };

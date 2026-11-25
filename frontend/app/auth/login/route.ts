// app/auth/login/route.ts — section 6.3
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ statusCode: 400, error: 'Bad Request', message: 'Enter your email and password.' }, { status: 400 });
  }
  let r: Response;
  try {
    r = await fetch(`${process.env.API_INTERNAL_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { statusCode: 502, error: 'Bad Gateway', message: 'Couldn’t reach the server. Check your connection and try again.' },
      { status: 502 },
    );
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json(data, { status: r.status }); // 401 or 429 shown on the form

  const res = NextResponse.json({ email: data.email });
  res.cookies.set('whr_session', data.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: data.expiresIn, // seconds
    secure: process.env.COOKIE_SECURE !== 'false',
  });
  // Non-secret display cookie so the shell can show who is signed in.
  res.cookies.set('whr_user', data.email, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: data.expiresIn,
    secure: process.env.COOKIE_SECURE !== 'false',
  });
  return res;
}

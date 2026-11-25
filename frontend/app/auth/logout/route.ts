// app/auth/logout/route.ts — section 6.3
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('whr_session');
  res.cookies.delete('whr_user');
  return res;
}

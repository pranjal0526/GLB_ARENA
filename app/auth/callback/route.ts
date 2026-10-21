import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/auth/signin?auth_error=oauth', requestUrl.origin));
  }

  const supabase = createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(new URL('/auth/signin?auth_error=oauth', requestUrl.origin));
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/auth/signin?auth_error=oauth', requestUrl.origin));
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, account_status')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/auth/signin?auth_error=profile', requestUrl.origin));
  }
  if (profile.account_status !== 'active') {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/auth/signin?auth_error=account', requestUrl.origin));
  }

  return NextResponse.redirect(new URL(profile.role === 'admin' ? '/admin' : '/dashboard', requestUrl.origin));
}

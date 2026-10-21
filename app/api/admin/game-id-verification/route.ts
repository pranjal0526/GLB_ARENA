import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function POST(request: NextRequest) {
  const userClient = createClient();
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const { data: actor, error: profileError } = await userClient.from('profiles')
    .select('role,account_status').eq('id', authData.user.id).maybeSingle();
  if (profileError || actor?.role !== 'admin' || actor.account_status !== 'active') {
    return NextResponse.json({ error: 'Active administrator access required.' }, { status: 403 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) return NextResponse.json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 });

  const body = await request.json().catch(() => null) as { verificationId?: string } | null;
  const verificationId = body?.verificationId || '';
  if (!isUuid(verificationId)) return NextResponse.json({ error: 'A valid verification ID is required.' }, { status: 400 });

  const { data, error } = await userClient.rpc('admin_delete_rejected_game_id_verification', {
    p_verification_id: verificationId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const result = data as { success?: boolean; error?: string; screenshot_path?: string } | null;
  if (!result?.success) return NextResponse.json({ error: result?.error || 'Could not delete the rejected submission.' }, { status: 400 });

  const screenshotPath = result.screenshot_path;
  if (screenshotPath) {
    const { error: storageError } = await adminClient.storage.from('game-id-verifications').remove([screenshotPath]);
    if (storageError) {
      return NextResponse.json({ success: true, warning: `Submission details were deleted, but screenshot cleanup failed: ${storageError.message}` });
    }
  }
  return NextResponse.json({ success: true });
}

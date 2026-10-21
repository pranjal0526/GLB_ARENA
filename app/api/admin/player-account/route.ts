import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function getActiveAdmin() {
  const userClient = createClient();
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return { response: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) };
  const { data: actor, error: profileError } = await userClient.from('profiles')
    .select('id,role,account_status').eq('id', authData.user.id).maybeSingle();
  if (profileError || actor?.role !== 'admin' || actor.account_status !== 'active') {
    return { response: NextResponse.json({ error: 'Active administrator access required.' }, { status: 403 }) };
  }
  const admin = createAdminClient();
  if (!admin) return { response: NextResponse.json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 }) };
  return { admin, actorId: authData.user.id };
}

function getTargetId(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

async function removePlayerFiles(bucket: 'avatars' | 'game-id-verifications', folder: string, depth = 0): Promise<void> {
  if (depth > 2) return;
  const admin = createAdminClient();
  if (!admin) throw new Error('Server is missing SUPABASE_SERVICE_ROLE_KEY.');
  const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
  if (error) throw error;
  const files = (data || []).filter((item) => item.id).map((item) => `${folder}/${item.name}`);
  const directories = (data || []).filter((item) => !item.id);
  if (files.length) {
    const { error: removeError } = await admin.storage.from(bucket).remove(files);
    if (removeError) throw removeError;
  }
  for (const directory of directories) await removePlayerFiles(bucket, `${folder}/${directory.name}`, depth + 1);
}

export async function GET(request: NextRequest) {
  const context = await getActiveAdmin();
  if ('response' in context) return context.response;
  const playerId = getTargetId(request);
  if (!playerId) return NextResponse.json({ error: 'A valid player ID is required.' }, { status: 400 });

  const [{ data: authResult, error: authError }, { data: profile, error: profileError }] = await Promise.all([
    context.admin.auth.admin.getUserById(playerId),
    context.admin.from('profiles').select('*').eq('id', playerId).maybeSingle(),
  ]);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: 'Player account not found.' }, { status: 404 });
  if (authError || !authResult.user) return NextResponse.json({ error: authError?.message || 'Auth account not found.' }, { status: 404 });

  const [ratings, registrations, memberships, departures, verifications, profileEvents, accountAudit, contact] = await Promise.all([
    context.admin.from('rating_events').select('*').eq('player_id', playerId).order('created_at', { ascending: true }).limit(1000),
    context.admin.from('registrations').select('id,tournament_id,team_name,registration_code,status,slot_number,created_at,updated_at,tournament:tournaments(title,status)')
      .eq('captain_id', playerId).order('created_at', { ascending: false }).limit(500),
    context.admin.from('registration_members').select('id,registration_id,ign,uid,role,created_at,registration:registrations(id,team_name,status,created_at,tournament:tournaments(title,status))')
      .eq('player_id', playerId).order('created_at', { ascending: false }).limit(500),
    context.admin.from('registration_team_member_departures').select('id,registration_id,tournament_id,team_name,ign,uid,former_role,departed_at')
      .eq('player_id', playerId).order('departed_at', { ascending: false }).limit(500),
    context.admin.from('player_game_id_verifications').select('id,game,game_ign,game_uid,status,reviewer_note,submitted_at,reviewed_at')
      .eq('player_id', playerId).order('submitted_at', { ascending: false }).limit(200),
    context.admin.from('player_profile_events').select('id,event_type,changed_fields,before_values,after_values,actor_id,created_at')
      .eq('player_id', playerId).order('created_at', { ascending: true }).limit(1000),
    context.admin.from('admin_audit_logs').select('id,action,target_entity,target_id,metadata,created_at')
      .eq('target_entity', 'profiles').eq('target_id', playerId).order('created_at', { ascending: true }).limit(500),
    context.admin.from('player_contact_details').select('phone_number,created_at,updated_at').eq('player_id', playerId).maybeSingle(),
  ]);

  const queryErrors = [ratings.error, registrations.error, memberships.error, departures.error, verifications.error, profileEvents.error, accountAudit.error, contact.error].filter(Boolean);
  if (queryErrors.length) return NextResponse.json({ error: queryErrors[0]?.message }, { status: 500 });
  const departureTournamentIds = [...new Set((departures.data || []).map((entry) => entry.tournament_id))];
  const departureTournaments = departureTournamentIds.length
    ? await context.admin.from('tournaments').select('id,title').in('id', departureTournamentIds)
    : { data: [], error: null };
  if (departureTournaments.error) return NextResponse.json({ error: departureTournaments.error.message }, { status: 500 });
  const departureTournamentNames = new Map((departureTournaments.data || []).map((tournament) => [tournament.id, tournament.title]));
  return NextResponse.json({
    profile,
    contact: contact.data || null,
    auth: {
      email: authResult.user.email || null,
      created_at: authResult.user.created_at,
      last_sign_in_at: authResult.user.last_sign_in_at || null,
      providers: authResult.user.app_metadata?.providers || [],
    },
    ratings: ratings.data || [],
    registrations: registrations.data || [],
    team_entries: memberships.data || [],
    team_departures: (departures.data || []).map((entry) => ({
      ...entry,
      tournament_title: departureTournamentNames.get(entry.tournament_id) || null,
    })),
    verifications: verifications.data || [],
    profile_events: profileEvents.data || [],
    audit_events: accountAudit.data || [],
  });
}

export async function DELETE(request: NextRequest) {
  const context = await getActiveAdmin();
  if ('response' in context) return context.response;
  const playerId = getTargetId(request);
  if (!playerId) return NextResponse.json({ error: 'A valid player ID is required.' }, { status: 400 });
  if (playerId === context.actorId) return NextResponse.json({ error: 'You cannot delete the signed-in administrator account.' }, { status: 400 });

  const { data: player, error: queryError } = await context.admin.from('profiles')
    .select('id,username,display_name,role,account_status,created_at').eq('id', playerId).maybeSingle();
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 });
  if (!player) return NextResponse.json({ error: 'Player account not found.' }, { status: 404 });
  if (player.role === 'admin') return NextResponse.json({ error: 'Administrator accounts cannot be deleted from the player panel.' }, { status: 403 });

  try {
    await Promise.all([
      removePlayerFiles('avatars', playerId),
      removePlayerFiles('game-id-verifications', playerId),
    ]);
  } catch (storageError) {
    return NextResponse.json({ error: `Could not remove player uploads; account was not deleted. ${storageError instanceof Error ? storageError.message : ''}` }, { status: 500 });
  }

  // Keep historical tournament rows readable while removing the deleted
  // player's direct game name and UID from teammate rosters.
  const { error: rosterError } = await context.admin.from('registration_members')
    .update({ ign: 'Deleted player', uid: '', role: 'member' }).eq('player_id', playerId);
  if (rosterError) return NextResponse.json({ error: `Could not anonymize old squad records; account was not deleted. ${rosterError.message}` }, { status: 500 });

  const { error: departureHistoryError } = await context.admin.from('registration_team_member_departures')
    .update({ player_id: null, display_name: 'Deleted player', username: null, ign: 'Deleted player', uid: '' })
    .eq('player_id', playerId);
  if (departureHistoryError) return NextResponse.json({ error: `Could not anonymize previous team records; account was not deleted. ${departureHistoryError.message}` }, { status: 500 });

  const { error: deleteError } = await context.admin.auth.admin.deleteUser(playerId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const { error: rankingError } = await context.admin.rpc('rebuild_competitive_rankings');
  if (rankingError) console.error('Player account was deleted but rankings could not be recalculated:', rankingError.message);

  const { error: auditError } = await context.admin.from('admin_audit_logs').insert({
    actor_id: context.actorId,
    action: 'PLAYER_ACCOUNT_DELETED',
    target_entity: 'profiles',
    target_id: playerId,
    metadata: { username: player.username, display_name: player.display_name, created_at: player.created_at },
  });
  if (auditError) console.error('Account was deleted but its admin audit entry could not be written:', auditError.message);
  return NextResponse.json({ success: true, audit_recorded: !auditError, rankings_refreshed: !rankingError });
}

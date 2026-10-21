import { PrizeAward } from '../supabase/types';
import { createClient } from '../supabase/client';
import { getStore, isSupabaseConfigured, persistStore } from './store';
import { logAdminAction } from './audit-service';

export async function getPlayerPrizeAwards(playerId: string): Promise<PrizeAward[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().from('prize_awards')
      .select('*, tournament:tournaments(id,title,slug), registration:registrations(id,team_name,captain_id)')
      .eq('player_id', playerId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as PrizeAward[];
  }
  const store = getStore();
  return (store.prizeAwards || []).filter((award) => award.player_id === playerId)
    .map((award) => ({
      ...award,
      tournament: award.tournament || (() => { const tournament = store.tournaments.find((row) => row.id === award.tournament_id); return tournament ? { id: tournament.id, title: tournament.title, slug: tournament.slug } : undefined; })(),
      registration: award.registration || (() => { const registration = store.registrations.find((row) => row.id === award.registration_id); return registration ? { id: registration.id, captain_id: registration.captain_id, team_name: registration.team_name } : undefined; })(),
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getAllPrizeAwards(): Promise<PrizeAward[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().from('prize_awards')
      .select('*, tournament:tournaments(id,title,slug), registration:registrations(id,team_name,captain_id,captain:profiles(id,username,display_name)), recipient:profiles!prize_awards_player_id_fkey(id,username,display_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as PrizeAward[];
  }
  const store = getStore();
  return (store.prizeAwards || []).map((award) => {
    const recipient = store.profiles.find((profile) => profile.id === award.player_id);
    const registration = store.registrations.find((row) => row.id === award.registration_id);
    const tournament = store.tournaments.find((row) => row.id === award.tournament_id);
    return {
      ...award,
      recipient: recipient ? { id: recipient.id, username: recipient.username, display_name: recipient.display_name } : undefined,
      registration: registration ? {
        id: registration.id,
        captain_id: registration.captain_id,
        team_name: registration.team_name,
        captain: recipient ? { id: recipient.id, username: recipient.username, display_name: recipient.display_name } : undefined,
      } : award.registration,
      tournament: tournament ? { id: tournament.id, title: tournament.title, slug: tournament.slug } : award.tournament,
    };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function markPrizeAwardPaid(awardId: string, reference: string, adminId: string) {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().rpc('mark_prize_award_paid', {
      p_award_id: awardId,
      p_transfer_reference: reference.trim() || null,
    });
    if (error) return { success: false, error: error.message };
    return data?.success ? { success: true } : { success: false, error: data?.error || 'Could not update this award.' };
  }
  const store = getStore();
  const award = (store.prizeAwards || []).find((row) => row.id === awardId);
  if (!award || award.status !== 'pending') return { success: false, error: 'Pending prize award not found.' };
  award.status = 'paid';
  award.paid_by = adminId;
  award.paid_at = new Date().toISOString();
  award.transfer_reference = reference.trim() || null;
  persistStore(store);
  await logAdminAction({ actorId: adminId, action: 'PRIZE_MARKED_PAID', targetEntity: 'prize_awards', targetId: awardId, metadata: { transfer_reference: reference.trim() } });
  return { success: true };
}

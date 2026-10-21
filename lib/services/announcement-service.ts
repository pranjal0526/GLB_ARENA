import { Announcement } from '../supabase/types';
import { getStore, isSupabaseConfigured, persistStore } from './store';
import { createClient } from '../supabase/client';
import { logAdminAction } from './audit-service';

export async function getAnnouncements(tournamentId?: string): Promise<Announcement[]> {
  if (isSupabaseConfigured()) {
    let query = createClient().from('announcements').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
    if (tournamentId) query = query.or(`tournament_id.eq.${tournamentId},tournament_id.is.null`);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Announcement[];
  }
  const store = getStore();
  return store.announcements.filter((announcement) => !tournamentId || announcement.tournament_id === tournamentId || !announcement.tournament_id)
    .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function createAnnouncement(data: Omit<Announcement, 'id' | 'created_at'>, adminId: string): Promise<Announcement> {
  if (isSupabaseConfigured()) {
    const { data: created, error } = await createClient().from('announcements')
      .insert({ ...data, published_by: adminId }).select('*').single();
    if (error) throw error;
    await logAdminAction({ actorId: adminId, action: 'ANNOUNCEMENT_PUBLISHED', targetEntity: 'announcements', targetId: created.id, metadata: { title: created.title, category: created.category, pinned: created.is_pinned } });
    return created as Announcement;
  }
  const store = getStore();
  const announcement: Announcement = { ...data, id: `ann-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, published_by: adminId, created_at: new Date().toISOString() };
  store.announcements.unshift(announcement); persistStore(store);
  await logAdminAction({ actorId: adminId, action: 'ANNOUNCEMENT_PUBLISHED', targetEntity: 'announcements', targetId: announcement.id, metadata: { title: announcement.title, category: announcement.category, pinned: announcement.is_pinned } });
  return announcement;
}

import { Announcement } from '../supabase/types';
import { getStore, persistStore } from './store';
import { logAdminAction } from './audit-service';

export async function getAnnouncements(tournamentId?: string): Promise<Announcement[]> {
  const store = getStore();
  let list = [...store.announcements];

  if (tournamentId) {
    list = list.filter(a => a.tournament_id === tournamentId || !a.tournament_id);
  }

  return list.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) {
      return a.is_pinned ? -1 : 1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export async function createAnnouncement(
  data: Omit<Announcement, 'id' | 'created_at'>,
  adminId: string
): Promise<Announcement> {
  const store = getStore();

  const id = `ann-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const announcement: Announcement = {
    ...data,
    id,
    published_by: adminId,
    created_at: new Date().toISOString(),
  };

  store.announcements.unshift(announcement);
  persistStore(store);

  await logAdminAction({
    actorId: adminId,
    action: 'ANNOUNCEMENT_PUBLISHED',
    targetEntity: 'announcements',
    targetId: id,
    metadata: { title: announcement.title, category: announcement.category, pinned: announcement.is_pinned },
  });

  return announcement;
}

import { 
  Tournament, 
  Profile, 
  Registration, 
  Payment, 
  Match, 
  Announcement, 
  AdminAuditLog, 
  RatingEvent 
} from '../supabase/types';
import { 
  initialTournaments, 
  initialProfiles, 
  initialRegistrations, 
  initialMatches, 
  initialAnnouncements, 
  initialAuditLogs 
} from '../supabase/mock-data';

// Global state store for local/fallback execution
interface VyroxStore {
  tournaments: Tournament[];
  profiles: Profile[];
  registrations: Registration[];
  matches: Match[];
  announcements: Announcement[];
  auditLogs: AdminAuditLog[];
  ratingEvents: RatingEvent[];
}

// In-memory singleton state
let globalStore: VyroxStore = {
  tournaments: [...initialTournaments],
  profiles: [...initialProfiles],
  registrations: [...initialRegistrations],
  matches: [...initialMatches],
  announcements: [...initialAnnouncements],
  auditLogs: [...initialAuditLogs],
  ratingEvents: [],
};

export const getStore = (): VyroxStore => {
  return globalStore;
};

export const resetStore = () => {
  globalStore = {
    tournaments: [...initialTournaments],
    profiles: [...initialProfiles],
    registrations: [...initialRegistrations],
    matches: [...initialMatches],
    announcements: [...initialAnnouncements],
    auditLogs: [...initialAuditLogs],
    ratingEvents: [],
  };
};

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes('placeholder') && !key.includes('placeholder'));
}

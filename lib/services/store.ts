import { 
  Tournament, 
  Profile, 
  Registration, 
  Payment, 
  Match, 
  Announcement, 
  AdminAuditLog,
  RatingEvent,
  PrizeAward,
} from '../supabase/types';
import { 
  initialTournaments, 
  initialProfiles, 
  initialRegistrations, 
  initialMatches, 
  initialAnnouncements, 
  initialAuditLogs 
} from '../supabase/mock-data';

export interface VyroxStore {
  tournaments: Tournament[];
  profiles: Profile[];
  registrations: Registration[];
  matches: Match[];
  announcements: Announcement[];
  auditLogs: AdminAuditLog[];
  ratingEvents: RatingEvent[];
  prizeAwards: PrizeAward[];
  privateContactDetails?: Record<string, string>;
  deletedTeams?: string[];
}

const STORAGE_KEY = 'vyrox_live_store_v2';

// In-memory fallback
let memoryStore: VyroxStore = {
  tournaments: JSON.parse(JSON.stringify(initialTournaments)),
  profiles: JSON.parse(JSON.stringify(initialProfiles)),
  registrations: JSON.parse(JSON.stringify(initialRegistrations)),
  matches: JSON.parse(JSON.stringify(initialMatches)),
  announcements: JSON.parse(JSON.stringify(initialAnnouncements)),
  auditLogs: JSON.parse(JSON.stringify(initialAuditLogs)),
  ratingEvents: [],
  prizeAwards: [],
  privateContactDetails: {},
  deletedTeams: [],
};

export const getStore = (): VyroxStore => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.privateContactDetails ||= {};
        parsed.deletedTeams ||= [];
        memoryStore = parsed;
        return memoryStore;
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryStore));
      }
    } catch {
      // localStorage may fail in private mode
    }
  }
  return memoryStore;
};

export const persistStore = (updatedStore?: VyroxStore) => {
  if (updatedStore) {
    memoryStore = updatedStore;
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryStore));
      window.dispatchEvent(new Event('vyrox_store_updated'));
    } catch {
      // ignore
    }
  }
};

export const resetStore = () => {
  memoryStore = {
    tournaments: JSON.parse(JSON.stringify(initialTournaments)),
    profiles: JSON.parse(JSON.stringify(initialProfiles)),
    registrations: JSON.parse(JSON.stringify(initialRegistrations)),
    matches: JSON.parse(JSON.stringify(initialMatches)),
    announcements: JSON.parse(JSON.stringify(initialAnnouncements)),
    auditLogs: JSON.parse(JSON.stringify(initialAuditLogs)),
    ratingEvents: [],
    prizeAwards: [],
    privateContactDetails: {},
    deletedTeams: [],
  };
  persistStore();
};

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes('placeholder') && !key.includes('placeholder'));
}

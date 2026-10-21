export type ProfileRole = 'player' | 'admin';
export type AccountStatus = 'active' | 'banned' | 'suspended';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  bgmi_ign?: string | null;
  bgmi_uid?: string | null;
  free_fire_ign?: string | null;
  free_fire_uid?: string | null;
  role: ProfileRole;
  account_status: AccountStatus;
  ban_reason?: string | null;
  banned_at?: string | null;
  current_rating: number;
  /** Best rating reached; used for permanent badge unlocks. */
  highest_rating?: number;
  total_tournaments: number;
  total_wins: number;
  total_kills: number;
  created_at: string;
  updated_at: string;
}

export type GameTitle = 'BGMI' | 'Free Fire';

export type TournamentMode = 'Solo' | '1v1' | 'Duo' | 'Squad';
export type TournamentFormat = 'Single Elimination' | 'Round Robin' | 'Battle Royale';
export type TournamentStatus = 'draft' | 'open' | 'registration_closed' | 'live' | 'completed' | 'cancelled';
export type RoomReleasePolicy = 'manual' | '15_min_before' | 'confirmed_only';

export interface PrizeDistributionItem {
  place: string;
  amount: number; // in INR
}

export interface Tournament {
  id: string;
  title: string;
  slug: string;
  description: string;
  game: string;
  mode: TournamentMode;
  team_size: number;
  tournament_format: TournamentFormat;
  entry_fee_paise: number;
  prize_pool_paise: number;
  prize_distribution?: PrizeDistributionItem[];
  max_slots: number;
  registration_opens_at: string;
  registration_closes_at: string;
  start_time: string;
  rules: string;
  banner_url?: string | null;
  status: TournamentStatus;
  cancellation_reason?: string | null;
  room_id?: string | null;
  room_password?: string | null;
  room_release_policy: RoomReleasePolicy;
  room_released: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Computed or joined
  registered_count?: number;
}

export type RegistrationStatus = 
  | 'pending_payment' 
  | 'payment_submitted' 
  | 'confirmed' 
  | 'rejected' 
  | 'cancelled' 
  | 'disqualified';

export interface Registration {
  id: string;
  tournament_id: string;
  captain_id: string;
  team_name?: string | null;
  team_id?: string | null;
  registration_code: string;
  status: RegistrationStatus;
  disqualification_reason?: string | null;
  slot_number?: number | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  captain?: Profile;
  tournament?: Tournament;
  members?: RegistrationMember[];
  payment?: Payment;
}

export interface Team {
  id: string;
  name: string;
  game: string;
  captain_id?: string | null;
  current_rating: number;
  highest_rating: number;
  tournaments_played: number;
  total_wins: number;
  total_kills: number;
  total_points: number;
  created_at: string;
  updated_at: string;
}

export interface PrizeAward {
  id: string;
  tournament_id: string;
  registration_id: string;
  player_id: string;
  team_id?: string | null;
  place: number;
  amount_paise: number;
  status: 'pending' | 'paid';
  paid_by?: string | null;
  paid_at?: string | null;
  transfer_reference?: string | null;
  created_at: string;
  tournament?: Pick<Tournament, 'id' | 'title' | 'slug'>;
  registration?: Pick<Registration, 'id' | 'team_name' | 'captain_id'> & { captain?: Pick<Profile, 'id' | 'username' | 'display_name'> };
  recipient?: Pick<Profile, 'id' | 'username' | 'display_name'>;
}

export interface RegistrationMember {
  id: string;
  registration_id: string;
  player_id?: string | null;
  ign: string;
  uid: string;
  role: 'captain' | 'member' | 'substitute';
  created_at: string;
  profile?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
}

export type PaymentStatus = 'pending' | 'submitted' | 'verified' | 'rejected';

export interface Payment {
  id: string;
  registration_id: string;
  amount_paise: number;
  payment_method: string;
  payment_status: PaymentStatus;
  transaction_reference: string;
  screenshot_url?: string | null;
  submitted_at: string;
  verified_by?: string | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  registration?: Registration;
}

export type MatchStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';

export interface Match {
  id: string;
  tournament_id: string;
  round_number: number;
  round_label: string;
  match_number: number;
  format: string;
  scheduled_time: string;
  status: MatchStatus;
  room_id?: string | null;
  room_password?: string | null;
  room_released: boolean;
  created_by?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  participants?: MatchParticipant[];
}

export interface MatchParticipant {
  id: string;
  match_id: string;
  registration_id: string;
  participant_slot?: number | null;
  placement?: number | null;
  kills: number;
  points: number;
  is_winner: boolean;
  stats?: Record<string, unknown>;
  registration?: Registration;
}

export interface RatingEvent {
  id: string;
  player_id: string;
  tournament_id?: string | null;
  match_id?: string | null;
  previous_rating: number;
  rating_change: number;
  new_rating: number;
  description: string;
  idempotency_key: string;
  created_at: string;
}

export interface Announcement {
  id: string;
  tournament_id?: string | null;
  title: string;
  content: string;
  category: 'general' | 'tournament' | 'fixture' | 'payment' | 'winner' | 'urgent';
  is_pinned: boolean;
  published_by?: string | null;
  created_at: string;
}

export interface AdminAuditLog {
  id: string;
  actor_id?: string | null;
  actor?: Profile;
  action: string;
  target_entity: string;
  target_id: string;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  created_at: string;
}

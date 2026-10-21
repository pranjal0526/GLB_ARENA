import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const signUpSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(24, 'Username cannot exceed 24 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  display_name: z.string().min(2, 'Display name must be at least 2 characters'),
  game: z.enum(['BGMI', 'Free Fire']),
  ign: z.string().min(2, 'In-game name is required'),
  uid: z.string().min(5, 'Player ID must be at least 5 digits').regex(/^\d+$/, 'Player ID must be digits only'),
});

export const profileUpdateSchema = z.object({
  display_name: z.string().min(2, 'Display name must be at least 2 characters'),
  bgmi_ign: z.string().optional().or(z.literal('')),
  bgmi_uid: z.string().optional().or(z.literal('')),
  free_fire_ign: z.string().optional().or(z.literal('')),
  free_fire_uid: z.string().optional().or(z.literal('')),
  avatar_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

export const tournamentSchema = z.object({
  title: z.string().min(4, 'Title must be at least 4 characters'),
  slug: z.string().min(3, 'Slug must be at least 3 characters').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  game: z.enum(['BGMI', 'Free Fire']).default('BGMI'),
  mode: z.enum(['Solo', '1v1', '2v2', '3v3', '4v4', 'Duo', 'Squad']),
  team_size: z.coerce.number().min(1).max(6),
  tournament_format: z.enum(['Single Elimination', 'Round Robin', 'Battle Royale']),
  entry_fee_inr: z.coerce.number().min(0, 'Entry fee cannot be negative'),
  prize_pool_inr: z.coerce.number().min(0, 'Prize pool cannot be negative'),
  max_slots: z.coerce.number().min(2, 'Must have at least 2 slots'),
  registration_opens_at: z.string(),
  registration_closes_at: z.string(),
  start_time: z.string(),
  rules: z.string().min(10, 'Rules must be specified'),
  banner_url: z.string().url().optional().or(z.literal('')),
  room_release_policy: z.enum(['manual', '15_min_before', 'confirmed_only']),
}).superRefine((tournament, context) => {
  const teamSizeByMode = { Solo: 1, '1v1': 1, '2v2': 2, '3v3': 3, '4v4': 4, Duo: 2, Squad: 4 } as const;
  if (tournament.team_size !== teamSizeByMode[tournament.mode]) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['team_size'],
      message: tournament.mode === 'Squad'
        ? 'Squad teams have a maximum of 4 players; at least 2 approved players are required before they can enter a lobby.'
        : `${tournament.mode} entries require exactly ${teamSizeByMode[tournament.mode]} player(s).`,
    });
  }
});

export const registrationSchema = z.object({
  tournamentId: z.string().min(1),
  teamName: z.string().optional(),
  ign: z.string().min(2, 'In-game name is required'),
  uid: z.string().min(5, 'UID is required').regex(/^\d+$/, 'UID must be numeric digits'),
  teammates: z.array(
    z.object({
      ign: z.string().min(2, 'Teammate IGN is required'),
      uid: z.string().min(5, 'Teammate UID is required').regex(/^\d+$/, 'Teammate UID must be numeric digits'),
    })
  ).optional(),
});

export const paymentSubmissionSchema = z.object({
  registrationId: z.string().min(1),
  transactionReference: z
    .string()
    .min(6, 'UTR / Reference must be at least 6 characters')
    .max(30, 'Reference too long')
    .regex(/^[a-zA-Z0-9]+$/, 'Transaction reference should only contain letters and numbers'),
  screenshotUrl: z.string().url().optional().or(z.literal('')),
});

export const matchResultSchema = z.object({
  matchId: z.string().min(1),
  results: z.array(
    z.object({
      registrationId: z.string().min(1),
      placement: z.coerce.number().min(1).optional(),
      kills: z.coerce.number().min(0),
      points: z.coerce.number().min(0),
      isWinner: z.boolean(),
    })
  ),
});

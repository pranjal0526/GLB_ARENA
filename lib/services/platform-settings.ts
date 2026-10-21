import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/services/store';

export async function getPaidRegistrationEnabled(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { data, error } = await createClient().rpc('get_paid_registration_enabled');
  if (error) throw error;
  return Boolean(data);
}

export async function setPaidRegistrationEnabled(enabled: boolean): Promise<boolean> {
  if (!isSupabaseConfigured()) throw new Error('Connect the Supabase database before changing payment settings.');
  const { data, error } = await createClient().rpc('set_paid_registration_enabled', { p_enabled: enabled });
  if (error) throw error;
  return Boolean(data);
}

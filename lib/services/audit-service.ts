import { AdminAuditLog } from '../supabase/types';
import { getStore, isSupabaseConfigured, persistStore } from './store';
import { createClient } from '../supabase/client';

export async function logAdminAction(params: {
  actorId?: string;
  action: string;
  targetEntity: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<AdminAuditLog> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().from('admin_audit_logs').insert({
      actor_id: params.actorId || null,
      action: params.action,
      target_entity: params.targetEntity,
      target_id: params.targetId,
      metadata: params.metadata || {},
    }).select('*').single();
    if (error) throw error;
    return data as AdminAuditLog;
  }
  const store = getStore();
  const log: AdminAuditLog = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    actor_id: params.actorId,
    actor: store.profiles.find((profile) => profile.id === params.actorId),
    action: params.action,
    target_entity: params.targetEntity,
    target_id: params.targetId,
    metadata: params.metadata || {},
    ip_address: params.ipAddress || '127.0.0.1',
    created_at: new Date().toISOString(),
  };
  store.auditLogs.unshift(log); persistStore(store);
  return log;
}

export async function getAuditLogs(): Promise<AdminAuditLog[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().from('admin_audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return (data || []) as AdminAuditLog[];
  }
  return getStore().auditLogs;
}

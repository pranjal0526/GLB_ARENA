import { AdminAuditLog } from '../supabase/types';
import { getStore } from './store';

export async function logAdminAction(params: {
  actorId?: string;
  action: string;
  targetEntity: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<AdminAuditLog> {
  const store = getStore();
  const actor = store.profiles.find(p => p.id === params.actorId);

  const log: AdminAuditLog = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    actor_id: params.actorId,
    actor,
    action: params.action,
    target_entity: params.targetEntity,
    target_id: params.targetId,
    metadata: params.metadata || {},
    ip_address: params.ipAddress || '127.0.0.1',
    created_at: new Date().toISOString(),
  };

  store.auditLogs.unshift(log);
  return log;
}

export async function getAuditLogs(): Promise<AdminAuditLog[]> {
  const store = getStore();
  return store.auditLogs;
}

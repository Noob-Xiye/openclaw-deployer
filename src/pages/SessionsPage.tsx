import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { PageHeader, SectionCard, ConfirmModal } from '../components/ui';
import { gwRpc, SessionEntry, SessionPreviewMessage, gatewayClient } from '../services/gatewayWs';

const SessionsIcon = (
  <svg width="18" height="18" fill="none" stroke="#A78BFA" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);

function formatTime(ms?: number): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(ms).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function SessionsPage() {
  const { t, config } = useAppStore();
  const st = t.sessions;

  const [gwState, setGwState] = useState(gatewayClient.state);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterAgentId, setFilterAgentId] = useState('');

  // Preview modal
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewMessages, setPreviewMessages] = useState<SessionPreviewMessage[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Confirm modals
  const [resetConfirm, setResetConfirm] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const unsub = gatewayClient.onStateChange(s => setGwState(s));
    return unsub;
  }, []);

  const loadSessions = useCallback(async () => {
    if (gwState !== 'connected') return;
    setLoading(true);
    setError('');
    try {
      const result = await gwRpc.sessionsList(filterAgentId || undefined);
      setSessions(result.sessions || []);
    } catch (e: unknown) {
      setError(String(e));
    }
    setLoading(false);
  }, [gwState, filterAgentId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handlePreview = async (key: string) => {
    setPreviewKey(key);
    setPreviewMessages([]);
    setPreviewLoading(true);
    try {
      const result = await gwRpc.sessionsPreview(key, 10);
      setPreviewMessages(result.items || []);
    } catch {
      // preview failed, show empty
    }
    setPreviewLoading(false);
  };

  const handleReset = async (key: string) => {
    setError('');
    try {
      await gwRpc.sessionsReset(key);
      setResetConfirm(null);
      loadSessions();
    } catch (e: unknown) {
      setError(String(e));
    }
  };

  const handleDelete = async (key: string) => {
    setError('');
    try {
      await gwRpc.sessionsDelete(key);
      setDeleteConfirm(null);
      loadSessions();
    } catch (e: unknown) {
      setError(String(e));
    }
  };

  // Collect agent IDs from config + existing session keys
  const configAgentIds = (config?.agents?.list || []).map((a: { id: string }) => a.id);
  const sessionAgentIds = sessions
    .map(s => { const parts = s.key.split('/'); return parts.length > 1 ? parts[0] : ''; })
    .filter(Boolean);
  const agentIds = Array.from(new Set([...configAgentIds, ...sessionAgentIds]));

  if (gwState !== 'connected') {
    return (
      <div className="page-content animate-fade-in">
        <PageHeader title={st.title} subtitle={st.subtitle} icon={SessionsIcon} />
        <SectionCard title="">
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--color-text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>🔌</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{st.gatewayRequired}</div>
            <div style={{ fontSize: 12 }}>请先在「Gateway」页面连接 Gateway</div>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="page-content animate-fade-in">
      <PageHeader title={st.title} subtitle={st.subtitle} icon={SessionsIcon} />

      {/* Filter + refresh row */}
      <SectionCard title="">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            className="select"
            value={filterAgentId}
            onChange={e => setFilterAgentId(e.target.value)}
            style={{ flex: 1, maxWidth: 220 }}
          >
            <option value="">所有智能体</option>
            {agentIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
          <button
            className="btn btn-secondary btn-sm"
            onClick={loadSessions}
            disabled={loading}
          >
            {loading ? '加载中…' : '🔄 刷新'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 8, color: '#F87171', fontSize: 12 }}>❌ {error}</div>
        )}
      </SectionCard>

      {/* Sessions list */}
      {sessions.length === 0 ? (
        <SectionCard title="">
          <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--color-text-muted)', fontSize: 13 }}>
            {loading ? st.loading : st.noSessions}
          </div>
        </SectionCard>
      ) : (
        <SectionCard title={`${st.sessionsFor} (${sessions.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sessions.map(s => (
              <div key={s.key} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <code style={{
                    display: 'block', fontSize: 12,
                    fontFamily: 'var(--font-family-mono)',
                    color: 'var(--color-text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {s.key}
                  </code>
                  <div style={{ display: 'flex', gap: 12, marginTop: 3, fontSize: 11, color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                    {s.model && <span>🤖 {s.model}</span>}
                    {s.messageCount != null && <span>💬 {s.messageCount} {st.messageCount}</span>}
                    {s.lastActiveAtMs != null && <span>🕐 {formatTime(s.lastActiveAtMs)}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    title={st.preview}
                    onClick={() => handlePreview(s.key)}
                  >
                    👁️
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    title={st.reset}
                    onClick={() => setResetConfirm(s.key)}
                  >
                    🔄
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    title={st.delete}
                    onClick={() => setDeleteConfirm(s.key)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Preview modal */}
      {previewKey && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--color-surface-1)',
            borderRadius: 14, padding: 0,
            width: 700, maxWidth: '96vw', maxHeight: '85vh',
            display: 'flex', flexDirection: 'column',
            border: '1px solid var(--color-border)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0,
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>💬 {st.preview}</div>
                <code style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{previewKey}</code>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPreviewKey(null)}>✕</button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
              {previewLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>加载中…</div>
              ) : previewMessages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>暂无消息记录</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {previewMessages.map((msg, i) => (
                    <div key={i} style={{
                      padding: '10px 14px', borderRadius: 8,
                      background: msg.role === 'user' ? 'rgba(96,165,250,0.08)' : 'rgba(167,139,250,0.08)',
                      border: `1px solid ${msg.role === 'user' ? 'rgba(96,165,250,0.2)' : 'rgba(167,139,250,0.2)'}`,
                    }}>
                      <div style={{
                        fontSize: 10, fontWeight: 600, marginBottom: 5, textTransform: 'uppercase',
                        color: msg.role === 'user' ? '#60A5FA' : '#A78BFA',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span>{msg.role}</span>
                        {msg.ts && (
                          <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', textTransform: 'none' }}>
                            {formatTime(msg.ts)}
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        color: 'var(--color-text-primary)', lineHeight: 1.65,
                      }}>
                        {String(msg.text || msg.content || '').slice(0, 600)}
                        {String(msg.text || msg.content || '').length > 600 ? '…' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!resetConfirm}
        title={st.reset}
        message={st.resetConfirm}
        onConfirm={() => resetConfirm && handleReset(resetConfirm)}
        onCancel={() => setResetConfirm(null)}
      />

      <ConfirmModal
        open={!!deleteConfirm}
        title={st.delete}
        message={st.deleteConfirm}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
        danger
      />
    </div>
  );
}

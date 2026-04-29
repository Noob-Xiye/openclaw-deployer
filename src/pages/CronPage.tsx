import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { PageHeader, SectionCard, Badge, EmptyState, ConfirmModal, Toggle, FormField, LoadingSpinner, InfoBox } from '../components/ui';
import { CronJob, CronSchedule, CronPayload, CronDelivery } from '../types';
import { gwRpc, CronRunEntry, gatewayClient } from '../services/gatewayWs';

function generateId() {
  return 'job-' + Math.random().toString(36).slice(2, 9);
}

function formatMs(ms?: number) {
  if (!ms) return '–';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatTimestamp(ms?: number) {
  if (!ms) return '–';
  return new Date(ms).toLocaleString();
}

function getScheduleLabel(schedule?: CronSchedule): string {
  if (!schedule) return '未配置';
  if (schedule.kind === 'cron') return schedule.expr || 'cron';
  if (schedule.kind === 'every') return `每 ${schedule.interval || '?'}`;
  if (schedule.kind === 'at') return `每日 ${schedule.time || '?'}`;
  return '–';
}

function StatusDot({ ok }: { ok?: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: ok === true ? '#22C55E' : ok === false ? '#EF4444' : '#94A3B8',
      flexShrink: 0,
    }} />
  );
}

export function CronPage() {
  const { cronJobs, saveCronJobs, loadCronJobs, isCronLoading, config, t, addToast } = useAppStore();
  const ct = t.cron;
  const agentList = config?.agents?.list || [];

  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Gateway run-now + logs
  const [gwState, setGwState] = useState(gatewayClient.state);
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [logsJob, setLogsJob] = useState<string | null>(null);
  const [logs, setLogs] = useState<CronRunEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    const unsub = gatewayClient.onStateChange(s => setGwState(s));
    return unsub;
  }, []);

  useEffect(() => { loadCronJobs(); }, []);
  useEffect(() => { setJobs(cronJobs.jobs || []); }, [cronJobs]);

  const handleSave = async () => {
    setSaving(true);
    await saveCronJobs({ version: cronJobs.version ?? 1, jobs });
    setSaving(false);
  };

  const handleSaveJob = (job: CronJob) => {
    setJobs(prev => {
      const idx = prev.findIndex(j => j.id === job.id || j.name === job.name);
      if (idx >= 0) return prev.map((j, i) => i === idx ? job : j);
      return [...prev, { ...job, id: job.id || generateId(), createdAtMs: Date.now() }];
    });
    setEditingJob(null);
  };

  const handleDeleteJob = (id: string) => {
    setJobs(prev => prev.filter(j => (j.id ?? j.name) !== id));
    setDeleteConfirm(null);
  };

  const toggleJob = (id: string) => {
    setJobs(prev => prev.map(j => (j.id ?? j.name) === id ? { ...j, enabled: !j.enabled } : j));
  };

  // ── Run-now handler ───────────────────────────────────────────────────────
  const handleRunNow = useCallback(async (jobName: string) => {
    setRunningJobs(prev => new Set(prev).add(jobName));
    try {
      await gwRpc.cronRun(jobName);
      addToast({ type: 'success', message: `已触发: ${jobName}` });
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunningJobs(prev => { const n = new Set(prev); n.delete(jobName); return n; });
    }
  }, [addToast]);

  // ── Load runs/logs ────────────────────────────────────────────────────────
  const handleShowLogs = useCallback(async (jobName: string) => {
    setLogsJob(jobName);
    setLogsLoading(true);
    setLogs([]);
    try {
      const result = await gwRpc.cronRuns(jobName, 30);
      setLogs(result.runs || []);
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setLogsLoading(false);
    }
  }, [addToast]);

  const changed = JSON.stringify(jobs) !== JSON.stringify(cronJobs.jobs || []);

  const getAgentName = (agentId?: string) => {
    if (!agentId) return null;
    const agent = agentList.find(a => a.id === agentId);
    return agent?.name || agentId;
  };

  return (
    <div className="page-content animate-fade-in">
      <PageHeader
        title={ct.title}
        subtitle={ct.subtitle}
        icon={
          <svg width="18" height="18" fill="none" stroke="#22D3EE" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setEditingJob({
                name: '',
                enabled: true,
                schedule: { kind: 'cron', expr: '', tz: 'Asia/Shanghai' },
                sessionTarget: 'isolated',
                wakeMode: 'now',
                payload: { kind: 'agentTurn', lightContext: false },
                delivery: { mode: 'announce', channel: 'last', bestEffort: true },
              })}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {ct.addJob}
            </button>
            {changed && (
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? '...' : ct.saveJobs}
              </button>
            )}
          </div>
        }
      />

      <SectionCard title={ct.jobsFile} subtitle={ct.jobsFileHint}>
        {isCronLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '30px 0' }}>
            <div className="loader" />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={
              <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            title={ct.noJobs}
            description={ct.noJobsDesc}
            action={
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setEditingJob({
                  name: '',
                  enabled: true,
                  schedule: { kind: 'cron', expr: '', tz: 'Asia/Shanghai' },
                  sessionTarget: 'isolated',
                  wakeMode: 'now',
                  payload: { kind: 'agentTurn', lightContext: false },
                  delivery: { mode: 'announce', channel: 'last', bestEffort: true },
                })}
              >
                {ct.addJob}
              </button>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {jobs.map(job => {
              const jobKey = job.id ?? job.name;
              const hasErrors = (job.state?.consecutiveErrors ?? 0) > 0;
              return (
                <div key={jobKey} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '14px 16px',
                  background: 'var(--color-surface-2)',
                  border: `1px solid ${job.enabled ? 'var(--color-border)' : 'rgba(255,255,255,0.03)'}`,
                  borderRadius: 10, opacity: job.enabled ? 1 : 0.55,
                  transition: 'all 0.15s',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                    background: job.enabled
                      ? 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(99,102,241,0.1))'
                      : 'var(--color-surface-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
                  }}>
                    <svg width="16" height="16" fill="none" stroke={job.enabled ? '#22D3EE' : '#64748B'} strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {job.name}
                      </span>
                      <Badge variant={job.enabled ? 'success' : 'gray'}>{job.enabled ? 'active' : 'paused'}</Badge>
                      {job.agentId && (
                        <Badge variant="purple">{getAgentName(job.agentId)}</Badge>
                      )}
                      {job.sessionTarget && (
                        <Badge variant="info">{job.sessionTarget}</Badge>
                      )}
                      {hasErrors && (
                        <Badge variant="warning">errors: {job.state?.consecutiveErrors}</Badge>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                      <code style={{ fontFamily: 'var(--font-family-mono)', fontSize: 11, color: '#22D3EE', background: 'rgba(34,211,238,0.08)', padding: '1px 6px', borderRadius: 4 }}>
                        {getScheduleLabel(job.schedule)}
                      </code>
                      {job.description && (
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                          {job.description}
                        </span>
                      )}
                    </div>
                    {job.state?.lastRunAtMs && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                        <StatusDot ok={job.state.lastRunStatus === 'ok'} />
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                          {formatTimestamp(job.state.lastRunAtMs)} · {formatMs(job.state.lastDurationMs)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {/* Run Now */}
                    <button
                      className="btn btn-secondary btn-sm"
                      title={ct.runNow}
                      disabled={gwState !== 'connected' || runningJobs.has(job.name)}
                      onClick={() => handleRunNow(job.name)}
                      style={{ gap: 4 }}
                    >
                      {runningJobs.has(job.name) ? (
                        <LoadingSpinner size={11} />
                      ) : (
                        <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </button>
                    {/* Logs */}
                    <button
                      className="btn btn-ghost btn-sm"
                      title="查看执行日志"
                      disabled={gwState !== 'connected'}
                      onClick={() => handleShowLogs(job.name)}
                    >
                      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h8m-8 4h4" />
                      </svg>
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleJob(jobKey)} title={job.enabled ? 'Pause' : 'Enable'}>
                      {job.enabled ? (
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingJob({ ...job })}>
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(jobKey)}>
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {editingJob && (
        <CronJobEditModal
          job={editingJob}
          agents={agentList}
          onSave={handleSaveJob}
          onCancel={() => setEditingJob(null)}
          t={ct}
        />
      )}

      <ConfirmModal
        open={!!deleteConfirm}
        title="删除任务"
        message={`确认删除定时任务 "${deleteConfirm}"？`}
        onConfirm={() => deleteConfirm && handleDeleteJob(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
        danger
      />

      {/* Logs Modal */}
      {logsJob && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)', padding: 20,
        }}>
          <div className="card animate-fade-in" style={{
            width: 640, maxWidth: '95vw', maxHeight: '80vh',
            display: 'flex', flexDirection: 'column', padding: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" fill="none" stroke="#22D3EE" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h8m-8 4h4" />
                </svg>
                执行日志 — <code style={{ fontSize: 13, color: '#22D3EE', fontFamily: 'var(--font-family-mono)' }}>{logsJob}</code>
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setLogsJob(null)} style={{ padding: '4px 8px' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {logsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '30px 0' }}>
                  <LoadingSpinner size={24} />
                </div>
              ) : logs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '30px 0', fontSize: 13 }}>
                  暂无执行记录
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['状态', '开始时间', '耗时', '错误信息'].map(h => (
                        <th key={h} style={{
                          textAlign: 'left', padding: '6px 10px',
                          borderBottom: '1px solid var(--color-border)',
                          color: 'var(--color-text-muted)', fontWeight: 600,
                          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((run, i) => (
                      <tr key={run.runId || i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <Badge variant={
                            run.status === 'ok' ? 'success' :
                            run.status === 'error' ? 'error' :
                            run.status === 'running' ? 'info' : 'gray'
                          }>
                            {run.status || 'unknown'}
                          </Badge>
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)', fontSize: 11 }}>
                          {run.startedAtMs ? formatTimestamp(run.startedAtMs) : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--color-text-secondary)' }}>
                          {formatMs(run.durationMs)}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#F87171', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {run.errorMessage || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface EditModalProps {
  job: CronJob;
  agents: Array<{ id: string; name?: string }>;
  onSave: (j: CronJob) => void;
  onCancel: () => void;
  t: any;
}

function CronJobEditModal({ job, agents, onSave, onCancel, t: ct }: EditModalProps) {
  const [local, setLocal] = useState<CronJob>({ ...job });
  const [scheduleKind, setScheduleKind] = useState<'cron' | 'every' | 'at'>(
    job.schedule?.kind ?? 'cron'
  );

  const upd = (patch: Partial<CronJob>) => setLocal(p => ({ ...p, ...patch }));
  const updSchedule = (patch: Partial<CronSchedule>) =>
    setLocal(p => ({ ...p, schedule: { kind: scheduleKind, ...p.schedule, ...patch } }));
  const updPayload = (patch: Partial<CronPayload>) =>
    setLocal(p => ({ ...p, payload: { kind: 'agentTurn', ...p.payload, ...patch } }));
  const updDelivery = (patch: Partial<CronDelivery>) =>
    setLocal(p => ({ ...p, delivery: { mode: 'announce', ...p.delivery, ...patch } }));

  const switchKind = (kind: 'cron' | 'every' | 'at') => {
    setScheduleKind(kind);
    setLocal(p => ({ ...p, schedule: { kind, tz: p.schedule?.tz ?? 'Asia/Shanghai', staggerMs: p.schedule?.staggerMs } }));
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)', padding: 20,
    }}>
      <div className="card animate-fade-in" style={{
        width: 560, maxWidth: '95vw', maxHeight: '88vh',
        overflowY: 'auto', padding: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            {!job.id ? ct.newJob : ct.editJob}
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ padding: '4px 8px' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── Basic ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label={ct.jobName} required style={{ gridColumn: '1/3' }}>
              <input
                className="input"
                value={local.name}
                onChange={e => upd({ name: e.target.value })}
                placeholder="小探科技热点巡检"
              />
            </FormField>

            <FormField label={ct.agentId} hint={ct.agentIdHint} required>
              <select
                className="select"
                value={local.agentId || ''}
                onChange={e => upd({ agentId: e.target.value || undefined })}
              >
                <option value="">{ct.selectAgent}</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name ? `${a.name} (${a.id})` : a.id}</option>
                ))}
              </select>
            </FormField>

            <FormField label={ct.sessionTarget}>
              <select
                className="select"
                value={local.sessionTarget || 'isolated'}
                onChange={e => upd({ sessionTarget: e.target.value as any })}
              >
                <option value="main">{ct.sessionTargetOptions.main}</option>
                <option value="isolated">{ct.sessionTargetOptions.isolated}</option>
              </select>
            </FormField>

            <FormField label={ct.description} hint={ct.descriptionHint} style={{ gridColumn: '1/3' }}>
              <input
                className="input"
                value={local.description || ''}
                onChange={e => upd({ description: e.target.value || undefined })}
                placeholder="每小时由主 agent 调度小探进行科技热点巡检"
              />
            </FormField>
          </div>

          <ModalDivider />

          {/* ── Schedule ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionLabel>{ct.schedule}</SectionLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['cron', 'every', 'at'] as const).map(k => (
                <button
                  key={k}
                  onClick={() => switchKind(k)}
                  style={{
                    padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    border: scheduleKind === k ? '1.5px solid rgba(34,211,238,0.5)' : '1px solid var(--color-border)',
                    background: scheduleKind === k ? 'rgba(34,211,238,0.1)' : 'var(--color-surface-2)',
                    color: scheduleKind === k ? '#22D3EE' : 'var(--color-text-secondary)',
                    fontWeight: scheduleKind === k ? 600 : 400,
                  }}
                >
                  {(ct.scheduleKindOptions as any)[k]}
                </button>
              ))}
            </div>
            <p style={{ margin: '-4px 0 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
              {scheduleKind === 'cron' ? '📅 标准 Cron 表达式（Quartz 格式，精确到秒）' : scheduleKind === 'every' ? '🔄 固定间隔循环执行（如每 30m、每 1h）' : '⏰ 每天固定时间执行（格式：HH:MM）'}
            </p>
            {scheduleKind === 'cron' && (
              <>
                <FormField label={ct.cronExpr} hint="格式：秒 分 时 日 月 周（Quartz Cron）。示例：0 0 9 * * ? = 每天9点" tooltip="Cron 6字段：秒(0-59) 分(0-59) 时(0-23) 日(1-31) 月(1-12) 周(MON-SUN)。? = 不指定，*/N = 每隔N，, = 枚举多值" required>
                  <input className="input input-mono" value={local.schedule?.expr || ''} onChange={e => updSchedule({ expr: e.target.value })} placeholder="0 0 9 * * ?" />
                </FormField>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', alignSelf: 'center', marginRight: 2 }}>快捷：</span>
                  {[
                    { label: '每天9:00', expr: '0 0 9 * * ?' },
                    { label: '每小时', expr: '0 0 * * * ?' },
                    { label: '每2小时', expr: '0 0 */2 * * ?' },
                    { label: '9/12/18点', expr: '0 0 9,12,18 * * ?' },
                    { label: '工作日9:30', expr: '0 30 9 ? * MON-FRI' },
                    { label: '每15分钟', expr: '0 */15 * * * ?' },
                  ].map(({ label, expr }) => (
                    <button
                      key={expr}
                      type="button"
                      onClick={() => updSchedule({ expr })}
                      style={{
                        padding: '3px 9px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                        border: `1px solid ${local.schedule?.expr === expr ? 'rgba(34,211,238,0.5)' : 'rgba(34,211,238,0.18)'}`,
                        background: local.schedule?.expr === expr ? 'rgba(34,211,238,0.12)' : 'var(--color-surface-2)',
                        color: local.schedule?.expr === expr ? '#22D3EE' : 'var(--color-text-muted)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {scheduleKind === 'every' && (
              <FormField label={ct.interval} hint={ct.intervalHint} tooltip="支持格式：30m（30分钟）、1h（1小时）、2h30m。最小推荐值：5m" required>
                <input className="input" value={local.schedule?.interval || ''} onChange={e => updSchedule({ interval: e.target.value })} placeholder="1h" />
              </FormField>
            )}
            {scheduleKind === 'at' && (
              <FormField label={ct.atTime} hint={ct.atTimeHint} required>
                <input className="input" value={local.schedule?.time || ''} onChange={e => updSchedule({ time: e.target.value })} placeholder="09:00" />
              </FormField>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label={ct.timezone} hint={ct.timezoneHint}>
                <input className="input" value={local.schedule?.tz || ''} onChange={e => updSchedule({ tz: e.target.value || undefined })} placeholder="Asia/Shanghai" />
              </FormField>
              <FormField label={ct.staggerMs} hint={ct.staggerMsHint} tooltip="随机延迟最大值（毫秒）。例如设为 60000 时，任务会在计划时间后随机延迟 0~60 秒内执行，用于分散多个并发任务的压力。0 = 不延迟">
                <input className="input" type="number" min={0} value={local.schedule?.staggerMs ?? 0} onChange={e => updSchedule({ staggerMs: Number(e.target.value) || 0 })} placeholder="0" />
              </FormField>
            </div>
          </div>

          <ModalDivider />

          {/* ── Wake mode ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionLabel>{ct.wakeMode}</SectionLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['now', 'opportunistic'] as const).map(w => (
                <button key={w} onClick={() => upd({ wakeMode: w })} style={{
                  padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  border: (local.wakeMode || 'now') === w ? '1.5px solid rgba(99,102,241,0.5)' : '1px solid var(--color-border)',
                  background: (local.wakeMode || 'now') === w ? 'rgba(99,102,241,0.1)' : 'var(--color-surface-2)',
                  color: (local.wakeMode || 'now') === w ? '#A78BFA' : 'var(--color-text-secondary)',
                  fontWeight: (local.wakeMode || 'now') === w ? 600 : 400,
                }}>
                  {(ct.wakeModeOptions as any)[w]}
                </button>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
              {(local.wakeMode || 'now') === 'now'
                ? '⚡ 立即唤醒：到达计划时间时强制唤醒智能体执行（即使正在处理其他任务）'
                : '🌙 机会执行：仅在智能体空闲时执行，避免打断正在进行的对话'}
            </p>
          </div>

          <ModalDivider />

          {/* ── Payload ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionLabel>{ct.payload}</SectionLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['agentTurn', 'systemEvent'] as const).map(k => (
                <button key={k} onClick={() => updPayload({ kind: k })} style={{
                  padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  border: (local.payload?.kind || 'agentTurn') === k ? '1.5px solid rgba(244,114,182,0.5)' : '1px solid var(--color-border)',
                  background: (local.payload?.kind || 'agentTurn') === k ? 'rgba(244,114,182,0.1)' : 'var(--color-surface-2)',
                  color: (local.payload?.kind || 'agentTurn') === k ? '#F472B6' : 'var(--color-text-secondary)',
                  fontWeight: (local.payload?.kind || 'agentTurn') === k ? 600 : 400,
                }}>
                  {(ct.payloadKindOptions as any)[k]}
                </button>
              ))}
            </div>
            {(local.payload?.kind || 'agentTurn') === 'agentTurn' && (
              <FormField label={ct.message} hint="将发送给智能体的消息内容。留空则智能体会进行默认的定时检查行为">
                <textarea className="input" rows={4} value={local.payload?.message || ''} onChange={e => updPayload({ message: e.target.value || undefined })} placeholder={ct.messagePlaceholder} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
              </FormField>
            )}
            <Toggle checked={local.payload?.lightContext || false} onChange={v => updPayload({ lightContext: v })} label={ct.lightContext} />
            {local.payload?.lightContext && (
              <p style={{ margin: '-6px 0 0 20px', fontSize: 11, color: 'var(--color-text-muted)' }}>
                💡 轻上下文：仅发送少量必要上下文给模型，节省 Token 消耗（推荐用于高频定时任务）
              </p>
            )}
          </div>

          <ModalDivider />

          {/* ── Delivery ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionLabel>{ct.delivery}</SectionLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['announce', 'silent'] as const).map(m => (
                <button key={m} onClick={() => updDelivery({ mode: m })} style={{
                  padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  border: (local.delivery?.mode || 'announce') === m ? '1.5px solid rgba(245,158,11,0.5)' : '1px solid var(--color-border)',
                  background: (local.delivery?.mode || 'announce') === m ? 'rgba(245,158,11,0.1)' : 'var(--color-surface-2)',
                  color: (local.delivery?.mode || 'announce') === m ? '#FCD34D' : 'var(--color-text-secondary)',
                  fontWeight: (local.delivery?.mode || 'announce') === m ? 600 : 400,
                }}>
                  {(ct.deliveryModeOptions as any)[m]}
                </button>
              ))}
            </div>
            {(local.delivery?.mode || 'announce') === 'announce' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
                <FormField label={ct.deliveryChannel} hint={ct.deliveryChannelHint}>
                  <input className="input" value={local.delivery?.channel || ''} onChange={e => updDelivery({ channel: e.target.value || undefined })} placeholder="last" />
                </FormField>
                <div style={{ paddingBottom: 2 }}>
                  <Toggle checked={local.delivery?.bestEffort ?? true} onChange={v => updDelivery({ bestEffort: v })} label={ct.bestEffort} />
                </div>
              </div>
            )}
          </div>

          <ModalDivider />

          <Toggle checked={local.enabled !== false} onChange={v => upd({ enabled: v })} label={ct.enabled} />

          {/* ── State (read-only) ── */}
          {job.state?.lastRunAtMs && (
            <>
              <ModalDivider />
              <SectionLabel>{ct.state}</SectionLabel>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                padding: '10px 14px', borderRadius: 8,
                background: 'var(--color-surface-3)', border: '1px solid var(--color-border)',
              }}>
                <ReadOnlyField label={ct.lastRunAt} value={formatTimestamp(job.state.lastRunAtMs)} />
                <ReadOnlyField label={ct.lastStatus} value={job.state.lastRunStatus || '–'} />
                <ReadOnlyField label={ct.duration} value={formatMs(job.state.lastDurationMs)} />
                <ReadOnlyField label={ct.consecutiveErrors} value={String(job.state.consecutiveErrors ?? 0)} />
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <button className="btn btn-secondary" onClick={onCancel}>取消</button>
          <button
            className="btn btn-primary"
            onClick={() => onSave({ ...local, schedule: { kind: scheduleKind, ...local.schedule } })}
            disabled={!local.name?.trim()}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalDivider() {
  return <div style={{ height: 1, background: 'var(--color-border)', margin: '2px 0' }} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {children}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }}>{value}</div>
    </div>
  );
}

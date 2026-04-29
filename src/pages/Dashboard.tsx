import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../store';
import { PageHeader, SectionCard, Badge, EmptyState, LoadingSpinner, InfoBox } from '../components/ui';
import { gwRpc, HealthResult, StatusResult, gatewayClient } from '../services/gatewayWs';

function StatCard({
  label, value, sub, icon, gradient, color,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; gradient: string; color: string;
}) {
  return (
    <div className="stat-card shine" style={{ cursor: 'default' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            {label}
          </p>
          <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1, letterSpacing: '-0.02em' }}>
            {value}
          </p>
          {sub && (
            <p style={{ fontSize: 11, color: color, margin: '5px 0 0 0', fontWeight: 500 }}>
              {sub}
            </p>
          )}
        </div>
        <div style={{
          width: 42, height: 42, borderRadius: 11, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: gradient,
        }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function QuickLink({ label, desc, onClick, icon }: {
  label: string; desc: string; onClick: () => void; icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px', background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)', borderRadius: 10,
        cursor: 'pointer', transition: 'all 0.15s', width: '100%',
        textAlign: 'left', fontFamily: 'inherit',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(124,58,237,0.3)';
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-3)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)';
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-2)';
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(37,99,235,0.1))',
      }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>{desc}</p>
      </div>
    </button>
  );
}

export function Dashboard() {
  const { config, isLoading, loadError, loadConfig, t, setActiveSection, configPath, cronJobs, skills, loadCronJobs, loadSkills } = useAppStore();

  // ── Real-time health state ────────────────────────────────────────────────
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [gwState, setGwState] = useState(gatewayClient.state);
  const [lastProbeAt, setLastProbeAt] = useState<number | null>(null);

  useEffect(() => {
    const unsub = gatewayClient.onStateChange(s => setGwState(s));
    return unsub;
  }, []);

  const probe = useCallback(async () => {
    setHealthLoading(true);
    try {
      const [h, s] = await Promise.allSettled([gwRpc.health(), gwRpc.status()]);
      if (h.status === 'fulfilled') setHealth(h.value);
      if (s.status === 'fulfilled') setStatus(s.value);
      setLastProbeAt(Date.now());
    } catch { /* ignore */ } finally {
      setHealthLoading(false);
    }
  }, []);

  // Auto-probe every 30s when connected
  useEffect(() => {
    if (gwState === 'connected') {
      probe();
      const id = setInterval(probe, 30_000);
      return () => clearInterval(id);
    }
  }, [gwState, probe]);

  useEffect(() => {
    if (!config && !isLoading) loadConfig();
    loadCronJobs();
    loadSkills();
  }, []);

  const enabledChannels = config?.channels
    ? Object.values(config.channels).filter(ch => (ch as any)?.enabled).length
    : 0;
  const totalChannels = config?.channels ? Object.keys(config.channels).filter(k => k !== 'defaults').length : 0;
  const agentCount = config?.agents?.list?.length || 0;
  const primaryModel = config?.agents?.defaults?.model?.primary;
  const gatewayPort = config?.gateway?.port || 18789;
  const heartbeatEnabled = !!config?.agents?.defaults?.heartbeat;
  const cronCount = cronJobs.jobs.filter(j => j.enabled !== false).length;
  const skillCount = skills.length;

  return (
    <div className="page-content animate-fade-in">
      <PageHeader
        title={t.dashboard.title}
        subtitle={t.dashboard.subtitle}
        icon={
          <svg width="18" height="18" fill="none" stroke="#A78BFA" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z" />
          </svg>
        }
      />

      {/* Load error */}
      {loadError && (
        <div style={{
          padding: '14px 18px', borderRadius: 10,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.25)',
          color: '#FCA5A5', fontSize: 13,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <strong>Failed to load config:</strong> {loadError}
          </div>
          <p style={{ margin: '8px 0 0 24px', fontSize: 11, opacity: 0.8 }}>
            Config path: {configPath || 'auto-detecting...'}
          </p>
        </div>
      )}

      {/* No config loaded */}
      {!config && !isLoading && !loadError && (
        <div className="connection-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'linear-gradient(135deg, #7C3AED, #2563EB)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, flexShrink: 0,
            }}>
              🦞
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 700 }}>
                {t.dashboard.noConfigLoaded}
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {configPath || 'Detecting ~/.openclaw/openclaw.json...'}
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => loadConfig()}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {t.dashboard.loadConfig}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
          <LoadingSpinner size={32} />
        </div>
      )}

      {config && (
        <>
          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <StatCard
              label={t.dashboard.port}
              value={gatewayPort}
              sub="Gateway Port"
              gradient="linear-gradient(135deg, rgba(124,58,237,0.25), rgba(37,99,235,0.15))"
              color="#A78BFA"
              icon={<svg width="18" height="18" fill="none" stroke="#A78BFA" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" /></svg>}
            />
            <StatCard
              label={t.dashboard.channels}
              value={enabledChannels}
              sub={`/ ${totalChannels} total`}
              gradient="linear-gradient(135deg, rgba(6,182,212,0.2), rgba(16,185,129,0.12))"
              color="#22D3EE"
              icon={<svg width="18" height="18" fill="none" stroke="#22D3EE" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>}
            />
            <StatCard
              label={t.dashboard.agents}
              value={agentCount || 1}
              sub={agentCount === 0 ? 'Default agent' : `${agentCount} configured`}
              gradient="linear-gradient(135deg, rgba(245,158,11,0.2), rgba(239,68,68,0.1))"
              color="#FCD34D"
              icon={<svg width="18" height="18" fill="none" stroke="#FCD34D" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
            />
            <StatCard
              label={t.dashboard.skills}
              value={skillCount}
              sub={`~/.openclaw/skills`}
              gradient="linear-gradient(135deg, rgba(16,185,129,0.2), rgba(6,182,212,0.1))"
              color="#34D399"
              icon={<svg width="18" height="18" fill="none" stroke="#34D399" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>}
            />
            <StatCard
              label={t.dashboard.cronJobs}
              value={cronCount}
              sub="Active jobs"
              gradient="linear-gradient(135deg, rgba(59,130,246,0.2), rgba(124,58,237,0.12))"
              color="#93C5FD"
              icon={<svg width="18" height="18" fill="none" stroke="#93C5FD" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
          </div>

          {/* Gateway connection guide — shown when disconnected */}
          {gwState === 'disconnected' && (
            <InfoBox type="tip" title="如何启动 Gateway 并完成连接？" collapsible defaultCollapsed={false}>
              <ol style={{ margin: '4px 0 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <li>安装 CLI：<code style={{ fontFamily: 'monospace', background: 'rgba(99,102,241,0.15)', padding: '1px 5px', borderRadius: 3 }}>npm install -g openclaw</code></li>
                <li>启动 Gateway：<code style={{ fontFamily: 'monospace', background: 'rgba(99,102,241,0.15)', padding: '1px 5px', borderRadius: 3 }}>openclaw gateway run</code>（或打开 OpenClaw 桌面应用，会自动启动）</li>
                <li>在左侧连接栏填写地址 <code style={{ fontFamily: 'monospace', background: 'rgba(99,102,241,0.15)', padding: '1px 5px', borderRadius: 3 }}>ws://127.0.0.1:{gatewayPort}</code> 并点击连接</li>
                <li>如需认证，在"网关设置"中配置 Token，并在连接栏填入相同 Token</li>
              </ol>
            </InfoBox>
          )}

          {/* Real-time Health Card (shown when Gateway is available) */}
          {gwState !== 'disconnected' && (
            <SectionCard
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {t.health.title}
                  <div className={`status-dot ${gwState === 'connected' ? (health?.ok === false ? 'status-dot-error' : 'status-dot-success') : 'status-dot-warning'}`} style={{ width: 7, height: 7 }} />
                </div>
              }
              actions={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {lastProbeAt && (
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                      {t.health.lastCheck}: {new Date(lastProbeAt).toLocaleTimeString()}
                    </span>
                  )}
                  <button
                    className="btn btn-secondary"
                    onClick={probe}
                    disabled={healthLoading || gwState !== 'connected'}
                    style={{ padding: '4px 10px', fontSize: 11, gap: 5 }}
                  >
                    {healthLoading ? <LoadingSpinner size={10} /> : (
                      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    {t.health.probeNow}
                  </button>
                </div>
              }
            >
              {gwState !== 'connected' ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '8px 0' }}>
                  {gwState === 'connecting' ? t.connection.status.connecting : t.connection.status.disconnected}
                </div>
              ) : healthLoading && !health ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                  <LoadingSpinner size={14} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.health.checking}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Version + Uptime from status */}
                  {status && (
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {status.version && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t.health.version}</span>
                          <code style={{ fontSize: 11, background: 'var(--color-surface-2)', padding: '2px 6px', borderRadius: 4 }}>
                            v{status.version}
                          </code>
                        </div>
                      )}
                      {status.uptimeMs !== undefined && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t.health.uptime}</span>
                          <span style={{ fontSize: 11, color: 'var(--color-text-primary)', fontWeight: 600 }}>
                            {status.uptimeMs < 60000 ? `${Math.round(status.uptimeMs / 1000)}s`
                              : status.uptimeMs < 3600000 ? `${Math.round(status.uptimeMs / 60000)}m`
                              : `${(status.uptimeMs / 3600000).toFixed(1)}h`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Channel health */}
                  {(health?.channels && health.channels.length > 0) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {t.health.channels}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {health.channels.map(ch => (
                          <div key={ch.id} style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '4px 8px', borderRadius: 6,
                            background: ch.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                            border: `1px solid ${ch.ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                          }}>
                            <div className={`status-dot ${ch.ok ? 'status-dot-success' : 'status-dot-error'}`} style={{ width: 6, height: 6 }} />
                            <span style={{ fontSize: 11, color: ch.ok ? '#34D399' : '#F87171', fontWeight: 600 }}>
                              {ch.id}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : health && (
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.health.noChannels}</div>
                  )}
                </div>
              )}
            </SectionCard>
          )}

          {/* 2-column layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Config Summary */}
            <SectionCard title={t.dashboard.configSummary}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Primary Model', value: primaryModel || '—', mono: true },
                  { label: 'Gateway Port', value: String(gatewayPort), mono: true },
                  { label: 'Reload Mode', value: config.gateway?.reload?.mode || 'hybrid' },
                  { label: 'Tool Profile', value: config.tools?.profile || 'full' },
                  { label: 'Heartbeat', value: heartbeatEnabled ? (config.agents?.defaults?.heartbeat?.every || 'on') : 'off' },
                  { label: 'Session Scope', value: config.session?.dmScope || 'main' },
                ].map(row => (
                  <div key={row.label} style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 8,
                    padding: '7px 0',
                    borderBottom: '1px solid var(--color-border)',
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{row.label}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      fontFamily: row.mono ? 'var(--font-family-mono)' : 'inherit',
                      background: 'var(--color-surface-2)',
                      padding: '2px 8px', borderRadius: 5,
                    }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Quick navigation */}
            <SectionCard title={t.dashboard.quickActions}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <QuickLink
                  label={t.nav.gateway} desc="Port, auth, reload mode"
                  onClick={() => setActiveSection('gateway')}
                  icon={<svg width="15" height="15" fill="none" stroke="#A78BFA" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2" /></svg>}
                />
                <QuickLink
                  label={t.nav.agents} desc="Models, heartbeat, sandbox"
                  onClick={() => setActiveSection('agents')}
                  icon={<svg width="15" height="15" fill="none" stroke="#22D3EE" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
                />
                <QuickLink
                  label={t.nav.channels} desc="Feishu, Telegram, Discord..."
                  onClick={() => setActiveSection('channels')}
                  icon={<svg width="15" height="15" fill="none" stroke="#FCD34D" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>}
                />
                <QuickLink
                  label={t.nav.rawConfig} desc="Direct JSON editor"
                  onClick={() => setActiveSection('rawConfig')}
                  icon={<svg width="15" height="15" fill="none" stroke="#34D399" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>}
                />
              </div>
            </SectionCard>
          </div>

          {/* Config file path */}
          <SectionCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <svg width="16" height="16" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{t.dashboard.configPath}:</span>
              <code style={{
                fontFamily: 'var(--font-family-mono)', fontSize: 11,
                color: 'var(--color-text-primary)',
                background: 'var(--color-surface-2)',
                padding: '3px 8px', borderRadius: 5,
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {configPath || 'auto-detected'}
              </code>
              <Badge variant="success">Loaded</Badge>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

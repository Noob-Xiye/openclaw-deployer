import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { PageHeader, SectionCard, Badge, EmptyState, LoadingSpinner } from '../components/ui';
import { gwRpc, UsageCostResult, gatewayClient } from '../services/gatewayWs';

type DayOption = 7 | 30 | 90;

/** Format a USD number for display */
function fmtUsd(n?: number) {
  if (n === undefined || n === null) return '—';
  if (n === 0) return '$0.00';
  if (n < 0.001) return `$${(n * 1000).toFixed(3)}m`;
  return `$${n.toFixed(4)}`;
}

/** Format token count */
function fmtTokens(n?: number) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface BarRowProps {
  label: string;
  costUsd: number;
  tokens: number;
  maxCost: number;
  color: string;
}

function BarRow({ label, costUsd, tokens, maxCost, color }: BarRowProps) {
  const pct = maxCost > 0 ? Math.max(2, (costUsd / maxCost) * 100) : 2;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <div style={{ width: 120, flexShrink: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={label}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1 }}>
          {fmtTokens(tokens)} tokens
        </div>
      </div>
      <div style={{ flex: 1, height: 8, background: 'var(--color-surface-3)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: color, borderRadius: 4,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{ width: 72, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', flexShrink: 0 }}>
        {fmtUsd(costUsd)}
      </div>
    </div>
  );
}

export function UsagePage() {
  const { t, config } = useAppStore();
  const ut = t.usage;

  const [days, setDays] = useState<DayOption>(30);
  const [data, setData] = useState<UsageCostResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gwState, setGwState] = useState(gatewayClient.state);

  // Track gateway connection state
  useEffect(() => {
    const unsub = gatewayClient.onStateChange(s => setGwState(s));
    return unsub;
  }, []);

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await gwRpc.usageCost({ days });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [days]);

  // Auto-load when gateway is connected
  useEffect(() => {
    if (gwState === 'connected' && config) {
      loadUsage();
    }
  }, [gwState, days, config, loadUsage]);

  // Gateway not configured
  if (!config) {
    return (
      <div className="page-content animate-fade-in">
        <PageHeader title={ut.title} subtitle={ut.subtitle} icon={
          <svg width="18" height="18" fill="none" stroke="#A78BFA" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        } />
        <EmptyState
          icon="📊"
          title={ut.gatewayRequired}
          description={ut.gatewayRequiredDesc}
        />
      </div>
    );
  }

  // Compute max cost for bar scaling
  const agentEntries = Object.entries(data?.byAgent || {});
  const modelEntries = Object.entries(data?.byModel || {});
  const maxAgentCost = Math.max(...agentEntries.map(([, v]) => v.costUsd || 0), 0.0001);
  const maxModelCost = Math.max(...modelEntries.map(([, v]) => v.costUsd || 0), 0.0001);

  const agentColors = ['#A78BFA', '#60A5FA', '#34D399', '#FCD34D', '#F87171', '#22D3EE'];
  const modelColors = ['#F472B6', '#FB923C', '#A3E635', '#818CF8', '#34D399', '#FCA5A5'];

  return (
    <div className="page-content animate-fade-in">
      <PageHeader
        title={ut.title}
        subtitle={ut.subtitle}
        icon={
          <svg width="18" height="18" fill="none" stroke="#A78BFA" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Period selector */}
            <div style={{ display: 'flex', gap: 4 }}>
              {([7, 30, 90] as DayOption[]).map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  style={{
                    padding: '5px 10px', fontSize: 12, borderRadius: 6,
                    border: `1px solid ${days === d ? '#7C3AED' : 'var(--color-border)'}`,
                    background: days === d ? 'rgba(124,58,237,0.15)' : 'var(--color-surface-2)',
                    color: days === d ? '#A78BFA' : 'var(--color-text-secondary)',
                    fontWeight: days === d ? 700 : 500, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {d === 7 ? ut.days7 : d === 30 ? ut.days30 : ut.days90}
                </button>
              ))}
            </div>
            <button
              onClick={loadUsage}
              disabled={loading || gwState !== 'connected'}
              className="btn btn-secondary"
              style={{ gap: 6 }}
            >
              {loading ? <LoadingSpinner size={12} /> : (
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {ut.refresh}
            </button>
          </div>
        }
      />

      {/* Gateway offline warning */}
      {gwState !== 'connected' && (
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.25)',
          color: '#FCD34D', fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {ut.gatewayRequired} — {gwState === 'connecting' ? t.connection.status.connecting : t.connection.status.disconnected}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.25)',
          color: '#FCA5A5', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
          <LoadingSpinner size={32} />
        </div>
      )}

      {/* No data */}
      {!loading && !error && !data && gwState === 'connected' && (
        <EmptyState icon="📊" title={ut.noData} description={ut.noDataDesc} />
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {[
              {
                label: ut.totalCost,
                value: fmtUsd(data.totalCostUsd),
                color: '#A78BFA',
                gradient: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(37,99,235,0.15))',
                icon: <svg width="18" height="18" fill="none" stroke="#A78BFA" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
              },
              {
                label: ut.totalTokens,
                value: fmtTokens((data.totalInputTokens || 0) + (data.totalOutputTokens || 0)),
                color: '#22D3EE',
                gradient: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(16,185,129,0.12))',
                icon: <svg width="18" height="18" fill="none" stroke="#22D3EE" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>,
              },
              {
                label: t.usage.inputTokens,
                value: fmtTokens(data.totalInputTokens),
                color: '#34D399',
                gradient: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(6,182,212,0.1))',
                icon: <svg width="18" height="18" fill="none" stroke="#34D399" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>,
              },
              {
                label: t.usage.outputTokens,
                value: fmtTokens(data.totalOutputTokens),
                color: '#FCD34D',
                gradient: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(239,68,68,0.1))',
                icon: <svg width="18" height="18" fill="none" stroke="#FCD34D" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" /></svg>,
              },
            ].map(card => (
              <div key={card.label} className="stat-card shine" style={{ cursor: 'default' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                      {card.label}
                    </p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1, letterSpacing: '-0.02em' }}>
                      {card.value}
                    </p>
                  </div>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: card.gradient,
                  }}>
                    {card.icon}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* By Agent + By Model */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* By Agent */}
            <SectionCard
              title={ut.byAgent}
              actions={<Badge variant="gray">{agentEntries.length} agents</Badge>}
            >
              {agentEntries.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px 0' }}>
                  {ut.noData}
                </div>
              ) : (
                <div>
                  {agentEntries
                    .sort((a, b) => (b[1].costUsd || 0) - (a[1].costUsd || 0))
                    .map(([agentId, stats], i) => (
                      <BarRow
                        key={agentId}
                        label={agentId}
                        costUsd={stats.costUsd || 0}
                        tokens={(stats.inputTokens || 0) + (stats.outputTokens || 0)}
                        maxCost={maxAgentCost}
                        color={agentColors[i % agentColors.length]}
                      />
                    ))}
                </div>
              )}
            </SectionCard>

            {/* By Model */}
            <SectionCard
              title={ut.byModel}
              actions={<Badge variant="gray">{modelEntries.length} models</Badge>}
            >
              {modelEntries.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px 0' }}>
                  {ut.noData}
                </div>
              ) : (
                <div>
                  {modelEntries
                    .sort((a, b) => (b[1].costUsd || 0) - (a[1].costUsd || 0))
                    .map(([modelId, stats], i) => (
                      <BarRow
                        key={modelId}
                        label={modelId.split('/').pop() || modelId}
                        costUsd={stats.costUsd || 0}
                        tokens={(stats.inputTokens || 0) + (stats.outputTokens || 0)}
                        maxCost={maxModelCost}
                        color={modelColors[i % modelColors.length]}
                      />
                    ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* By Date — simple table */}
          {data.byDate && Object.keys(data.byDate).length > 0 && (
            <SectionCard title={ut.byDate}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {[ut.date, ut.costUsd, ut.inputTokens, ut.outputTokens].map(h => (
                        <th key={h} style={{
                          textAlign: 'left', padding: '6px 10px',
                          borderBottom: '1px solid var(--color-border)',
                          color: 'var(--color-text-muted)',
                          fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.byDate)
                      .sort((a, b) => b[0].localeCompare(a[0]))
                      .map(([date, stats]) => (
                        <tr key={date} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '8px 10px', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }}>{date}</td>
                          <td style={{ padding: '8px 10px', color: '#A78BFA', fontWeight: 700 }}>{fmtUsd(stats.costUsd)}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--color-text-secondary)' }}>{fmtTokens(stats.inputTokens)}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--color-text-secondary)' }}>{fmtTokens(stats.outputTokens)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}

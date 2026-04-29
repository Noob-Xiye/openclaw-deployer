import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import { PageHeader, SectionCard, Badge, EmptyState, LoadingSpinner, InfoBox } from '../components/ui';

// ── Rust command types (match lib.rs) ─────────────────────────────────────────

interface ToolCheck {
  name: string;
  found: boolean;
  version: string | null;
  path: string | null;
  error: string | null;
}

interface SystemInfo {
  platform: string;
  arch: string;
  hostname: string;
  os_version: string;
  total_memory_gb: number;
  free_memory_gb: number;
  cpu_count: number;
}

interface EnvDiagnostics {
  system: SystemInfo;
  tools: ToolCheck[];
  openclaw_found: boolean;
  openclaw_version: string | null;
  openclaw_home: string;
  openclaw_config_exists: boolean;
  node_major_version: number | null;
  rust_installed: boolean;
  rust_version: string | null;
  errors: string[];
}

interface VariantDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  npm_package: string;
  cli_command: string;
  config_dir_name: string;
  default_port: number;
  category: string;
  features: string[];
  source_url: string;
}

interface VariantStatus {
  variant: VariantDef;
  installed: boolean;
  running: boolean;
  version: string | null;
  config_exists: boolean;
}

interface InstallResult {
  success: boolean;
  message: string;
  openclaw_version: string | null;
  warnings: string[];
}

interface GatewayStatus {
  running: boolean;
  pid: number | null;
  port_open: boolean | null;
  uptime_seconds: number | null;
  memory_mb: number | null;
}

// ── Variant card ────────────────────────────────────────────────────────────

function VariantCard({
  vs, onInstall, onStart, installing, lang,
}: {
  vs: VariantStatus;
  onInstall: (id: string) => void;
  onStart: (id: string, port: number) => void;
  installing: string | null;
  lang: 'zh' | 'en';
}) {
  const v = vs.variant;
  const isCore = v.category === 'core';

  return (
    <div style={{
      background: 'var(--color-surface-2)',
      border: `1.5px solid ${vs.installed ? (vs.running ? 'rgba(16,185,129,0.35)' : 'rgba(99,102,241,0.3)') : 'var(--color-border)'}`,
      borderRadius: 12,
      padding: '18px 20px',
      position: 'relative',
      transition: 'border-color 0.15s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: isCore
            ? 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(37,99,235,0.15))'
            : 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(6,182,212,0.1))',
          border: `1px solid ${isCore ? 'rgba(124,58,237,0.25)' : 'rgba(16,185,129,0.2)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>
          {v.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {v.name}
            </span>
            {isCore && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                background: 'rgba(124,58,237,0.15)', color: '#A78BFA', letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>
                {lang === 'zh' ? '核心' : 'CORE'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {v.description}
          </div>
        </div>
        {/* Status badge */}
        <div style={{ flexShrink: 0 }}>
          {vs.running ? (
            <Badge variant="success">{lang === 'zh' ? '运行中' : 'Running'}</Badge>
          ) : vs.installed ? (
            <Badge variant="info">{lang === 'zh' ? '已安装' : 'Installed'}</Badge>
          ) : (
            <Badge variant="gray">{lang === 'zh' ? '未安装' : 'Not Installed'}</Badge>
          )}
        </div>
      </div>

      {/* Features */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {v.features.map(f => (
          <span key={f} style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 5,
            background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
          }}>
            {f}
          </span>
        ))}
      </div>

      {/* Info row */}
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 12, flexWrap: 'wrap' }}>
        <span>CLI: <code style={{ fontFamily: 'var(--font-family-mono)', background: 'var(--color-surface-3)', padding: '1px 5px', borderRadius: 3 }}>{v.cli_command}</code></span>
        <span>{lang === 'zh' ? '端口' : 'Port'}: {v.default_port}</span>
        {vs.version && <span>{lang === 'zh' ? '版本' : 'Ver'}: {vs.version}</span>}
        {vs.config_exists && <span>✓ {lang === 'zh' ? '配置已存在' : 'Config exists'}</span>}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {!vs.installed && (
          <button
            onClick={() => onInstall(v.id)}
            disabled={installing !== null}
            className={installing === v.id ? 'btn btn-primary' : 'btn btn-primary'}
            style={{ opacity: installing !== null && installing !== v.id ? 0.5 : 1 }}
          >
            {installing === v.id ? (
              <>
                <span className="loader" style={{ width: 14, height: 14, borderWidth: 2 }} />
                {lang === 'zh' ? '安装中...' : 'Installing...'}
              </>
            ) : (
              <>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {lang === 'zh' ? '安装' : 'Install'}
              </>
            )}
          </button>
        )}
        {vs.installed && !vs.running && (
          <button
            onClick={() => onStart(v.id, v.default_port)}
            className="btn btn-secondary"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {lang === 'zh' ? '启动' : 'Start'}
          </button>
        )}
        {vs.installed && (
          <button
            onClick={() => onInstall(v.id)}
            disabled={installing !== null}
            className="btn btn-ghost"
            style={{ opacity: installing !== null ? 0.5 : 1 }}
          >
            {installing === v.id
              ? (lang === 'zh' ? '更新中...' : 'Updating...')
              : (lang === 'zh' ? '更新' : 'Update')}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Env Diagnostics Panel ───────────────────────────────────────────────────

function DiagnosticsPanel({ diag, loading, lang }: { diag: EnvDiagnostics | null; loading: boolean; lang: 'zh' | 'en' }) {
  if (loading && !diag) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0' }}>
        <LoadingSpinner size={20} />
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {lang === 'zh' ? '正在诊断环境...' : 'Diagnosing environment...'}
        </span>
      </div>
    );
  }

  if (!diag) return null;

  const toolIcon = (found: boolean) => found ? '✅' : '❌';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* System info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
        {[
          { label: lang === 'zh' ? '系统' : 'OS', value: `${diag.system.platform} ${diag.system.arch}` },
          { label: lang === 'zh' ? '版本' : 'Version', value: diag.system.os_version },
          { label: lang === 'zh' ? '主机名' : 'Host', value: diag.system.hostname },
          { label: lang === 'zh' ? '内存' : 'RAM', value: `${diag.system.free_memory_gb.toFixed(1)} / ${diag.system.total_memory_gb.toFixed(1)} GB` },
          { label: 'CPU', value: `${diag.system.cpu_count} cores` },
        ].map(row => (
          <div key={row.label} style={{
            padding: '8px 10px', borderRadius: 7,
            background: 'var(--color-surface-3)', border: '1px solid var(--color-border)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {row.label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 600, marginTop: 2 }}>
              {row.value}
            </div>
          </div>
        ))}
      </div>

      {/* Tools checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {lang === 'zh' ? '工具链检测' : 'Toolchain Check'}
        </div>
        {diag.tools.map(t => (
          <div key={t.name} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 6,
            background: 'var(--color-surface-3)', border: '1px solid var(--color-border)',
          }}>
            <span style={{ fontSize: 13 }}>{toolIcon(t.found)}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', minWidth: 50 }}>
              {t.name}
            </span>
            {t.found && t.version && (
              <code style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>
                {t.version}
              </code>
            )}
            {t.found && t.path && (
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {t.path}
              </span>
            )}
            {!t.found && (
              <span style={{ fontSize: 11, color: '#F87171' }}>
                {lang === 'zh' ? '未找到' : 'Not found'}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* OpenClaw status */}
      <div style={{
        padding: '10px 14px', borderRadius: 9,
        background: diag.openclaw_found ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
        border: `1px solid ${diag.openclaw_found ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.25)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>{diag.openclaw_found ? '✅' : '⚠️'}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: diag.openclaw_found ? '#34D399' : '#FCD34D' }}>
            OpenClaw {diag.openclaw_found
              ? (diag.openclaw_version ? `v${diag.openclaw_version}` : (lang === 'zh' ? '已安装' : 'Installed'))
              : (lang === 'zh' ? '未安装' : 'Not Installed')}
          </span>
        </div>
        {diag.openclaw_config_exists && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
            ✓ {lang === 'zh' ? '配置文件已存在' : 'Config file exists'}: {diag.openclaw_home}
          </div>
        )}
      </div>

      {/* Errors */}
      {diag.errors.length > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: 9,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F87171', marginBottom: 6 }}>
            {lang === 'zh' ? '⚠️ 问题' : '⚠️ Issues'}
          </div>
          {diag.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: '#FCA5A5', lineHeight: 1.6 }}>• {e}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function InstallPage() {
  const { addToast, language, loadConfig } = useAppStore();
  const lang = language as 'zh' | 'en';

  // State
  const [diagnostics, setDiagnostics] = useState<EnvDiagnostics | null>(null);
  const [variants, setVariants] = useState<VariantStatus[]>([]);
  const [diagLoading, setDiagLoading] = useState(false);
  const [varLoading, setVarLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [gatewayStarting, setGatewayStarting] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'variants'>('overview');

  // Run diagnostics
  const runDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    try {
      const diag = await invoke<EnvDiagnostics>('diagnose_environment');
      setDiagnostics(diag);
    } catch (e) {
      addToast({ type: 'error', message: `Diagnostics failed: ${e}` });
    } finally {
      setDiagLoading(false);
    }
  }, [addToast]);

  // Load variants
  const loadVariants = useCallback(async () => {
    setVarLoading(true);
    try {
      const vs = await invoke<VariantStatus[]>('get_all_variants');
      setVariants(vs);
    } catch (e) {
      addToast({ type: 'error', message: `Load variants failed: ${e}` });
    } finally {
      setVarLoading(false);
    }
  }, [addToast]);

  // Initial load
  useEffect(() => {
    runDiagnostics();
    loadVariants();
  }, [runDiagnostics, loadVariants]);

  // Install a variant
  const handleInstall = async (variantId: string) => {
    setInstalling(variantId);
    try {
      const result = await invoke<InstallResult>('install_variant', { variantId });
      if (result.success) {
        addToast({ type: 'success', message: result.message });
        loadVariants();
        runDiagnostics();
        loadConfig();
      } else {
        addToast({ type: 'error', message: result.message });
      }
      if (result.warnings.length > 0) {
        result.warnings.forEach(w => addToast({ type: 'warning', message: w }));
      }
    } catch (e) {
      addToast({ type: 'error', message: `${e}` });
    } finally {
      setInstalling(null);
    }
  };

  // Start a variant gateway
  const handleStart = async (variantId: string, port: number) => {
    setGatewayStarting(variantId);
    try {
      const result = await invoke<{ success: boolean; message: string; pid: number | null }>('start_variant_gateway', { variantId, port });
      addToast({ type: result.success ? 'success' : 'error', message: result.message });
      loadVariants();
    } catch (e) {
      addToast({ type: 'error', message: `${e}` });
    } finally {
      setGatewayStarting(null);
    }
  };

  // Init config
  const handleInitConfig = async () => {
    try {
      const msg = await invoke<string>('init_openclaw_config');
      addToast({ type: 'success', message: msg });
      runDiagnostics();
      loadConfig();
    } catch (e) {
      addToast({ type: 'error', message: `${e}` });
    }
  };

  return (
    <div className="page-content animate-fade-in">
      <PageHeader
        title={lang === 'zh' ? '部署中心' : 'Deploy Center'}
        subtitle={lang === 'zh' ? '环境诊断、一键安装、多变体管理' : 'Diagnostics, one-click install, multi-variant management'}
        icon={
          <svg width="18" height="18" fill="none" stroke="#A78BFA" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        }
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => { runDiagnostics(); loadVariants(); }} style={{ padding: '6px 14px', fontSize: 12, gap: 5 }}>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {lang === 'zh' ? '刷新检测' : 'Refresh'}
            </button>
            <button className="btn btn-secondary" onClick={handleInitConfig} style={{ padding: '6px 14px', fontSize: 12, gap: 5 }}>
              {lang === 'zh' ? '初始化配置' : 'Init Config'}
            </button>
          </div>
        }
      />

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {([
          { id: 'overview' as const, label: lang === 'zh' ? '环境诊断' : 'Diagnostics' },
          { id: 'variants' as const, label: lang === 'zh' ? '变体管理' : 'Variants' },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
              background: tab === t.id ? 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(37,99,235,0.1))' : 'var(--color-surface-2)',
              color: tab === t.id ? '#A78BFA' : 'var(--color-text-muted)',
              border: `1px solid ${tab === t.id ? 'rgba(124,58,237,0.3)' : 'var(--color-border)'}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Diagnostics Tab */}
      {tab === 'overview' && (
        <SectionCard title={lang === 'zh' ? '系统环境诊断' : 'Environment Diagnostics'}>
          <DiagnosticsPanel diag={diagnostics} loading={diagLoading} lang={lang} />
        </SectionCard>
      )}

      {/* Variants Tab */}
      {tab === 'variants' && (
        <>
          {varLoading && variants.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
              <LoadingSpinner size={24} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Core variant */}
              {variants.filter(v => v.variant.category === 'core').map(vs => (
                <VariantCard
                  key={vs.variant.id}
                  vs={vs}
                  onInstall={handleInstall}
                  onStart={handleStart}
                  installing={installing}
                  lang={lang}
                />
              ))}

              {/* Variant group */}
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547" />
                </svg>
                {lang === 'zh' ? '社区变体' : 'Community Variants'}
              </div>
              {variants.filter(v => v.variant.category === 'variant').map(vs => (
                <VariantCard
                  key={vs.variant.id}
                  vs={vs}
                  onInstall={handleInstall}
                  onStart={handleStart}
                  installing={installing}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Install guide (always visible at bottom) */}
      <div style={{ marginTop: 20 }}>
        <InfoBox type="tip" title={lang === 'zh' ? '手动安装提示' : 'Manual Install Tips'} collapsible defaultCollapsed>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <div>
              <code style={{ fontFamily: 'var(--font-family-mono)', background: 'var(--color-surface-3)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>
                npm install -g openclaw
              </code>
              <span style={{ fontSize: 11, marginLeft: 6, color: 'var(--color-text-muted)' }}>
                — {lang === 'zh' ? '安装核心版' : 'Install core'}
              </span>
            </div>
            <div>
              <code style={{ fontFamily: 'var(--font-family-mono)', background: 'var(--color-surface-3)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>
                npm install -g kimiclaw
              </code>
              <span style={{ fontSize: 11, marginLeft: 6, color: 'var(--color-text-muted)' }}>
                — {lang === 'zh' ? '安装 Kimi 定制版' : 'Install Kimi variant'}
              </span>
            </div>
            <div>
              <code style={{ fontFamily: 'var(--font-family-mono)', background: 'var(--color-surface-3)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>
                openclaw gateway run
              </code>
              <span style={{ fontSize: 11, marginLeft: 6, color: 'var(--color-text-muted)' }}>
                — {lang === 'zh' ? '启动 Gateway' : 'Start Gateway'}
              </span>
            </div>
            <div>
              <code style={{ fontFamily: 'var(--font-family-mono)', background: 'var(--color-surface-3)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>
                openclaw config init
              </code>
              <span style={{ fontSize: 11, marginLeft: 6, color: 'var(--color-text-muted)' }}>
                — {lang === 'zh' ? '初始化配置文件' : 'Initialize config'}
              </span>
            </div>
          </div>
        </InfoBox>
      </div>
    </div>
  );
}

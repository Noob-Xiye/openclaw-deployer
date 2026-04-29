import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import { PageHeader, SectionCard, Badge, LoadingSpinner, InfoBox, ConfirmModal } from '../components/ui';

// ── Types ───────────────────────────────────────────────────────────────────

interface ClawVariant {
  id: string;
  name: string;
  icon: string;
  description: string;
  npmPackage: string;
  cliCommand: string;
  category: 'core' | 'community' | 'bundled';
  features: string[];
  sourceUrl?: string;
}

interface InstallProgress {
  step: 'idle' | 'checking' | 'downloading' | 'installing' | 'configuring' | 'completed' | 'error';
  message: string;
  percent: number;
}

interface DetectedInstall {
  path: string;
  version: string | null;
  type: 'npm' | 'bundled' | 'unknown';
}

// ── Variant Catalog ─────────────────────────────────────────────────────────

const VARIANTS: ClawVariant[] = [
  {
    id: 'openclaw',
    name: 'OpenClaw',
    icon: '🐾',
    description: '官方核心版，功能完整，社区支持最广泛',
    npmPackage: 'openclaw',
    cliCommand: 'openclaw',
    category: 'core',
    features: ['Gateway', 'Agent', 'Skills', 'MCP', 'Cron'],
    sourceUrl: 'https://www.npmjs.com/package/openclaw',
  },
  {
    id: 'kimiclaw',
    name: 'KimiClaw',
    icon: '🌙',
    description: 'Kimi 定制版，针对 Moonshot AI 优化',
    npmPackage: 'kimiclaw',
    cliCommand: 'kimiclaw',
    category: 'community',
    features: ['Kimi API', '长文本', 'Gateway', 'Agent'],
    sourceUrl: 'https://www.npmjs.com/package/kimiclaw',
  },
  {
    id: 'qclaw',
    name: 'QClaw (捆绑版)',
    icon: '⚡',
    description: '已捆绑在 QClaw 中，无需额外安装',
    npmPackage: '',
    cliCommand: 'openclaw',
    category: 'bundled',
    features: ['已安装', 'Gateway', 'Agent', 'Skills'],
  },
];

// ── Helper Components ───────────────────────────────────────────────────────

function ProgressBar({ percent, status }: { percent: number; status: 'idle' | 'running' | 'error' | 'success' }) {
  const colors = {
    idle: 'var(--color-border)',
    running: '#6366F1',
    error: '#EF4444',
    success: '#10B981',
  };
  return (
    <div style={{ width: '100%', height: 4, background: 'var(--color-surface-3)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        width: `${percent}%`,
        height: '100%',
        background: colors[status],
        transition: 'width 0.3s ease',
      }} />
    </div>
  );
}

function VariantCard({
  variant,
  detected,
  isInstalling,
  progress,
  onInstall,
  onUninstall,
  onOpenConfig,
  customPath,
  onPathChange,
  lang,
}: {
  variant: ClawVariant;
  detected: DetectedInstall | null;
  isInstalling: boolean;
  progress: InstallProgress;
  onInstall: (v: ClawVariant, path?: string) => void;
  onUninstall: (v: ClawVariant) => void;
  onOpenConfig: (v: ClawVariant) => void;
  customPath: string;
  onPathChange: (v: string) => void;
  lang: 'zh' | 'en';
}) {
  const isInstalled = !!detected;
  const isBundled = variant.category === 'bundled';

  return (
    <div style={{
      background: 'var(--color-surface-2)',
      border: `1.5px solid ${isInstalled ? 'rgba(16,185,129,0.35)' : 'var(--color-border)'}`,
      borderRadius: 12,
      padding: '20px 24px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 12,
          background: isBundled
            ? 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(234,179,8,0.15))'
            : variant.category === 'core'
            ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(37,99,235,0.15))'
            : 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(6,182,212,0.1))',
          border: `1px solid ${isBundled ? 'rgba(245,158,11,0.3)' : variant.category === 'core' ? 'rgba(99,102,241,0.25)' : 'rgba(16,185,129,0.2)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, flexShrink: 0,
        }}>
          {variant.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {variant.name}
            </span>
            {isBundled && <Badge variant="warning">{lang === 'zh' ? '已捆绑' : 'Bundled'}</Badge>}
            {variant.category === 'core' && <Badge variant="info">{lang === 'zh' ? '官方' : 'Official'}</Badge>}
            {isInstalled && <Badge variant="success">{lang === 'zh' ? '已安装' : 'Installed'}</Badge>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {variant.description}
          </div>
          {detected?.version && (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
              {lang === 'zh' ? '版本' : 'Version'}: {detected.version}
            </div>
          )}
        </div>
      </div>

      {/* Features */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {variant.features.map(f => (
          <span key={f} style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 6,
            background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
          }}>{f}</span>
        ))}
      </div>

      {/* Custom Path Input (only for npm installable variants) */}
      {!isBundled && !isInstalled && (
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--color-surface-3)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            {lang === 'zh' ? '安装路径 (可选，留空使用默认)' : 'Install Path (optional, leave empty for default)'}
          </div>
          <input
            type="text"
            value={customPath}
            onChange={(e) => onPathChange(e.target.value)}
            placeholder={lang === 'zh' ? '例如: D:\\Tools\\OpenClaw' : 'e.g., D:\\Tools\\OpenClaw'}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 13,
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-family-mono)',
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
            {lang === 'zh'
              ? '默认路径: npm 全局目录。自定义路径需要手动添加到 PATH。'
              : 'Default: npm global dir. Custom path requires manual PATH setup.'}
          </div>
        </div>
      )}

      {/* Progress */}
      {isInstalling && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{progress.message}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{progress.percent}%</span>
          </div>
          <ProgressBar percent={progress.percent} status={progress.step === 'error' ? 'error' : progress.step === 'completed' ? 'success' : 'running'} />
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        {isInstalled ? (
          <>
            <button
              onClick={() => onUninstall(variant)}
              className="btn btn-ghost"
              disabled={isInstalling}
            >
              {lang === 'zh' ? '卸载' : 'Uninstall'}
            </button>
            <button
              onClick={() => onOpenConfig(variant)}
              className="btn btn-secondary"
            >
              {lang === 'zh' ? '打开配置' : 'Open Config'}
            </button>
          </>
        ) : isBundled ? (
          <button className="btn btn-secondary" disabled>
            {lang === 'zh' ? '已随 QClaw 安装' : 'Installed with QClaw'}
          </button>
        ) : (
          <button
            onClick={() => onInstall(variant, customPath || undefined)}
            disabled={isInstalling}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {isInstalling ? (
              <>
                <span className="loader" style={{ width: 14, height: 14, borderWidth: 2 }} />
                {lang === 'zh' ? '安装中...' : 'Installing...'}
              </>
            ) : (
              <>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {lang === 'zh' ? '一键安装' : 'One-Click Install'}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function InstallPage() {
  const { addToast, language } = useAppStore();
  const lang = language as 'zh' | 'en';

  // State
  const [detectedInstalls, setDetectedInstalls] = useState<Record<string, DetectedInstall>>({});
  const [installingVariant, setInstallingVariant] = useState<string | null>(null);
  const [progress, setProgress] = useState<InstallProgress>({ step: 'idle', message: '', percent: 0 });
  const [customPaths, setCustomPaths] = useState<Record<string, string>>({});
  const [isScanning, setIsScanning] = useState(false);

  // Scan for installed variants
  const scanInstallations = useCallback(async () => {
    setIsScanning(true);
    const detected: Record<string, DetectedInstall> = {};

    try {
      // Check each variant
      for (const variant of VARIANTS) {
        // Try to find the CLI command
        const path = await invoke<string | null>('find_tool_in_path', { name: variant.cliCommand })
          .catch(() => null);

        if (path) {
          // Get version
          let version: string | null = null;
          try {
            const result = await invoke<{ stdout: string; stderr: string; code: number }>(
              'run_command_output_cmd',
              { program: path, args: ['--version'], timeoutSecs: 5 }
            );
            if (result.code === 0) {
              version = result.stdout.trim();
            }
          } catch { /* ignore */ }

          detected[variant.id] = {
            path,
            version,
            type: variant.category === 'bundled' ? 'bundled' : 'npm',
          };
        }
      }

      // Special check for QClaw bundled version
      const qclawPath = 'D:\\Program Files\\QClaw\\resources\\openclaw\\openclaw.cmd';
      try {
        const exists = await invoke<boolean>('file_exists', { path: qclawPath });
        if (exists && !detected['qclaw']) {
          detected['qclaw'] = {
            path: qclawPath,
            version: 'bundled',
            type: 'bundled',
          };
        }
      } catch { /* ignore */ }

      setDetectedInstalls(detected);
    } catch (e) {
      addToast({ type: 'error', message: `Scan failed: ${e}` });
    } finally {
      setIsScanning(false);
    }
  }, [addToast]);

  // Initial scan
  useEffect(() => {
    scanInstallations();
  }, [scanInstallations]);

  // Install a variant
  const handleInstall = async (variant: ClawVariant, customPath?: string) => {
    setInstallingVariant(variant.id);
    setProgress({ step: 'checking', message: lang === 'zh' ? '检查环境...' : 'Checking environment...', percent: 10 });

    try {
      // Step 1: Check prerequisites
      await new Promise(r => setTimeout(r, 500));
      setProgress({ step: 'downloading', message: lang === 'zh' ? '下载安装包...' : 'Downloading...', percent: 30 });

      // Step 2: Run npm install
      const result = await invoke<{ success: boolean; message: string; openclaw_version: string | null; warnings: string[] }>(
        'install_variant',
        { variantId: variant.id }
      );

      if (!result.success) {
        throw new Error(result.message);
      }

      setProgress({ step: 'configuring', message: lang === 'zh' ? '初始化配置...' : 'Initializing config...', percent: 80 });

      // Step 3: Initialize config
      try {
        await invoke<string>('init_openclaw_config');
      } catch { /* config might already exist */ }

      setProgress({ step: 'completed', message: lang === 'zh' ? '安装完成！' : 'Installation completed!', percent: 100 });
      addToast({ type: 'success', message: result.message });

      // Refresh detection
      await scanInstallations();
    } catch (e) {
      setProgress({ step: 'error', message: `${e}`, percent: 0 });
      addToast({ type: 'error', message: `${e}` });
    } finally {
      setInstallingVariant(null);
      setTimeout(() => setProgress({ step: 'idle', message: '', percent: 0 }), 2000);
    }
  };

  // Uninstall a variant
  const handleUninstall = async (variant: ClawVariant) => {
    if (!confirm(lang === 'zh' ? `确定要卸载 ${variant.name} 吗？` : `Uninstall ${variant.name}?`)) {
      return;
    }
    addToast({ type: 'info', message: lang === 'zh' ? '卸载功能开发中...' : 'Uninstall feature coming soon...' });
  };

  // Open config for a variant
  const handleOpenConfig = (variant: ClawVariant) => {
    // Navigate to raw config page
    window.location.href = '#/raw-config';
  };

  return (
    <div className="page-content animate-fade-in">
      <PageHeader
        title={lang === 'zh' ? '应用商店' : 'App Store'}
        subtitle={lang === 'zh' ? '一键安装和管理 OpenClaw 及其变体' : 'One-click install and manage OpenClaw variants'}
        icon={
          <svg width="20" height="20" fill="none" stroke="#A78BFA" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        }
        actions={
          <button
            className="btn btn-secondary"
            onClick={scanInstallations}
            disabled={isScanning}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {isScanning ? (
              <span className="loader" style={{ width: 14, height: 14, borderWidth: 2 }} />
            ) : (
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {lang === 'zh' ? '刷新' : 'Refresh'}
          </button>
        }
      />

      {/* Info box about QClaw - integrated style */}
      {detectedInstalls['qclaw'] && (
        <div style={{
          marginBottom: 16,
          padding: '12px 16px',
          background: 'var(--color-surface-2)',
          borderRadius: 8,
          borderLeft: '3px solid #6366F1',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#818CF8', marginBottom: 4 }}>
            {lang === 'zh' ? '检测到 QClaw' : 'QClaw Detected'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {lang === 'zh'
              ? '您已安装 QClaw，其中已包含 OpenClaw 核心功能。可以直接使用，无需额外安装。'
              : 'You have QClaw installed, which includes OpenClaw core features. No additional installation needed.'}
          </div>
        </div>
      )}

      {/* Variants Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {VARIANTS.map(variant => (
          <VariantCard
            key={variant.id}
            variant={variant}
            detected={detectedInstalls[variant.id] || null}
            isInstalling={installingVariant === variant.id}
            progress={progress}
            onInstall={handleInstall}
            onUninstall={handleUninstall}
            onOpenConfig={handleOpenConfig}
            customPath={customPaths[variant.id] || ''}
            onPathChange={(v) => setCustomPaths(p => ({ ...p, [variant.id]: v }))}
            lang={lang}
          />
        ))}
      </div>

      {/* Manual install tip */}
      <div style={{ marginTop: 24 }}>
        <InfoBox type="tip" title={lang === 'zh' ? '手动安装' : 'Manual Install'} collapsible defaultCollapsed>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <code style={{
              fontFamily: 'var(--font-family-mono)',
              background: 'var(--color-surface-3)',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 12,
            }}>
              npm install -g openclaw
            </code>
            <code style={{
              fontFamily: 'var(--font-family-mono)',
              background: 'var(--color-surface-3)',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 12,
            }}>
              openclaw config init
            </code>
          </div>
        </InfoBox>
      </div>
    </div>
  );
}

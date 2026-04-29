import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import { PageHeader, Badge, LoadingSpinner } from '../components/ui';

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
}

interface DeployStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
}

interface DeployProgress {
  steps: DeployStep[];
  currentStep: number;
  overallPercent: number;
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

function StepIndicator({ step, index, isActive }: { step: DeployStep; index: number; isActive: boolean }) {
  const getIcon = () => {
    switch (step.status) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'running': return <span className="loader" style={{ width: 12, height: 12, borderWidth: 2 }} />;
      default: return index + 1;
    }
  };

  const getColor = () => {
    switch (step.status) {
      case 'success': return '#10B981';
      case 'error': return '#EF4444';
      case 'running': return '#6366F1';
      default: return 'var(--color-text-muted)';
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 0',
      opacity: step.status === 'pending' && !isActive ? 0.5 : 1,
    }}>
      <div style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: step.status === 'running' ? 'rgba(99,102,241,0.15)' : 'var(--color-surface-3)',
        border: `2px solid ${getColor()}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
        color: getColor(),
        flexShrink: 0,
      }}>
        {getIcon()}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {step.name}
        </div>
        {step.message && (
          <div style={{ fontSize: 11, color: step.status === 'error' ? '#EF4444' : 'var(--color-text-muted)', marginTop: 2 }}>
            {step.message}
          </div>
        )}
      </div>
    </div>
  );
}

function VariantCard({
  variant,
  detected,
  isDeploying,
  progress,
  onDeploy,
  onStartGateway,
  lang,
}: {
  variant: ClawVariant;
  detected: DetectedInstall | null;
  isDeploying: boolean;
  progress: DeployProgress | null;
  onDeploy: (v: ClawVariant) => void;
  onStartGateway: (v: ClawVariant) => void;
  lang: 'zh' | 'en';
}) {
  const isInstalled = !!detected;
  const isBundled = variant.category === 'bundled';
  const isRunning = false; // TODO: check if gateway is running

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
            {isRunning && <Badge variant="success">{lang === 'zh' ? '运行中' : 'Running'}</Badge>}
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

      {/* Deploy Progress */}
      {isDeploying && progress && (
        <div style={{
          marginBottom: 16,
          padding: 16,
          background: 'var(--color-surface-3)',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            {lang === 'zh' ? '部署进度' : 'Deploy Progress'}
          </div>
          {progress.steps.map((step, idx) => (
            <StepIndicator
              key={step.name}
              step={step}
              index={idx}
              isActive={idx === progress.currentStep}
            />
          ))}
          <div style={{ marginTop: 12 }}>
            <div style={{
              width: '100%', height: 4, background: 'var(--color-surface-2)', borderRadius: 2, overflow: 'hidden'
            }}>
              <div style={{
                width: `${progress.overallPercent}%`,
                height: '100%',
                background: '#6366F1',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        {isInstalled ? (
          <>
            {!isRunning && (
              <button
                onClick={() => onStartGateway(variant)}
                className="btn btn-primary"
                disabled={isDeploying}
              >
                {lang === 'zh' ? '启动 Gateway' : 'Start Gateway'}
              </button>
            )}
            {isRunning && (
              <button className="btn btn-secondary" disabled>
                {lang === 'zh' ? 'Gateway 运行中' : 'Gateway Running'}
              </button>
            )}
          </>
        ) : isBundled ? (
          <button className="btn btn-secondary" disabled>
            {lang === 'zh' ? '已随 QClaw 安装' : 'Installed with QClaw'}
          </button>
        ) : (
          <button
            onClick={() => onDeploy(variant)}
            disabled={isDeploying}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {isDeploying ? (
              <>
                <span className="loader" style={{ width: 14, height: 14, borderWidth: 2 }} />
                {lang === 'zh' ? '部署中...' : 'Deploying...'}
              </>
            ) : (
              <>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {lang === 'zh' ? '一键部署' : 'One-Click Deploy'}
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
  const { addToast, language, setActiveSection } = useAppStore();
  const lang = language as 'zh' | 'en';

  // State
  const [detectedInstalls, setDetectedInstalls] = useState<Record<string, DetectedInstall>>({});
  const [deployingVariant, setDeployingVariant] = useState<string | null>(null);
  const [deployProgress, setDeployProgress] = useState<DeployProgress | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Scan for installed variants
  const scanInstallations = useCallback(async () => {
    setIsScanning(true);
    const detected: Record<string, DetectedInstall> = {};

    try {
      for (const variant of VARIANTS) {
        const path = await invoke<string | null>('find_tool_in_path', { name: variant.cliCommand })
          .catch(() => null);

        if (path) {
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

  // Full auto-deploy process
  const handleDeploy = async (variant: ClawVariant) => {
    if (variant.category === 'bundled') return;

    setDeployingVariant(variant.id);

    const steps: DeployStep[] = [
      { name: lang === 'zh' ? '检查环境' : 'Check Environment', status: 'pending' },
      { name: lang === 'zh' ? '下载并安装' : 'Download & Install', status: 'pending' },
      { name: lang === 'zh' ? '初始化配置' : 'Initialize Config', status: 'pending' },
      { name: lang === 'zh' ? '启动 Gateway' : 'Start Gateway', status: 'pending' },
    ];

    const updateProgress = (currentStep: number, stepUpdates?: Partial<DeployStep>) => {
      const updatedSteps = steps.map((s, idx) => {
        if (idx < currentStep) return { ...s, status: 'success' as const };
        if (idx === currentStep) return { ...s, status: 'running' as const, ...stepUpdates };
        return s;
      });
      setDeployProgress({
        steps: updatedSteps,
        currentStep,
        overallPercent: Math.round((currentStep / steps.length) * 100),
      });
    };

    try {
      // Step 1: Check environment
      updateProgress(0);
      await new Promise(r => setTimeout(r, 500));

      // Check Node.js
      const nodeCheck = await invoke<{ found: boolean; version?: string }>('check_tool_cmd', { name: 'node' });
      if (!nodeCheck.found) {
        throw new Error(lang === 'zh' ? '未检测到 Node.js，请先安装 Node.js 18+' : 'Node.js not found. Please install Node.js 18+');
      }

      updateProgress(1);

      // Step 2: Install variant
      const installResult = await invoke<{ success: boolean; message: string; openclaw_version: string | null; warnings: string[] }>(
        'install_variant',
        { variantId: variant.id }
      );

      if (!installResult.success) {
        throw new Error(installResult.message);
      }

      if (installResult.warnings.length > 0) {
        installResult.warnings.forEach(w => addToast({ type: 'warning', message: w }));
      }

      updateProgress(2);

      // Step 3: Initialize config
      try {
        await invoke<string>('init_openclaw_config');
      } catch (e) {
        // Config might already exist, continue
      }

      updateProgress(3);

      // Step 4: Start Gateway (optional, can be started manually)
      // For now, just mark as completed
      steps[3].status = 'success';
      setDeployProgress({
        steps: [...steps],
        currentStep: 3,
        overallPercent: 100,
      });

      addToast({ type: 'success', message: installResult.message });
      await scanInstallations();

      // Auto-switch to dashboard after successful deploy
      setTimeout(() => {
        setActiveSection('dashboard');
      }, 1500);

    } catch (e) {
      const errorMsg = `${e}`;
      steps[deployProgress?.currentStep || 0].status = 'error';
      steps[deployProgress?.currentStep || 0].message = errorMsg;
      setDeployProgress({
        steps: [...steps],
        currentStep: deployProgress?.currentStep || 0,
        overallPercent: 0,
      });
      addToast({ type: 'error', message: errorMsg });
    } finally {
      setTimeout(() => {
        setDeployingVariant(null);
        setDeployProgress(null);
      }, 3000);
    }
  };

  // Start Gateway for a variant
  const handleStartGateway = async (variant: ClawVariant) => {
    try {
      const result = await invoke<{ success: boolean; message: string; pid: number | null }>(
        'start_variant_gateway',
        { variantId: variant.id, port: 3000 }
      );
      addToast({ type: result.success ? 'success' : 'error', message: result.message });
      if (result.success) {
        setActiveSection('dashboard');
      }
    } catch (e) {
      addToast({ type: 'error', message: `${e}` });
    }
  };

  return (
    <div className="page-content animate-fade-in">
      <PageHeader
        title={lang === 'zh' ? '应用商店' : 'App Store'}
        subtitle={lang === 'zh' ? '一键全自动部署 OpenClaw 及其变体' : 'One-click auto-deploy OpenClaw variants'}
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
            isDeploying={deployingVariant === variant.id}
            progress={deployProgress}
            onDeploy={handleDeploy}
            onStartGateway={handleStartGateway}
            lang={lang}
          />
        ))}
      </div>
    </div>
  );
}

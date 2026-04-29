import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { OsPlatform } from '../types';
import { PageHeader, SectionCard } from '../components/ui';

// ── OS detection ──────────────────────────────────────────────────────────
function detectOS(): OsPlatform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

// ── Install instructions per OS ───────────────────────────────────────────
interface InstallStep {
  label: string;
  cmd?: string;
  note?: string;
}

interface OsInstallGuide {
  icon: string;
  name: string;
  prereqs: InstallStep[];
  install: InstallStep[];
  verify: InstallStep[];
}

function getGuide(os: OsPlatform, lang: 'zh' | 'en'): OsInstallGuide {
  const zh = lang === 'zh';

  const guides: Record<OsPlatform, OsInstallGuide> = {
    windows: {
      icon: '🪟',
      name: 'Windows',
      prereqs: [
        {
          label: zh ? '安装 Node.js 22+（必须）' : 'Install Node.js 22+ (required)',
          cmd: 'winget install OpenJS.NodeJS.LTS',
          note: zh ? '或从 https://nodejs.org 下载安装包' : 'Or download installer from https://nodejs.org',
        },
      ],
      install: [
        {
          label: zh ? '全局安装 OpenClaw' : 'Install OpenClaw globally',
          cmd: 'npm install -g openclaw',
          note: zh ? '需要管理员权限或配置 npm prefix' : 'May require admin privileges or npm prefix configuration',
        },
      ],
      verify: [
        {
          label: zh ? '验证安装' : 'Verify installation',
          cmd: 'openclaw --version',
        },
        {
          label: zh ? '初始化配置' : 'Initialize config',
          cmd: 'openclaw config init',
          note: zh ? '生成 %USERPROFILE%\\.openclaw\\openclaw.json' : 'Creates %USERPROFILE%\\.openclaw\\openclaw.json',
        },
      ],
    },
    macos: {
      icon: '🍎',
      name: 'macOS',
      prereqs: [
        {
          label: zh ? '安装 Homebrew（推荐）' : 'Install Homebrew (recommended)',
          cmd: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
        },
        {
          label: zh ? '安装 Node.js 22+' : 'Install Node.js 22+',
          cmd: 'brew install node@22',
        },
      ],
      install: [
        {
          label: zh ? '全局安装 OpenClaw' : 'Install OpenClaw globally',
          cmd: 'npm install -g openclaw',
        },
        {
          label: zh ? '（可选）安装 macOS 桌面版' : '(Optional) Install macOS Desktop App',
          note: zh ? '从 https://openclaw.ai/install 下载 .dmg 安装包' : 'Download .dmg from https://openclaw.ai/install',
        },
      ],
      verify: [
        {
          label: zh ? '验证安装' : 'Verify installation',
          cmd: 'openclaw --version',
        },
        {
          label: zh ? '初始化配置' : 'Initialize config',
          cmd: 'openclaw config init',
          note: zh ? '生成 ~/.openclaw/openclaw.json' : 'Creates ~/.openclaw/openclaw.json',
        },
      ],
    },
    linux: {
      icon: '🐧',
      name: 'Linux',
      prereqs: [
        {
          label: zh ? '安装 Node.js 22+（使用 NodeSource）' : 'Install Node.js 22+ (via NodeSource)',
          cmd: 'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs',
          note: zh ? 'Arch Linux: sudo pacman -S nodejs npm' : 'Arch Linux: sudo pacman -S nodejs npm',
        },
      ],
      install: [
        {
          label: zh ? '全局安装 OpenClaw' : 'Install OpenClaw globally',
          cmd: 'sudo npm install -g openclaw',
          note: zh ? '如果使用 nvm，可省略 sudo' : 'Omit sudo if using nvm',
        },
      ],
      verify: [
        {
          label: zh ? '验证安装' : 'Verify installation',
          cmd: 'openclaw --version',
        },
        {
          label: zh ? '初始化配置' : 'Initialize config',
          cmd: 'openclaw config init',
          note: zh ? '生成 ~/.openclaw/openclaw.json' : 'Creates ~/.openclaw/openclaw.json',
        },
        {
          label: zh ? '（可选）设置 systemd 服务' : '(Optional) Setup systemd service',
          cmd: 'openclaw gateway install-service',
          note: zh ? '使 Gateway 开机自启' : 'Auto-start Gateway on boot',
        },
      ],
    },
    unknown: {
      icon: '❓',
      name: zh ? '未知系统' : 'Unknown OS',
      prereqs: [],
      install: [
        {
          label: zh ? '通过 npm 安装' : 'Install via npm',
          cmd: 'npm install -g openclaw',
        },
      ],
      verify: [
        { label: zh ? '验证安装' : 'Verify', cmd: 'openclaw --version' },
      ],
    },
  };

  return guides[os];
}

function CodeBlock({ code, lang }: { code: string; lang: 'zh' | 'en' }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{
      background: 'var(--color-surface-1, #0d0d0d)', border: '1px solid var(--color-border)',
      borderRadius: 8, padding: '10px 14px', position: 'relative', marginTop: 6,
    }}>
      <code style={{ fontSize: 12, fontFamily: 'monospace', color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {code}
      </code>
      <button
        onClick={copy}
        style={{
          position: 'absolute', top: 8, right: 8, padding: '3px 10px', borderRadius: 5,
          fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          background: copied ? '#22c55e20' : 'var(--color-surface-3)',
          color: copied ? '#22c55e' : 'var(--color-text-muted)',
          border: `1px solid ${copied ? '#22c55e40' : 'var(--color-border)'}`,
          transition: 'all 0.15s',
        }}
      >
        {copied ? (lang === 'zh' ? '已复制' : 'Copied') : (lang === 'zh' ? '复制' : 'Copy')}
      </button>
    </div>
  );
}

function StepGroup({
  title, steps, icon, lang,
}: { title: string; steps: InstallStep[]; icon: string; lang: 'zh' | 'en' }) {
  if (steps.length === 0) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: 7 }}>
        <span>{icon}</span>
        {title}
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map((step, i) => (
          <div key={i} style={{
            background: 'var(--color-surface-2)', borderRadius: 9, padding: '12px 14px',
            border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed20,#2563eb20)',
                border: '1px solid #7c3aed40', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: '#7c3aed', flexShrink: 0,
              }}>
                {i + 1}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{step.label}</span>
            </div>
            {step.cmd && <CodeBlock code={step.cmd} lang={lang} />}
            {step.note && (
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
                💡 {step.note}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function InstallPage() {
  const { config, language } = useAppStore();
  const lang = language as 'zh' | 'en';
  const [os, setOs] = useState<OsPlatform>('unknown');
  const [guessOs, setGuessOs] = useState<OsPlatform>('unknown');
  const [checkDone, setCheckDone] = useState(false);
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    const detected = detectOS();
    setOs(detected);
    setGuessOs(detected);
    // If config loaded successfully, openclaw is likely installed locally
    setIsInstalled(config !== null);
    setCheckDone(true);
  }, [config]);

  const guide = getGuide(os, lang);

  const OS_LIST: OsPlatform[] = ['windows', 'macos', 'linux'];

  return (
    <div style={{ padding: '24px 32px', maxWidth: 860, margin: '0 auto' }}>
      <PageHeader
        title={lang === 'zh' ? 'OpenClaw 安装' : 'Install OpenClaw'}
        subtitle={lang === 'zh' ? '检测安装状态，根据当前操作系统获取一键安装指南' : 'Detect installation status and get OS-specific install guide'}
      />

      {/* Installation status */}
      <SectionCard>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, flexShrink: 0,
            background: checkDone
              ? (isInstalled ? '#22c55e15' : '#f59e0b15')
              : 'var(--color-surface-3)',
            border: `1.5px solid ${checkDone ? (isInstalled ? '#22c55e40' : '#f59e0b40') : 'var(--color-border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          }}>
            {!checkDone ? '⏳' : isInstalled ? '✅' : '⚠️'}
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 5px 0' }}>
              {!checkDone
                ? (lang === 'zh' ? '检测中...' : 'Detecting...')
                : isInstalled
                  ? (lang === 'zh' ? 'OpenClaw 已安装' : 'OpenClaw is Installed')
                  : (lang === 'zh' ? '未检测到 OpenClaw' : 'OpenClaw Not Detected')}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.6 }}>
              {isInstalled
                ? (lang === 'zh'
                  ? '配置文件已成功加载，OpenClaw 已在本机正确安装并运行'
                  : 'Config file loaded successfully — OpenClaw is installed and running on this machine')
                : (lang === 'zh'
                  ? '未能加载到本地配置，可能未安装 OpenClaw，请参照下方安装指南'
                  : 'Could not load local config — OpenClaw may not be installed. Follow the guide below.')}
            </p>
          </div>

          <div style={{
            padding: '8px 14px', borderRadius: 9,
            background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            fontSize: 13, color: 'var(--color-text-secondary)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 18 }}>{guide.icon}</span>
            <span>
              {lang === 'zh' ? '检测系统：' : 'Detected OS: '}
              <strong>{guide.name}</strong>
              {guessOs !== os && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}> (override)</span>}
            </span>
          </div>
        </div>
      </SectionCard>

      {/* OS selector */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
          {lang === 'zh' ? '切换系统：' : 'Switch OS:'}
        </span>
        {OS_LIST.map(o => {
          const g = getGuide(o, lang);
          return (
            <button
              key={o}
              onClick={() => setOs(o)}
              style={{
                padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                background: os === o ? 'linear-gradient(135deg,#7c3aed20,#2563eb20)' : 'var(--color-surface-2)',
                color: os === o ? '#7c3aed' : 'var(--color-text-muted)',
                border: `1px solid ${os === o ? '#7c3aed50' : 'var(--color-border)'}`,
              }}
            >
              {g.icon} {g.name}
            </button>
          );
        })}
      </div>

      {/* Install guide */}
      <div style={{ marginTop: 20 }}>
        <SectionCard>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 18px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{guide.icon}</span>
            {lang === 'zh' ? `${guide.name} 安装指南` : `${guide.name} Install Guide`}
          </h3>

          <StepGroup
            title={lang === 'zh' ? '前置条件' : 'Prerequisites'}
            steps={guide.prereqs}
            icon="📦"
            lang={lang}
          />
          <StepGroup
            title={lang === 'zh' ? '安装 OpenClaw' : 'Install OpenClaw'}
            steps={guide.install}
            icon="🚀"
            lang={lang}
          />
          <StepGroup
            title={lang === 'zh' ? '验证与初始化' : 'Verify & Initialize'}
            steps={guide.verify}
            icon="✅"
            lang={lang}
          />
        </SectionCard>
      </div>

      {/* Quick start after install */}
      <div style={{ marginTop: 16 }}>
        <SectionCard>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 12px 0' }}>
            🏃 {lang === 'zh' ? '安装后快速启动' : 'Quick Start After Install'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: lang === 'zh' ? '启动 Gateway' : 'Start Gateway', cmd: 'openclaw gateway run' },
              { label: lang === 'zh' ? '查看状态' : 'Check Status', cmd: 'openclaw channels status' },
              { label: lang === 'zh' ? '运行医生诊断' : 'Run Doctor', cmd: 'openclaw doctor' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--color-surface-2)', borderRadius: 8, padding: '10px 14px',
                border: '1px solid var(--color-border)',
              }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600, whiteSpace: 'nowrap', minWidth: 120 }}>
                  {item.label}
                </span>
                <div style={{ flex: 1 }}>
                  <CodeBlock code={item.cmd} lang={lang} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Links */}
      <div style={{
        marginTop: 16, padding: '14px 18px', borderRadius: 10,
        background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
        display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {lang === 'zh' ? '更多资源：' : 'Resources:'}
        </span>
        {[
          { label: lang === 'zh' ? '官方文档' : 'Docs', url: 'https://docs.openclaw.ai' },
          { label: lang === 'zh' ? '发布页面' : 'Releases', url: 'https://openclaw.ai/install' },
          { label: 'npm', url: 'https://www.npmjs.com/package/openclaw' },
          { label: 'GitHub', url: 'https://github.com/openclaw/openclaw' },
        ].map(link => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12, fontWeight: 600, color: '#7c3aed', textDecoration: 'none',
              padding: '3px 10px', borderRadius: 6, background: '#7c3aed10', border: '1px solid #7c3aed30',
              transition: 'all 0.12s',
            }}
          >
            {link.label} ↗
          </a>
        ))}
      </div>
    </div>
  );
}

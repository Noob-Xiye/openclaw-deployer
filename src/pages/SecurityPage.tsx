import { useState, useCallback } from 'react';
import { useAppStore } from '../store';
import { OpenClawConfig, SecurityFinding, SecurityScanResult, SecuritySeverity } from '../types';
import { PageHeader, SectionCard, Badge } from '../components/ui';

// ---- Severity styling ----
const SEV_CONFIG: Record<SecuritySeverity, { label: Record<string, string>; color: string; bg: string; icon: string }> = {
  critical: { label: { zh: '严重', en: 'Critical' }, color: '#ef4444', bg: '#ef444415', icon: '🔴' },
  high:     { label: { zh: '高危', en: 'High' }, color: '#f97316', bg: '#f9731615', icon: '🟠' },
  warning:  { label: { zh: '警告', en: 'Warning' }, color: '#f59e0b', bg: '#f59e0b15', icon: '🟡' },
  info:     { label: { zh: '提示', en: 'Info' }, color: '#3b82f6', bg: '#3b82f615', icon: '🔵' },
  ok:       { label: { zh: '通过', en: 'OK' }, color: '#22c55e', bg: '#22c55e15', icon: '✅' },
};

// ---- Security check engine ----
function runSecurityScan(config: OpenClawConfig | null): SecurityScanResult {
  const findings: SecurityFinding[] = [];
  const now = Date.now();

  if (!config) {
    findings.push({
      id: 'no-config',
      severity: 'warning',
      category: 'config',
      title: '未加载配置文件',
      description: '无法分析安全状态，请先加载 openclaw.json',
      recommendation: '在仪表盘页面加载配置文件',
    });
    return { scannedAt: now, score: 0, findings };
  }

  // ── AUTH checks ────────────────────────────────────────────────────────────
  const authMode = config.gateway?.auth?.mode;
  const authToken = config.gateway?.auth?.token;

  if (!authMode || authMode === 'none') {
    findings.push({
      id: 'auth-none',
      severity: 'critical',
      category: 'auth',
      title: '网关认证已禁用',
      description: 'Gateway 未配置认证，任何能访问端口的人都可连接并操控 AI 智能体',
      recommendation: '在 Gateway 设置中启用 token 或 password 认证模式',
      configPath: 'gateway.auth.mode',
    });
  } else if (authMode === 'token') {
    if (!authToken) {
      findings.push({
        id: 'auth-empty-token',
        severity: 'critical',
        category: 'auth',
        title: '认证令牌为空',
        description: '认证模式设置为 token，但未配置令牌值',
        recommendation: '在 gateway.auth.token 中设置强随机令牌（建议 32+ 位）',
        configPath: 'gateway.auth.token',
      });
    } else if (authToken.length < 16) {
      findings.push({
        id: 'auth-weak-token',
        severity: 'high',
        category: 'auth',
        title: '认证令牌过短',
        description: `当前令牌仅 ${authToken.length} 位，容易被暴力破解`,
        recommendation: '使用至少 32 位的随机令牌，推荐通过 openssl rand -hex 32 生成',
        configPath: 'gateway.auth.token',
      });
    } else {
      findings.push({
        id: 'auth-token-ok',
        severity: 'ok',
        category: 'auth',
        title: 'Token 认证已配置',
        description: '网关使用 token 认证，长度符合要求',
        recommendation: '',
      });
    }
  }

  // ── NETWORK checks ────────────────────────────────────────────────────────
  const bind = config.gateway?.bind;
  const port = config.gateway?.port ?? 18789;

  if (bind === '0.0.0.0' || bind === '::') {
    findings.push({
      id: 'network-exposed',
      severity: 'high',
      category: 'network',
      title: '网关绑定到所有网络接口',
      description: `bind="${bind}" 使 Gateway 暴露在所有网络接口上，局域网内任何设备都可访问`,
      recommendation: '如非必要，改为 bind=127.0.0.1（仅本机访问）；若需局域网访问，确保配置了强认证',
      configPath: 'gateway.bind',
    });
  } else {
    findings.push({
      id: 'network-loopback',
      severity: 'ok',
      category: 'network',
      title: '网关绑定到回环地址',
      description: `bind="${bind ?? '127.0.0.1'}"，Gateway 仅本地可访问`,
      recommendation: '',
    });
  }

  // ── TLS check ────────────────────────────────────────────────────────────
  const tlsEnabled = config.gateway?.tls?.enabled;
  const tailscaleMode = config.gateway?.tailscale?.mode;
  const isNetworkExposed = bind === '0.0.0.0' || bind === '::';

  if (isNetworkExposed && !tlsEnabled && tailscaleMode === 'off') {
    findings.push({
      id: 'tls-missing',
      severity: 'high',
      category: 'tls',
      title: '网络暴露但未启用 TLS',
      description: 'Gateway 暴露在网络上，但未配置 TLS 加密，通信内容可能被监听',
      recommendation: '启用 TLS（gateway.tls）或使用 Tailscale Funnel/Serve 进行加密通道访问',
      configPath: 'gateway.tls.enabled',
    });
  }

  // ── SECRETS in plaintext ──────────────────────────────────────────────────
  const secretsInPlaintext: string[] = [];

  // Check channel secrets
  if (config.channels?.feishu?.appSecret && !config.channels.feishu.appSecret.startsWith('$')) {
    secretsInPlaintext.push('channels.feishu.appSecret');
  }
  if (config.channels?.telegram?.botToken && !config.channels.telegram.botToken.startsWith('$')) {
    secretsInPlaintext.push('channels.telegram.botToken');
  }
  if (config.channels?.discord?.botToken && !config.channels.discord.botToken.startsWith('$')) {
    secretsInPlaintext.push('channels.discord.botToken');
  }

  // Check model provider API keys
  if (config.models?.providers) {
    for (const [provider, cfg] of Object.entries(config.models.providers)) {
      if (cfg.apiKey && !String(cfg.apiKey).startsWith('$')) {
        secretsInPlaintext.push(`models.providers.${provider}.apiKey`);
      }
    }
  }

  if (secretsInPlaintext.length > 0) {
    findings.push({
      id: 'secrets-plaintext',
      severity: secretsInPlaintext.length >= 3 ? 'high' : 'warning',
      category: 'secrets',
      title: `${secretsInPlaintext.length} 处密钥以明文存储`,
      description: `以下字段包含明文密钥：${secretsInPlaintext.join('、')}`,
      recommendation: '使用环境变量替代明文密钥，格式如 "$FEISHU_APP_SECRET"，并在 env 或系统环境中设置实际值',
      configPath: secretsInPlaintext[0],
    });
  } else {
    findings.push({
      id: 'secrets-ok',
      severity: 'ok',
      category: 'secrets',
      title: '未检测到明文密钥',
      description: '配置中的密钥均使用环境变量引用',
      recommendation: '',
    });
  }

  // ── ACCESS CONTROL checks ────────────────────────────────────────────────
  const feishuDmPolicy = config.channels?.feishu?.dmPolicy;
  const tgDmPolicy = config.channels?.telegram?.dmPolicy;

  if (feishuDmPolicy === 'open' || tgDmPolicy === 'open') {
    findings.push({
      id: 'access-open-channel',
      severity: 'warning',
      category: 'access',
      title: '消息渠道设置为开放策略',
      description: '飞书或 Telegram 的私信策略为 open，任何人都可向智能体发送消息',
      recommendation: '建议将 dmPolicy 设为 pairing 或 allowlist，限制可与智能体交互的用户',
      configPath: 'channels.*.dmPolicy',
    });
  }

  // ── CONTROL UI exposed ───────────────────────────────────────────────────
  const disabledDeviceAuth = config.gateway?.controlUi?.dangerouslyDisableDeviceAuth;
  if (disabledDeviceAuth) {
    findings.push({
      id: 'control-ui-no-auth',
      severity: 'high',
      category: 'access',
      title: '控制界面设备认证已禁用',
      description: 'dangerouslyDisableDeviceAuth=true 使控制 UI 无需设备配对即可访问',
      recommendation: '生产环境应删除此配置项，恢复设备认证保护',
      configPath: 'gateway.controlUi.dangerouslyDisableDeviceAuth',
    });
  }

  // ── Score calculation ────────────────────────────────────────────────────
  const penaltyMap: Record<SecuritySeverity, number> = {
    critical: 30, high: 15, warning: 5, info: 0, ok: 0,
  };
  const totalPenalty = findings
    .filter(f => f.severity !== 'ok')
    .reduce((acc, f) => acc + penaltyMap[f.severity], 0);
  const score = Math.max(0, 100 - totalPenalty);

  return { scannedAt: now, score, findings };
}

// ── Score ring ────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const dash = circ * (score / 100);

  return (
    <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-border)" strokeWidth={8} />
      <circle
        cx="50" cy="50" r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text
        x="50" y="54"
        textAnchor="middle"
        style={{ transform: 'rotate(90deg)', transformOrigin: '50px 50px', fill: color, fontSize: 20, fontWeight: 800 }}
      >
        {score}
      </text>
    </svg>
  );
}

export function SecurityPage() {
  const { config, language } = useAppStore();
  const lang = language as 'zh' | 'en';
  const [result, setResult] = useState<SecurityScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const runScan = useCallback(() => {
    setScanning(true);
    setTimeout(() => {
      const r = runSecurityScan(config);
      setResult(r);
      setScanning(false);
    }, 800); // simulate async
  }, [config]);

  const sevOrder: SecuritySeverity[] = ['critical', 'high', 'warning', 'info', 'ok'];
  const sorted = result
    ? [...result.findings].sort((a, b) => sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity))
    : [];

  const issueCount = sorted.filter(f => f.severity !== 'ok').length;
  const okCount = sorted.filter(f => f.severity === 'ok').length;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 860, margin: '0 auto' }}>
      <PageHeader
        title={lang === 'zh' ? '安全分析' : 'Security Analysis'}
        subtitle={lang === 'zh' ? '扫描配置中的安全风险，检测潜在入侵风险与不安全设置' : 'Scan for security risks in config, detect insecure settings and potential threats'}
      />

      {/* Scan button & summary */}
      <SectionCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 6px 0' }}>
              {lang === 'zh' ? '配置安全扫描' : 'Config Security Scan'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.6 }}>
              {lang === 'zh'
                ? '分析当前 openclaw.json 配置文件，检测认证、网络暴露、明文密钥、访问控制等安全问题'
                : 'Analyze current openclaw.json for auth weaknesses, network exposure, plaintext secrets, and access control issues'}
            </p>
            {result && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>
                {lang === 'zh' ? '上次扫描：' : 'Last scan: '}
                {new Date(result.scannedAt).toLocaleString()}
                {'  ·  '}
                <span style={{ color: issueCount > 0 ? '#f59e0b' : '#22c55e' }}>
                  {issueCount} {lang === 'zh' ? '项问题' : 'issue(s)'}
                </span>
                {', '}
                <span style={{ color: '#22c55e' }}>
                  {okCount} {lang === 'zh' ? '项通过' : 'passed'}
                </span>
              </div>
            )}
          </div>

          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <ScoreRing score={result.score} />
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                {lang === 'zh' ? '安全评分' : 'Security Score'}
              </span>
            </div>
          )}

          <button
            onClick={runScan}
            disabled={scanning}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 22px', borderRadius: 9, fontSize: 13, fontWeight: 700,
              cursor: scanning ? 'not-allowed' : 'pointer',
              background: scanning ? 'var(--color-surface-3)' : 'linear-gradient(135deg,#7c3aed,#2563eb)',
              color: scanning ? 'var(--color-text-muted)' : '#fff',
              border: 'none', fontFamily: 'inherit', flexShrink: 0,
              opacity: scanning ? 0.7 : 1, transition: 'all 0.15s',
            }}
          >
            {scanning ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                  <path strokeLinecap="round" d="M4 12a8 8 0 018-8V4" />
                </svg>
                {lang === 'zh' ? '扫描中...' : 'Scanning...'}
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {result ? (lang === 'zh' ? '重新扫描' : 'Rescan') : (lang === 'zh' ? '开始扫描' : 'Start Scan')}
              </>
            )}
          </button>
        </div>
      </SectionCard>

      {/* Findings */}
      {result && sorted.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {lang === 'zh' ? '扫描结果' : 'Findings'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map(f => {
              const sev = SEV_CONFIG[f.severity];
              const isOpen = expandedId === f.id;
              return (
                <div
                  key={f.id}
                  style={{
                    background: sev.bg,
                    border: `1px solid ${sev.color}30`,
                    borderRadius: 10,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => setExpandedId(isOpen ? null : f.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', background: 'transparent', border: 'none',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{sev.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>{f.title}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                          background: `${sev.color}20`, color: sev.color, letterSpacing: '0.04em',
                        }}>
                          {sev.label[lang]}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', background: 'var(--color-surface-2)', padding: '1px 7px', borderRadius: 99 }}>
                          {f.category}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '3px 0 0 0' }}>{f.description}</p>
                    </div>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      style={{ flexShrink: 0, color: 'var(--color-text-muted)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && f.severity !== 'ok' && (
                    <div style={{ padding: '0 16px 14px 44px' }}>
                      <div style={{
                        background: 'var(--color-surface-2)', borderRadius: 8, padding: '10px 14px',
                        border: '1px solid var(--color-border)',
                      }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', margin: '0 0 5px 0' }}>
                          {lang === 'zh' ? '🔧 修复建议' : '🔧 Recommendation'}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.6 }}>
                          {f.recommendation}
                        </p>
                        {f.configPath && (
                          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '6px 0 0 0', fontFamily: 'monospace' }}>
                            {lang === 'zh' ? '配置路径：' : 'Config path: '}
                            <code style={{ background: 'var(--color-surface-3)', padding: '1px 5px', borderRadius: 4 }}>
                              {f.configPath}
                            </code>
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Intrusion detection info */}
      <div style={{ marginTop: 20 }}>
        <SectionCard>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🛡️</span>
            {lang === 'zh' ? '入侵防护建议' : 'Intrusion Protection Recommendations'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              {
                title: lang === 'zh' ? '限制访问来源' : 'Restrict Access Sources',
                desc: lang === 'zh' ? '通过 channels.*.allowFrom 配置白名单，只允许可信用户 ID 与智能体交互' : 'Use channels.*.allowFrom to whitelist trusted user IDs',
              },
              {
                title: lang === 'zh' ? '定期轮换令牌' : 'Rotate Tokens Regularly',
                desc: lang === 'zh' ? '定期更换 gateway.auth.token，防止令牌泄露后被长期滥用' : 'Rotate gateway.auth.token periodically to limit exposure from leaks',
              },
              {
                title: lang === 'zh' ? '使用 Tailscale 替代公网暴露' : 'Use Tailscale Instead of Public Exposure',
                desc: lang === 'zh' ? '通过 Tailscale Serve 方式访问远程 Gateway，避免直接暴露端口' : 'Use Tailscale Serve to access remote Gateway without exposing ports',
              },
              {
                title: lang === 'zh' ? '监控 Gateway 日志' : 'Monitor Gateway Logs',
                desc: lang === 'zh' ? '定期检查 ~/.openclaw/logs/ 中的日志，查找异常连接或认证失败记录' : 'Regularly check ~/.openclaw/logs/ for suspicious connections or auth failures',
              },
              {
                title: lang === 'zh' ? '启用沙箱模式' : 'Enable Sandbox Mode',
                desc: lang === 'zh' ? '将 agents.defaults.sandbox.mode 设置为 non-main 或 all，限制 AI 执行危险命令' : 'Set agents.defaults.sandbox.mode to non-main or all to limit dangerous command execution',
              },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, padding: '10px 14px',
                background: 'var(--color-surface-2)', borderRadius: 8, border: '1px solid var(--color-border)',
              }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
                  {['🔒', '🔄', '🌐', '📋', '📦'][i]}
                </span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 3px 0' }}>{item.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.6 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

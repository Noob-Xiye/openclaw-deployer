import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { PageHeader, SectionCard, FormField, Toggle, SaveBar, InfoBox } from '../components/ui';
import { GatewayConfig } from '../types';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function GatewaySettings() {
  const { config, saveConfig, saveStatus, t } = useAppStore();
  const gt = t.gateway;

  const [local, setLocal] = useState<GatewayConfig>({});

  useEffect(() => {
    if (config?.gateway) {
      setLocal(deepClone(config.gateway));
    } else {
      setLocal({ port: 18789, bind: '127.0.0.1', reload: { mode: 'hybrid' } });
    }
  }, [config?.gateway]);

  const handleSave = () => {
    // If no config exists yet, create a new one with gateway settings
    if (!config) {
      saveConfig({
        gateway: local,
        agents: { defaults: { model: { primary: 'qclaw/modelroute' }, heartbeat: true, every: '30m' }, list: [] },
        channels: {},
        tools: {},
        skills: {},
      } as any);
      return;
    }
    saveConfig({ ...config, gateway: local });
  };

  const upd = (patch: Partial<GatewayConfig>) => setLocal(p => ({ ...p, ...patch }));

  return (
    <div className="page-content animate-fade-in">
      <PageHeader
        title={gt.title}
        subtitle={gt.subtitle}
        icon={
          <svg width="18" height="18" fill="none" stroke="#A78BFA" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
          </svg>
        }
      />

      <InfoBox type="info" title="什么是 Gateway？" collapsible defaultCollapsed>
        Gateway 是 OpenClaw 的核心服务进程，负责接收消息、调度智能体、管理会话。
        配置完成后，通过命令 <code style={{ fontFamily: 'monospace', background: 'rgba(59,130,246,0.12)', padding: '1px 5px', borderRadius: 3 }}>openclaw gateway run</code> 启动，
        或打开 OpenClaw 桌面应用（自动启动 Gateway）。修改配置后，热更新模式会自动生效，无需手动重启。
      </InfoBox>

      {/* Server */}
      <SectionCard title={gt.server}>
        <div className="form-row">
          <FormField label={gt.port} hint="Gateway 监听端口，默认 18789。修改后须更新连接地址" tooltip="建议保持默认值 18789。若端口被占用，可改为 18790 等，连接时需同步修改。端口范围 1024-65535">
            <input
              type="number"
              className="input"
              value={local.port || 18789}
              onChange={e => upd({ port: parseInt(e.target.value) || 18789 })}
            />
          </FormField>
          <FormField label={gt.bind} hint="127.0.0.1 = 仅本机；0.0.0.0 = 允许局域网" tooltip="安全建议：保持 127.0.0.1（本机访问）。若需从手机或其他设备访问，可改为 0.0.0.0，务必同时设置 Token 认证">
            <input
              type="text"
              className="input input-mono"
              value={local.bind || '127.0.0.1'}
              onChange={e => upd({ bind: e.target.value })}
              placeholder="127.0.0.1"
            />
          </FormField>
        </div>
      </SectionCard>

      {/* Auth */}
      <SectionCard title={gt.auth} subtitle="控制谁可以连接到 Gateway">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormField label={gt.authMode} tooltip="token = 使用固定 Bearer 令牌（推荐，简单安全）；password = 使用用户名+密码（兼容 HTTP 基本认证）">
            <select
              className="select"
              value={local.auth?.mode || 'token'}
              onChange={e => upd({ auth: { ...local.auth, mode: e.target.value as 'token' | 'password' } })}
            >
              <option value="token">{gt.authModeOptions.token}</option>
              <option value="password">{gt.authModeOptions.password}</option>
            </select>
          </FormField>
          {local.auth?.mode === 'token' && (
            <FormField label={gt.token} hint="客户端连接时须提供此令牌。推荐通过环境变量 OPENCLAW_GATEWAY_TOKEN 存储" tooltip="留空表示无认证（仅限本机访问时可接受）。远程访问请务必设置强令牌">
              <input
                type="password"
                className="input input-mono"
                value={local.auth?.token || ''}
                onChange={e => upd({ auth: { ...local.auth, mode: 'token', token: e.target.value } })}
                placeholder="your-secret-token"
              />
            </FormField>
          )}
          {local.auth?.mode === 'password' && (
            <FormField label={gt.password} hint="使用用户名/密码进行认证，适合与 HTTP 代理配合使用">
              <input
                type="password"
                className="input"
                value={(local.auth as any)?.password || ''}
                onChange={e => upd({ auth: { ...local.auth, mode: 'password', password: e.target.value } })}
              />
            </FormField>
          )}
        </div>
      </SectionCard>

      {/* Reload */}
      <SectionCard title={gt.reload}>
        <div className="form-row">
          <FormField label={gt.reloadMode}>
            <select
              className="select"
              value={local.reload?.mode || 'hybrid'}
              onChange={e => upd({ reload: { ...local.reload, mode: e.target.value as any } })}
            >
              <option value="hybrid">{gt.reloadModeOptions.hybrid}</option>
              <option value="hot">{gt.reloadModeOptions.hot}</option>
              <option value="restart">{gt.reloadModeOptions.restart}</option>
              <option value="off">{gt.reloadModeOptions.off}</option>
            </select>
          </FormField>
          <FormField label={gt.debounceMs} hint="文件变更后延迟多少毫秒再触发重载（默认 500ms），避免连续写入多次触发">
            <input
              type="number"
              className="input"
              value={local.reload?.debounceMs || 500}
              onChange={e => upd({ reload: { ...local.reload, mode: local.reload?.mode || 'hybrid', debounceMs: parseInt(e.target.value) } })}
              placeholder="500"
            />
          </FormField>
        </div>
        {/* Mode description */}
        <div style={{
          marginTop: 12, padding: '10px 14px',
          background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: 8, fontSize: 12, color: '#93C5FD',
        }}>
          {local.reload?.mode === 'hybrid' && '✦ 混合模式：安全改动即时生效，关键改动自动重启（推荐）'}
          {local.reload?.mode === 'hot' && '✦ 热更新：只热更新安全改动，需手动重启关键改动'}
          {local.reload?.mode === 'restart' && '✦ 重启模式：任何改动都触发完整重启'}
          {local.reload?.mode === 'off' && '✦ 关闭监听：所有改动需手动重启 Gateway'}
        </div>
      </SectionCard>

      {/* Tailscale */}
      <SectionCard title={gt.tailscale} subtitle="通过 Tailscale 安全地将 Gateway 暴露到私有网络或互联网">
        <div className="form-row">
          <FormField label={gt.tailscaleMode} tooltip="off = 不使用；serve = 在私有 Tailnet 中共享（仅 Tailscale 用户可访问）；funnel = 公开暴露到互联网（需 Tailscale Funnel 权限）">
            <select
              className="select"
              value={local.tailscale?.mode || 'off'}
              onChange={e => upd({ tailscale: { ...local.tailscale, mode: e.target.value as any } })}
            >
              <option value="off">{gt.tailscaleModeOptions.off}</option>
              <option value="serve">{gt.tailscaleModeOptions.serve}</option>
              <option value="funnel">{gt.tailscaleModeOptions.funnel}</option>
            </select>
          </FormField>
          {local.tailscale?.mode !== 'off' && (
            <FormField label={gt.resetOnExit} hint="退出时自动清理 Tailscale 路由，避免遗留悬挂路由">
              <Toggle
                checked={local.tailscale?.resetOnExit || false}
                onChange={v => upd({ tailscale: { ...local.tailscale, mode: local.tailscale?.mode || 'serve', resetOnExit: v } })}
                label={gt.resetOnExit}
              />
            </FormField>
          )}
        </div>
        {local.tailscale?.mode && local.tailscale.mode !== 'off' && (
          <InfoBox type="info">
            {local.tailscale.mode === 'serve'
              ? '🔒 Serve 模式：Gateway 仅在你的 Tailscale 私有网络中可访问，需要设备加入同一 Tailnet'
              : '🌐 Funnel 模式：Gateway 将通过 Tailscale 的公共 HTTPS 地址暴露到互联网，需在 Tailscale 管理面板开启 Funnel 权限'}
          </InfoBox>
        )}
      </SectionCard>

      <SaveBar onSave={handleSave} saving={saveStatus === 'saving'} />
    </div>
  );
}

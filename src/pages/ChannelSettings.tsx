import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { PageHeader, SectionCard, FormField, Toggle, SaveBar, Badge, InfoBox } from '../components/ui';
import { ChannelsConfig, FeishuChannelConfig, TelegramChannelConfig, DiscordChannelConfig } from '../types';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

const CHANNEL_META = [
  {
    key: 'feishu',
    name: '飞书',
    nameEn: 'Feishu / Lark',
    icon: '🪶',
    color: '#00D6B2',
    desc: '企业级即时通讯，支持 Bot 消息',
    descEn: 'Enterprise IM with Bot support',
  },
  {
    key: 'telegram',
    name: 'Telegram',
    nameEn: 'Telegram',
    icon: '✈️',
    color: '#2AABEE',
    desc: '全球化 Bot 平台',
    descEn: 'Global Bot platform',
  },
  {
    key: 'discord',
    name: 'Discord',
    nameEn: 'Discord',
    icon: '🎮',
    color: '#5865F2',
    desc: '社区型即时通讯',
    descEn: 'Community-based IM',
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    nameEn: 'WhatsApp',
    icon: '💬',
    color: '#25D366',
    desc: '国际化即时通讯',
    descEn: 'International messaging',
  },
];

export function ChannelSettings() {
  const { config, saveConfig, saveStatus, t, language } = useAppStore();
  const ct = t.channels;

  const [local, setLocal] = useState<ChannelsConfig>({});

  useEffect(() => {
    if (config?.channels) {
      setLocal(deepClone(config.channels));
    } else {
      setLocal({});
    }
  }, [config?.channels]);

  const handleSave = () => {
    if (!config) return;
    saveConfig({ ...config, channels: local });
  };

  const policyOptions = [
    { value: 'allow-all', label: ct.policyAllowAll },
    { value: 'deny-all', label: ct.policyDenyAll },
    { value: 'allow-listed', label: ct.policyAllowListed },
    { value: 'deny-listed', label: ct.policyDenyListed },
  ];

  return (
    <div className="page-content animate-fade-in">
      <PageHeader
        title={ct.title}
        subtitle={ct.subtitle}
        icon={
          <svg width="18" height="18" fill="none" stroke="#34D399" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        }
      />

      {/* Feishu */}
      <SectionCard
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🪶</span>
            <span>{language === 'zh' ? '飞书 / Lark' : 'Feishu / Lark'}</span>
            <Badge variant={local.feishu?.enabled ? 'success' : 'gray'}>
              {local.feishu?.enabled ? ct.enabled : ct.disabled}
            </Badge>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Toggle
            checked={local.feishu?.enabled || false}
            onChange={v => setLocal(p => ({ ...p, feishu: { ...p.feishu, enabled: v } }))}
            label={ct.enableChannel}
          />
          {local.feishu?.enabled && (
            <>
              <InfoBox type="tip" title="飞书 Bot 配置步骤" collapsible defaultCollapsed>
                <ol style={{ margin: '4px 0 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <li>访问 <a href="https://open.feishu.cn" target="_blank" rel="noreferrer" style={{ color: '#60A5FA' }}>open.feishu.cn</a> → 创建企业自建应用</li>
                  <li>在"凭证与基础信息"页获取 <strong>App ID</strong>（格式：<code style={{ fontFamily: 'monospace', fontSize: 10 }}>cli_xxxxxxxxxx</code>）和 <strong>App Secret</strong></li>
                  <li>开启"机器人"能力，配置消息事件订阅，填写 Gateway 的 Webhook 回调地址</li>
                  <li>将 App Secret 存入环境变量而非明文填入（见下方提示）</li>
                </ol>
              </InfoBox>
              <div className="form-row">
                <FormField label="App ID" tooltip="从飞书开放平台 → 我的应用 → 凭证与基础信息获取，格式：cli_xxxxxxxxxx" required>
                  <input
                    className="input input-mono"
                    value={(local.feishu as FeishuChannelConfig)?.appId || ''}
                    onChange={e => setLocal(p => ({ ...p, feishu: { ...p.feishu, appId: e.target.value } as FeishuChannelConfig }))}
                    placeholder="cli_xxxxxxxxxx"
                  />
                </FormField>
                <FormField label="App Secret" hint={ct.secretHint} required>
                  <input
                    type="password"
                    className="input input-mono"
                    value={(local.feishu as FeishuChannelConfig)?.appSecret || ''}
                    onChange={e => setLocal(p => ({ ...p, feishu: { ...p.feishu, appSecret: e.target.value } as FeishuChannelConfig }))}
                    placeholder="••••••••••••••••"
                  />
                </FormField>
              </div>
              <EnvHint varName="OPENCLAW_FEISHU_APP_SECRET" />
              <div className="form-row">
                <FormField label={ct.dmPolicy} hint={ct.dmPolicyHint} tooltip="allow-all = 接受所有私信；deny-all = 拒绝所有私信；allow-listed = 仅白名单用户；deny-listed = 拒绝黑名单用户">
                  <select
                    className="select"
                    value={(local.feishu as FeishuChannelConfig)?.dmPolicy || 'allow-all'}
                    onChange={e => setLocal(p => ({ ...p, feishu: { ...p.feishu, dmPolicy: e.target.value as any } as FeishuChannelConfig }))}
                  >
                    {policyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </FormField>
                <FormField label={ct.groupPolicy} hint={ct.groupPolicyHint}>
                  <select
                    className="select"
                    value={(local.feishu as FeishuChannelConfig)?.groupPolicy || 'deny-all'}
                    onChange={e => setLocal(p => ({ ...p, feishu: { ...p.feishu, groupPolicy: e.target.value as any } as FeishuChannelConfig }))}
                  >
                    {policyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </FormField>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {/* Telegram */}
      <SectionCard
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>✈️</span>
            <span>Telegram</span>
            <Badge variant={local.telegram?.enabled ? 'success' : 'gray'}>
              {local.telegram?.enabled ? ct.enabled : ct.disabled}
            </Badge>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Toggle
            checked={local.telegram?.enabled || false}
            onChange={v => setLocal(p => ({ ...p, telegram: { ...p.telegram, enabled: v } }))}
            label={ct.enableChannel}
          />
          {local.telegram?.enabled && (
            <>
              <InfoBox type="tip" title="Telegram Bot 配置步骤" collapsible defaultCollapsed>
                <ol style={{ margin: '4px 0 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <li>在 Telegram 中搜索 <strong>@BotFather</strong>，发送 <code style={{ fontFamily: 'monospace', fontSize: 10 }}>/newbot</code></li>
                  <li>按提示设置机器人名称和用户名，获取 <strong>Bot Token</strong>（格式：<code style={{ fontFamily: 'monospace', fontSize: 10 }}>1234567890:ABCdef...</code>）</li>
                  <li>将 Token 填入下方，或设置环境变量替代明文存储</li>
                </ol>
              </InfoBox>
              <FormField label="Bot Token" hint={ct.secretHint} tooltip="从 @BotFather 获取的 Bot Token，建议通过环境变量 OPENCLAW_TELEGRAM_BOT_TOKEN 设置" required>
                <input
                  type="password"
                  className="input input-mono"
                  value={(local.telegram as TelegramChannelConfig)?.botToken || ''}
                  onChange={e => setLocal(p => ({ ...p, telegram: { ...p.telegram, botToken: e.target.value } as TelegramChannelConfig }))}
                  placeholder="1234567890:ABCdefGHI..."
                />
              </FormField>
              <EnvHint varName="OPENCLAW_TELEGRAM_BOT_TOKEN" />
              <FormField label={ct.dmPolicy} tooltip="allow-all = 接受所有私信；deny-all = 拒绝所有私信；allow-listed = 仅白名单用户；deny-listed = 拒绝黑名单用户">
                <select
                  className="select"
                  value={(local.telegram as TelegramChannelConfig)?.dmPolicy || 'allow-all'}
                  onChange={e => setLocal(p => ({ ...p, telegram: { ...p.telegram, dmPolicy: e.target.value as any } as TelegramChannelConfig }))}
                >
                  {policyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </FormField>
            </>
          )}
        </div>
      </SectionCard>

      {/* Discord */}
      <SectionCard
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🎮</span>
            <span>Discord</span>
            <Badge variant={local.discord?.enabled ? 'success' : 'gray'}>
              {local.discord?.enabled ? ct.enabled : ct.disabled}
            </Badge>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Toggle
            checked={local.discord?.enabled || false}
            onChange={v => setLocal(p => ({ ...p, discord: { ...p.discord, enabled: v } }))}
            label={ct.enableChannel}
          />
          {local.discord?.enabled && (
            <>
              <InfoBox type="tip" title="Discord Bot 配置步骤" collapsible defaultCollapsed>
                <ol style={{ margin: '4px 0 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <li>访问 <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" style={{ color: '#60A5FA' }}>discord.com/developers</a> → New Application</li>
                  <li>进入 <strong>Bot</strong> 标签 → Reset Token 获取 Bot Token</li>
                  <li>开启 <strong>Message Content Intent</strong>（Privileged Gateway Intents 中，必须）</li>
                  <li>通过 OAuth2 URL Generator 生成邀请链接，将 Bot 加入服务器</li>
                </ol>
              </InfoBox>
              <FormField label="Bot Token" hint={ct.secretHint} tooltip="Discord 开发者后台 Bot 页面获取，建议通过环境变量 OPENCLAW_DISCORD_BOT_TOKEN 设置" required>
                <input
                  type="password"
                  className="input input-mono"
                  value={(local.discord as DiscordChannelConfig)?.botToken || ''}
                  onChange={e => setLocal(p => ({ ...p, discord: { ...p.discord, botToken: e.target.value } as DiscordChannelConfig }))}
                  placeholder="MTxxxxxx.Gyyyyy..."
                />
              </FormField>
              <EnvHint varName="OPENCLAW_DISCORD_BOT_TOKEN" />
              <FormField label={ct.dmPolicy} tooltip="allow-all = 接受所有私信；deny-all = 拒绝所有私信；allow-listed = 仅白名单用户；deny-listed = 拒绝黑名单用户">
                <select
                  className="select"
                  value={(local.discord as DiscordChannelConfig)?.dmPolicy || 'allow-all'}
                  onChange={e => setLocal(p => ({ ...p, discord: { ...p.discord, dmPolicy: e.target.value as any } as DiscordChannelConfig }))}
                >
                  {policyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </FormField>
            </>
          )}
        </div>
      </SectionCard>

      {/* WhatsApp */}
      <SectionCard
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>💬</span>
            <span>WhatsApp</span>
            <Badge variant={local.whatsapp?.enabled ? 'success' : 'gray'}>
              {local.whatsapp?.enabled ? ct.enabled : ct.disabled}
            </Badge>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Toggle
            checked={local.whatsapp?.enabled || false}
            onChange={v => setLocal(p => ({ ...p, whatsapp: { ...p.whatsapp, enabled: v } }))}
            label={ct.enableChannel}
          />
          {local.whatsapp?.enabled && (
            <InfoBox type="info" title="WhatsApp Business API 配置说明">
              <p style={{ margin: 0 }}>WhatsApp Business API 需要通过 Meta 官方审核。配置步骤：</p>
              <ol style={{ margin: '6px 0 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>在 <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" style={{ color: '#60A5FA' }}>Meta 开发者平台</a> 创建应用并申请 WhatsApp Business API 访问权限</li>
                <li>获取 Phone Number ID、Business Account ID 和 Access Token</li>
                <li>复杂配置项请通过左侧"原始配置"页面的 JSON 编辑器手动设置</li>
              </ol>
            </InfoBox>
          )}
        </div>
      </SectionCard>

      <SaveBar onSave={handleSave} saving={saveStatus === 'saving'} />
    </div>
  );
}

function EnvHint({ varName }: { varName: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '7px 12px',
      background: 'rgba(99,102,241,0.07)',
      border: '1px solid rgba(99,102,241,0.15)',
      borderRadius: 6,
      fontSize: 11, color: '#A5B4FC',
    }}>
      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>推荐使用环境变量 </span>
      <code style={{ fontFamily: 'var(--font-family-mono)', background: 'rgba(99,102,241,0.15)', padding: '1px 5px', borderRadius: 3 }}>
        {varName}
      </code>
      <span> 替代明文存储</span>
    </div>
  );
}

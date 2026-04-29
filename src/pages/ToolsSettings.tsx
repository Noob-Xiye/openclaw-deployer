import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { PageHeader, SectionCard, FormField, Toggle, SaveBar, Badge } from '../components/ui';
import { ToolsConfig } from '../types';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

const PROFILE_OPTIONS = [
  { value: 'full', label: 'Full — 全部工具', hint: '启用所有可用工具' },
  { value: 'coding', label: 'Coding — 编程', hint: '代码相关工具' },
  { value: 'messaging', label: 'Messaging — 通讯', hint: '消息处理工具' },
  { value: 'minimal', label: 'Minimal — 极简', hint: '最少工具集' },
];

const SEARCH_PROVIDERS = [
  { value: 'brave', label: 'Brave Search' },
  { value: 'perplexity', label: 'Perplexity' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'grok', label: 'Grok (xAI)' },
  { value: 'kimi', label: 'Kimi (月之暗面)' },
];

const BUILTIN_TOOLS = [
  { id: 'read_file', desc: '读取文件', category: 'file' },
  { id: 'write_file', desc: '写入文件', category: 'file' },
  { id: 'list_dir', desc: '列出目录', category: 'file' },
  { id: 'run_command', desc: '执行命令', category: 'shell' },
  { id: 'search_web', desc: '搜索网络', category: 'web' },
  { id: 'fetch_url', desc: '获取网页', category: 'web' },
  { id: 'browser_navigate', desc: '浏览器导航', category: 'browser' },
  { id: 'browser_screenshot', desc: '截图', category: 'browser' },
  { id: 'memory_search', desc: '搜索记忆', category: 'memory' },
  { id: 'memory_save', desc: '保存记忆', category: 'memory' },
  { id: 'canvas_write', desc: '写入画板', category: 'canvas' },
  { id: 'a2a_call', desc: 'Agent-to-Agent 调用', category: 'a2a' },
];

export function ToolsSettings() {
  const { config, saveConfig, saveStatus, t } = useAppStore();
  const tt = t.tools;

  const [local, setLocal] = useState<ToolsConfig>({});
  const [allowText, setAllowText] = useState('');
  const [denyText, setDenyText] = useState('');

  useEffect(() => {
    if (config?.tools) {
      setLocal(deepClone(config.tools));
      setAllowText((config.tools.allow || []).join('\n'));
      setDenyText((config.tools.deny || []).join('\n'));
    } else {
      setLocal({ profile: 'full' });
      setAllowText('');
      setDenyText('');
    }
  }, [config?.tools]);

  const handleSave = () => {
    if (!config) return;
    const finalLocal = {
      ...local,
      allow: allowText.split('\n').map(s => s.trim()).filter(Boolean),
      deny: denyText.split('\n').map(s => s.trim()).filter(Boolean),
    };
    saveConfig({ ...config, tools: finalLocal });
  };

  const currentProfile = local.profile || 'full';

  return (
    <div className="page-content animate-fade-in">
      <PageHeader
        title={tt.title}
        subtitle={tt.subtitle}
        icon={
          <svg width="18" height="18" fill="none" stroke="#FBBF24" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
      />

      {/* Profile */}
      <SectionCard title={tt.profile}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {PROFILE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setLocal(p => ({ ...p, profile: opt.value as any }))}
              style={{
                padding: '12px 14px', borderRadius: 9, textAlign: 'left',
                border: currentProfile === opt.value
                  ? '1.5px solid rgba(99,102,241,0.6)'
                  : '1px solid var(--color-border)',
                background: currentProfile === opt.value
                  ? 'rgba(99,102,241,0.1)'
                  : 'var(--color-surface-2)',
                cursor: 'pointer', transition: 'all 0.15s',
                boxShadow: currentProfile === opt.value ? '0 0 12px rgba(99,102,241,0.2)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  color: currentProfile === opt.value ? '#A5B4FC' : 'var(--color-text-primary)',
                }}>
                  {opt.label}
                </span>
                {currentProfile === opt.value && (
                  <svg width="14" height="14" fill="none" stroke="#A5B4FC" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <p style={{ margin: '3px 0 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>{opt.hint}</p>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Web Search */}
      <SectionCard title={tt.webSearch}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Toggle
            checked={local.web?.search?.enabled ?? false}
            onChange={v => setLocal(p => ({ ...p, web: { ...p.web, search: { ...p.web?.search, enabled: v } } }))}
            label={tt.searchEnabled}
          />
          <div className="form-row">
            <FormField label={tt.webSearchProvider}>
              <select
                className="select"
                value={local.web?.search?.provider || 'tavily'}
                onChange={e => setLocal(p => ({ ...p, web: { ...p.web, search: { ...p.web?.search, provider: e.target.value as any } } }))}
              >
                {SEARCH_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </FormField>
            <FormField label={tt.webSearchApiKey} hint={tt.webSearchApiKeyHint}>
              <input
                type="password"
                className="input input-mono"
                value={local.web?.search?.apiKey || ''}
                onChange={e => setLocal(p => ({ ...p, web: { ...p.web, search: { ...p.web?.search, apiKey: e.target.value } } }))}
                placeholder="tvly-..."
              />
            </FormField>
          </div>
        </div>
      </SectionCard>

      {/* Web Fetch */}
      <SectionCard title={tt.webFetch}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Toggle
            checked={local.web?.fetch?.enabled ?? false}
            onChange={v => setLocal(p => ({ ...p, web: { ...p.web, fetch: { ...p.web?.fetch, enabled: v } } }))}
            label={tt.webFetchEnabled}
          />
          {local.web?.fetch?.enabled && (
            <FormField label={tt.webFetchMaxChars} hint={tt.webFetchMaxCharsHint}>
              <input
                className="input"
                type="number"
                style={{ width: 160 }}
                value={local.web?.fetch?.maxChars ?? 50000}
                onChange={e => setLocal(p => ({ ...p, web: { ...p.web, fetch: { ...p.web?.fetch, enabled: p.web?.fetch?.enabled ?? true, maxChars: Number(e.target.value) } } }))}
                placeholder="50000"
              />
            </FormField>
          )}
        </div>
      </SectionCard>

      {/* Capabilities */}
      <SectionCard title={tt.capabilities}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            {
              key: 'browser', label: tt.browser, icon: '🌐',
              get: () => local.browser?.enabled,
              set: (v: boolean) => setLocal(p => ({ ...p, browser: { ...p.browser, enabled: v } })),
            },
            {
              key: 'canvas', label: tt.canvas, icon: '🖼️',
              get: () => local.canvas?.enabled,
              set: (v: boolean) => setLocal(p => ({ ...p, canvas: { ...p.canvas, enabled: v } })),
            },
            {
              key: 'a2a', label: tt.a2a, icon: '🔗',
              get: () => local.agentToAgent?.enabled,
              set: (v: boolean) => setLocal(p => ({ ...p, agentToAgent: { ...p.agentToAgent, enabled: v } })),
            },
          ].map(cap => (
            <div key={cap.key} style={{
              padding: '12px 14px', borderRadius: 9,
              background: cap.get() ? 'rgba(16,185,129,0.08)' : 'var(--color-surface-2)',
              border: `1px solid ${cap.get() ? 'rgba(16,185,129,0.25)' : 'var(--color-border)'}`,
              transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{cap.icon}</span>
                <Toggle checked={cap.get() || false} onChange={cap.set} label="" />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: cap.get() ? '#6EE7B7' : 'var(--color-text-secondary)' }}>
                {cap.label}
              </div>
            </div>
          ))}
          </div>
          <FormField label={tt.sessionsVisibility}>
            <select
              className="select"
              value={local.sessions?.visibility || 'all'}
              onChange={e => setLocal(p => ({ ...p, sessions: { ...p.sessions, visibility: e.target.value as any } }))}
            >
              <option value="all">{tt.sessionsVisibilityOptions.all}</option>
              <option value="owned">{tt.sessionsVisibilityOptions.owned}</option>
              <option value="none">{tt.sessionsVisibilityOptions.none}</option>
            </select>
          </FormField>
        </div>
      </SectionCard>
      <SectionCard title={tt.allowDeny}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: 'rgba(245,158,11,0.07)',
            border: '1px solid rgba(245,158,11,0.15)',
            fontSize: 12, color: '#FDE68A',
          }}>
            💡 {tt.allowDenyHint}
          </div>
          <div className="form-row">
            <FormField label={tt.allowList} hint={tt.allowListHint}>
              <textarea
                className="input input-mono"
                rows={6}
                value={allowText}
                onChange={e => setAllowText(e.target.value)}
                placeholder={`read_file\nwrite_file\n...`}
                style={{ resize: 'vertical', fontFamily: 'var(--font-family-mono)', fontSize: 12 }}
              />
            </FormField>
            <FormField label={tt.denyList} hint={tt.denyListHint}>
              <textarea
                className="input input-mono"
                rows={6}
                value={denyText}
                onChange={e => setDenyText(e.target.value)}
                placeholder={`run_command\nbrowser_navigate\n...`}
                style={{ resize: 'vertical', fontFamily: 'var(--font-family-mono)', fontSize: 12 }}
              />
            </FormField>
          </div>
          {/* Quick reference */}
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Built-in Tools Reference
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {BUILTIN_TOOLS.map(tool => (
                <code
                  key={tool.id}
                  title={tool.desc}
                  style={{
                    fontFamily: 'var(--font-family-mono)', fontSize: 10,
                    padding: '2px 7px', borderRadius: 4,
                    background: 'var(--color-surface-3)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)', cursor: 'default',
                  }}
                >
                  {tool.id}
                </code>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SaveBar onSave={handleSave} saving={saveStatus === 'saving'} />
    </div>
  );
}

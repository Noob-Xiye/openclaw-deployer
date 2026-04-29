import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import { PageHeader, SectionCard, FormField, Toggle, SaveBar, Badge, ConfirmModal, InfoBox } from '../components/ui';
import { AgentsConfig, Agent } from '../types';
import { gwRpc, GatewayModel, AgentFile, gatewayClient } from '../services/gatewayWs';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function generateId() {
  return 'agent-' + Math.random().toString(36).slice(2, 8);
}

export function AgentSettings() {
  const { config, saveConfig, saveStatus, t } = useAppStore();
  const at = t.agents;

  const [local, setLocal] = useState<AgentsConfig>({});
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingFiles, setEditingFiles] = useState<Agent | null>(null);
  const [showRelationships, setShowRelationships] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  // Gateway skill discovery — loaded once when connected
  const [gwSkillIds, setGwSkillIds] = useState<string[]>([]);
  const [gwState, setGwState] = useState(gatewayClient.state);
  useEffect(() => {
    const unsub = gatewayClient.onStateChange(s => setGwState(s));
    return unsub;
  }, []);
  useEffect(() => {
    if (gwState !== 'connected') return;
    gwRpc.skillsStatus().then(r => {
      if (r?.skills?.length) setGwSkillIds(r.skills.map((s: any) => s.id || s.name || '').filter(Boolean));
    }).catch(() => {});
  }, [gwState]);

  useEffect(() => {
    if (config?.agents) {
      setLocal(deepClone(config.agents));
    } else {
      setLocal({ defaults: { model: { primary: 'claude-opus-4-5' } } });
    }
  }, [config?.agents]);

  const handleSave = () => {
    if (!config) return;
    saveConfig({ ...config, agents: local });
  };

  const updDefaults = (patch: any) => setLocal(p => ({
    ...p,
    defaults: { ...p.defaults, ...patch },
  }));

  const handleAddAgent = () => {
    const newAgent: Agent = { id: generateId(), workspace: '' };
    setEditingAgent(newAgent);
  };

  const handleSaveAgent = (agent: Agent) => {
    setLocal(p => {
      const list = p.list || [];
      const idx = list.findIndex(a => a.id === agent.id);
      const newList = idx >= 0
        ? list.map(a => a.id === agent.id ? agent : a)
        : [...list, agent];
      return { ...p, list: newList };
    });
    setEditingAgent(null);
  };

  const handleDeleteAgent = (id: string) => {
    setLocal(p => ({ ...p, list: (p.list || []).filter(a => a.id !== id) }));
    setDeleteConfirm(null);
  };

  return (
    <div className="page-content animate-fade-in">
      <PageHeader
        title={at.title}
        subtitle={at.subtitle}
        icon={
          <svg width="18" height="18" fill="none" stroke="#A78BFA" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
      />

      <InfoBox type="info" title="智能体（Agent）说明" collapsible defaultCollapsed>
        OpenClaw 支持多个智能体并行工作。<strong>默认智能体（main）</strong>始终存在，处理日常消息。
        额外智能体可被主智能体调度，执行特定领域的专项任务。
        每个智能体有独立的工作区（文件读写根目录）、模型配置和技能集合。
        <br />
        配置说明：在"全局默认"中设置所有智能体的默认行为，在"智能体列表"中为子智能体单独覆盖配置。修改后点击页面底部"保存更改"生效。
      </InfoBox>

      {/* Defaults */}
      <SectionCard title={at.defaults}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-row">
            <FormField label={at.primaryModel} hint={at.primaryModelHint} tooltip="支持模型：claude-opus-4-5（最强）、claude-sonnet-4-5（平衡）、claude-haiku-4-5（快速）；OpenAI：gpt-4o、gpt-4o-mini；Gemini：gemini-2.0-flash" required>
              <input
                className="input input-mono"
                value={local.defaults?.model?.primary || ''}
                onChange={e => updDefaults({ model: { ...local.defaults?.model, primary: e.target.value } })}
                placeholder="claude-opus-4-5"
              />
            </FormField>
            <FormField label={at.subagentsModel} hint={at.subagentsModelHint} tooltip="子智能体默认使用的模型。留空则继承主模型。推荐使用轻量模型（如 claude-haiku-4-5）降低子任务成本">
              <input
                className="input input-mono"
                value={local.defaults?.subagents?.model || ''}
                onChange={e => updDefaults({ subagents: { model: e.target.value } })}
                placeholder="claude-haiku-4-5"
              />
            </FormField>
          </div>

          <FormField label={at.workspace} hint={at.workspaceHint} tooltip="智能体读写文件的根目录。留空使用 ~/.openclaw/workspace。多智能体场景建议各自使用独立目录">
            <input
              className="input input-mono"
              value={local.defaults?.workspace || ''}
              onChange={e => updDefaults({ workspace: e.target.value })}
              placeholder="~/.openclaw/workspace"
            />
          </FormField>
        </div>
      </SectionCard>

      {/* Heartbeat */}
      <SectionCard title={at.heartbeat}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Toggle
            checked={!!local.defaults?.heartbeat}
            onChange={v => updDefaults({
              heartbeat: v ? { every: '15m', target: 'main' } : undefined,
            })}
            label={`${at.heartbeat} ${local.defaults?.heartbeat ? '(enabled)' : '(disabled)'}`}
          />
          {local.defaults?.heartbeat && (
            <div className="form-row" style={{ marginTop: 8 }}>
              <FormField label={at.heartbeatEvery} hint={at.heartbeatEveryHint} tooltip="支持格式：15m（15分钟）、1h（1小时）、30s。推荐值 15m～60m，过短会增加 API Token 消耗">
                <input
                  className="input"
                  value={local.defaults.heartbeat.every}
                  onChange={e => updDefaults({ heartbeat: { ...local.defaults?.heartbeat, every: e.target.value } })}
                  placeholder="15m"
                />
              </FormField>
              <FormField label={at.heartbeatTarget}>
                <select
                  className="select"
                  value={local.defaults.heartbeat.target || 'main'}
                  onChange={e => updDefaults({ heartbeat: { ...local.defaults?.heartbeat, target: e.target.value } })}
                >
                  <option value="main">{at.heartbeatTargetOptions.main}</option>
                </select>
              </FormField>
            </div>
          )}
          {local.defaults?.heartbeat && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.2)',
              fontSize: 12, color: '#FCD34D',
            }}>
              ⚡ 心跳会在主 session 中定期运行，检查待处理事项。无需关注时回复 <code style={{ fontFamily: 'var(--font-family-mono)', background: 'rgba(245,158,11,0.1)', padding: '1px 4px', borderRadius: 3 }}>HEARTBEAT_OK</code>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Sandbox */}
      <SectionCard title={at.sandbox} subtitle="限制智能体的文件系统访问权限，防止意外操作系统文件">
        <div className="form-row">
          <FormField label={at.sandboxMode} tooltip="off = 无限制；non-main = 仅非主智能体受限（推荐）；all = 所有智能体受限">
            <select
              className="select"
              value={local.defaults?.sandbox?.mode || 'off'}
              onChange={e => updDefaults({ sandbox: { ...local.defaults?.sandbox, mode: e.target.value as any } })}
            >
              <option value="off">{at.sandboxModeOptions.off}</option>
              <option value="non-main">{at.sandboxModeOptions['non-main']}</option>
              <option value="all">{at.sandboxModeOptions.all}</option>
            </select>
          </FormField>
          {local.defaults?.sandbox?.mode !== 'off' && (
            <FormField label={at.sandboxScope} tooltip="session = 每次对话独立沙箱（最安全）；agent = 同一智能体共享；shared = 所有智能体共享同一沙箱">
              <select
                className="select"
                value={local.defaults?.sandbox?.scope || 'session'}
                onChange={e => updDefaults({ sandbox: { ...local.defaults?.sandbox, scope: e.target.value as any } })}
              >
                <option value="session">{at.sandboxScopeOptions.session}</option>
                <option value="agent">{at.sandboxScopeOptions.agent}</option>
                <option value="shared">{at.sandboxScopeOptions.shared}</option>
              </select>
            </FormField>
          )}
        </div>
        {local.defaults?.sandbox?.mode !== 'off' && (
          <div style={{ marginTop: 10, padding: '9px 13px', borderRadius: 7, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)', fontSize: 11, color: '#A5B4FC' }}>
            🔒 {local.defaults?.sandbox?.mode === 'non-main' ? '非主智能体（子智能体）' : '所有智能体'}在隔离沙箱中运行，文件操作限制在工作区内，无法访问系统文件。
            范围：<strong>{local.defaults?.sandbox?.scope === 'session' ? '每次会话独立' : local.defaults?.sandbox?.scope === 'agent' ? '同一智能体共享' : '全局共享'}</strong>
          </div>
        )}
      </SectionCard>

      {/* A2A Collaboration */}
      <SectionCard title="多智能体协作（A2A）" subtitle="控制智能体之间的委托调度与通信策略">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Toggle
            checked={!!(local.defaults as any)?.a2aEnabled}
            onChange={v => updDefaults({ a2aEnabled: v })}
            label="启用智能体间委托（Agent-to-Agent）"
          />
          {(local.defaults as any)?.a2aEnabled && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.2)', fontSize: 12, color: '#67E8F9' }}>
              🔗 主智能体可将子任务委托给列表中的其他智能体并收集结果。在子智能体的「协作配置」中设置唤起关键词。
            </div>
          )}
          <Toggle
            checked={!!local.defaults?.tools?.loopDetection?.enabled}
            onChange={v => updDefaults({
              tools: {
                ...local.defaults?.tools,
                loopDetection: { enabled: v, maxIterations: local.defaults?.tools?.loopDetection?.maxIterations ?? 10 },
              },
            })}
            label={`全局循环检测（最大 ${local.defaults?.tools?.loopDetection?.maxIterations ?? 10} 轮）`}
          />
          {local.defaults?.tools?.loopDetection?.enabled && (
            <FormField label="最大迭代轮数" hint="智能体相互调用的最大深度，超出后自动中止">
              <input
                className="input"
                type="number"
                min={1}
                max={100}
                value={local.defaults?.tools?.loopDetection?.maxIterations ?? 10}
                onChange={e => updDefaults({
                  tools: {
                    ...local.defaults?.tools,
                    loopDetection: { enabled: true, maxIterations: Number(e.target.value) || 10 },
                  },
                })}
                style={{ width: 120 }}
              />
            </FormField>
          )}
        </div>
      </SectionCard>

      {/* Agent list */}
      <SectionCard
        title={at.agentList}
        style={{ paddingBottom: 16 }}
        actions={
          (local.list && local.list.length > 0) ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowRelationships(true)}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              关系图
            </button>
          ) : undefined
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {(!local.list || local.list.length === 0) ? (
            <div style={{
              padding: '20px', textAlign: 'center',
              color: 'var(--color-text-muted)', fontSize: 13,
              background: 'var(--color-surface-2)',
              borderRadius: 8, border: '1px dashed var(--color-border)',
            }}>
              暂无额外智能体。系统始终保有一个默认智能体（main）处于活跃状态。
            </div>
          ) : (
            local.list.map(agent => (
              <div key={agent.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 9,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(37,99,235,0.1))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>
                  🤖
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {agent.name || agent.id}
                    </span>
                    <code style={{ fontFamily: 'var(--font-family-mono)', fontSize: 11, color: 'var(--color-text-muted)', background: 'var(--color-surface-3)', padding: '1px 5px', borderRadius: 3 }}>
                      {agent.id}
                    </code>
                    {agent.default && <Badge variant="purple">default</Badge>}
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {agent.workspace || 'Default workspace'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" title="编辑配置" onClick={() => setEditingAgent(deepClone(agent))}>
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button className="btn btn-ghost btn-sm" title="编辑文件" onClick={() => setEditingFiles(agent)}>
                    <svg width="13" height="13" fill="none" stroke="#60A5FA" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(agent.id)}>
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowWizard(true)}>
            🪄 向导创建
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleAddAgent}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {at.addAgent}
          </button>
        </div>
      </SectionCard>

      <SaveBar onSave={handleSave} saving={saveStatus === 'saving'} />

      {/* Edit agent modal */}
      {editingAgent && (
        <AgentEditModal
          agent={editingAgent}
          onSave={handleSaveAgent}
          onCancel={() => setEditingAgent(null)}
          t={at}
          gwSkillIds={gwSkillIds}
        />
      )}

      <ConfirmModal
        open={!!deleteConfirm}
        title="删除智能体"
        message={`确定要删除智能体 "${deleteConfirm}" 吗？此操作无法撤销。`}
        onConfirm={() => deleteConfirm && handleDeleteAgent(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
        danger
      />

      {editingFiles && (
        <AgentFilesModal
          agent={editingFiles}
          onClose={() => setEditingFiles(null)}
        />
      )}

      {showWizard && (
        <AgentWizardModal
          onSave={(agent: Agent) => {
            handleSaveAgent(agent);
            setShowWizard(false);
          }}
          onClose={() => setShowWizard(false)}
          knownSkillIds={Array.from(new Set([...Object.keys(config?.skills?.entries || {}), ...gwSkillIds]))}
        />
      )}

      {showRelationships && (
        <AgentRelationshipsModal
          agents={local.list || []}
          gwSkillIds={gwSkillIds}
          onSave={newList => {
            setLocal(p => ({ ...p, list: newList }));
            setShowRelationships(false);
          }}
          onClose={() => setShowRelationships(false)}
        />
      )}
    </div>
  );
}

// ─── ModelSelector ──────────────────────────────────────────

function ModelSelector({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [models, setModels] = useState<GatewayModel[]>([]);
  const [gwState, setGwState] = useState(gatewayClient.state);
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    const unsub = gatewayClient.onStateChange(s => setGwState(s));
    return unsub;
  }, []);

  useEffect(() => {
    if (gwState !== 'connected') return;
    gwRpc.modelsList().then(r => {
      if (r?.models?.length) setModels(r.models);
    }).catch(() => {});
  }, [gwState]);

  const connected = gwState === 'connected' && models.length > 0;

  if (!connected || useCustom) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="input input-mono"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || 'claude-opus-4-5'}
          style={{ flex: 1 }}
        />
        {connected && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setUseCustom(false)}
            title="从已知模型中选择"
            style={{ flexShrink: 0 }}
          >
            📋
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <select
        className="select"
        style={{ flex: 1, fontFamily: 'var(--font-family-mono)', fontSize: 12 }}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {!value && <option value="">— 选择模型 —</option>}
        {models.map(m => (
          <option key={m.id} value={m.id}>
            {m.name || m.id}{m.provider ? ` (${m.provider})` : ''}
          </option>
        ))}
        {value && !models.find(m => m.id === value) && (
          <option value={value}>{value} (自定义)</option>
        )}
      </select>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setUseCustom(true)}
        title="手动输入模型 ID"
        style={{ flexShrink: 0 }}
      >
        ✏️
      </button>
    </div>
  );
}

function AgentEditModal({ agent, onSave, onCancel, t: at, gwSkillIds = [] }: {
  agent: Agent;
  onSave: (a: Agent) => void;
  onCancel: () => void;
  t: any;
  gwSkillIds?: string[];
}) {
  const [local, setLocal] = useState<Agent>(agent);
  const { config, openclawHome } = useAppStore();
  const [customSkillInput, setCustomSkillInput] = useState('');

  // Cross-platform workspace path placeholder derived from openclaw home dir
  const wsPlaceholder = openclawHome
    ? openclawHome.replace(/\\/g, '/').replace(/\/\.openclaw\/?$/, '') + '/my_workspace'
    : '~/my_workspace';

  // 所有已知技能 ID: config.skills.entries + Gateway 发现的 + 当前 agent 已用的
  const knownSkillIds = Array.from(new Set([...Object.keys(config?.skills?.entries || {}), ...gwSkillIds]));
  const allSkillIds = Array.from(new Set([...knownSkillIds, ...(local.skills || [])]));

  const isSelected = (id: string) => (local.skills || []).includes(id);
  const toggleSkill = (id: string) => {
    setLocal(p => ({
      ...p,
      skills: isSelected(id)
        ? (p.skills || []).filter(s => s !== id)
        : [...(p.skills || []), id],
    }));
  };
  const addCustomSkill = () => {
    const id = customSkillInput.trim();
    if (!id || isSelected(id)) { setCustomSkillInput(''); return; }
    setLocal(p => ({ ...p, skills: [...(p.skills || []), id] }));
    setCustomSkillInput('');
  };

  const updHeartbeat = (patch: any) => setLocal(p => ({
    ...p,
    heartbeat: { ...p.heartbeat!, ...patch },
  }));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}>
      <div className="card animate-fade-in" style={{ width: 520, padding: '24px', maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 20px 0', fontSize: 16, fontWeight: 700 }}>
          {local.id.startsWith('agent-') ? at.addAgent : `编辑 ${local.name || local.id}`}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ID + 显示名 */}
          <div className="form-row">
            <FormField label={at.agentId} required>
              <input className="input input-mono" value={local.id} onChange={e => setLocal(p => ({ ...p, id: e.target.value }))} placeholder="main" />
            </FormField>
            <FormField label={at.agentName} hint={at.agentNameHint}>
              <input className="input" value={local.name || ''} onChange={e => setLocal(p => ({ ...p, name: e.target.value || undefined }))} placeholder="小总管" />
            </FormField>
          </div>

          <FormField label={at.agentWorkspace}>
            <input className="input input-mono" value={local.workspace || ''} onChange={e => setLocal(p => ({ ...p, workspace: e.target.value }))} placeholder={wsPlaceholder} />
          </FormField>

          <FormField label={at.agentDir} hint={at.agentDirHint}>
            <input className="input input-mono" value={local.agentDir || ''} onChange={e => setLocal(p => ({ ...p, agentDir: e.target.value || undefined }))} placeholder="~/.openclaw/agents/main/agent" />
          </FormField>

          <FormField label={at.primaryModel}>
            <ModelSelector
              value={typeof local.model === 'string' ? local.model : (local.model?.primary || '')}
              onChange={v => setLocal(p => ({ ...p, model: { ...(typeof p.model === 'object' ? p.model : {}), primary: v } }))}
              placeholder="claude-opus-4-5"
            />
          </FormField>

          <FormField label={at.agentSkills} hint={at.agentSkillsHint}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Tag pills */}
              {allSkillIds.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {allSkillIds.map(id => {
                    const sel = isSelected(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleSkill(id)}
                        style={{
                          padding: '4px 10px', borderRadius: 14, fontSize: 11,
                          border: '1px solid',
                          background: sel ? 'rgba(167,139,250,0.15)' : 'transparent',
                          color: sel ? '#A78BFA' : 'var(--color-text-muted)',
                          borderColor: sel ? 'rgba(124,58,237,0.4)' : 'var(--color-border)',
                          cursor: 'pointer', transition: 'all 0.15s',
                          fontFamily: 'var(--font-family-mono)',
                        }}
                      >
                        {sel ? '✓ ' : ''}{id}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                  在「技能设置」中添加技能后，可在此处勾选分配
                </div>
              )}
              {/* 手动输入 */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="input input-mono"
                  style={{ flex: 1, fontSize: 12 }}
                  value={customSkillInput}
                  onChange={e => setCustomSkillInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomSkill())}
                  placeholder="手动输入技能 ID，回车添加…"
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={addCustomSkill}
                  disabled={!customSkillInput.trim()}
                >
                  添加
                </button>
              </div>
              {(local.skills || []).length > 0 && (
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                  已选 {(local.skills || []).length} 个技能
                </div>
              )}
            </div>
          </FormField>

          {/* 心跳配置 */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
            <Toggle
              checked={!!local.heartbeat}
              onChange={v => setLocal(p => ({ ...p, heartbeat: v ? { every: '30m', target: 'last' } : undefined }))}
              label={at.heartbeat + (local.heartbeat ? '' : ' (disabled)')}
            />
            {local.heartbeat && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                <div className="form-row">
                  <FormField label={at.heartbeatEvery} hint={at.heartbeatEveryHint}>
                    <input
                      className="input"
                      value={local.heartbeat.every || ''}
                      onChange={e => updHeartbeat({ every: e.target.value })}
                      placeholder="30m"
                    />
                  </FormField>
                  <FormField label={at.heartbeatTarget}>
                    <select
                      className="select"
                      value={local.heartbeat.target || 'last'}
                      onChange={e => updHeartbeat({ target: e.target.value })}
                    >
                      <option value="last">last</option>
                      <option value="main">main</option>
                    </select>
                  </FormField>
                </div>
                <FormField label={at.heartbeatActiveHours} hint={at.activeHoursHint}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="input"
                      style={{ width: 100 }}
                      value={local.heartbeat.activeHours?.start || ''}
                      onChange={e => updHeartbeat({ activeHours: { ...local.heartbeat?.activeHours, start: e.target.value, end: local.heartbeat?.activeHours?.end || '22:00' } })}
                      placeholder="08:00"
                    />
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>~</span>
                    <input
                      className="input"
                      style={{ width: 100 }}
                      value={local.heartbeat.activeHours?.end || ''}
                      onChange={e => updHeartbeat({ activeHours: { start: local.heartbeat?.activeHours?.start || '08:00', ...local.heartbeat?.activeHours, end: e.target.value } })}
                      placeholder="22:00"
                    />
                  </div>
                </FormField>
              </div>
            )}
          </div>

          {/* 工具集 */}
          <FormField label={at.toolsProfile}>
            <select
              className="select"
              value={local.tools?.profile || ''}
              onChange={e => setLocal(p => ({ ...p, tools: { ...p.tools, profile: e.target.value as any || undefined } }))}
            >
              <option value="">默认（跟随全局）</option>
              <option value="full">full — 全部工具</option>
              <option value="coding">coding — 编程</option>
              <option value="messaging">messaging — 通讯</option>
              <option value="minimal">minimal — 极简</option>
            </select>
          </FormField>

          <div>
            <Toggle
              checked={local.default || false}
              onChange={v => setLocal(p => ({ ...p, default: v }))}
              label={at.agentDefault}
            />
          </div>

          {/* ─── 协作配置 ─── */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              🤝 协作配置
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <FormField
                label="群聊唤起关键词"
                hint="在群聊中，消息包含以下关键词时该智能体会被唤起（逗号分隔）"
              >
                <input
                  className="input"
                  value={(local.groupChat?.mentionPatterns || []).join(', ')}
                  onChange={e => {
                    const patterns = e.target.value
                      .split(',')
                      .map(s => s.trim())
                      .filter(Boolean);
                    setLocal(p => ({ ...p, groupChat: { ...p.groupChat, mentionPatterns: patterns } }));
                  }}
                  placeholder="例：@助手, 帮我, 问一下"
                />
              </FormField>

              <div>
                <Toggle
                  checked={!!local.tools?.loopDetection?.enabled}
                  onChange={v => setLocal(p => ({
                    ...p,
                    tools: {
                      ...p.tools,
                      loopDetection: { enabled: v, maxIterations: p.tools?.loopDetection?.maxIterations ?? 10 },
                    },
                  }))}
                  label="启用循环检测（防止无限递归）"
                />
                {local.tools?.loopDetection?.enabled && (
                  <div style={{ marginTop: 8, paddingLeft: 4 }}>
                    <FormField label="最大递归轮数" hint="超出后自动中止，默认 10">
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={50}
                        value={local.tools?.loopDetection?.maxIterations ?? 10}
                        onChange={e => setLocal(p => ({
                          ...p,
                          tools: {
                            ...p.tools,
                            loopDetection: { enabled: true, maxIterations: Number(e.target.value) || 10 },
                          },
                        }))}
                        style={{ width: 100 }}
                      />
                    </FormField>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" onClick={() => onSave(local)}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ─── AgentFilesModal ─────────────────────────────────────────

const AGENT_FILE_TABS = ['SOUL.md', 'TOOLS.md', 'IDENTITY.md', 'AGENTS.md', 'USER.md', 'BOOTSTRAP.md', 'MEMORY.md'];

function AgentFilesModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const { openclawHome } = useAppStore();
  // Persona/memory files (SOUL.md, IDENTITY.md etc.) live in the workspace dir, not agentDir
  const workspaceDir = agent.workspace || (openclawHome ? `${openclawHome}/agents/${agent.id}` : '');

  const [activeFile, setActiveFile] = useState('SOUL.md');
  const [contents, setContents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [savedFile, setSavedFile] = useState('');

  // Gateway mode
  const [useGateway, setUseGateway] = useState(false);
  const [gwState, setGwState] = useState(gatewayClient.state);
  const [gwFileList, setGwFileList] = useState<AgentFile[]>([]);
  const [loadedGwFiles, setLoadedGwFiles] = useState<Set<string>>(new Set());

  // Compute tabs: in gateway mode, merge gateway file list with AGENT_FILE_TABS
  const fileTabs = useGateway && gwFileList.length > 0
    ? Array.from(new Set([...gwFileList.map(f => f.name), ...AGENT_FILE_TABS]))
    : AGENT_FILE_TABS;

  // Track gateway connection state
  useEffect(() => {
    const unsub = gatewayClient.onStateChange(s => setGwState(s));
    return unsub;
  }, []);

  // Local file loading (only when not in gateway mode)
  useEffect(() => {
    if (useGateway) return;
    if (!workspaceDir) return;
    async function loadFiles() {
      setLoading(true);
      const result: Record<string, string> = {};
      for (const file of AGENT_FILE_TABS) {
        try {
          const content = await invoke<string>('read_text_file', { path: `${workspaceDir}/${file}` });
          result[file] = content;
        } catch {
          result[file] = '';
        }
      }
      setContents(result);
      setLoading(false);
    }
    loadFiles();
  }, [workspaceDir, useGateway]);

  // Gateway: load file list on activation
  useEffect(() => {
    if (!useGateway || gwState !== 'connected') return;
    setLoading(true);
    gwRpc.agentFilesList(agent.id)
      .then(r => {
        setGwFileList(r.files);
        setLoadedGwFiles(new Set());
        setContents({});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [useGateway, gwState, agent.id]);

  // Gateway: lazily load file content when tab changes
  useEffect(() => {
    if (!useGateway || gwState !== 'connected' || loadedGwFiles.has(activeFile)) return;
    gwRpc.agentFilesGet(agent.id, activeFile)
      .then(r => {
        setContents(c => ({ ...c, [activeFile]: r.file.content || '' }));
        setLoadedGwFiles(s => new Set([...s, activeFile]));
      })
      .catch(() => {
        setContents(c => ({ ...c, [activeFile]: '' }));
        setLoadedGwFiles(s => new Set([...s, activeFile]));
      });
  }, [useGateway, gwState, activeFile, agent.id, loadedGwFiles]);

  const handleSave = async () => {
    if (!dirty[activeFile]) return;
    setSaving(true);
    setError('');
    try {
      if (useGateway && gwState === 'connected') {
        await gwRpc.agentFilesSet(agent.id, activeFile, contents[activeFile] || '');
      } else {
        await invoke('write_text_file', { path: `${workspaceDir}/${activeFile}`, content: contents[activeFile] });
      }
      setDirty(d => ({ ...d, [activeFile]: false }));
      setSavedFile(activeFile);
      setTimeout(() => setSavedFile(''), 2000);
    } catch (e: any) {
      setError(String(e));
    }
    setSaving(false);
  };

  const handleChange = (val: string) => {
    setContents(c => ({ ...c, [activeFile]: val }));
    setDirty(d => ({ ...d, [activeFile]: true }));
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--color-surface-1)',
        borderRadius: 14, padding: 0,
        width: '820px', maxWidth: '96vw', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        border: '1px solid var(--color-border)',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              📄 编辑智能体文件
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {agent.name || agent.id} &nbsp;·&nbsp; <code style={{ fontSize: 11 }}>{useGateway ? `Gateway / ${agent.id}` : workspaceDir}</code>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Local / Gateway toggle */}
            <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
              <button
                className="btn btn-sm"
                onClick={() => setUseGateway(false)}
                style={{
                  borderRadius: 0, border: 'none', padding: '4px 10px', fontSize: 11,
                  background: !useGateway ? 'rgba(167,139,250,0.2)' : 'transparent',
                  color: !useGateway ? '#A78BFA' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                }}
              >
                📁 本地
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setUseGateway(true)}
                disabled={gwState !== 'connected'}
                style={{
                  borderRadius: 0, border: 'none', padding: '4px 10px', fontSize: 11,
                  background: useGateway ? 'rgba(96,165,250,0.2)' : 'transparent',
                  color: useGateway ? '#60A5FA' : gwState !== 'connected' ? 'var(--color-text-disabled)' : 'var(--color-text-muted)',
                  cursor: gwState !== 'connected' ? 'not-allowed' : 'pointer',
                }}
                title={gwState !== 'connected' ? 'Gateway 离线' : '通过 Gateway 编辑（支持远程 agent）'}
              >
                🌐 Gateway{gwState !== 'connected' ? ' (离线)' : ''}
              </button>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* File Tabs */}
        <div style={{
          display: 'flex', gap: 2, padding: '10px 20px 0',
          borderBottom: '1px solid var(--color-border)', flexShrink: 0,
          overflowX: 'auto',
        }}>
          {fileTabs.map(file => (
            <button
              key={file}
              onClick={() => setActiveFile(file)}
              style={{
                padding: '5px 12px', borderRadius: '7px 7px 0 0',
                border: '1px solid transparent', borderBottom: 'none',
                fontSize: 12, fontWeight: activeFile === file ? 700 : 400,
                cursor: 'pointer', whiteSpace: 'nowrap',
                background: activeFile === file ? 'var(--color-surface-2)' : 'transparent',
                color: activeFile === file ? 'var(--color-accent)' : 'var(--color-text-muted)',
                borderColor: activeFile === file ? 'var(--color-border)' : 'transparent',
                position: 'relative',
              }}
            >
              {file}
              {dirty[file] && (
                <span style={{
                  display: 'inline-block', width: 5, height: 5,
                  borderRadius: '50%', background: '#F59E0B',
                  marginLeft: 5, verticalAlign: 'middle',
                }} />
              )}
            </button>
          ))}
        </div>

        {/* Editor Area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>
              正在读取文件…
            </div>
          ) : (
            <textarea
              value={contents[activeFile] || ''}
              onChange={e => handleChange(e.target.value)}
              spellCheck={false}
              style={{
                width: '100%', minHeight: 340,
                fontFamily: 'var(--font-family-mono)', fontSize: 13, lineHeight: 1.65,
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
                borderRadius: 8, padding: '12px 14px',
                resize: 'vertical', outline: 'none',
                boxSizing: 'border-box',
              }}
              placeholder={`${activeFile} 文件内容为空或不存在`}
            />
          )}
          {error && (
            <div style={{ marginTop: 8, color: '#F87171', fontSize: 12 }}>❌ {error}</div>
          )}
          {savedFile && (
            <div style={{ marginTop: 8, color: '#34D399', fontSize: 12 }}>✓ {savedFile} 已保存</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
          padding: '12px 20px', borderTop: '1px solid var(--color-border)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginRight: 'auto' }}>
            {dirty[activeFile] ? '● 有未保存的更改' : contents[activeFile] ? `${contents[activeFile].length} 个字符` : '（文件为空）'}
          </span>
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!dirty[activeFile] || saving}
          >
            {saving ? '保存中…' : `保存 ${activeFile}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AgentRelationshipsModal ──────────────────────────────────

function AgentRelationshipsModal({ agents, onSave, onClose, gwSkillIds = [] }: {
  agents: Agent[];
  onSave: (list: Agent[]) => void;
  onClose: () => void;
  gwSkillIds?: string[];
}) {
  const { config } = useAppStore();
  const [localAgents, setLocalAgents] = useState<Agent[]>(() => JSON.parse(JSON.stringify(agents)));
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [skillInput, setSkillInput] = useState('');

  const sel = localAgents.find(a => a.id === selected) || null;
  // 所有已知技能 ID: config.skills.entries + Gateway 发现的
  const knownSkillIds = Array.from(new Set([...Object.keys(config?.skills?.entries || {}), ...gwSkillIds]));

  // Clear skill input when switching agents
  useEffect(() => { setSkillInput(''); }, [selected]);

  const patchAgent = (id: string, patch: Partial<Agent>) => {
    setLocalAgents(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
    setDirty(true);
  };

  const setHeartbeatTarget = (agentId: string, target: string) => {
    setLocalAgents(prev => prev.map(a => {
      if (a.id !== agentId) return a;
      if (!target) return { ...a, heartbeat: a.heartbeat ? { ...a.heartbeat, target: undefined } : undefined };
      return { ...a, heartbeat: { ...(a.heartbeat || { every: '30m' }), target } };
    }));
    setDirty(true);
  };

  const toggleHeartbeat = (agentId: string, enabled: boolean) => {
    setLocalAgents(prev => prev.map(a => {
      if (a.id !== agentId) return a;
      return { ...a, heartbeat: enabled ? { every: '30m', target: 'main' } : undefined };
    }));
    setDirty(true);
  };

  // Compute edges from local state
  const edges: Array<{ from: string; to: string; type: 'heartbeat' | 'skill' }> = [];
  for (const a of localAgents) {
    if (a.heartbeat?.target) {
      const tgt = localAgents.find(b => b.id === a.heartbeat!.target!);
      if (tgt) edges.push({ from: a.id, to: tgt.id, type: 'heartbeat' });
    }
    const skillStr = (a.skills || []).join(' ');
    for (const b of localAgents) {
      if (b.id === a.id) continue;
      if (skillStr.toLowerCase().includes(b.id.toLowerCase())) {
        if (!edges.find(e => e.from === a.id && e.to === b.id)) {
          edges.push({ from: a.id, to: b.id, type: 'skill' });
        }
      }
    }
  }

  const W = 480, H = 360;
  const cx = W / 2, cy = H / 2;
  const nodeR = Math.min(W, H) * 0.36;

  const nodePos: Record<string, { x: number; y: number }> = {};
  localAgents.forEach((a, i) => {
    const angle = (2 * Math.PI * i) / Math.max(localAgents.length, 1) - Math.PI / 2;
    nodePos[a.id] = { x: cx + nodeR * Math.cos(angle), y: cy + nodeR * Math.sin(angle) };
  });

  const isHi = (id: string) => {
    if (!selected) return true;
    if (id === selected) return true;
    return edges.some(e => (e.from === selected && e.to === id) || (e.to === selected && e.from === id));
  };

  const selEdges = selected ? edges.filter(e => e.from === selected || e.to === selected) : [];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--color-surface-1)', borderRadius: 14,
        width: 820, maxWidth: '96vw', maxHeight: '90vh',
        border: '1px solid var(--color-border)',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>⚡ 智能体关系图</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
              点击节点编辑连接关系· {localAgents.length} 个智能体· {edges.length} 条连接
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {dirty && (
              <button className="btn btn-primary btn-sm" onClick={() => onSave(localAgents)}>
                💾 保存更改
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body: graph + side panel */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Graph */}
          <div style={{ flex: 1, padding: '14px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {localAgents.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                暂无智能体数据
              </div>
            ) : (
              <svg width={W} height={H} style={{ display: 'block', flexShrink: 0 }}>
                <rect width={W} height={H} rx={10} fill="var(--color-surface-2)" />

                {/* Edges */}
                {edges.map((edge, i) => {
                  const from = nodePos[edge.from];
                  const to = nodePos[edge.to];
                  if (!from || !to) return null;
                  const isActive = !selected || edge.from === selected || edge.to === selected;
                  const color = edge.type === 'heartbeat' ? '#F59E0B' : '#7C3AED';
                  // shorten line so arrowhead doesn't overlap circle
                  const dx = to.x - from.x, dy = to.y - from.y;
                  const len = Math.sqrt(dx * dx + dy * dy) || 1;
                  const x2 = to.x - (dx / len) * 30;
                  const y2 = to.y - (dy / len) * 30;
                  return (
                    <g key={i}>
                      <defs>
                        <marker id={`arr-${i}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                          <path d="M0,0 L0,6 L8,3 z" fill={isActive ? color : '#374151'} />
                        </marker>
                      </defs>
                      <line
                        x1={from.x} y1={from.y} x2={x2} y2={y2}
                        stroke={isActive ? color : '#374151'}
                        strokeWidth={isActive ? 1.8 : 0.8}
                        strokeOpacity={isActive ? 0.75 : 0.2}
                        strokeDasharray={edge.type === 'skill' ? '5,3' : undefined}
                        markerEnd={`url(#arr-${i})`}
                      />
                    </g>
                  );
                })}

                {/* Nodes */}
                {localAgents.map(agent => {
                  const pos = nodePos[agent.id];
                  if (!pos) return null;
                  const hi = isHi(agent.id);
                  const isSel = agent.id === selected;
                  return (
                    <g key={agent.id} onClick={() => setSelected(s => s === agent.id ? null : agent.id)} style={{ cursor: 'pointer' }}>
                      <circle
                        cx={pos.x} cy={pos.y} r={26}
                        fill={isSel ? 'rgba(124,58,237,0.3)' : 'rgba(124,58,237,0.1)'}
                        stroke={isSel ? '#7C3AED' : hi ? '#6D28D9' : '#374151'}
                        strokeWidth={isSel ? 2.5 : 1.5}
                        opacity={hi ? 1 : 0.3}
                      />
                      <text x={pos.x} y={pos.y + 6} textAnchor="middle" fontSize={17} opacity={hi ? 1 : 0.3}>🤖</text>
                      <text
                        x={pos.x} y={pos.y + 44}
                        textAnchor="middle" fontSize={10}
                        fontWeight={isSel ? 700 : 500}
                        fill={hi ? 'var(--color-text-primary)' : 'var(--color-text-muted)'}
                      >
                        {(agent.name || agent.id).slice(0, 11)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Legend */}
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'flex', gap: 14 }}>
              <span style={{ color: '#F59E0B' }}>── 心跳目标</span>
              <span style={{ color: '#7C3AED' }}>- - 技能调用</span>
              <span style={{ marginLeft: 'auto' }}>点击节点选中 / 再次点击取消选中</span>
            </div>
          </div>

          {/* Right edit panel */}
          <div style={{
            width: 256, borderLeft: '1px solid var(--color-border)',
            display: 'flex', flexDirection: 'column',
            background: 'var(--color-surface-2)', flexShrink: 0,
          }}>
            {!sel ? (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: 24, textAlign: 'center', color: 'var(--color-text-muted)',
              }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>👈</div>
                <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                  点击左侧图中的智能体节点
                  编辑其心跳连接关系
                </div>
                {localAgents.length > 0 && (
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                    {localAgents.map(a => (
                      <button
                        key={a.id}
                        className="btn btn-ghost btn-sm"
                        style={{ justifyContent: 'flex-start', gap: 8, fontSize: 12 }}
                        onClick={() => setSelected(a.id)}
                      >
                        <span>🤖</span>
                        <span>{a.name || a.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Agent info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9,
                    background: 'linear-gradient(135deg,rgba(124,58,237,0.25),rgba(37,99,235,0.15))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, flexShrink: 0,
                  }}>🤖</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sel.name || sel.id}
                    </div>
                    <code style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)' }}>{sel.id}</code>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 'auto', flexShrink: 0 }}
                    onClick={() => setSelected(null)}
                    title="关闭"
                  >
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Model section */}
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#60A5FA', marginBottom: 6 }}>🤖 模型</div>
                  <ModelSelector
                    value={typeof sel.model === 'string' ? sel.model : (sel.model?.primary || '')}
                    onChange={v => patchAgent(sel.id, {
                      model: v ? { ...(typeof sel.model === 'object' && sel.model ? sel.model : {}), primary: v } : undefined,
                    })}
                    placeholder="继承默认"
                  />
                  {!sel.model && (
                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 3 }}>未设置（使用全局默认）</div>
                  )}
                </div>

                {/* Heartbeat section — expanded with editable interval + active hours */}
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#F59E0B' }}>⚡ 心跳设置</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!sel.heartbeat}
                        onChange={e => toggleHeartbeat(sel.id, e.target.checked)}
                        style={{ width: 13, height: 13 }}
                      />
                      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>启用</span>
                    </label>
                  </div>

                  {sel.heartbeat ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 3 }}>目标</div>
                          <select
                            className="select"
                            style={{ width: '100%', fontSize: 11 }}
                            value={sel.heartbeat?.target || ''}
                            onChange={e => setHeartbeatTarget(sel.id, e.target.value)}
                          >
                            <option value="">无</option>
                            {localAgents.filter(a => a.id !== sel.id).map(a => (
                              <option key={a.id} value={a.id}>{a.name || a.id}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 3 }}>频率</div>
                          <input
                            className="input"
                            style={{ width: '100%', fontSize: 11 }}
                            value={sel.heartbeat.every || '30m'}
                            onChange={e => patchAgent(sel.id, {
                              heartbeat: { ...sel.heartbeat!, every: e.target.value },
                            })}
                            placeholder="30m"
                          />
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 3 }}>活跃时段</div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            className="input"
                            style={{ flex: 1, fontSize: 11 }}
                            value={sel.heartbeat.activeHours?.start || ''}
                            onChange={e => patchAgent(sel.id, {
                              heartbeat: { ...sel.heartbeat!, activeHours: { start: e.target.value, end: sel.heartbeat?.activeHours?.end || '22:00' } },
                            })}
                            placeholder="08:00"
                          />
                          <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>~</span>
                          <input
                            className="input"
                            style={{ flex: 1, fontSize: 11 }}
                            value={sel.heartbeat.activeHours?.end || ''}
                            onChange={e => patchAgent(sel.id, {
                              heartbeat: { ...sel.heartbeat!, activeHours: { start: sel.heartbeat?.activeHours?.start || '08:00', end: e.target.value } },
                            })}
                            placeholder="22:00"
                          />
                          {sel.heartbeat.activeHours && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => patchAgent(sel.id, {
                                heartbeat: { ...sel.heartbeat!, activeHours: undefined },
                              })}
                              title="清除时段"
                              style={{ padding: '0 6px', flexShrink: 0 }}
                            >✕</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                      心跳已禁用，勾选上方复选框启用
                    </div>
                  )}
                </div>

                {/* Current connections */}
                {selEdges.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>🔗 当前连接</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {selEdges.map((e, i) => {
                        const other = localAgents.find(a => a.id === (e.from === sel.id ? e.to : e.from));
                        const dir = e.from === sel.id ? '→' : '←';
                        const typeColor = e.type === 'heartbeat' ? '#F59E0B' : '#A78BFA';
                        const typeLabel = e.type === 'heartbeat' ? '心跳' : '技能';
                        return (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 8px', borderRadius: 6,
                            background: 'var(--color-surface-3)', fontSize: 11,
                          }}>
                            <span style={{ color: typeColor, fontWeight: 700 }}>{dir}</span>
                            <span style={{ flex: 1, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {other?.name || other?.id || '?'}
                            </span>
                            <span style={{
                              padding: '1px 5px', borderRadius: 8,
                              background: `${typeColor}25`, color: typeColor, fontSize: 10,
                            }}>{typeLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Skills — editable chip list */}
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#A78BFA', marginBottom: 7 }}>⚡ 技能分配</div>
                  {(() => {
                    const allSkills = Array.from(new Set([...knownSkillIds, ...(sel.skills || [])]));
                    const isSelSkill = (id: string) => (sel.skills || []).includes(id);
                    const toggleSkill = (id: string) => {
                      const next = isSelSkill(id)
                        ? (sel.skills || []).filter(s => s !== id)
                        : [...(sel.skills || []), id];
                      patchAgent(sel.id, { skills: next.length ? next : undefined });
                    };
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {allSkills.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {allSkills.map(id => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => toggleSkill(id)}
                                style={{
                                  padding: '2px 8px', borderRadius: 10, fontSize: 10,
                                  border: '1px solid',
                                  background: isSelSkill(id) ? 'rgba(167,139,250,0.15)' : 'transparent',
                                  color: isSelSkill(id) ? '#A78BFA' : 'var(--color-text-muted)',
                                  borderColor: isSelSkill(id) ? 'rgba(124,58,237,0.4)' : 'var(--color-border)',
                                  cursor: 'pointer',
                                  fontFamily: 'var(--font-family-mono)',
                                }}
                              >
                                {isSelSkill(id) ? '✓ ' : ''}{id}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                            在「技能」页面添加技能后可在此分配
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 5 }}>
                          <input
                            className="input"
                            style={{ flex: 1, fontSize: 11 }}
                            value={skillInput}
                            onChange={e => setSkillInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                const id = skillInput.trim();
                                if (id && !isSelSkill(id)) {
                                  patchAgent(sel.id, { skills: [...(sel.skills || []), id] });
                                }
                                setSkillInput('');
                              }
                            }}
                            placeholder="手动输入技能 ID…"
                          />
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ flexShrink: 0 }}
                            disabled={!skillInput.trim()}
                            onClick={() => {
                              const id = skillInput.trim();
                              if (id && !isSelSkill(id)) {
                                patchAgent(sel.id, { skills: [...(sel.skills || []), id] });
                              }
                              setSkillInput('');
                            }}
                          >添加</button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px', borderTop: '1px solid var(--color-border)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: dirty ? '#F59E0B' : 'var(--color-text-muted)' }}>
            {dirty ? '● 有未保存的更改' : '无更改'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>关闭</button>
            <button className="btn btn-primary" onClick={() => onSave(localAgents)} disabled={!dirty}>
              保存更改
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AgentWizardModal ─────────────────────────────────────────

const WIZARD_STEPS = ['基本信息', '模型与技能', '心跳配置', '确认创建'];

function AgentWizardModal({ onSave, onClose, knownSkillIds }: {
  onSave: (agent: Agent) => void;
  onClose: () => void;
  knownSkillIds: string[];
}) {
  const { openclawHome } = useAppStore();
  const wsPlaceholder = openclawHome
    ? openclawHome.replace(/\\/g, '/').replace(/\/\.openclaw\/?$/, '') + '/my_workspace'
    : '~/my_workspace';
  const [step, setStep] = useState(0);
  const [agent, setAgent] = useState<Agent>({ id: generateId(), workspace: '' });
  const [customSkillInput, setCustomSkillInput] = useState('');

  const patch = (p: Partial<Agent>) => setAgent(prev => ({ ...prev, ...p }));
  const allSkillIds = Array.from(new Set([...knownSkillIds, ...(agent.skills || [])]));
  const isSkillSel = (id: string) => (agent.skills || []).includes(id);

  const toggleSkill = (id: string) => {
    patch({
      skills: isSkillSel(id)
        ? (agent.skills || []).filter(s => s !== id)
        : [...(agent.skills || []), id],
    });
  };

  const addCustomSkill = () => {
    const id = customSkillInput.trim();
    if (!id || isSkillSel(id)) { setCustomSkillInput(''); return; }
    patch({ skills: [...(agent.skills || []), id] });
    setCustomSkillInput('');
  };

  const updHb = (p: Partial<NonNullable<Agent['heartbeat']>>) =>
    patch({ heartbeat: { ...agent.heartbeat!, ...p } });

  const canProceed = step === 0 ? !!agent.id.trim() : true;

  const handleNext = () => {
    if (step < WIZARD_STEPS.length - 1) setStep(s => s + 1);
    else onSave(agent);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9100,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="card animate-fade-in" style={{
        width: 520, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto',
        padding: 0, borderRadius: 14,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--color-border)',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>🪄 向导创建智能体</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
              步骤 {step + 1} / {WIZARD_STEPS.length} · {WIZARD_STEPS[step]}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Step indicator */}
        <div style={{
          display: 'flex', padding: '12px 20px 0',
          borderBottom: '1px solid var(--color-border)', gap: 4,
        }}>
          {WIZARD_STEPS.map((label, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: i === step ? '#7C3AED' : i < step ? '#059669' : 'var(--color-surface-3)',
                color: i <= step ? '#fff' : 'var(--color-text-muted)',
                border: i === step ? '2px solid #A78BFA' : '2px solid transparent',
              }}>
                {i < step ? '✓' : i + 1}
              </div>
              <div style={{
                fontSize: 9, fontWeight: i === step ? 700 : 400, marginBottom: 8, textAlign: 'center',
                color: i === step ? 'var(--color-accent)' : 'var(--color-text-muted)',
              }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Step content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {step === 0 && (
            <>
              <div className="form-row">
                <FormField label="智能体 ID" required>
                  <input
                    className="input input-mono"
                    value={agent.id}
                    onChange={e => patch({ id: e.target.value })}
                    placeholder="main"
                  />
                </FormField>
                <FormField label="显示名称">
                  <input
                    className="input"
                    value={agent.name || ''}
                    onChange={e => patch({ name: e.target.value || undefined })}
                    placeholder="小总管"
                  />
                </FormField>
              </div>
              <FormField label="工作区路径" hint="智能体运行时所在的工作目录">
                <input
                  className="input input-mono"
                  value={agent.workspace || ''}
                  onChange={e => patch({ workspace: e.target.value })}
                  placeholder={wsPlaceholder}
                />
              </FormField>
            </>
          )}

          {step === 1 && (
            <>
              <FormField label="模型" hint="留空则使用全局默认模型">
                <ModelSelector
                  value={typeof agent.model === 'string' ? agent.model : (agent.model?.primary || '')}
                  onChange={v => patch({ model: v ? { primary: v } : undefined })}
                  placeholder="继承全局默认"
                />
              </FormField>
              <FormField label="技能分配" hint="选择该智能体可以使用的技能">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {allSkillIds.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {allSkillIds.map(id => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleSkill(id)}
                          style={{
                            padding: '4px 10px', borderRadius: 14, fontSize: 11,
                            border: '1px solid',
                            background: isSkillSel(id) ? 'rgba(167,139,250,0.15)' : 'transparent',
                            color: isSkillSel(id) ? '#A78BFA' : 'var(--color-text-muted)',
                            borderColor: isSkillSel(id) ? 'rgba(124,58,237,0.4)' : 'var(--color-border)',
                            cursor: 'pointer', fontFamily: 'var(--font-family-mono)',
                          }}
                        >
                          {isSkillSel(id) ? '✓ ' : ''}{id}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                      在「技能设置」中添加技能后可在此分配
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="input input-mono"
                      style={{ flex: 1, fontSize: 12 }}
                      value={customSkillInput}
                      onChange={e => setCustomSkillInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomSkill())}
                      placeholder="手动输入技能 ID…"
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={addCustomSkill}
                      disabled={!customSkillInput.trim()}
                    >添加</button>
                  </div>
                </div>
              </FormField>
            </>
          )}

          {step === 2 && (
            <>
              <Toggle
                checked={!!agent.heartbeat}
                onChange={v => patch({ heartbeat: v ? { every: '30m', target: 'last' } : undefined })}
                label={`心跳 ${agent.heartbeat ? '(已启用)' : '(已禁用)'}`}
              />
              {agent.heartbeat && (
                <>
                  <div className="form-row">
                    <FormField label="频率" hint="例如: 15m、1h">
                      <input
                        className="input"
                        value={agent.heartbeat.every || '30m'}
                        onChange={e => updHb({ every: e.target.value })}
                        placeholder="30m"
                      />
                    </FormField>
                    <FormField label="目标智能体">
                      <input
                        className="input input-mono"
                        value={agent.heartbeat.target || ''}
                        onChange={e => updHb({ target: e.target.value || undefined })}
                        placeholder="last"
                      />
                    </FormField>
                  </div>
                  <FormField label="活跃时段" hint="格式 HH:MM，留空则全天运行">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        className="input" style={{ width: 100 }}
                        value={agent.heartbeat.activeHours?.start || ''}
                        onChange={e => updHb({ activeHours: { start: e.target.value, end: agent.heartbeat?.activeHours?.end || '22:00' } })}
                        placeholder="08:00"
                      />
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>~</span>
                      <input
                        className="input" style={{ width: 100 }}
                        value={agent.heartbeat.activeHours?.end || ''}
                        onChange={e => updHb({ activeHours: { start: agent.heartbeat?.activeHours?.start || '08:00', end: e.target.value } })}
                        placeholder="22:00"
                      />
                    </div>
                  </FormField>
                </>
              )}
            </>
          )}

          {step === 3 && (
            <div style={{
              padding: '14px 16px', borderRadius: 10,
              background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10 }}>📋 创建摘要</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 56, flexShrink: 0 }}>ID</span>
                  <code style={{ fontSize: 12, fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-primary)' }}>{agent.id}</code>
                </div>
                {agent.name && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 56, flexShrink: 0 }}>显示名</span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>{agent.name}</span>
                  </div>
                )}
                {agent.workspace && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 56, flexShrink: 0 }}>工作区</span>
                    <code style={{ fontSize: 11, fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-muted)', wordBreak: 'break-all' }}>{agent.workspace}</code>
                  </div>
                )}
                {agent.model && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 56, flexShrink: 0 }}>模型</span>
                    <code style={{ fontSize: 12, fontFamily: 'var(--font-family-mono)', color: '#60A5FA' }}>
                      {typeof agent.model === 'string' ? agent.model : agent.model.primary}
                    </code>
                  </div>
                )}
                {(agent.skills || []).length > 0 && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 56, flexShrink: 0 }}>技能</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(agent.skills || []).map(s => (
                        <span key={s} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'rgba(167,139,250,0.12)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.2)' }}>{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {agent.heartbeat && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 56, flexShrink: 0 }}>心跳</span>
                    <span style={{ fontSize: 12, color: '#F59E0B' }}>
                      每 {agent.heartbeat.every || '30m'}
                      {agent.heartbeat.target ? ` → ${agent.heartbeat.target}` : ''}
                      {agent.heartbeat.activeHours ? ` (${agent.heartbeat.activeHours.start}~${agent.heartbeat.activeHours.end})` : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', gap: 8, justifyContent: 'space-between',
          padding: '12px 20px', borderTop: '1px solid var(--color-border)',
        }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={step === 0 ? onClose : () => setStep(s => s - 1)}
          >
            {step === 0 ? '取消' : '← 上一步'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleNext}
            disabled={!canProceed}
          >
            {step === WIZARD_STEPS.length - 1 ? '✓ 创建智能体' : '下一步 →'}
          </button>
        </div>
      </div>
    </div>
  );
}

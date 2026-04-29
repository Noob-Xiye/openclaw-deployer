import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import { PageHeader, SectionCard, Badge, EmptyState, SaveBar, FormField, Toggle, InfoBox } from '../components/ui';
import { SkillEntry } from '../types';
import { gwRpc, SkillStatusEntry, gatewayClient } from '../services/gatewayWs';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Well-known skill metadata for display
const SKILL_META: Record<string, { icon: string; label: string; desc: string; hasApiKey?: boolean }> = {
  'tavily-web-search': { icon: '🔍', label: 'Tavily Web Search', desc: '通过 Tavily API 进行 Web 搜索', hasApiKey: true },
  'Memory': { icon: '🧠', label: 'Memory', desc: '长期记忆存储与检索' },
  'hot-tech-radar': { icon: '📡', label: 'Hot Tech Radar', desc: '科技热点雷达' },
  'xiaotan-dispatch': { icon: '📨', label: 'Xiaotan Dispatch', desc: '调度小探执行任务' },
  'gemini': { icon: '🔮', label: 'Google Gemini', desc: 'Gemini 多模态 AI', hasApiKey: true },
  'peekaboo': { icon: '👁️', label: 'Peekaboo', desc: '视觉感知与图像分析' },
  'web-scraper': { icon: '🕷️', label: 'Web Scraper', desc: '网页内容抓取' },
};

function getSkillMeta(id: string) {
  return SKILL_META[id] || { icon: '⚡', label: id, desc: '' };
}

export function SkillsPage() {
  const { config, saveConfig, saveStatus, t } = useAppStore();
  const st = t.skills;

  // Derive entries from config
  const [entries, setEntries] = useState<Record<string, SkillEntry>>({});
  const [extraDirs, setExtraDirs] = useState<string[]>([]);
  const [newDir, setNewDir] = useState('');
  const [newSkillId, setNewSkillId] = useState('');
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [showClawHub, setShowClawHub] = useState(false);

  // --- Agent skill assignments (editable) ---
  // keyed by agent id → current skill array draft
  const [agentSkillsDraft, setAgentSkillsDraft] = useState<Record<string, string[]>>({});
  // per-agent input state for adding a new skill
  const [agentSkillInput, setAgentSkillInput] = useState<Record<string, string>>({});

  // --- Gateway skills.status: all installed skill names ---
  const [gatewaySkills, setGatewaySkills] = useState<SkillStatusEntry[]>([]);
  const [gwState, setGwState] = useState(gatewayClient.state);

  useEffect(() => {
    const unsub = gatewayClient.onStateChange(s => setGwState(s));
    return unsub;
  }, []);

  useEffect(() => {
    if (gwState !== 'connected') return;
    gwRpc.skillsStatus().then(r => {
      if (r?.skills?.length) setGatewaySkills(r.skills);
    }).catch(() => {});
  }, [gwState]);

  useEffect(() => {
    setEntries(deepClone(config?.skills?.entries || {}));
    setExtraDirs(config?.skills?.extraDirs || []);
  }, [config?.skills]);

  // Sync agent skills draft when config changes
  useEffect(() => {
    const draft: Record<string, string[]> = {};
    for (const agent of (config?.agents?.list || [])) {
      draft[agent.id] = [...(agent.skills || [])];
    }
    setAgentSkillsDraft(draft);
  }, [config?.agents?.list]);

  // All skill IDs used across agents
  const agentList = config?.agents?.list || [];
  const allAgentSkills = agentList.flatMap(a => a.skills || []);
  // Gateway-discovered skill IDs
  const gatewaySkillIds = gatewaySkills.map(s => s.id || s.name || '').filter(Boolean);
  // Union of all known skill IDs for the global pool
  const uniqueSkillIds = Array.from(new Set([
    ...Object.keys(entries),
    ...allAgentSkills,
    ...gatewaySkillIds,
  ]));

  // Available skill pool for agent assignment picker = all known IDs
  const skillPool = Array.from(new Set([
    ...gatewaySkillIds,
    ...Object.keys(entries),
    ...allAgentSkills,
  ])).sort();

  const handleSave = () => {
    if (!config) return;
    // Build updated agents list with new skill assignments
    const updatedAgentList = (config.agents?.list || []).map(agent => {
      const draft = agentSkillsDraft[agent.id];
      if (!draft) return agent;
      return { ...agent, skills: draft.length > 0 ? draft : undefined };
    });
    saveConfig({
      ...config,
      skills: { ...config.skills, entries, extraDirs: extraDirs.length > 0 ? extraDirs : undefined },
      agents: { ...config.agents, list: updatedAgentList },
    });
  };

  const updateEntry = (id: string, patch: Partial<SkillEntry>) => {
    setEntries(p => ({ ...p, [id]: { ...p[id], ...patch } }));
  };

  const removeEntry = (id: string) => {
    setEntries(p => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  };

  const addEntry = () => {
    if (!newSkillId.trim()) return;
    setEntries(p => ({ ...p, [newSkillId.trim()]: { enabled: true } }));
    setNewSkillId('');
  };

  const addDir = () => {
    if (!newDir.trim()) return;
    setExtraDirs(p => [...p, newDir.trim()]);
    setNewDir('');
  };
  const removeDir = (i: number) => setExtraDirs(p => p.filter((_, idx) => idx !== i));

  // --- Agent skill assignment handlers ---
  const removeSkillFromAgent = (agentId: string, skillId: string) => {
    setAgentSkillsDraft(p => ({
      ...p,
      [agentId]: (p[agentId] || []).filter(s => s !== skillId),
    }));
  };

  const addSkillToAgent = (agentId: string, skillId: string) => {
    const id = skillId.trim();
    if (!id) return;
    setAgentSkillsDraft(p => {
      const current = p[agentId] || [];
      if (current.includes(id)) return p;
      return { ...p, [agentId]: [...current, id] };
    });
    // Also ensure an entry exists in skills.entries for this skill
    setEntries(p => {
      if (p[id]) return p;
      return { ...p, [id]: { enabled: true } };
    });
  };

  const changed =
    JSON.stringify(entries) !== JSON.stringify(config?.skills?.entries || {}) ||
    JSON.stringify(extraDirs) !== JSON.stringify(config?.skills?.extraDirs || []) ||
    (config?.agents?.list || []).some(agent => {
      const draft = agentSkillsDraft[agent.id];
      const orig = agent.skills || [];
      if (!draft) return false;
      return JSON.stringify(draft) !== JSON.stringify(orig);
    });

  // Merge: entry IDs from config + IDs discovered from agents + gateway (auto-create)
  const allEntryIds = Array.from(new Set([...Object.keys(entries), ...uniqueSkillIds]));

  return (
    <div className="page-content animate-fade-in">
      <PageHeader
        title={st.title}
        subtitle={st.subtitle}
        icon={
          <svg width="18" height="18" fill="none" stroke="#F472B6" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => setShowClawHub(true)}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            ClawHub 技能市场
          </button>
        }
      />

      {/* ── Skill Entries (skills.entries in openclaw.json) ── */}
      <SectionCard title={st.skillEntries} subtitle={st.skillEntriesDesc}>
        {allEntryIds.length === 0 ? (
          <EmptyState
            icon={<svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
            title={st.noEntries}
            description={st.noEntriesDesc}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {allEntryIds.map(skillId => {
              const entry = entries[skillId] || {};
              const meta = getSkillMeta(skillId);
              const inAgents = agentList.filter(a => a.skills?.includes(skillId));
              const isEnabled = entry.enabled !== false;
              const hasApiKey = meta.hasApiKey || !!entry.apiKey;

              return (
                <div key={skillId} style={{
                  padding: '14px 16px',
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                      background: 'linear-gradient(135deg, rgba(244,114,182,0.2), rgba(99,102,241,0.1))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18,
                    }}>
                      {meta.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          {meta.label}
                        </span>
                        {skillId !== meta.label && (
                          <code style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)', background: 'var(--color-surface-3)', padding: '1px 5px', borderRadius: 4 }}>
                            {skillId}
                          </code>
                        )}
                        {!isEnabled && <Badge variant="gray">disabled</Badge>}
                        {inAgents.length > 0 && inAgents.map(a => (
                          <Badge key={a.id} variant="purple">{a.name || a.id}</Badge>
                        ))}
                      </div>
                      {meta.desc && (
                        <p style={{ margin: '3px 0 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>{meta.desc}</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <Toggle
                        checked={isEnabled}
                        onChange={v => updateEntry(skillId, { enabled: v })}
                        label=""
                      />
                      <button className="btn btn-ghost btn-sm" title="编辑详情" onClick={() => setEditingSkillId(skillId)}>
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {Object.keys(entries).includes(skillId) && (
                        <button className="btn btn-ghost btn-sm" onClick={() => removeEntry(skillId)}>
                          <svg width="12" height="12" fill="none" stroke="#EF4444" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* API Key row */}
                  {(hasApiKey || isEnabled) && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                      <FormField label="API Key" hint="留空则从环境变量读取">
                        <input
                          className="input input-mono"
                          type="password"
                          value={entry.apiKey || ''}
                          onChange={e => updateEntry(skillId, { apiKey: e.target.value || undefined })}
                          placeholder={`${skillId.toUpperCase().replace(/-/g, '_')}_API_KEY`}
                        />
                      </FormField>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add new entry */}
        <div style={{ display: 'flex', gap: 7, marginTop: 14 }}>
          <input
            className="input input-mono"
            style={{ flex: 1 }}
            value={newSkillId}
            onChange={e => setNewSkillId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addEntry()}
            placeholder="skill-id（如 tavily-web-search）"
          />
          <button className="btn btn-secondary btn-sm" onClick={addEntry}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {st.addSkillEntry}
          </button>
        </div>
      </SectionCard>

      {/* ── Agent Skill Assignments (interactive) ── */}
      <SectionCard
        title={st.agentAssignments}
        subtitle={st.agentSkillsDesc}
      >
        {agentList.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{st.noAgents}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {agentList.map(agent => {
              const agentSkills = agentSkillsDraft[agent.id] || [];
              const inputVal = agentSkillInput[agent.id] || '';
              // Autocomplete: pool minus already assigned
              const suggestions = skillPool.filter(s => !agentSkills.includes(s));
              const filteredSuggestions = inputVal.trim()
                ? suggestions.filter(s => s.toLowerCase().includes(inputVal.toLowerCase()))
                : suggestions;

              return (
                <div key={agent.id} style={{
                  padding: '12px 14px',
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 9,
                }}>
                  {/* Agent header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                      background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(37,99,235,0.1))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                    }}>🤖</div>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {agent.name || agent.id}
                      </span>
                      <code style={{ marginLeft: 7, fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)', background: 'var(--color-surface-3)', padding: '1px 5px', borderRadius: 4 }}>
                        {agent.id}
                      </code>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {agentSkills.length} {st.assignedCount}
                    </div>
                  </div>

                  {/* Assigned skill chips with remove button */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8, minHeight: 28 }}>
                    {agentSkills.length === 0 ? (
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                        {st.noSkillsAvailable}
                      </span>
                    ) : agentSkills.map(skillId => {
                      const m = getSkillMeta(skillId);
                      // Warn if skill is not in the discovered pool (may not be installed)
                      const isKnown = skillPool.includes(skillId);
                      return (
                        <span
                          key={skillId}
                          title={isKnown ? skillId : `⚠️ 未在工作区或 Gateway 中发现此技能: ${skillId}`}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 5px 3px 9px', borderRadius: 20,
                            background: isKnown ? 'rgba(244,114,182,0.1)' : 'rgba(239,68,68,0.1)',
                            border: `1px solid ${isKnown ? 'rgba(244,114,182,0.3)' : 'rgba(239,68,68,0.3)'}`,
                            fontSize: 11,
                            color: isKnown ? '#F9A8D4' : '#FCA5A5',
                          }}
                        >
                          <span>{m.icon}</span>
                          <span style={{ fontFamily: 'var(--font-family-mono)' }}>{skillId}</span>
                          {!isKnown && <span style={{ fontSize: 10 }}>⚠️</span>}
                          <button
                            type="button"
                            title={st.removeSkillFromAgent}
                            onClick={() => removeSkillFromAgent(agent.id, skillId)}
                            style={{
                              marginLeft: 2, padding: '1px 3px', border: 'none', background: 'none',
                              cursor: 'pointer', color: 'inherit', opacity: 0.7, fontSize: 11, lineHeight: 1,
                              display: 'flex', alignItems: 'center',
                            }}
                          >✕</button>
                        </span>
                      );
                    })}
                  </div>

                  {/* Add skill to agent */}
                  <div style={{ position: 'relative', display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input
                        className="input input-mono"
                        style={{ width: '100%', fontSize: 12 }}
                        value={inputVal}
                        onChange={e => setAgentSkillInput(p => ({ ...p, [agent.id]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (inputVal.trim()) {
                              addSkillToAgent(agent.id, inputVal.trim());
                              setAgentSkillInput(p => ({ ...p, [agent.id]: '' }));
                            }
                          }
                        }}
                        placeholder={`${st.addSkillToAgent}…`}
                      />
                      {/* Autocomplete dropdown */}
                      {inputVal.trim() && filteredSuggestions.length > 0 && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                          background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                          borderRadius: 7, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                          maxHeight: 160, overflowY: 'auto',
                        }}>
                          {filteredSuggestions.slice(0, 10).map(s => (
                            <button
                              key={s}
                              type="button"
                              onMouseDown={e => {
                                e.preventDefault();
                                addSkillToAgent(agent.id, s);
                                setAgentSkillInput(p => ({ ...p, [agent.id]: '' }));
                              }}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '6px 10px', background: 'none', border: 'none',
                                color: 'var(--color-text-secondary)', cursor: 'pointer',
                                fontFamily: 'var(--font-family-mono)', fontSize: 12,
                              }}
                            >
                              {getSkillMeta(s).icon} {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flexShrink: 0 }}
                      disabled={!inputVal.trim()}
                      onClick={() => {
                        if (inputVal.trim()) {
                          addSkillToAgent(agent.id, inputVal.trim());
                          setAgentSkillInput(p => ({ ...p, [agent.id]: '' }));
                        }
                      }}
                    >
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      添加
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* Gateway skill pool hint */}
        {gwState === 'connected' && gatewaySkillIds.length > 0 && (
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 10, marginBottom: 0 }}>
            💡 {st.skillsFromGateway}：{gatewaySkillIds.length} 个（输入框中可自动补全）
          </p>
        )}
        {gwState !== 'connected' && (
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 10, marginBottom: 0 }}>
            ⚠️ Gateway 未连接，技能自动补全不可用
          </p>
        )}
      </SectionCard>

      {/* ── Extra Dirs ── */}
      <SectionCard title={st.extraDirs} subtitle="从自定义目录加载本地开发中的技能（适合技能开发者）">
        <InfoBox type="tip" collapsible defaultCollapsed>
          额外技能目录用于加载<strong>本地自定义技能</strong>，适合以下场景：
          <ul style={{ margin: '4px 0 0 0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <li>开发/调试中的技能（还未发布到 ClawHub）</li>
            <li>公司内部私有技能</li>
            <li>从源码直接加载官方技能</li>
          </ul>
          每个目录中须包含 <code style={{ fontFamily: 'monospace', background: 'rgba(99,102,241,0.12)', padding: '1px 4px', borderRadius: 3 }}>SKILL.md</code> 文件的子文件夹，OpenClaw 会自动扫描识别。
        </InfoBox>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {extraDirs.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
              未配置额外技能目录。
            </p>
          )}
          {extraDirs.map((dir, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px',
              background: 'var(--color-surface-2)', borderRadius: 7,
              border: '1px solid var(--color-border)',
            }}>
              <svg width="12" height="12" fill="none" stroke="#94A3B8" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <code style={{ flex: 1, fontFamily: 'var(--font-family-mono)', fontSize: 12, color: 'var(--color-text-secondary)' }}>{dir}</code>
              <button className="btn btn-ghost btn-sm" onClick={() => removeDir(i)} style={{ padding: '3px 7px' }}>
                <svg width="12" height="12" fill="none" stroke="#EF4444" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 7, marginTop: 4 }}>
            <input
              className="input input-mono"
              style={{ flex: 1, fontSize: 12 }}
              value={newDir}
              onChange={e => setNewDir(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDir()}
              placeholder="/path/to/my-skills"
            />
            <button className="btn btn-secondary btn-sm" onClick={addDir}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {st.addDir}
            </button>
          </div>
        </div>
      </SectionCard>

      <SaveBar onSave={handleSave} saving={saveStatus === 'saving'} />

      {editingSkillId && (
        <SkillEditModal
          skillId={editingSkillId}
          entry={entries[editingSkillId] || {}}
          extraDirs={extraDirs}
          onSave={(id, e) => updateEntry(id, e)}
          onClose={() => setEditingSkillId(null)}
        />
      )}

      {showClawHub && (
        <ClawHubModal
          installedIds={Object.keys(entries)}
          onInstall={id => {
            setEntries(p => ({ ...p, [id]: { ...p[id], enabled: true } }));
          }}
          onClose={() => setShowClawHub(false)}
        />
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────
//  SkillEditModal
// ─────────────────────────────────────────────────────────────
function SkillEditModal({ skillId, entry, extraDirs, onSave, onClose }: {
  skillId: string;
  entry: SkillEntry;
  extraDirs: string[];
  onSave: (skillId: string, entry: SkillEntry) => void;
  onClose: () => void;
}) {
  const meta = getSkillMeta(skillId);
  const [local, setLocal] = useState<SkillEntry>({ ...entry });
  const [activeTab, setActiveTab] = useState<'basic' | 'auth' | 'env' | 'prompt'>('basic');
  const [envRows, setEnvRows] = useState<[string, string][]>(
    Object.entries(entry.env || {})
  );
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvVal, setNewEnvVal] = useState('');

  // ── Skill 2.0 SKILL.md 编辑 ─────────────────────────────────
  const { openclawHome } = useAppStore();
  const [promptPath, setPromptPath] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [promptDirty, setPromptDirty] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptError, setPromptError] = useState('');
  const [manualPromptPath, setManualPromptPath] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function findSkillMd() {
      setLoadingPrompt(true);
      setPromptPath('');
      setPromptContent('');
      // 搜索顺序: openclawHome/skills/ 优先，然后 extraDirs
      // Normalize to forward slashes — Rust fs accepts '/' on all platforms including Windows
      const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
      const defaultSkillsDir = openclawHome ? normPath(openclawHome) + '/skills' : null;
      const searchDirs = [
        ...(defaultSkillsDir ? [defaultSkillsDir] : []),
        ...extraDirs.map(normPath),
      ];
      for (const dir of searchDirs) {
        const tryPaths = [
          normPath(dir) + '/' + skillId + '/SKILL.md',
        ];
        for (const p of tryPaths) {
          try {
            const content = await invoke<string>('read_text_file', { path: p });
            if (!cancelled) { setPromptPath(p); setPromptContent(content); }
            setLoadingPrompt(false);
            return;
          } catch { /* 继续尝试 */ }
        }
      }
      if (!cancelled) setLoadingPrompt(false);
    }
    findSkillMd();
    return () => { cancelled = true; };
  }, [skillId, extraDirs, openclawHome]);

  const loadPromptFromPath = async (path: string) => {
    if (!path.trim()) return;
    setLoadingPrompt(true);
    setPromptError('');
    try {
      const content = await invoke<string>('read_text_file', { path: path.trim() });
      setPromptPath(path.trim());
      setPromptContent(content);
      setPromptDirty(false);
    } catch (e: any) { setPromptError(String(e)); }
    setLoadingPrompt(false);
  };

  const savePrompt = async () => {
    if (!promptPath || !promptDirty) return;
    setSavingPrompt(true);
    setPromptError('');
    try {
      await invoke('write_text_file', { path: promptPath, content: promptContent });
      setPromptDirty(false);
    } catch (e: any) { setPromptError(String(e)); }
    setSavingPrompt(false);
  };

  const handleSave = () => {
    const env: Record<string, string> = {};
    envRows.forEach(([k, v]) => { if (k.trim()) env[k.trim()] = v; });
    onSave(skillId, {
      ...local,
      env: Object.keys(env).length > 0 ? env : undefined,
    });
    onClose();
  };

  const addEnvRow = () => {
    if (!newEnvKey.trim()) return;
    setEnvRows(p => [...p, [newEnvKey.trim(), newEnvVal]]);
    setNewEnvKey(''); setNewEnvVal('');
  };

  const TABS = [
    { id: 'basic', label: '基本信息' },
    { id: 'auth', label: '认证' },
    { id: 'env', label: '环境变量' },
    { id: 'prompt', label: '📄 Prompt' },
  ] as const;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9100,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}>
      <div className="card animate-fade-in" style={{ width: 500, maxWidth: '90vw', padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(244,114,182,0.2), rgba(99,102,241,0.15))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>
            {local.icon as string || meta.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              编辑技能
            </div>
            <code style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)' }}>
              {skillId}
            </code>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: activeTab === tab.id ? 'rgba(167,139,250,0.15)' : 'transparent',
                color: activeTab === tab.id ? '#A78BFA' : 'var(--color-text-secondary)',
                fontSize: 12, fontWeight: activeTab === tab.id ? 600 : 400,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'basic' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField label="显示名称" hint="覆盖默认的显示名称">
              <input
                className="input"
                value={local.label as string || ''}
                onChange={e => setLocal(p => ({ ...p, label: e.target.value || undefined }))}
                placeholder={meta.label}
              />
            </FormField>
            <FormField label="描述" hint="自定义描述信息">
              <textarea
                className="input"
                rows={2}
                value={local.description as string || ''}
                onChange={e => setLocal(p => ({ ...p, description: e.target.value || undefined }))}
                placeholder={meta.desc || '技能描述'}
                style={{ resize: 'vertical' }}
              />
            </FormField>
            <div>
              <Toggle
                checked={local.enabled !== false}
                onChange={v => setLocal(p => ({ ...p, enabled: v }))}
                label="启用此技能"
              />
            </div>
          </div>
        )}

        {activeTab === 'auth' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField label="API Key" hint={`留空则自动读取环境变量 ${skillId.toUpperCase().replace(/-/g, '_')}_API_KEY`} tooltip="推荐通过环境变量而非明文存储 API Key。在系统环境变量中设置后，此处留空即可自动读取">
              <input
                className="input input-mono"
                type="password"
                value={local.apiKey as string || ''}
                onChange={e => setLocal(p => ({ ...p, apiKey: e.target.value || undefined }))}
                placeholder={`${skillId.toUpperCase().replace(/-/g, '_')}_API_KEY`}
              />
            </FormField>
            {local.apiKey && (
              <div style={{ fontSize: 11, color: '#6EE7B7', padding: '7px 10px', borderRadius: 7, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                ✓ API Key 已配置
              </div>
            )}
          </div>
        )}

        {activeTab === 'env' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: '0 0 8px 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
              为该技能注入额外的环境变量
            </p>
            {envRows.map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                <input
                  className="input input-mono"
                  style={{ flex: 1, fontSize: 12 }}
                  value={k}
                  onChange={e => setEnvRows(p => p.map((r, j) => j === i ? [e.target.value, r[1]] : r))}
                  placeholder="KEY"
                />
                <span style={{ color: 'var(--color-text-muted)' }}>=</span>
                <input
                  className="input input-mono"
                  style={{ flex: 2, fontSize: 12 }}
                  value={v}
                  onChange={e => setEnvRows(p => p.map((r, j) => j === i ? [r[0], e.target.value] : r))}
                  placeholder="value"
                />
                <button className="btn btn-ghost btn-sm" onClick={() => setEnvRows(p => p.filter((_, j) => j !== i))}>
                  <svg width="11" height="11" fill="none" stroke="#EF4444" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 7 }}>
              <input
                className="input input-mono"
                style={{ flex: 1, fontSize: 12 }}
                value={newEnvKey}
                onChange={e => setNewEnvKey(e.target.value)}
                placeholder="新 KEY"
              />
              <span style={{ color: 'var(--color-text-muted)', lineHeight: '36px' }}>=</span>
              <input
                className="input input-mono"
                style={{ flex: 2, fontSize: 12 }}
                value={newEnvVal}
                onChange={e => setNewEnvVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addEnvRow()}
                placeholder="value"
              />
              <button className="btn btn-secondary btn-sm" onClick={addEnvRow}>+</button>
            </div>
          </div>
        )}

        {activeTab === 'prompt' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              padding: '8px 12px', borderRadius: 7,
              background: 'rgba(167,139,250,0.08)',
              border: '1px solid rgba(167,139,250,0.2)',
              fontSize: 11, color: '#C4B5FD',
            }}>
              📋 Skill 2.0 — 编辑 <code style={{ fontFamily: 'var(--font-family-mono)' }}>SKILL.md</code> 文件
              （YAML frontmatter + Markdown prompt 正文）
            </div>

            {loadingPrompt ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-text-muted)', fontSize: 12 }}>
                正在查找 SKILL.md…
              </div>
            ) : promptPath ? (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: 6,
                  background: 'var(--color-surface-3)',
                  fontSize: 11, color: 'var(--color-text-muted)',
                }}>
                  <svg width="12" height="12" fill="none" stroke="#34D399" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <code style={{ fontFamily: 'var(--font-family-mono)', fontSize: 10 }}>{promptPath}</code>
                  {promptDirty && (
                    <span style={{ marginLeft: 'auto', color: '#F59E0B', fontSize: 10 }}>● 未保存</span>
                  )}
                </div>
                <textarea
                  className="input input-mono"
                  rows={13}
                  value={promptContent}
                  onChange={e => { setPromptContent(e.target.value); setPromptDirty(true); }}
                  style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.65 }}
                  placeholder={`---\nname: ${skillId}\ndescription: |\n  触发条件描述\n---\n\n# ${skillId}\n\n你的 prompt 正文…`}
                />
                {promptError && (
                  <div style={{ fontSize: 11, color: '#F87171' }}>❌ {promptError}</div>
                )}
                <button
                  className="btn btn-primary btn-sm"
                  onClick={savePrompt}
                  disabled={!promptDirty || savingPrompt}
                  style={{ alignSelf: 'flex-end' }}
                >
                  {savingPrompt ? '保存中…' : '💾 保存 SKILL.md'}
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  未在技能目录中找到 <code style={{ fontFamily: 'var(--font-family-mono)' }}>SKILL.md</code>。
                  请在「技能设置 → 额外目录」中添加技能根目录，或手动输入文件路径：
                </p>
                <div style={{ display: 'flex', gap: 7 }}>
                  <input
                    className="input input-mono"
                    style={{ flex: 1, fontSize: 12 }}
                    value={manualPromptPath}
                    onChange={e => setManualPromptPath(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && loadPromptFromPath(manualPromptPath)}
                    placeholder={`C:/skills/${skillId}/SKILL.md`}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={() => loadPromptFromPath(manualPromptPath)}>打开</button>
                </div>
                {promptError && (
                  <div style={{ fontSize: 11, color: '#F87171' }}>❌ {promptError}</div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  ClawHubModal — 搜索和安装技能
// ─────────────────────────────────────────────────────────────
const CLAWHUB_SKILLS = [
  { id: 'tavily-web-search', icon: '🔍', name: 'Tavily Web Search', author: 'openclaw', desc: '通过 Tavily API 进行高质量 Web 搜索', category: '搜索', hasApiKey: true },
  { id: 'Memory', icon: '🧠', name: 'Memory', author: 'openclaw', desc: '长期记忆存储与语义检索', category: '记忆', hasApiKey: false },
  { id: 'peekaboo', icon: '👁️', name: 'Peekaboo Vision', author: 'openclaw', desc: '视觉感知与图像分析', category: '视觉', hasApiKey: false },
  { id: 'browser-use', icon: '🌐', name: 'Browser Use', author: 'openclaw', desc: '智能浏览器控制与网页自动化', category: '浏览器', hasApiKey: false },
  { id: 'perplexity-search', icon: '🔮', name: 'Perplexity Search', author: 'openclaw', desc: 'AI 增强的实时网络搜索', category: '搜索', hasApiKey: true },
  { id: 'gemini-flash', icon: '✨', name: 'Gemini Flash', author: 'google', desc: 'Google Gemini Flash 模型集成', category: 'AI', hasApiKey: true },
  { id: 'web-scraper', icon: '🕷️', name: 'Web Scraper', author: 'openclaw', desc: '高效网页内容抓取与解析', category: '网页', hasApiKey: false },
  { id: 'feishu-tools', icon: '🦜', name: 'Feishu Tools', author: 'openclaw', desc: '飞书消息、文档、日历集成', category: '效率', hasApiKey: true },
  { id: 'notion-tools', icon: '📓', name: 'Notion Tools', author: 'openclaw', desc: 'Notion 数据库和页面操作', category: '效率', hasApiKey: true },
  { id: 'github-tools', icon: '🐱', name: 'GitHub Tools', author: 'openclaw', desc: 'GitHub 仓库、Issues、PR 管理', category: '开发', hasApiKey: true },
  { id: 'hot-tech-radar', icon: '📡', name: 'Hot Tech Radar', author: 'openclaw', desc: '实时科技热点追踪与分析', category: '资讯', hasApiKey: false },
  { id: 'xiaohongshu-mcp', icon: '📱', name: 'XiaoHongShu MCP', author: 'community', desc: '小红书内容发布与互动管理', category: '社媒', hasApiKey: false },
  { id: 'email-tools', icon: '✉️', name: 'Email Tools', author: 'openclaw', desc: '邮件收发与智能处理', category: '效率', hasApiKey: true },
  { id: 'code-executor', icon: '⚡', name: 'Code Executor', author: 'openclaw', desc: '安全执行 Python/JS 代码片段', category: '开发', hasApiKey: false },
  { id: 'toutiao-publish', icon: '📰', name: 'Toutiao Publish', author: 'community', desc: '今日头条文章发布管理', category: '社媒', hasApiKey: false },
];

function ClawHubModal({ installedIds, onInstall, onClose }: {
  installedIds: string[];
  onInstall: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [justInstalled, setJustInstalled] = useState<Set<string>>(new Set());
  const [gwState, setGwState] = useState(gatewayClient.state);
  const [gwStatus, setGwStatus] = useState<SkillStatusEntry[]>([]);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [gwError, setGwError] = useState('');

  // ClawHub API search state
  const [apiResults, setApiResults] = useState<Array<{ slug: string; displayName: string; summary?: string }>>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiSearched, setApiSearched] = useState(false);

  useEffect(() => {
    const unsub = gatewayClient.onStateChange(s => setGwState(s));
    return unsub;
  }, []);

  const refreshGwStatus = useCallback(() => {
    gwRpc.skillsStatus().then(r => setGwStatus(r.skills)).catch(() => {});
  }, []);

  useEffect(() => {
    if (gwState !== 'connected') return;
    setGwError('');
    refreshGwStatus();
  }, [gwState, refreshGwStatus]);

  // Search clawhub.com API
  const searchClawHub = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setApiResults([]); setApiSearched(false); return; }
    setApiLoading(true);
    setApiSearched(true);
    try {
      const res = await fetch(`https://clawhub.com/api/search?q=${encodeURIComponent(trimmed)}&limit=20`);
      if (res.ok) {
        const data: { results?: Array<{ slug: string; displayName: string; summary?: string }> } = await res.json();
        setApiResults(data.results || []);
      } else {
        setApiResults([]);
      }
    } catch {
      setApiResults([]);
    }
    setApiLoading(false);
  }, []);

  // Auto-search when query changes (debounced 500ms)
  useEffect(() => {
    const t = setTimeout(() => { searchClawHub(query); }, 500);
    return () => clearTimeout(t);
  }, [query, searchClawHub]);

  // Merge: local catalog + gateway status entries not in catalog
  const allSkills = (() => {
    const merged = [...CLAWHUB_SKILLS];
    for (const st of gwStatus) {
      const id = st.id || st.name || '';
      if (id && !merged.find(s => s.id === id)) {
        merged.push({
          id,
          name: st.name || id,
          icon: '⚡',
          author: 'gateway',
          desc: st.description || '',
          category: '已安装',
          hasApiKey: !!(st.hasApiKey),
        });
      }
    }
    return merged;
  })();

  const gwInstalledIds = gwStatus.filter(s => s.installed).map(s => s.id);

  // Local filter (when no API search results yet)
  const localFiltered = allSkills.filter(s =>
    !query.trim() ||
    s.id.toLowerCase().includes(query.toLowerCase()) ||
    s.name.toLowerCase().includes(query.toLowerCase()) ||
    s.desc.includes(query) ||
    s.category.includes(query)
  );

  // Merge API results with local — API results shown when query is non-empty
  const displayList: Array<{ id: string; name: string; icon: string; author: string; desc: string; category: string; hasApiKey: boolean; fromApi?: boolean }> = (() => {
    if (!query.trim()) return localFiltered;
    const local = localFiltered;
    if (!apiSearched) return local;
    const apiExtra = apiResults
      .filter(r => !local.find(s => s.id === r.slug))
      .map(r => ({
        id: r.slug,
        name: r.displayName,
        icon: '🌐',
        author: 'clawhub',
        desc: r.summary || '',
        category: 'ClawHub',
        hasApiKey: false,
        fromApi: true,
      }));
    return [...local, ...apiExtra];
  })();

  const handleInstall = useCallback(async (id: string, skillName?: string) => {
    onInstall(id);
    setJustInstalled(p => new Set([...p, id]));
    if (gwState === 'connected') {
      setInstalling(p => new Set([...p, id]));
      setGwError('');
      try {
        // Look up install spec from gateway status
        const statusEntry = gwStatus.find(s => s.id === id || s.name === id);
        const installId = statusEntry?.install?.[0]?.id;
        const name = skillName || statusEntry?.name || id;
        if (installId) {
          await gwRpc.skillsInstall(name, installId);
          refreshGwStatus();
        } else {
          // Skill not in workspace or has no install spec — show CLI hint
          setGwError(`技能 "${id}" 不在工作区，请先运行: clawhub install ${id}`);
          setJustInstalled(p => { const s = new Set(p); s.delete(id); return s; });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setGwError(`安装失败: ${msg}`);
        setJustInstalled(p => { const s = new Set(p); s.delete(id); return s; });
      } finally {
        setInstalling(p => { const s = new Set(p); s.delete(id); return s; });
      }
    }
  }, [gwState, onInstall, refreshGwStatus, gwStatus]);

  const openInBrowser = () => {
    const url = query.trim()
      ? `https://clawhub.com/search?q=${encodeURIComponent(query)}`
      : 'https://clawhub.com/';
    window.open(url, '_blank');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9100,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}>
      <div className="card animate-fade-in" style={{ width: 600, maxWidth: '92vw', padding: '24px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 24 }}>🦞</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, background: 'linear-gradient(135deg,#A78BFA,#60A5FA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              ClawHub 技能市场
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>clawhub.ai — 发现并安装 Agent 技能</div>
              {gwState === 'connected' ? (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'rgba(16,185,129,0.12)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>
                  ● Gateway 已连接
                </span>
              ) : (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'rgba(107,114,128,0.12)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                  ○ Gateway 离线
                </span>
              )}
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={openInBrowser}
            style={{ color: '#60A5FA', fontSize: 11 }}
          >
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            在浏览器中打开
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <svg width="14" height="14" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" viewBox="0 0 24 24" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchClawHub(query)}
            placeholder="搜索技能名称、ID 或分类… (Enter 搜索 ClawHub)"
            autoFocus
          />
        </div>

        {/* Gateway error */}
        {gwError && (
          <div style={{ marginBottom: 10, padding: '7px 12px', borderRadius: 7, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 11, color: '#F87171', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>❌ {gwError}</span>
            <button onClick={() => setGwError('')} style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 13, padding: '0 4px' }}>✕</button>
          </div>
        )}

        {/* Skill list */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Search loading indicator */}
          {apiLoading && (
            <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> 正在搜索 clawhub.com…
            </div>
          )}
          {displayList.length === 0 && !apiLoading ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
              <div>{apiSearched ? '未在 ClawHub 找到匹配技能' : '未找到匹配技能'}</div>
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={openInBrowser}>
                在 ClawHub 上搜索 "{query}"
              </button>
            </div>
          ) : (
            displayList.map(skill => {
              const isInstalled = installedIds.includes(skill.id) || justInstalled.has(skill.id) || gwInstalledIds.includes(skill.id);
              const isInstalling = installing.has(skill.id);
              const gwStatusEntry = gwStatus.find(s => s.id === skill.id || s.name === skill.id);
              return (
                <div key={skill.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px',
                  background: 'var(--color-surface-2)',
                  border: `1px solid ${isInstalled ? 'rgba(16,185,129,0.2)' : 'var(--color-border)'}`,
                  borderRadius: 9,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                    background: 'linear-gradient(135deg,rgba(244,114,182,0.15),rgba(99,102,241,0.1))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>
                    {skill.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{skill.name}</span>
                      <code style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)', background: 'var(--color-surface-3)', padding: '1px 5px', borderRadius: 3 }}>{skill.id}</code>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(99,102,241,0.1)', color: '#A5B4FC', border: '1px solid rgba(99,102,241,0.2)' }}>{skill.category}</span>
                      {skill.hasApiKey && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(245,158,11,0.1)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.2)' }}>需要 API Key</span>}
                      {skill.author !== 'openclaw' && skill.author !== 'gateway' && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(52,211,153,0.1)', color: '#6EE7B7', border: '1px solid rgba(52,211,153,0.2)' }}>社区</span>}
                      {(skill as { fromApi?: boolean }).fromApi && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(96,165,250,0.1)', color: '#93C5FD', border: '1px solid rgba(96,165,250,0.2)' }}>🌐 在线</span>}
                      {gwStatusEntry?.version && <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>v{gwStatusEntry.version}</span>}
                    </div>
                    <p style={{ margin: '3px 0 0 0', fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{skill.desc}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      className={isInstalled ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}
                      onClick={() => !isInstalled && !isInstalling && handleInstall(skill.id, skill.name)}
                      disabled={isInstalled || isInstalling}
                      style={{ minWidth: 72 }}
                    >
                      {isInstalling ? '安装中…' : isInstalled ? '✓ 已安装' : '安装'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 12 }}>
          更多技能请访问 <button onClick={openInBrowser} style={{ background: 'none', border: 'none', color: '#60A5FA', cursor: 'pointer', fontSize: 10, padding: 0 }}>clawhub.com</button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useAppStore } from '../store';
import { InstanceProfile, InstanceType } from '../types';
import { PageHeader, SectionCard, Badge, EmptyState } from '../components/ui';

const TYPE_COLORS: Record<InstanceType, string> = {
  local: '#22c55e',
  remote: '#3b82f6',
  ssh: '#f59e0b',
};

const TYPE_LABELS: Record<InstanceType, { zh: string; en: string }> = {
  local: { zh: '本地', en: 'Local' },
  remote: { zh: '远程', en: 'Remote' },
  ssh: { zh: 'SSH 隧道', en: 'SSH Tunnel' },
};

const ACCENT_COLORS = [
  '#7c3aed', '#2563eb', '#059669', '#dc2626',
  '#d97706', '#db2777', '#0891b2', '#65a30d',
];

const DEFAULT_FORM: Omit<InstanceProfile, 'id' | 'createdAt'> = {
  name: '',
  type: 'remote',
  gatewayUrl: 'ws://localhost:18789',
  token: '',
  sshHost: '',
  sshUser: '',
  sshKeyPath: '',
  notes: '',
  color: ACCENT_COLORS[0],
};

function InstanceCard({
  inst, isActive, onSwitch, onEdit, onRemove, lang,
}: {
  inst: InstanceProfile;
  isActive: boolean;
  onSwitch: () => void;
  onEdit: () => void;
  onRemove: () => void;
  lang: 'zh' | 'en';
}) {
  const typeLabel = TYPE_LABELS[inst.type]?.[lang] ?? inst.type;
  const typeColor = TYPE_COLORS[inst.type] ?? '#888';

  return (
    <div style={{
      border: `1.5px solid ${isActive ? (inst.color || '#7c3aed') : 'var(--color-border)'}`,
      borderRadius: 12,
      padding: '16px 18px',
      background: isActive ? `${inst.color || '#7c3aed'}10` : 'var(--color-surface-2)',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      transition: 'all 0.15s',
      position: 'relative',
    }}>
      {/* Color dot */}
      <div style={{
        width: 12, height: 12, borderRadius: '50%',
        background: inst.color || '#7c3aed',
        flexShrink: 0,
        boxShadow: isActive ? `0 0 0 3px ${inst.color || '#7c3aed'}30` : undefined,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {inst.name}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
            background: `${typeColor}20`, color: typeColor, letterSpacing: '0.04em',
          }}>
            {typeLabel}
          </span>
          {isActive && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
              background: '#22c55e20', color: '#22c55e',
            }}>
              {lang === 'zh' ? '当前' : 'Active'}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
          {inst.gatewayUrl}
          {inst.sshHost && ` via ${inst.sshUser ? `${inst.sshUser}@` : ''}${inst.sshHost}`}
        </div>
        {inst.notes && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, fontStyle: 'italic' }}>
            {inst.notes}
          </div>
        )}
        {inst.lastConnectedAt && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {lang === 'zh' ? '上次连接' : 'Last connected'}: {new Date(inst.lastConnectedAt).toLocaleString()}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {!isActive && (
          <button
            onClick={onSwitch}
            style={{
              padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: `${inst.color || '#7c3aed'}20`, color: inst.color || '#7c3aed',
              border: `1px solid ${inst.color || '#7c3aed'}50`,
              transition: 'all 0.12s', fontFamily: 'inherit',
            }}
          >
            {lang === 'zh' ? '切换' : 'Switch'}
          </button>
        )}
        <button
          onClick={onEdit}
          style={{
            padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)', transition: 'all 0.12s', fontFamily: 'inherit',
          }}
        >
          {lang === 'zh' ? '编辑' : 'Edit'}
        </button>
        <button
          onClick={onRemove}
          style={{
            padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: 'transparent', color: '#ef4444',
            border: '1px solid #ef444440', transition: 'all 0.12s', fontFamily: 'inherit',
          }}
        >
          {lang === 'zh' ? '删除' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

function InstanceForm({
  initial,
  lang,
  onSave,
  onCancel,
}: {
  initial: Omit<InstanceProfile, 'id' | 'createdAt'>;
  lang: 'zh' | 'en';
  onSave: (data: Omit<InstanceProfile, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const isValid = form.name.trim() && form.gatewayUrl.trim();

  const field = (label: string, key: keyof typeof form, type = 'text', hint?: string) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 5 }}>
        {label}
      </label>
      <input
        type={type}
        value={(form[key] as string) ?? ''}
        onChange={e => set({ [key]: e.target.value } as Partial<typeof form>)}
        style={{
          width: '100%', padding: '8px 11px', borderRadius: 8, fontSize: 13,
          background: 'var(--color-surface-3)', border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)', fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      />
      {hint && <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>{hint}</p>}
    </div>
  );

  return (
    <div style={{
      background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
      borderRadius: 12, padding: 20, marginTop: 12,
    }}>
      <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 16px 0' }}>
        {lang === 'zh' ? '实例配置' : 'Instance Configuration'}
      </h4>

      {/* Type selector */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 5 }}>
          {lang === 'zh' ? '类型' : 'Type'}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['local', 'remote', 'ssh'] as InstanceType[]).map(t => (
            <button
              key={t}
              onClick={() => set({ type: t })}
              style={{
                padding: '6px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                background: form.type === t ? `${TYPE_COLORS[t]}20` : 'var(--color-surface-3)',
                color: form.type === t ? TYPE_COLORS[t] : 'var(--color-text-muted)',
                border: `1px solid ${form.type === t ? TYPE_COLORS[t] + '60' : 'var(--color-border)'}`,
              }}
            >
              {TYPE_LABELS[t][lang]}
            </button>
          ))}
        </div>
      </div>

      {field(lang === 'zh' ? '实例名称' : 'Name', 'name', 'text', lang === 'zh' ? '便于识别的显示名称' : 'Friendly display name')}
      {field('Gateway URL', 'gatewayUrl', 'text', lang === 'zh' ? 'WebSocket 地址，例如 ws://192.168.1.10:18789' : 'WebSocket URL, e.g. ws://192.168.1.10:18789')}
      {field(lang === 'zh' ? '访问令牌' : 'Token', 'token', 'password', lang === 'zh' ? '可选，留空表示无认证' : 'Optional, leave empty for no auth')}

      {form.type === 'ssh' && (
        <>
          {field(lang === 'zh' ? 'SSH 主机' : 'SSH Host', 'sshHost', 'text', lang === 'zh' ? '例如 user@192.168.1.5' : 'e.g. user@192.168.1.5')}
          {field(lang === 'zh' ? 'SSH 用户名' : 'SSH User', 'sshUser')}
          {field(lang === 'zh' ? 'SSH 密钥路径' : 'SSH Key Path', 'sshKeyPath', 'text', lang === 'zh' ? '~/.ssh/id_rsa' : '~/.ssh/id_rsa')}
        </>
      )}

      {field(lang === 'zh' ? '备注' : 'Notes', 'notes')}

      {/* Color picker */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 7 }}>
          {lang === 'zh' ? '标识颜色' : 'Accent Color'}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {ACCENT_COLORS.map(c => (
            <div
              key={c}
              onClick={() => set({ color: c })}
              style={{
                width: 24, height: 24, borderRadius: '50%', background: c,
                cursor: 'pointer', transition: 'all 0.12s',
                boxShadow: form.color === c ? `0 0 0 3px var(--color-bg), 0 0 0 5px ${c}` : undefined,
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button
          onClick={onCancel}
          style={{
            padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)', fontFamily: 'inherit',
          }}
        >
          {lang === 'zh' ? '取消' : 'Cancel'}
        </button>
        <button
          onClick={() => isValid && onSave(form)}
          disabled={!isValid}
          style={{
            padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: isValid ? 'pointer' : 'not-allowed',
            background: isValid ? 'linear-gradient(135deg,#7c3aed,#2563eb)' : 'var(--color-surface-3)',
            color: isValid ? '#fff' : 'var(--color-text-muted)',
            border: 'none', fontFamily: 'inherit', opacity: isValid ? 1 : 0.6,
          }}
        >
          {lang === 'zh' ? '保存' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export function InstancesPage() {
  const { instances, activeInstanceId, addInstance, updateInstance, removeInstance, switchInstance, addToast, language } = useAppStore();
  const lang = language as 'zh' | 'en';
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleAdd = (data: Omit<InstanceProfile, 'id' | 'createdAt'>) => {
    addInstance(data);
    setShowForm(false);
    addToast({ type: 'success', message: lang === 'zh' ? '实例已添加' : 'Instance added' });
  };

  const handleUpdate = (id: string, data: Omit<InstanceProfile, 'id' | 'createdAt'>) => {
    updateInstance(id, data);
    setEditingId(null);
    addToast({ type: 'success', message: lang === 'zh' ? '已更新' : 'Updated' });
  };

  const handleSwitch = (id: string) => {
    switchInstance(id);
    addToast({ type: 'success', message: lang === 'zh' ? '已切换实例' : 'Instance switched' });
  };

  const handleRemove = (id: string) => {
    removeInstance(id);
    setDeleteConfirm(null);
    addToast({ type: 'info', message: lang === 'zh' ? '实例已删除' : 'Instance removed' });
  };

  const activeInst = instances.find(i => i.id === activeInstanceId);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 860, margin: '0 auto' }}>
      <PageHeader
        title={lang === 'zh' ? '实例管理' : 'Instance Management'}
        subtitle={lang === 'zh' ? '管理本地与远程 OpenClaw 运行实例，快速切换工作环境' : 'Manage local and remote OpenClaw instances, switch environments easily'}
      />

      {/* Active instance banner */}
      {activeInst && (
        <div style={{
          background: `${activeInst.color || '#7c3aed'}15`,
          border: `1px solid ${activeInst.color || '#7c3aed'}40`,
          borderRadius: 10, padding: '10px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: activeInst.color || '#7c3aed', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {lang === 'zh' ? '当前实例：' : 'Active instance: '}
            <strong style={{ color: 'var(--color-text-primary)' }}>{activeInst.name}</strong>
            <span style={{ marginLeft: 8, color: 'var(--color-text-muted)', fontSize: 12 }}>{activeInst.gatewayUrl}</span>
          </span>
        </div>
      )}

      {!activeInstanceId && instances.length > 0 && (
        <div style={{
          background: '#f59e0b15', border: '1px solid #f59e0b40', borderRadius: 10,
          padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#f59e0b',
        }}>
          {lang === 'zh' ? '⚠️ 未选择活跃实例，当前使用本地默认配置' : '⚠️ No active instance selected, using local default config'}
        </div>
      )}

      <SectionCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            {lang === 'zh' ? `所有实例（${instances.length}）` : `All Instances (${instances.length})`}
          </h3>
          <button
            onClick={() => { setShowForm(true); setEditingId(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: 'linear-gradient(135deg,#7c3aed,#2563eb)', color: '#fff',
              border: 'none', fontFamily: 'inherit',
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {lang === 'zh' ? '添加实例' : 'Add Instance'}
          </button>
        </div>

        {instances.length === 0 && !showForm && (
          <EmptyState
            title={lang === 'zh' ? '暂无实例' : 'No instances'}
            description={lang === 'zh' ? '添加本地或远程 OpenClaw 实例以便快速切换' : 'Add local or remote OpenClaw instances for quick switching'}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {instances.map(inst => (
            <div key={inst.id}>
              {editingId === inst.id ? (
                <InstanceForm
                  initial={{ name: inst.name, type: inst.type, gatewayUrl: inst.gatewayUrl, token: inst.token, sshHost: inst.sshHost, sshUser: inst.sshUser, sshKeyPath: inst.sshKeyPath, notes: inst.notes, color: inst.color }}
                  lang={lang}
                  onSave={data => handleUpdate(inst.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <InstanceCard
                    inst={inst}
                    isActive={inst.id === activeInstanceId}
                    onSwitch={() => handleSwitch(inst.id)}
                    onEdit={() => setEditingId(inst.id)}
                    onRemove={() => setDeleteConfirm(inst.id)}
                    lang={lang}
                  />
                  {deleteConfirm === inst.id && (
                    <div style={{
                      background: '#ef444415', border: '1px solid #ef444440',
                      borderRadius: 8, padding: '12px 16px', marginTop: 4,
                      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', flex: 1 }}>
                        {lang === 'zh' ? `确认删除实例 "${inst.name}"？` : `Delete instance "${inst.name}"?`}
                      </span>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        style={{ padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', fontFamily: 'inherit' }}
                      >
                        {lang === 'zh' ? '取消' : 'Cancel'}
                      </button>
                      <button
                        onClick={() => handleRemove(inst.id)}
                        style={{ padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#ef4444', color: '#fff', border: 'none', fontFamily: 'inherit' }}
                      >
                        {lang === 'zh' ? '确认删除' : 'Confirm Delete'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {showForm && (
          <InstanceForm
            initial={DEFAULT_FORM}
            lang={lang}
            onSave={handleAdd}
            onCancel={() => setShowForm(false)}
          />
        )}
      </SectionCard>

      {/* Tips */}
      <div style={{
        marginTop: 20, padding: '14px 18px', borderRadius: 10,
        background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
        fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.7,
      }}>
        <strong style={{ color: 'var(--color-text-secondary)' }}>
          {lang === 'zh' ? '💡 使用提示' : '💡 Tips'}
        </strong>
        <ul style={{ margin: '6px 0 0 0', paddingLeft: 18 }}>
          <li>{lang === 'zh' ? '本地实例：直接连接运行在本机的 Gateway（默认 ws://localhost:18789）' : 'Local: connects to Gateway running on this machine (default ws://localhost:18789)'}</li>
          <li>{lang === 'zh' ? '远程实例：连接局域网或公网中的 Gateway，需要 Gateway 配置 bind=0.0.0.0 或 Tailscale' : 'Remote: connect to Gateway on LAN or internet, requires bind=0.0.0.0 or Tailscale'}</li>
          <li>{lang === 'zh' ? 'SSH 隧道：通过 SSH 转发端口连接远程机器上的 Gateway（开发中）' : 'SSH Tunnel: forward port via SSH to connect to remote Gateway (experimental)'}</li>
        </ul>
      </div>
    </div>
  );
}

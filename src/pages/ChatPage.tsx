import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import {
  gatewayClient,
  extractMessageText,
  buildSessionKey,
  type ChatEvent,
  type ConnectionState,
} from '../services/gatewayWs';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** 流式传输中的部分文本（未定义 = 已完成） */
  streaming?: string;
  timestamp: number;
  error?: boolean;
}

function genId() {
  return 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

const AGENT_COLORS: Record<string, string> = {
  main:    '#A78BFA',
  xiaotan: '#60A5FA',
  xiaojin: '#34D399',
  xiaojin2:'#34D399',
  xiaobi:  '#F59E0B',
  xiaobo:  '#F472B6',
  sysops:  '#94A3B8',
};

function getAgentColor(id: string) {
  return AGENT_COLORS[id] || '#A78BFA';
}

/**
 * 将 chat.history 返回的原始消息数组转换为 ChatMessage[]
 */
function buildHistoryMessages(raw: unknown[]): ChatMessage[] {
  return raw
    .filter((m): m is Record<string, unknown> =>
      m !== null && typeof m === 'object' &&
      ((m as Record<string,unknown>).role === 'user' || (m as Record<string,unknown>).role === 'assistant')
    )
    .map(m => ({
      id: genId(),
      role: m.role as 'user' | 'assistant',
      content: extractMessageText(m as Parameters<typeof extractMessageText>[0]) || '',
      timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
    }))
    .filter(m => m.content.trim() !== '');
}

export function ChatPage() {
  const { config, t } = useAppStore();
  const ct = t.chat;

  const agents = config?.agents?.list || [];
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [gwState, setGwState] = useState<ConnectionState>('disconnected');
  // hasConnected: true once we've ever reached 'connected' in this session.
  // Used to suppress the scary "Gateway 未运行" banner during normal reconnects.
  const [hasConnected, setHasConnected] = useState(() => gatewayClient.state === 'connected');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyLoadedRef = useRef<Set<string>>(new Set());
  // Tracks agents whose history request is currently in-flight (prevents duplicate concurrent requests)
  const historyInProgressRef = useRef<Set<string>>(new Set());
  const currentRunIdRef = useRef<string | null>(null);

  // ─── Broadcast Mode ─────────────────────────────────────────
  const [broadcastMode, setBroadcastMode] = useState(false);
  const [broadcastTargets, setBroadcastTargets] = useState<Set<string>>(new Set());
  const broadcastSendingRef = useRef<Set<string>>(new Set());
  const [broadcastSending, setBroadcastSending] = useState<Set<string>>(new Set());

  const port = config?.gateway?.port || 18789;
  const token = config?.gateway?.auth?.token || '';
  // Only connect after config is available; avoids spurious connect-then-disconnect
  // cycle when config loads asynchronously (first render has token='' from null config).
  const configLoaded = config !== null;

  const currentMsgs = messages[selectedAgentId] || [];
  const selectedAgent = agents.find(a => a.id === selectedAgentId);
  const agentColor = getAgentColor(selectedAgentId);

  // 派生 gateway 展示状态
  const gatewayStatus: 'online' | 'offline' | 'checking' =
    gwState === 'connected' ? 'online' :
    gwState === 'connecting' ? 'checking' :
    'offline';

  // Init: select first agent
  useEffect(() => {
    if (!selectedAgentId && agents.length > 0) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  // 同步 Gateway 配置，订阅连接状态，主动触发连接。
  // 仅在 config 加载完成后执行，避免以空 token 建立连接后立即因 token 变更而断开。
  useEffect(() => {
    if (!configLoaded) return;
    gatewayClient.setConfig({ port: Number(port), token });
    const unsub = gatewayClient.onStateChange((s) => {
      setGwState(s);
      if (s === 'connected') setHasConnected(true);
    });
    // Read current state synchronously (singleton may already be connected)
    setGwState(gatewayClient.state);
    if (gatewayClient.state === 'connected') setHasConnected(true);
    gatewayClient.ensureConnected().catch(() => {});
    return unsub;
  }, [port, token, configLoaded]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMsgs]);

  // 选中 Agent 且 Gateway 已连接时加载历史记录。
  // 关键：historyLoadedRef.add 必须在请求成功后才写入，否则请求失败（如断连）后
  // 不会在下次重连时重试，导致历史记录永远为空。
  useEffect(() => {
    if (!selectedAgentId || gwState !== 'connected') return;
    if (historyLoadedRef.current.has(selectedAgentId)) return;
    // Prevent duplicate concurrent requests for the same agent
    if (historyInProgressRef.current.has(selectedAgentId)) return;

    const agentId = selectedAgentId;
    historyInProgressRef.current.add(agentId);
    const sessionKey = buildSessionKey(agentId, gatewayClient.getMainKey());
    gatewayClient
      .request<{ messages?: unknown[] }>('chat.history', { sessionKey, limit: 50 })
      .then(result => {
        // Mark loaded ONLY after a successful response
        historyLoadedRef.current.add(agentId);
        historyInProgressRef.current.delete(agentId);
        const histMsgs = buildHistoryMessages(result?.messages || []);
        // 只在该 agent 还没有任何消息时填入（避免覆盖展开页后已发的消息）
        setMessages(prev => ({
          ...prev,
          [agentId]: (prev[agentId] || []).length === 0 ? histMsgs : prev[agentId],
        }));
      })
      .catch(() => {
        // Remove in-progress flag without marking loaded → next gwState 'connected'
        // transition will retry (e.g. after a brief disconnect during the request).
        historyInProgressRef.current.delete(agentId);
      });
  }, [selectedAgentId, gwState]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || !selectedAgentId) return;

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    // 先创建一个占位助手消息（streaming='' 表示思考中）
    const placeholderId = genId();
    const placeholderMsg: ChatMessage = {
      id: placeholderId,
      role: 'assistant',
      content: '',
      streaming: '',
      timestamp: Date.now(),
    };

    setMessages(prev => ({
      ...prev,
      [selectedAgentId]: [...(prev[selectedAgentId] || []), userMsg, placeholderMsg],
    }));
    setInput('');
    setSending(true);

    const idempotencyKey = crypto.randomUUID();
    currentRunIdRef.current = idempotencyKey;
    const sessionKey = buildSessionKey(selectedAgentId, gatewayClient.getMainKey());

    // ⚠️ 先订阅事件，再发送请求
    const unsub = gatewayClient.on<ChatEvent>('chat', (payload) => {
      if (payload.runId !== idempotencyKey) return;

      if (payload.state === 'delta') {
        const deltaText = extractMessageText(payload.message);
        if (deltaText) {
          setMessages(prev => ({
            ...prev,
            [selectedAgentId]: (prev[selectedAgentId] || []).map(m =>
              m.id === placeholderId ? { ...m, streaming: deltaText } : m
            ),
          }));
        }
      } else if (payload.state === 'final') {
        unsub();
        currentRunIdRef.current = null;
        const finalText = extractMessageText(payload.message);
        setMessages(prev => ({
          ...prev,
          [selectedAgentId]: (prev[selectedAgentId] || []).map(m =>
            m.id === placeholderId
              ? { ...m, content: finalText || '（无回复）', streaming: undefined }
              : m
          ),
        }));
        setSending(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      } else if (payload.state === 'error' || payload.state === 'aborted') {
        unsub();
        currentRunIdRef.current = null;
        const errMsg = payload.errorMessage ||
          (payload.state === 'aborted' ? '已中止' : '发送失败');
        setMessages(prev => ({
          ...prev,
          [selectedAgentId]: (prev[selectedAgentId] || []).map(m =>
            m.id === placeholderId
              ? { ...m, content: errMsg, streaming: undefined, error: payload.state !== 'aborted' }
              : m
          ),
        }));
        setSending(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    });

    try {
      await gatewayClient.request('chat.send', {
        sessionKey,
        message: text,
        deliver: false,
        idempotencyKey,
      });
    } catch (err: unknown) {
      unsub();
      currentRunIdRef.current = null;
      setMessages(prev => ({
        ...prev,
        [selectedAgentId]: (prev[selectedAgentId] || []).map(m =>
          m.id === placeholderId
            ? {
                ...m,
                content: `发送失败\n\n${err instanceof Error ? err.message : String(err)}`,
                streaming: undefined,
                error: true,
              }
            : m
        ),
      }));
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleAbort = async () => {
    if (!currentRunIdRef.current || !selectedAgentId) return;
    const sessionKey = buildSessionKey(selectedAgentId, gatewayClient.getMainKey());
    try {
      await gatewayClient.request('chat.abort', {
        sessionKey,
        runId: currentRunIdRef.current,
      });
    } catch {
      // 忽略错误——聊天事件订阅会处理 aborted 状态
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearHistory = () => {
    if (selectedAgentId) {
      setMessages(prev => ({ ...prev, [selectedAgentId]: [] }));
    }
  };

  // ─── Broadcast send ──────────────────────────────────────────
  const handleBroadcastSend = async () => {
    const text = input.trim();
    if (!text || broadcastSendingRef.current.size > 0 || broadcastTargets.size === 0) return;

    const targetIds = Array.from(broadcastTargets);
    const pidMap: Record<string, string> = {};

    // Immediately append user + placeholder to each target's message list
    for (const agentId of targetIds) {
      const userMsg: ChatMessage = { id: genId(), role: 'user', content: text, timestamp: Date.now() };
      const pid = genId();
      pidMap[agentId] = pid;
      const placeholder: ChatMessage = { id: pid, role: 'assistant', content: '', streaming: '', timestamp: Date.now() };
      setMessages(prev => ({
        ...prev,
        [agentId]: [...(prev[agentId] || []), userMsg, placeholder],
      }));
      broadcastSendingRef.current.add(agentId);
    }
    setBroadcastSending(new Set(broadcastSendingRef.current));
    setInput('');

    // Fire off parallel sends
    for (const agentId of targetIds) {
      const pid = pidMap[agentId];
      const sessionKey = buildSessionKey(agentId, gatewayClient.getMainKey());
      const idempotencyKey = crypto.randomUUID();

      const unsub = gatewayClient.on<ChatEvent>('chat', (payload) => {
        if (payload.runId !== idempotencyKey) return;
        if (payload.state === 'delta') {
          const delta = extractMessageText(payload.message);
          if (delta) {
            setMessages(prev => ({
              ...prev,
              [agentId]: (prev[agentId] || []).map(m =>
                m.id === pid ? { ...m, streaming: delta } : m
              ),
            }));
          }
        } else if (payload.state === 'final' || payload.state === 'error' || payload.state === 'aborted') {
          unsub();
          const finalText = payload.state === 'final'
            ? (extractMessageText(payload.message) || '（无回复）')
            : (payload.errorMessage || (payload.state === 'aborted' ? '已中止' : '响应失败'));
          setMessages(prev => ({
            ...prev,
            [agentId]: (prev[agentId] || []).map(m =>
              m.id === pid ? { ...m, content: finalText, streaming: undefined, error: payload.state === 'error' } : m
            ),
          }));
          broadcastSendingRef.current.delete(agentId);
          setBroadcastSending(new Set(broadcastSendingRef.current));
        }
      });

      try {
        await gatewayClient.request('chat.send', {
          sessionKey, message: text, deliver: false, idempotencyKey,
        });
      } catch (err: unknown) {
        unsub();
        const errMsg = `发送失败: ${err instanceof Error ? err.message : String(err)}`;
        setMessages(prev => ({
          ...prev,
          [agentId]: (prev[agentId] || []).map(m =>
            m.id === pid ? { ...m, content: errMsg, streaming: undefined, error: true } : m
          ),
        }));
        broadcastSendingRef.current.delete(agentId);
        setBroadcastSending(new Set(broadcastSendingRef.current));
      }
    }
  };

  const toggleBroadcastMode = () => {
    const next = !broadcastMode;
    setBroadcastMode(next);
    if (next) {
      // Pre-select all agents when entering broadcast mode
      setBroadcastTargets(new Set(agents.map(a => a.id)));
    }
  };

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--color-bg)',
    }}>
      {/* ── Left: Agent List ── */}
      <div style={{
        width: 220,
        minWidth: 220,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 14px 10px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {ct.title}
            </div>
            {agents.length > 1 && (
              <button
                onClick={toggleBroadcastMode}
                title={broadcastMode ? '退出广播模式' : '广播：同时发消息给多个智能体'}
                style={{
                  padding: '3px 8px', borderRadius: 6, border: '1px solid',
                  fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  background: broadcastMode ? 'rgba(245,158,11,0.15)' : 'transparent',
                  color: broadcastMode ? '#FCD34D' : 'var(--color-text-muted)',
                  borderColor: broadcastMode ? 'rgba(245,158,11,0.4)' : 'var(--color-border)',
                }}
              >
                📡 广播
              </button>
            )}
          </div>
          {broadcastMode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <span style={{ fontSize: 10, color: '#FCD34D' }}>
                已选 {broadcastTargets.size}/{agents.length}
              </span>
              <button
                onClick={() => setBroadcastTargets(new Set(agents.map(a => a.id)))}
                style={{ fontSize: 10, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px' }}
              >全选</button>
              <button
                onClick={() => setBroadcastTargets(new Set())}
                style={{ fontSize: 10, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px' }}
              >清空</button>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {ct.subtitle}
            </div>
          )}
        </div>

        {/* Agent list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {agents.length === 0 ? (
            <div style={{ padding: '20px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>🤖</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{ct.noAgents}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>{ct.noAgentsDesc}</div>
            </div>
          ) : (
            agents.map(agent => {
              const color = getAgentColor(agent.id);
              const isSelected = selectedAgentId === agent.id;
              const isChecked = broadcastTargets.has(agent.id);
              const msgCount = (messages[agent.id] || []).length;
              return (
                <button
                  key={agent.id}
                  onClick={() => {
                    if (broadcastMode) {
                      setBroadcastTargets(prev => {
                        const next = new Set(prev);
                        if (next.has(agent.id)) next.delete(agent.id);
                        else next.add(agent.id);
                        return next;
                      });
                    } else {
                      setSelectedAgentId(agent.id);
                    }
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 10px',
                    borderRadius: 9,
                    border: broadcastMode
                      ? `1.5px solid ${isChecked ? 'rgba(245,158,11,0.45)' : 'transparent'}`
                      : isSelected
                      ? `1.5px solid ${color}40`
                      : '1.5px solid transparent',
                    background: broadcastMode
                      ? isChecked ? 'rgba(245,158,11,0.1)' : 'transparent'
                      : isSelected ? `${color}14` : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    marginBottom: 2,
                    textAlign: 'left',
                  }}
                >
                  {/* Broadcast checkbox OR avatar */}
                  {broadcastMode ? (
                    <div style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: `2px solid ${isChecked ? '#FCD34D' : 'var(--color-border)'}`,
                      background: isChecked ? 'rgba(245,158,11,0.2)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isChecked && <span style={{ fontSize: 10, color: '#FCD34D', fontWeight: 700 }}>✓</span>}
                    </div>
                  ) : (
                    <div style={{
                      width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                      background: `linear-gradient(135deg, ${color}40, ${color}20)`,
                      border: `1.5px solid ${color}50`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 15,
                    }}>
                      🤖
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: isSelected && !broadcastMode ? 700 : 500,
                      color: broadcastMode
                        ? (isChecked ? '#FCD34D' : 'var(--color-text-primary)')
                        : (isSelected ? color : 'var(--color-text-primary)'),
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {agent.name || agent.id}
                    </div>
                    <div style={{
                      fontSize: 10, color: 'var(--color-text-muted)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {typeof agent.model === 'string' ? agent.model : agent.model?.primary || ''}
                    </div>
                  </div>
                  {broadcastMode && broadcastSending.has(agent.id) ? (
                    <div style={{ flexShrink: 0 }}>
                      <ThinkingDots />
                    </div>
                  ) : msgCount > 0 ? (
                    <div style={{
                      flexShrink: 0, minWidth: 18, height: 18, borderRadius: 9,
                      background: broadcastMode ? 'rgba(245,158,11,0.3)' : color, color: '#fff',
                      fontSize: 10, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 4px',
                    }}>
                      {msgCount}
                    </div>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {/* Gateway status */}
        <div style={{
          padding: '10px 12px',
          borderTop: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '7px 10px', borderRadius: 7,
            background: gatewayStatus === 'online'
              ? 'rgba(16,185,129,0.08)'
              : gatewayStatus === 'offline'
              ? 'rgba(239,68,68,0.08)'
              : 'rgba(100,116,139,0.08)',
            border: `1px solid ${
              gatewayStatus === 'online' ? 'rgba(16,185,129,0.2)'
              : gatewayStatus === 'offline' ? 'rgba(239,68,68,0.2)'
              : 'rgba(100,116,139,0.15)'
            }`,
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: gatewayStatus === 'online' ? '#34D399'
                : gatewayStatus === 'offline' ? '#F87171'
                : '#94A3B8',
              boxShadow: gatewayStatus === 'online' ? '0 0 6px rgba(52,211,153,0.6)' : 'none',
              animation: gatewayStatus === 'checking' ? 'pulse 1.5s infinite' : 'none',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 10, fontWeight: 600,
                color: gatewayStatus === 'online' ? '#34D399'
                  : gatewayStatus === 'offline' ? '#F87171'
                  : '#94A3B8',
              }}>
                Gateway {gatewayStatus === 'online' ? ct.online : gatewayStatus === 'offline' ? ct.offline : ct.connecting}
              </div>
              <div style={{ fontSize: 9, color: 'var(--color-text-muted)', marginTop: 1, fontFamily: 'var(--font-family-mono)' }}>
                :{port}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Chat Area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {broadcastMode ? (
          /* ── Broadcast Mode: multi-column grid ── */
          <>
            {/* Broadcast header bar */}
            <div style={{
              height: 56, flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '0 20px',
              borderBottom: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 12px', borderRadius: 8,
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.3)',
              }}>
                <span style={{ fontSize: 14 }}>📡</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#FCD34D' }}>广播模式</span>
                <span style={{ fontSize: 11, color: 'rgba(252,211,77,0.7)' }}>
                  → {broadcastTargets.size} 个智能体
                </span>
              </div>
              {broadcastSending.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  <ThinkingDots />
                  <span>等待 {broadcastSending.size} 个响应…</span>
                </div>
              )}
              <div style={{ flex: 1 }} />
              <button
                className="btn btn-ghost btn-sm"
                onClick={toggleBroadcastMode}
                style={{ color: 'var(--color-text-muted)' }}
              >
                退出广播
              </button>
            </div>

            {/* Agent columns */}
            {broadcastTargets.size === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 32 }}>📡</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>请在左侧选择至少一个智能体</div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'hidden' }}>
                {Array.from(broadcastTargets).map((agentId, idx, arr) => {
                  const agent = agents.find(a => a.id === agentId);
                  const color = getAgentColor(agentId);
                  const msgs = messages[agentId] || [];
                  const isSending = broadcastSending.has(agentId);
                  return (
                    <div key={agentId} style={{
                      minWidth: 300, flex: '1 1 0',
                      display: 'flex', flexDirection: 'column',
                      borderRight: idx < arr.length - 1 ? '1px solid var(--color-border)' : 'none',
                      overflow: 'hidden',
                    }}>
                      {/* Column header */}
                      <div style={{
                        padding: '10px 14px', flexShrink: 0,
                        borderBottom: '1px solid var(--color-border)',
                        background: `linear-gradient(135deg, ${color}08, transparent)`,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                          background: `${color}25`, border: `1.5px solid ${color}50`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                        }}>🤖</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {agent?.name || agentId}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)' }}>
                            {agentId}
                          </div>
                        </div>
                        {isSending && <ThinkingDots />}
                      </div>
                      {/* Messages */}
                      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {msgs.length === 0 ? (
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 12, padding: '40px 0' }}>
                            等待消息
                          </div>
                        ) : (
                          msgs.slice(-30).map(msg => (
                            <BroadcastBubble key={msg.id} msg={msg} agentColor={color} />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Shared input area for broadcast */}
            <div style={{
              flexShrink: 0, padding: '12px 16px 16px',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}>
              {configLoaded && !hasConnected && gatewayStatus === 'offline' && (
                <div style={{
                  marginBottom: 10, padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                  fontSize: 12, color: '#F87171', display: 'flex', alignItems: 'center', gap: 7,
                }}>
                  ⚠️ {ct.gatewayOffline} — {ct.gatewayOfflineDesc}
                </div>
              )}
              <div style={{
                display: 'flex', gap: 10, alignItems: 'flex-end',
                background: 'var(--color-surface-2)',
                border: `1.5px solid ${input.trim() ? 'rgba(245,158,11,0.4)' : 'var(--color-border)'}`,
                borderRadius: 12, padding: '10px 12px',
                transition: 'border-color 0.2s',
              }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleBroadcastSend(); }
                  }}
                  placeholder={`广播给 ${broadcastTargets.size} 个智能体…`}
                  rows={1}
                  disabled={broadcastSending.size > 0 || !configLoaded || gwState !== 'connected'}
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    resize: 'none', fontFamily: 'var(--font-family-sans)',
                    fontSize: 13, color: 'var(--color-text-primary)',
                    lineHeight: 1.5, maxHeight: 120, overflowY: 'auto', padding: 0,
                  }}
                  onInput={e => {
                    const el = e.currentTarget; el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                  }}
                />
                <button
                  onClick={handleBroadcastSend}
                  disabled={!input.trim() || broadcastSending.size > 0 || !configLoaded || gwState !== 'connected' || broadcastTargets.size === 0}
                  style={{
                    flexShrink: 0, width: 34, height: 34, borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: input.trim() && gwState === 'connected' && broadcastTargets.size > 0
                      ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                      : 'var(--color-surface-3)',
                    color: input.trim() && gwState === 'connected' && broadcastTargets.size > 0 ? '#fff' : 'var(--color-text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                    boxShadow: input.trim() && gwState === 'connected' ? '0 2px 8px rgba(245,158,11,0.4)' : 'none',
                  }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 6, textAlign: 'center' }}>
                Enter 广播 · Shift+Enter 换行 · 消息将同时发送给所有选中智能体
              </div>
            </div>
          </>
        ) : !selectedAgentId || agents.length === 0 ? (
          /* Empty state */
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-muted)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
              {agents.length === 0 ? ct.noAgents : ct.selectAgent}
            </div>
            <div style={{ fontSize: 12 }}>
              {agents.length === 0 ? ct.noAgentsDesc : ''}
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div style={{
              height: 56, flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '0 20px',
              borderBottom: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: `linear-gradient(135deg, ${agentColor}40, ${agentColor}20)`,
                border: `1.5px solid ${agentColor}50`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0,
              }}>
                🤖
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: agentColor }}>
                  {selectedAgent?.name || selectedAgentId}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)' }}>
                  {selectedAgentId}
                  {selectedAgent?.model && (
                    <span style={{ marginLeft: 8, color: 'var(--color-text-muted)' }}>
                      · {typeof selectedAgent.model === 'string' ? selectedAgent.model : selectedAgent.model.primary}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              {currentMsgs.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={clearHistory}
                  title={ct.clearHistory}
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}

              {/* Gateway indicator */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 20,
                background: gatewayStatus === 'online'
                  ? 'rgba(16,185,129,0.1)'
                  : gatewayStatus === 'checking'
                  ? 'rgba(251,191,36,0.1)'
                  : 'rgba(239,68,68,0.1)',
                border: `1px solid ${
                  gatewayStatus === 'online' ? 'rgba(16,185,129,0.2)'
                  : gatewayStatus === 'checking' ? 'rgba(251,191,36,0.25)'
                  : 'rgba(239,68,68,0.2)'}`,
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: gatewayStatus === 'online' ? '#34D399'
                    : gatewayStatus === 'checking' ? '#FBBF24'
                    : '#F87171',
                  boxShadow: gatewayStatus === 'online' ? '0 0 5px rgba(52,211,153,0.6)'
                    : gatewayStatus === 'checking' ? '0 0 5px rgba(251,191,36,0.5)'
                    : 'none',
                  animation: gatewayStatus === 'checking' ? 'pulse 1.5s infinite' : 'none',
                }} />
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: gatewayStatus === 'online' ? '#34D399'
                    : gatewayStatus === 'checking' ? '#FBBF24'
                    : '#F87171',
                }}>
                  {gatewayStatus === 'online' ? ct.connected
                    : gatewayStatus === 'checking' ? ct.connecting
                    : ct.disconnected}
                </span>
              </div>
            </div>

            {/* Messages Area */}
            <div style={{
              flex: 1, overflowY: 'auto', padding: '20px 16px',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              {currentMsgs.length === 0 ? (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-text-muted)', padding: '60px 0',
                }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>
                    {selectedAgent?.name ? selectedAgent.name.slice(0, 2) : '🤖'}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                    {selectedAgent?.name || selectedAgentId}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    {gwState === 'connecting' ? '连接中…' : gwState === 'connected' ? ct.selectAgent : '等待 Gateway 连接'}
                  </div>
                </div>
              ) : (
                currentMsgs.map(msg => (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    agentName={selectedAgent?.name || selectedAgentId}
                    agentColor={agentColor}
                    userName={ct.you}
                  />
                ))
              )}

              {/* 连接中指示器（仅在建立连接时显示） */}
              {gwState === 'connecting' && !sending && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: `${agentColor}20`,
                    border: `1.5px solid ${agentColor}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14,
                  }}>
                    🤖
                  </div>
                  <div style={{
                    padding: '10px 14px', borderRadius: '4px 12px 12px 12px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{ct.thinking}</span>
                    <ThinkingDots />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={{
              flexShrink: 0,
              padding: '12px 16px 16px',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}>
              {/* 仅在配置已加载且尚未成功连接过时才显示警告，避免重连期间错误显示此条 */}
              {configLoaded && !hasConnected && gatewayStatus === 'offline' && (
                <div style={{
                  marginBottom: 10, padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  fontSize: 12, color: '#F87171',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}>
                  ⚠️ {ct.gatewayOffline} — {ct.gatewayOfflineDesc}
                </div>
              )}
              <div style={{
                display: 'flex', gap: 10, alignItems: 'flex-end',
                background: 'var(--color-surface-2)',
                border: `1.5px solid ${input.trim() ? agentColor + '40' : 'var(--color-border)'}`,
                borderRadius: 12, padding: '10px 12px',
                transition: 'border-color 0.2s',
              }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={ct.inputPlaceholder}
                  rows={1}
                  disabled={sending || !configLoaded || gwState !== 'connected'}
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    resize: 'none', fontFamily: 'var(--font-family-sans)',
                    fontSize: 13, color: 'var(--color-text-primary)',
                    lineHeight: 1.5, maxHeight: 120, overflowY: 'auto',
                    padding: 0,
                  }}
                  onInput={e => {
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                  }}
                />
                {/* 发送中显示中止按鈕，平时显示发送按鈕 */}
                {sending ? (
                  <button
                    onClick={handleAbort}
                    title="停止回复"
                    style={{
                      flexShrink: 0, width: 34, height: 34,
                      borderRadius: 8, outline: 'none', cursor: 'pointer',
                      background: 'rgba(239,68,68,0.15)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      color: '#F87171',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                  >
                    <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || !configLoaded || gwState !== 'connected'}
                    style={{
                      flexShrink: 0, width: 34, height: 34,
                      borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: input.trim() && gwState === 'connected'
                        ? `linear-gradient(135deg, ${agentColor}, ${agentColor}cc)`
                        : 'var(--color-surface-3)',
                      color: input.trim() && gwState === 'connected'
                        ? '#fff' : 'var(--color-text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                      boxShadow: input.trim() && gwState === 'connected'
                        ? `0 2px 8px ${agentColor}40` : 'none',
                    }}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 6, textAlign: 'center' }}>
                Enter 发送 · Shift+Enter 换行
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function MessageBubble({ msg, agentName, agentColor, userName }: {
  msg: ChatMessage;
  agentName: string;
  agentColor: string;
  userName: string;
}) {
  const isUser = msg.role === 'user';
  const isStreaming = msg.streaming !== undefined;
  // streaming='' 表示思考中（尚未收到第一个 delta），否则显示流式文本
  const displayContent = isStreaming ? msg.streaming! : msg.content;
  const showThinking = isStreaming && msg.streaming === '';

  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      gap: 10,
    }}>
      {/* Avatar */}
      {!isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: `${agentColor}20`,
          border: `1.5px solid ${agentColor}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, marginTop: 2,
        }}>
          🤖
        </div>
      )}
      {isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(37,99,235,0.2))',
          border: '1.5px solid rgba(99,102,241,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, marginTop: 2,
        }}>
          👤
        </div>
      )}

      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '72%',
        gap: 3,
      }}>
        {/* Name + time */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          flexDirection: isUser ? 'row-reverse' : 'row',
        }}>
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: isUser ? 'var(--color-text-muted)' : agentColor,
          }}>
            {isUser ? userName : agentName}
          </span>
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
            {formatTime(msg.timestamp)}
          </span>
        </div>

        {/* Bubble */}
        <div style={{
          padding: '10px 14px',
          borderRadius: isUser ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
          background: isUser
            ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(37,99,235,0.15))'
            : msg.error
            ? 'rgba(239,68,68,0.1)'
            : 'var(--color-surface)',
          border: isUser
            ? '1px solid rgba(99,102,241,0.25)'
            : msg.error
            ? '1px solid rgba(239,68,68,0.2)'
            : '1px solid var(--color-border)',
          fontSize: 13,
          lineHeight: 1.6,
          color: msg.error ? '#FCA5A5' : 'var(--color-text-primary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          boxShadow: isUser ? '0 1px 6px rgba(99,102,241,0.15)' : 'none',
          display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 0,
        }}>
          {showThinking ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>思考中</span>
              <ThinkingDots />
            </div>
          ) : (
            <>
              <span>{displayContent}</span>
              {isStreaming && <StreamingCursor color={agentColor} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: '50%',
          background: 'var(--color-text-muted)',
          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}
function StreamingCursor({ color }: { color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 2, height: '1em',
      background: color,
      marginLeft: 2,
      verticalAlign: 'text-bottom',
      animation: 'blink 1s step-end infinite',
      borderRadius: 1,
      opacity: 0.8,
    }} />
  );
}

// ─── BroadcastBubble: compact message in multi-agent grid ────

function BroadcastBubble({ msg, agentColor }: { msg: ChatMessage; agentColor: string }) {
  const isUser = msg.role === 'user';
  const isStreaming = msg.streaming !== undefined;
  const displayContent = isStreaming ? msg.streaming! : msg.content;
  const showThinking = isStreaming && msg.streaming === '';

  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      gap: 6,
    }}>
      <div style={{
        maxWidth: '90%',
        padding: '7px 10px',
        borderRadius: isUser ? '10px 3px 10px 10px' : '3px 10px 10px 10px',
        background: isUser
          ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(37,99,235,0.12))'
          : msg.error ? 'rgba(239,68,68,0.1)' : 'var(--color-surface-1)',
        border: isUser
          ? '1px solid rgba(99,102,241,0.2)'
          : msg.error ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--color-border)',
        fontSize: 12,
        lineHeight: 1.55,
        color: msg.error ? '#FCA5A5' : 'var(--color-text-primary)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {showThinking ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>思考中</span>
            <ThinkingDots />
          </div>
        ) : (
          <>
            <span>{displayContent}</span>
            {isStreaming && <StreamingCursor color={agentColor} />}
          </>
        )}
      </div>
    </div>
  );
}
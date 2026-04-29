/**
 * OpenClaw Gateway WebSocket Client
 *
 * Implements the Gateway WS JSON-RPC protocol (protocol version 3):
 *   1. WS upgrade → ws://127.0.0.1:{port}
 *   2. Server sends "connect.challenge" event
 *   3. Client sends "connect" RPC with token + scopes
 *   4. Server responds with hello-ok → connected
 *   5. Client can now call request() and subscribe to events
 *
 * Key events:
 *   "chat"  → ChatEvent { runId, sessionKey, seq, state, message?, errorMessage? }
 *             state: "delta" (streaming) | "final" | "aborted" | "error"
 *   "agent" → AgentEvent { runId, stream, data, sessionKey, seq, ts }  (raw model chunks)
 *
 * Ref: https://github.com/openclaw/openclaw/tree/main/src/gateway
 */

// ── Platform detection ───────────────────────────────────────────────────────

/** Detect the current OS from the webview user-agent string. */
function detectPlatform(): 'windows' | 'macos' | 'linux' {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'windows';
  if (ua.includes('Mac')) return 'macos';
  return 'linux';
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role?: string;
  content?: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
  text?: string;
  [key: string]: unknown;
}

export interface ChatEvent {
  runId: string;
  sessionKey: string;
  seq: number;
  state: 'delta' | 'final' | 'aborted' | 'error';
  message?: ChatMessage;
  errorMessage?: string;
  stopReason?: string;
  usage?: unknown;
}

export interface GatewayConfig {
  port: number;
  token: string;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// ── Gateway RPC response types ───────────────────────────────────────────────

/** models.list */
export interface GatewayModel {
  id: string;
  name?: string;
  provider?: string;
  contextWindow?: number;
  cost?: { input?: number; output?: number };
  capabilities?: string[];
}
export interface ModelsListResult { models: GatewayModel[] }

/** agents.list */
export interface GatewayAgent {
  id: string;
  name?: string;
  model?: string | { primary: string };
  workspace?: string;
  skills?: string[];
  onboardingCompleted?: boolean;
}
export interface AgentsListResult { agents: GatewayAgent[] }

/** agents.files.list */
export interface AgentFile {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
}
export interface AgentFilesListResult { agentId: string; workspace: string; files: AgentFile[] }

/** agents.files.get */
export interface AgentFilesGetResult {
  agentId: string;
  workspace: string;
  file: { name: string; path: string; missing: boolean; content?: string };
}

/** sessions.list */
export interface SessionEntry {
  key: string;
  sessionId?: string;
  model?: string;
  messageCount?: number;
  lastActiveAtMs?: number;
  createdAtMs?: number;
  thinkingLevel?: string;
}
export interface SessionsListResult { sessions: SessionEntry[]; agentId?: string }

/** sessions.preview */
export interface SessionPreviewMessage {
  role: string;
  content?: string;
  text?: string;
  ts?: number;
}
export interface SessionsPreviewResult {
  key: string;
  sessionId?: string;
  items: SessionPreviewMessage[];
}

/** cron.list / cron.status */
export interface CronJobStatus {
  name: string;
  enabled?: boolean;
  schedule?: unknown;
  lastRunAtMs?: number;
  lastStatus?: 'ok' | 'error' | 'skipped';
  lastDurationMs?: number;
  consecutiveErrors?: number;
  nextRunAtMs?: number;
}
export interface CronListResult { jobs: CronJobStatus[] }
export interface CronStatusResult { jobs: CronJobStatus[] }
export interface CronRunResult { runId?: string; queued?: boolean }
export interface CronRunEntry {
  runId?: string;
  jobName?: string;
  startedAtMs?: number;
  completedAtMs?: number;
  durationMs?: number;
  status?: 'running' | 'ok' | 'error' | 'aborted';
  errorMessage?: string;
}
export interface CronRunsResult { runs: CronRunEntry[] }

/** skills.status */
export interface SkillInstallOption {
  id: string;        // e.g. 'brew', 'node'
  kind: string;      // e.g. 'brew', 'node', 'uv'
  label?: string;
  bins?: string[];
}
export interface SkillStatusEntry {
  id: string;
  name?: string;
  version?: string;
  enabled?: boolean;
  installed?: boolean;
  hasApiKey?: boolean;
  description?: string;
  source?: string;
  installedAt?: string;
  install?: SkillInstallOption[];
}
export interface SkillsStatusResult { skills: SkillStatusEntry[] }

/** skills.bins — returns binary names (e.g. 'brew', 'node') used by installed skills */
export interface SkillsBinsResult { bins: string[] }

/** usage.cost */
export interface UsageCostEntry {
  agentId?: string;
  sessionKey?: string;
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  date?: string;
}
export interface UsageCostSummary {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byAgent?: Record<string, { costUsd: number; inputTokens: number; outputTokens: number }>;
  byModel?: Record<string, { costUsd: number; inputTokens: number; outputTokens: number }>;
  byDate?: Record<string, { costUsd: number; inputTokens: number; outputTokens: number }>;
  sessions?: UsageCostEntry[];
}
export interface UsageCostResult extends UsageCostSummary { startDate?: string; endDate?: string }

/** health */
export interface HealthChannelStatus {
  id: string;
  ok: boolean;
  detail?: string;
}
export interface HealthResult {
  ts?: number;
  uptimeMs?: number;
  channels?: HealthChannelStatus[];
  ok?: boolean;
  errors?: string[];
}

/** status */
export interface StatusResult {
  version?: string;
  uptimeMs?: number;
  gatewayMode?: string;
  channels?: Record<string, { enabled: boolean; connected?: boolean }>;
  agents?: { count: number };
}

// ── Constants ────────────────────────────────────────────────────────────────

const CLIENT_ID = 'openclaw-control-ui';
const CLIENT_MODE = 'ui';
// Request all operator scopes (same as CLI default)
const SCOPES = ['operator.admin', 'operator.read', 'operator.write'];
const CONNECT_TIMEOUT_MS = 12_000;
const REQUEST_TIMEOUT_MS = 180_000; // 3 min; agent runs can be long

// ── Internal types ───────────────────────────────────────────────────────────

type PendingRequest = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type EventHandler<T = unknown> = (payload: T) => void;

// ── GatewayWsClient ──────────────────────────────────────────────────────────

class GatewayWsClient {
  private ws: WebSocket | null = null;
  private config: GatewayConfig | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private _state: ConnectionState = 'disconnected';
  private connectPromise: Promise<void> | null = null;
  private stateListeners = new Set<(s: ConnectionState) => void>();

  // ── Auto-reconnect ────────────────────────────────────────────────────────
  private _mainKey = 'main';
  private _intentionalDisconnect = false;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryCount = 0;
  private readonly _maxRetryMs = 30_000;

  // ── Config ────────────────────────────────────────────────────────────────

  setConfig(config: GatewayConfig) {
    const changed =
      !this.config ||
      this.config.port !== config.port ||
      this.config.token !== config.token;
    this.config = { ...config };
    if (changed) {
      this._retryCount = 0;
      this._forceDisconnect();
      // 允许断开后外部调用 ensureConnected() 或自动重连
      this._intentionalDisconnect = false;
    }
  }

  /** 获取 Gateway 配置的 mainKey（连接成功后从 snapshot 读取）。 */
  getMainKey(): string {
    return this._mainKey;
  }

  // ── State ─────────────────────────────────────────────────────────────────

  get state(): ConnectionState {
    return this._state;
  }

  onStateChange(handler: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(handler);
    return () => this.stateListeners.delete(handler);
  }

  private _setState(s: ConnectionState) {
    if (this._state === s) return;
    this._state = s;
    for (const h of this.stateListeners) {
      try {
        h(s);
      } catch {
        // ignore
      }
    }
  }

  // ── Connect ───────────────────────────────────────────────────────────────

  async ensureConnected(): Promise<void> {
    if (
      this._state === 'connected' &&
      this.ws !== null &&
      this.ws.readyState === WebSocket.OPEN
    ) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }
    this.connectPromise = this._doConnect().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private _doConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.config) {
        reject(new Error('Gateway 配置未初始化'));
        return;
      }

      const { port, token } = this.config;
      this._setState('connecting');
      console.log('[gatewayWs] _doConnect: connecting to ws://127.0.0.1:' + port, 'token=', token ? token.substring(0,8)+'...' : '(empty)');

      let ws: WebSocket;
      try {
        ws = new WebSocket(`ws://127.0.0.1:${port}`);
      } catch (e) {
        this._setState('error');
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }

      this.ws = ws;

      const connectTimer = setTimeout(() => {
        ws.close();
        this._setState('error');
        reject(new Error(`Gateway 连接超时（${CONNECT_TIMEOUT_MS / 1000}s）`));
      }, CONNECT_TIMEOUT_MS);

      // ── Phase 1: wait for challenge ───────────────────────────────────────
      ws.onmessage = (ev) => {
        try {
          const frame = JSON.parse(ev.data as string);
          if (frame?.type !== 'event' || frame?.event !== 'connect.challenge') {
            return;
          }

          // ── Phase 2: send connect RPC ─────────────────────────────────────
          const reqId = crypto.randomUUID();
          const connectReq = {
            type: 'req',
            id: reqId,
            method: 'connect',
            params: {
              minProtocol: 1,
              maxProtocol: 99,
              client: {
                id: CLIENT_ID,
                version: '1.0.0',
                platform: detectPlatform(),
                mode: CLIENT_MODE,
              },
              role: 'operator',
              scopes: SCOPES,
              auth: { token },
            },
          };
          ws.send(JSON.stringify(connectReq));

          // ── Phase 3: wait for hello-ok response ───────────────────────────
          ws.onmessage = (ev2) => {
            try {
              const frame2 = JSON.parse(ev2.data as string);
              if (frame2?.type !== 'res' || frame2?.id !== reqId) {
                return; // might be an early event, keep waiting
              }
              clearTimeout(connectTimer);
              if (frame2.ok) {
                // 从 snapshot 提取配置的 mainKey
                const snapshotMainKey =
                  (frame2.payload as { snapshot?: { sessionDefaults?: { mainKey?: string } } })
                    ?.snapshot?.sessionDefaults?.mainKey;
                if (snapshotMainKey && typeof snapshotMainKey === 'string') {
                  this._mainKey = snapshotMainKey;
                }
                this._retryCount = 0;
                this._setState('connected');
                // Switch to full message handler
                ws.onmessage = (ev3) => this._handleFrame(ev3.data as string);
                ws.onclose = () => this._handleClose();
                ws.onerror = () => this._handleClose();
                resolve();
              } else {
                const msg =
                  frame2.error?.message || 'connect 被 Gateway 拒绝';
                this._setState('error');
                try {
                  ws.close();
                } catch {
                  // ignore
                }
                reject(new Error(msg));
                this._scheduleReconnect();
              }
            } catch {
              // ignore malformed frames
            }
          };
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = (err) => {
        console.error('[gatewayWs] WebSocket onerror:', err, 'readyState=', ws.readyState);
        clearTimeout(connectTimer);
        this._setState('error');
        reject(new Error('WebSocket 连接失败'));
        this._scheduleReconnect();
      };

      ws.onclose = (ev) => {
        console.warn('[gatewayWs] WebSocket onclose: code=', ev?.code, 'reason=', ev?.reason, 'wasClean=', ev?.wasClean);
        clearTimeout(connectTimer);
        if (this._state === 'connecting') {
          this._setState('disconnected');
          reject(new Error('WebSocket 连接中断'));
          this._scheduleReconnect();
        }
      };
    });
  }

  // ── Message handler (post-connect) ────────────────────────────────────────

  private _handleFrame(data: string) {
    try {
      const frame = JSON.parse(data);
      if (frame?.type === 'res') {
        const p = this.pendingRequests.get(frame.id);
        if (p) {
          this.pendingRequests.delete(frame.id);
          clearTimeout(p.timeoutId);
          if (frame.ok) {
            p.resolve(frame.payload);
          } else {
            p.reject(
              new Error(frame.error?.message || '请求失败'),
            );
          }
        }
      } else if (frame?.type === 'event') {
        const eventName = frame.event as string;
        const handlers = this.eventHandlers.get(eventName);
        if (handlers) {
          for (const h of handlers) {
            try {
              h(frame.payload);
            } catch {
              // ignore handler errors
            }
          }
        }
      }
    } catch {
      // ignore malformed frames
    }
  }

  private _handleClose() {
    const wasConnected = this._state === 'connected';
    this._setState('disconnected');
    this.ws = null;
    // Reject all pending requests
    for (const [, p] of this.pendingRequests) {
      clearTimeout(p.timeoutId);
      p.reject(
        new Error(
          wasConnected ? 'Gateway 连接已断开' : 'WebSocket 已关闭',
        ),
      );
    }
    this.pendingRequests.clear();
    // 连接丢失后自动重连
    this._scheduleReconnect();
  }

  /** 指数退避重连调度（仅非主动断开时触发）。 */
  private _scheduleReconnect() {
    if (this._intentionalDisconnect || !this.config) return;
    if (this._retryTimer !== null) return; // already scheduled
    const delayMs = Math.min(Math.pow(2, this._retryCount) * 1_500, this._maxRetryMs);
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      if (!this._intentionalDisconnect) {
        this._retryCount++;
        this.ensureConnected().catch(() => {});
      }
    }, delayMs);
  }

  // ── RPC request ───────────────────────────────────────────────────────────

  async request<T = unknown>(
    method: string,
    params: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    await this.ensureConnected();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gateway 未连接');
    }
    return new Promise<T>((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`请求 ${method} 超时（${timeoutMs / 1000}s）`));
      }, timeoutMs);
      this.pendingRequests.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timeoutId,
      });
      this.ws!.send(JSON.stringify({ type: 'req', id, method, params }));
    });
  }

  // ── Event subscription ────────────────────────────────────────────────────

  on<T = unknown>(
    event: string,
    handler: EventHandler<T>,
  ): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as EventHandler);
    return () => {
      this.eventHandlers.get(event)?.delete(handler as EventHandler);
    };
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  private _forceDisconnect() {
    this._intentionalDisconnect = true;
    if (this._retryTimer !== null) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    this._setState('disconnected');
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.connectPromise = null;
    for (const [, p] of this.pendingRequests) {
      clearTimeout(p.timeoutId);
      p.reject(new Error('连接已重置'));
    }
    this.pendingRequests.clear();
  }

  disconnect() {
    this._forceDisconnect();
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const gatewayClient = new GatewayWsClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract plain text from a chat message payload.
 * The message.content may be a string or an array of {type:"text", text:string} blocks.
 */
export function extractMessageText(message?: ChatMessage | null): string {
  if (!message) return '';
  // Prefer .text field (plain text shortcut used in final messages)
  if (typeof message.text === 'string' && message.text.trim()) {
    return message.text.trim();
  }
  // content array  →  join text blocks
  if (Array.isArray(message.content)) {
    return message.content
      .filter(
        (b) => b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string',
      )
      .map((b) => (b.text as string).trim())
      .filter(Boolean)
      .join('\n');
  }
  // content string fallback
  if (typeof message.content === 'string') {
    return message.content.trim();
  }
  return '';
}

/**
 * Build the Gateway session key for a given agent.
 * Matches the official buildAgentMainSessionKey() logic:
 *   - main agent (id === 'main' or id equals mainKey) → bare normalised mainKey
 *   - other agents → "agent:{normalizedId}:{normalizedMainKey}"
 */
export function buildSessionKey(agentId: string, mainKey = 'main'): string {
  const normalizedId = agentId.trim().toLowerCase();
  const normalizedMain = (mainKey || 'main').trim().toLowerCase();
  if (normalizedId === normalizedMain || normalizedId === 'main') {
    return normalizedMain;
  }
  return `agent:${normalizedId}:${normalizedMain}`;
}

// ── Typed RPC helpers ─────────────────────────────────────────────────────────

const SHORT = 30_000; // 30 s for quick reads

export const gwRpc = {
  // Models
  modelsList: () =>
    gatewayClient.request<ModelsListResult>('models.list', {}, SHORT),

  // Agents
  agentsList: () =>
    gatewayClient.request<AgentsListResult>('agents.list', {}, SHORT),
  agentsCreate: (params: Record<string, unknown>) =>
    gatewayClient.request<{ agentId: string }>('agents.create', params),
  agentsUpdate: (agentId: string, updates: Record<string, unknown>) =>
    gatewayClient.request('agents.update', { agentId, ...updates }),
  agentsDelete: (agentId: string) =>
    gatewayClient.request('agents.delete', { agentId }),

  // Agent files
  agentFilesList: (agentId: string) =>
    gatewayClient.request<AgentFilesListResult>('agents.files.list', { agentId }, SHORT),
  agentFilesGet: (agentId: string, name: string) =>
    gatewayClient.request<AgentFilesGetResult>('agents.files.get', { agentId, name }, SHORT),
  agentFilesSet: (agentId: string, name: string, content: string) =>
    gatewayClient.request('agents.files.set', { agentId, name, content }),

  // Sessions
  sessionsList: (agentId?: string) =>
    gatewayClient.request<SessionsListResult>('sessions.list', agentId ? { agentId } : {}, SHORT),
  sessionsPreview: (key: string, limit = 5) =>
    gatewayClient.request<SessionsPreviewResult>('sessions.preview', { key, limit }, SHORT),
  sessionsReset: (key: string) =>
    gatewayClient.request('sessions.reset', { key }),
  sessionsDelete: (key: string) =>
    gatewayClient.request('sessions.delete', { key }),

  // Cron
  cronList: () =>
    gatewayClient.request<CronListResult>('cron.list', {}, SHORT),
  cronStatus: () =>
    gatewayClient.request<CronStatusResult>('cron.status', {}, SHORT),
  cronRun: (name: string) =>
    gatewayClient.request<CronRunResult>('cron.run', { id: name }),
  cronRuns: (name: string, limit = 20) =>
    gatewayClient.request<CronRunsResult>('cron.runs', { id: name, limit }, SHORT),

  // Skills
  skillsStatus: () =>
    gatewayClient.request<SkillsStatusResult>('skills.status', {}, SHORT),
  skillsBins: () =>
    gatewayClient.request<SkillsBinsResult>('skills.bins', {}, SHORT),
  /** name = skill name (from skills.status), installId = install spec id (e.g. 'brew','node') */
  skillsInstall: (name: string, installId: string, timeoutMs = 120_000) =>
    gatewayClient.request('skills.install', { name, installId, timeoutMs }),
  /** Update skill config: enable/disable, set apiKey, or set env vars */
  skillsUpdate: (skillKey: string, patch?: { enabled?: boolean; apiKey?: string; env?: Record<string, string> }) =>
    gatewayClient.request('skills.update', { skillKey, ...patch }),

  // Usage
  usageCost: (params?: { days?: number; mode?: string }) =>
    gatewayClient.request<UsageCostResult>('usage.cost', params ?? {}),
  usageStatus: () =>
    gatewayClient.request('usage.status', {}, SHORT),

  // Health / Status
  health: () =>
    gatewayClient.request<HealthResult>('health', {}, SHORT),
  status: () =>
    gatewayClient.request<StatusResult>('status', {}, SHORT),
};

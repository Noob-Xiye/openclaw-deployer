// OpenClaw Configuration Types - Based on actual openclaw.json + jobs.json schemas

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface OpenClawConfig {
  $schema?: string;
  agents?: AgentsConfig;
  models?: ModelsConfig;
  tools?: ToolsConfig;
  channels?: ChannelsConfig;
  gateway?: GatewayConfig;
  browser?: BrowserConfig;
  skills?: SkillsConfig;
  commands?: Record<string, unknown>;
  plugins?: unknown[];
  meta?: MetaConfig;
  wizard?: unknown;
  bindings?: BindingConfig[];
  session?: SessionConfig;
  messages?: unknown;
  hooks?: HooksConfig;
  canvasHost?: string;
  discovery?: DiscoveryConfig;
  env?: Record<string, string>;
  secrets?: Record<string, unknown>;
  auth?: AuthConfig;
  logging?: LoggingConfig;
  cli?: CliConfig;
  talk?: unknown;
  ui?: UiConfig;
  cron?: CronConfig;
}

export interface GatewayConfig {
  port?: number;
  mode?: 'local' | 'remote';
  bind?: string;
  auth?: { mode: 'token' | 'password' | 'none'; token?: string; password?: string };
  reload?: { mode: 'hot' | 'hybrid' | 'restart' | 'off'; debounceMs?: number };
  tailscale?: { mode: 'off' | 'serve' | 'funnel'; resetOnExit?: boolean };
  tls?: { enabled: boolean; cert?: string; key?: string };
  controlUi?: { dangerouslyDisableDeviceAuth?: boolean };
}

export interface AgentsConfig {
  defaults?: AgentDefaults;
  list?: Agent[];
}

export interface AgentDefaults {
  workspace?: string;
  agentDir?: string;
  model?: { primary: string; fallbacks?: string[] };
  models?: Record<string, { alias?: string }>;
  sandbox?: { mode: 'off' | 'non-main' | 'all'; scope?: 'session' | 'agent' | 'shared' };
  heartbeat?: {
    every: string;
    target?: string;
    systemPrompt?: string;
    prompt?: string;
    activeHours?: { start: string; end: string; timezone?: string };
    directPolicy?: 'allow' | 'deny';
    lightContext?: boolean;
    ackMaxChars?: number;
  };
  memory?: {
    vectorSearch?: { enabled: boolean; provider?: string; model?: string };
    autoRefresh?: { enabled: boolean; threshold?: number };
  };
  subagents?: { model?: string };
  session?: Partial<SessionConfig>;
  tools?: AgentToolsOverride;
}

export interface Agent {
  id: string;
  name?: string;                    // display name, e.g. "小总管"
  workspace?: string;
  agentDir?: string;
  default?: boolean;
  model?: string | { primary: string; fallbacks?: string[] };  // can be plain string
  skills?: string[];                 // skill IDs, e.g. ["tavily-web-search", "Memory"]
  heartbeat?: {
    every?: string;
    target?: string;
    systemPrompt?: string;
    prompt?: string;
    activeHours?: { start: string; end: string; timezone?: string };
    directPolicy?: 'allow' | 'deny';
    lightContext?: boolean;
    ackMaxChars?: number;
  };
  tools?: AgentToolsOverride;
  groupChat?: { mentionPatterns?: string[] };
}

export interface AgentToolsOverride {
  profile?: 'full' | 'coding' | 'messaging' | 'minimal';
  allow?: string[];
  deny?: string[];
  byProvider?: Record<string, { allow?: string[]; deny?: string[] }>;
  elevated?: string[];
  loopDetection?: { enabled: boolean; maxIterations?: number };
}

export interface ModelsConfig {
  mode?: 'merge' | 'replace';
  providers?: Record<string, ModelProviderConfig>;
}

export interface ModelProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  api?: string;
  models?: Array<{
    id: string;
    name?: string;
    cost?: { input?: number; output?: number };
    contextWindow?: number;
  }>;
}

export interface ModelDef {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  alias?: string;
}

export interface ToolsConfig {
  profile?: 'full' | 'coding' | 'messaging' | 'minimal';
  allow?: string[];
  deny?: string[];
  web?: {
    search?: {
      enabled?: boolean;
      provider?: 'brave' | 'gemini' | 'perplexity' | 'grok' | 'kimi';
      apiKey?: string;
      maxResults?: number;
    };
    fetch?: { enabled?: boolean; maxChars?: number };
  };
  browser?: { enabled?: boolean };
  canvas?: { enabled?: boolean };
  agentToAgent?: { enabled?: boolean };
  sessions?: { visibility?: 'all' | 'owned' | 'none' };
  image?: { enabled?: boolean };
  pdf?: { enabled?: boolean };
}

export interface BrowserConfig {
  enabled?: boolean;
  profile?: 'openclaw' | 'chrome';
  executablePath?: string;
  headless?: boolean;
  ssrf?: { mode: 'block' | 'allow' | 'ask'; allowPrivate?: boolean };
}

export interface ChannelsConfig {
  defaults?: ChannelDefaults;
  feishu?: FeishuChannelConfig;
  telegram?: TelegramChannelConfig;
  discord?: DiscordChannelConfig;
  whatsapp?: WhatsAppChannelConfig;
  slack?: Record<string, unknown>;
  imessage?: Record<string, unknown>;
}

export interface ChannelDefaults {
  dmPolicy?: PolicyMode;
  groupPolicy?: PolicyMode;
  heartbeat?: { announce?: boolean };
}

export type PolicyMode = 'pairing' | 'allowlist' | 'open' | 'disabled';

export interface FeishuChannelConfig {
  enabled?: boolean;
  appId?: string;
  appSecret?: string;
  verificationToken?: string;
  encryptKey?: string;
  dmPolicy?: PolicyMode;
  groupPolicy?: PolicyMode;
  allowFrom?: string[];
  groups?: Record<string, { policy?: PolicyMode }>;
}

export interface TelegramChannelConfig {
  enabled?: boolean;
  botToken?: string;
  dmPolicy?: PolicyMode;
  allowFrom?: string[];
}

export interface DiscordChannelConfig {
  enabled?: boolean;
  botToken?: string;
  dmPolicy?: PolicyMode;
  guilds?: Record<string, { roles?: Record<string, string> }>;
}

export interface WhatsAppChannelConfig {
  enabled?: boolean;
  accounts?: Array<{ id: string; [key: string]: unknown }>;
}

export interface SkillsConfig {
  allowBundled?: string[];
  extraDirs?: string[];
  load?: { extraDirs?: string[] };
  entries?: Record<string, SkillEntry>;
}

export interface SkillEntry {
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
  [key: string]: unknown;
}

export interface SkillInfo {
  name: string;
  path: string;
  content: string;
  description?: string;
  enabled?: boolean;
}

// ---- Cron ----
export interface CronSchedule {
  kind: 'cron' | 'every' | 'at';
  expr?: string;      // for kind=cron (full cron expression)
  interval?: string;  // for kind=every, e.g. "1h"
  time?: string;      // for kind=at,   e.g. "09:00"
  staggerMs?: number;
  tz?: string;
}

export interface CronPayload {
  kind: 'agentTurn' | 'systemEvent';
  message?: string;
  systemEvent?: string;
  lightContext?: boolean;
}

export interface CronDelivery {
  mode: 'announce' | 'silent';
  channel?: string;
  bestEffort?: boolean;
}

export interface CronJobState {
  lastRunAtMs?: number;
  lastRunStatus?: string;
  lastStatus?: string;
  lastDurationMs?: number;
  lastDelivered?: boolean;
  lastDeliveryStatus?: string;
  consecutiveErrors?: number;
}

export interface SessionConfig {
  dmScope?: 'main' | 'per-peer' | 'per-channel-peer' | 'per-account-channel-peer';
  threadBindings?: { enabled: boolean; idleHours?: number; maxAgeHours?: number };
  reset?: { mode: 'daily' | 'idle' | 'never'; atHour?: number; idleMinutes?: number; tz?: string };
  maxHistoryMessages?: number;
  maxContextTokens?: number;
}

export interface CronConfig {
  enabled?: boolean;
  maxConcurrentRuns?: number;
  sessionRetention?: string;
}

export interface CronJob {
  id?: string;
  agentId?: string;       // which agent executes this job
  name: string;
  description?: string;
  enabled?: boolean;
  createdAtMs?: number;
  updatedAtMs?: number;
  schedule?: CronSchedule;
  sessionTarget?: 'main' | 'isolated';
  wakeMode?: 'now' | 'opportunistic';
  payload?: CronPayload;
  delivery?: CronDelivery;
  state?: CronJobState;
}

export interface CronJobsFile {
  version?: number;
  jobs: CronJob[];
}

export interface HooksConfig {
  enabled?: boolean;
  events?: Record<string, HookAction[]>;
}

export interface HookAction {
  type: 'exec' | 'message' | 'http';
  command?: string;
  url?: string;
  method?: string;
}

export interface BindingConfig {
  agentId: string;
  channel?: string;
  accountId?: string;
  peer?: string;
  parentPeer?: string;
  guildId?: string;
  teamId?: string;
  roles?: string[];
  fallback?: boolean;
}

export interface AuthConfig { mode?: string; token?: string }
export interface DiscoveryConfig { enabled?: boolean; advertise?: boolean }
export interface LoggingConfig { level?: 'debug' | 'info' | 'warn' | 'error'; file?: string; maxSize?: string }
export interface CliConfig { defaultAgent?: string }
export interface UiConfig { theme?: 'light' | 'dark' | 'system' }
export interface MetaConfig { version?: string; updatedAt?: string }

export interface GatewayStatus {
  version?: string;
  port?: number;
  uptime?: number;
  agents?: Array<{ id: string; status: string }>;
  channels?: Array<{ type: string; status: string }>;
  memory?: { used: number; total: number };
}

export interface GatewayError {
  message: string;
  code?: number | string;
}

// ---- Instance Management ----
export type InstanceType = 'local' | 'remote' | 'ssh';

export interface InstanceProfile {
  id: string;
  name: string;
  type: InstanceType;
  gatewayUrl: string;      // e.g. ws://localhost:18789 or wss://remote.host:18789
  token?: string;
  sshHost?: string;        // SSH jump host (type=ssh)
  sshUser?: string;
  sshKeyPath?: string;
  notes?: string;
  color?: string;          // UI accent color for quick recognition
  createdAt: number;
  lastConnectedAt?: number;
}

// ---- Security Scan ----
export type SecuritySeverity = 'critical' | 'high' | 'warning' | 'info' | 'ok';

export interface SecurityFinding {
  id: string;
  severity: SecuritySeverity;
  category: 'auth' | 'network' | 'secrets' | 'tls' | 'access' | 'config';
  title: string;
  description: string;
  recommendation: string;
  configPath?: string;     // dot-path to the config key involved
}

export interface SecurityScanResult {
  scannedAt: number;
  score: number;           // 0-100, higher is better
  findings: SecurityFinding[];
}

// ---- Install Detection ----
export type OsPlatform = 'windows' | 'macos' | 'linux' | 'unknown';

export interface InstallCheck {
  installed: boolean;
  version?: string;
  configExists: boolean;
  configPath?: string;
  npmGlobalPath?: string;
}

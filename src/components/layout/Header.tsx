import { useAppStore } from '../../store';

const sectionIcons: Record<string, string> = {
  dashboard: '📊',
  gateway: '🌐',
  agents: '🤖',
  channels: '💬',
  tools: '🔧',
  skills: '🧪',
  cron: '⏰',
  chat: '💬',
  rawConfig: '📝',
};

export function Header() {
  const { language, setLanguage, theme, setTheme, activeSection, loadConfig, isLoading, config, t } = useAppStore();

  // Derive title/subtitle from active section via i18n
  const getSectionInfo = (): { title: string; subtitle?: string } => {
    switch (activeSection) {
      case 'dashboard':  return { title: t.dashboard.title, subtitle: t.dashboard.subtitle };
      case 'gateway':    return { title: t.gateway.title, subtitle: t.gateway.subtitle };
      case 'agents':     return { title: t.agents.title, subtitle: t.agents.subtitle };
      case 'channels':   return { title: t.channels.title, subtitle: t.channels.subtitle };
      case 'tools':      return { title: t.tools.title, subtitle: t.tools.subtitle };
      case 'skills':     return { title: t.skills.title, subtitle: t.skills.subtitle };
      case 'cron':       return { title: t.cron.title, subtitle: t.cron.subtitle };
      case 'chat':       return { title: t.chat.title, subtitle: t.chat.subtitle };
      case 'rawConfig':  return { title: t.rawConfig.title, subtitle: t.rawConfig.subtitle };
      default:           return { title: t.dashboard.title };
    }
  };

  const { title, subtitle } = getSectionInfo();

  return (
    <header style={{
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      borderBottom: '1px solid var(--color-border)',
      background: 'var(--color-surface)',
      flexShrink: 0,
      gap: 16,
    }}>
      {/* Left: page title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>{sectionIcons[activeSection] || '📋'}</span>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>
            {title}
          </h2>
          {subtitle && (
            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.3 }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right: actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Reload config */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => loadConfig()}
          disabled={isLoading}
          title="Reload config"
          style={{ padding: '5px 8px' }}
        >
          <svg
            width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
            style={{ animation: isLoading ? 'spin 0.7s linear infinite' : 'none' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        {/* Language toggle */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
          style={{ padding: '5px 10px', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }}
          title="Switch language"
        >
          {language === 'zh' ? 'EN' : '中文'}
        </button>

        {/* Theme toggle */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          style={{ padding: '5px 8px' }}
          title="Toggle theme"
        >
          {theme === 'dark' ? (
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* Config path indicator */}
        {config && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: 20,
            fontSize: 11,
            color: '#34D399',
            maxWidth: 200,
            overflow: 'hidden',
          }}>
            <div className="status-dot status-dot-success" style={{ width: 6, height: 6, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              openclaw.json
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

import React from 'react';
import { useAppStore } from '../../store';

type NavKey = 'dashboard' | 'gateway' | 'agents' | 'channels' | 'tools' | 'skills' | 'cron' | 'chat' | 'rawConfig' | 'usage' | 'sessions' | 'instances' | 'security' | 'install';

interface NavItem {
  id: string;
  labelKey: NavKey;
  icon: React.ReactNode;
  badge?: string;
}

interface NavGroup {
  groupKey: 'overview' | 'team' | 'system' | 'extend' | 'advanced' | 'manage';
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    groupKey: 'overview',
    items: [
      {
        id: 'dashboard',
        labelKey: 'dashboard',
        icon: (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z" />
          </svg>
        ),
      },
      {
        id: 'usage',
        labelKey: 'usage',
        icon: (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
    ],
  },
  {
    groupKey: 'team',
    items: [
      {
        id: 'chat',
        labelKey: 'chat',
        icon: (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        ),
      },
      {
        id: 'agents',
        labelKey: 'agents',
        icon: (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ),
      },
      {
        id: 'sessions',
        labelKey: 'sessions',
        icon: (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        ),
      },
    ],
  },
  {
    groupKey: 'system',
    items: [
      {
        id: 'gateway',
        labelKey: 'gateway',
        icon: (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
          </svg>
        ),
      },
      {
        id: 'channels',
        labelKey: 'channels',
        icon: (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        ),
      },
      {
        id: 'cron',
        labelKey: 'cron',
        icon: (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
    ],
  },
  {
    groupKey: 'extend',
    items: [
      {
        id: 'skills',
        labelKey: 'skills',
        icon: (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        ),
      },
      {
        id: 'tools',
        labelKey: 'tools',
        icon: (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
          </svg>
        ),
      },
    ],
  },
  {
    groupKey: 'advanced',
    items: [
      {
        id: 'rawConfig',
        labelKey: 'rawConfig',
        icon: (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        ),
      },
    ],
  },
  {
    groupKey: 'manage',
    items: [
      {
        id: 'instances',
        labelKey: 'instances',
        icon: (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-9-4h4" />
          </svg>
        ),
      },
      {
        id: 'security',
        labelKey: 'security',
        icon: (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        ),
      },

      {
        id: 'install',
        labelKey: 'install',
        icon: (
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        ),
      },
    ],
  },
];

export function Sidebar() {
  const { activeSection, setActiveSection, sidebarCollapsed, setSidebarCollapsed, t, config } = useAppStore();

  const width = sidebarCollapsed ? 60 : 220;

  return (
    <aside style={{
      width,
      minWidth: width,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-surface)',
      borderRight: '1px solid var(--color-border)',
      transition: 'width 0.2s ease',
      overflow: 'hidden',
      position: 'relative',
      zIndex: 10,
    }}>
      {/* Logo / Brand */}
      <div style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        padding: sidebarCollapsed ? '0 14px' : '0 16px',
        borderBottom: '1px solid var(--color-border)',
        gap: 10,
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: 'linear-gradient(135deg, #7C3AED, #2563EB)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 16,
          boxShadow: '0 4px 12px rgba(124,58,237,0.4)',
        }}>
          🦞
        </div>
        {!sidebarCollapsed && (
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              background: 'linear-gradient(135deg, #A78BFA, #60A5FA)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              whiteSpace: 'nowrap',
            }}>
              OpenClaw
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', marginTop: 1 }}>
              Config Manager
            </div>
          </div>
        )}
      </div>

      {/* Navigation — grouped */}
      <nav style={{ flex: 1, padding: sidebarCollapsed ? '8px 8px' : '8px 10px', overflowY: 'auto', overflowX: 'hidden' }}>
        {navGroups.map((group, gi) => (
          <div key={group.groupKey} style={{ marginBottom: gi < navGroups.length - 1 ? 6 : 0 }}>
            {/* Group label (hidden when collapsed) */}
            {!sidebarCollapsed && (
              <div style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                padding: '8px 8px 4px 8px',
              }}>
                {t.navGroups[group.groupKey]}
              </div>
            )}
            {group.items.map(item => {
              const active = activeSection === item.id;
              const navFallback = (t.nav as Record<string, string>)[item.labelKey];
              const label = item.labelKey === 'usage' ? t.usage.title :
                            item.labelKey === 'chat' ? t.chat.title :
                            item.labelKey === 'sessions' ? t.sessions.title :
                            item.labelKey === 'dashboard' ? t.nav.dashboard :
                            item.labelKey === 'rawConfig' ? t.nav.rawConfig :
                            item.labelKey === 'install' ? t.nav.install :
                            navFallback || item.labelKey;
              return (
                <button
                  key={item.id}
                  className={`nav-item ${active ? 'nav-item-active' : ''}`}
                  onClick={() => setActiveSection(item.id)}
                  title={sidebarCollapsed ? label : undefined}
                  style={{
                    width: '100%',
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    marginBottom: 2,
                    position: 'relative',
                  }}
                >
                  <span style={{
                    color: active ? '#A78BFA' : 'var(--color-text-secondary)',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}>
                    {item.icon}
                  </span>
                  {!sidebarCollapsed && (
                    <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, flex: 1, textAlign: 'left' }}>
                      {label}
                    </span>
                  )}
                  {!sidebarCollapsed && active && (
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: '#A78BFA',
                      flexShrink: 0,
                      boxShadow: '0 0 6px rgba(167,139,250,0.8)',
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Config Status */}
      {!sidebarCollapsed && (
        <div style={{
          padding: '10px 12px',
          borderTop: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '7px 10px',
            background: config ? 'rgba(16,185,129,0.08)' : 'rgba(100,116,139,0.08)',
            border: `1px solid ${config ? 'rgba(16,185,129,0.2)' : 'rgba(100,116,139,0.15)'}`,
            borderRadius: 8,
          }}>
            <div
              className={`status-dot ${config ? 'status-dot-success' : 'status-dot-gray'}`}
              style={{ width: 7, height: 7 }}
            />
            <span style={{
              fontSize: 11,
              color: config ? '#34D399' : 'var(--color-text-muted)',
              fontWeight: 500,
            }}>
              {config ? 'Config Loaded' : 'No Config'}
            </span>
          </div>
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        className="btn-ghost btn-icon"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        style={{
          width: '100%',
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
          padding: sidebarCollapsed ? 0 : '0 18px',
          borderTop: '1px solid var(--color-border)',
          borderRadius: 0,
          flexShrink: 0,
          color: 'var(--color-text-muted)',
        }}
        title={sidebarCollapsed ? 'Expand' : 'Collapse'}
      >
        <svg
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
        {!sidebarCollapsed && (
          <span style={{ fontSize: 11, marginLeft: 8 }}>Collapse</span>
        )}
      </button>
    </aside>
  );
}

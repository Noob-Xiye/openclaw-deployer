import { useEffect } from 'react';
import { useAppStore } from './store';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ToastContainer } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { GatewaySettings } from './pages/GatewaySettings';
import { AgentSettings } from './pages/AgentSettings';
import { ChannelSettings } from './pages/ChannelSettings';
import { ToolsSettings } from './pages/ToolsSettings';
import { SkillsPage } from './pages/SkillsPage';
import { CronPage } from './pages/CronPage';
import { RawConfig } from './pages/RawConfig';
import { ChatPage } from './pages/ChatPage';
import { UsagePage } from './pages/UsagePage';
import { SessionsPage } from './pages/SessionsPage';
import { InstancesPage } from './pages/InstancesPage';
import { SecurityPage } from './pages/SecurityPage';
import { InstallPage } from './pages/InstallPage';
import { gatewayClient } from './services/gatewayWs';

import './index.css';

function App() {
  const { activeSection, theme, config, initPaths, loadConfig } = useAppStore();

  // Apply theme class to <html>
  useEffect(() => {
    const applyTheme = () => {
      if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      }
    };
    applyTheme();
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', applyTheme);
      return () => mq.removeEventListener('change', applyTheme);
    }
  }, [theme]);

  // Boot: detect openclaw home → read config → ensure Tauri origin allowed → connect Gateway WS
  useEffect(() => {
    const boot = async () => {
      await initPaths();
      await loadConfig();
      // After loadConfig, sync the fresh configPath from Rust backend to store
      let freshPath = '';
      try {
        const { getConfigService } = await import('./services/config');
        freshPath = await getConfigService().getConfigPath();
        useAppStore.setState({ configPath: freshPath });
      } catch {
        // ignore
      }
      // Ensure Tauri WebView origins are allowed in config
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const cfgPath = freshPath || useAppStore.getState().configPath;
        const result = await invoke<string>('ensure_control_ui_allowed', { configPath: cfgPath });
        console.log('[App] ensure_control_ui_allowed:', result);
        // Reload config after modification
        await loadConfig();
      } catch (e) {
        console.warn('[App] ensure_control_ui_allowed failed:', e);
      }
    };
    boot();
  }, []);

  // When config loads/changes, feed port+token to gatewayClient
  useEffect(() => {
    if (config?.gateway) {
      const port = config.gateway.port || 18789;
      const token = config.gateway.auth?.token || '';
      console.log('[App] setConfig: port=', port, 'token=', token ? token.substring(0,8)+'...' : '(empty)', 'gwState=', gatewayClient.state);
      gatewayClient.setConfig({ port, token });
      // Auto-connect if not already connected
      if (gatewayClient.state === 'disconnected') {
        gatewayClient.ensureConnected().catch(() => {});
      }
    }
  }, [config?.gateway?.port, config?.gateway?.auth?.token]);

  const renderPage = () => {
    switch (activeSection) {
      case 'dashboard':  return <Dashboard />;
      case 'gateway':    return <GatewaySettings />;
      case 'agents':     return <AgentSettings />;
      case 'channels':   return <ChannelSettings />;
      case 'tools':      return <ToolsSettings />;
      case 'skills':     return <SkillsPage />;
      case 'cron':       return <CronPage />;
      case 'chat':       return <ChatPage />;
      case 'usage':      return <UsagePage />;
      case 'sessions':   return <SessionsPage />;
      case 'rawConfig':  return <RawConfig />;
      case 'instances':  return <InstancesPage />;
      case 'security':   return <SecurityPage />;
      case 'install':    return <InstallPage />;
      default:           return <Dashboard />;
    }
  };

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: 'var(--color-bg)',
      color: 'var(--color-text-primary)',
      fontFamily: 'var(--font-family-sans)',
    }}>
      <Sidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Header />
        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {renderPage()}
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}

export default App;
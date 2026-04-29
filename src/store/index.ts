import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { OpenClawConfig, CronJobsFile, SkillInfo, InstanceProfile } from '../types';
import { Language, translations } from '../i18n';
import { getConfigService } from '../services/config';

type Theme = 'dark' | 'light' | 'system';
type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

interface AppState {
  // Config
  config: OpenClawConfig | null;
  configPath: string;
  openclawHome: string;
  isLoading: boolean;
  saveStatus: SaveStatus;
  loadError: string | null;

  // Cron
  cronJobs: CronJobsFile;
  isCronLoading: boolean;

  // Skills
  skills: SkillInfo[];
  isSkillsLoading: boolean;

  // UI
  activeSection: string;
  sidebarCollapsed: boolean;
  language: Language;
  theme: Theme;
  toasts: Toast[];

  // Instances
  instances: InstanceProfile[];
  activeInstanceId: string | null;

  // Computed helpers
  t: ReturnType<typeof createT>;

  // Actions
  setActiveSection: (s: string) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: Theme) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;

  // Config actions
  loadConfig: (path?: string) => Promise<void>;
  saveConfig: (config: OpenClawConfig) => Promise<void>;
  updateConfig: (updater: (cfg: OpenClawConfig) => OpenClawConfig) => void;
  initPaths: () => Promise<void>;

  // Cron actions
  loadCronJobs: () => Promise<void>;
  saveCronJobs: (jobs: CronJobsFile) => Promise<void>;

  // Skills actions
  loadSkills: () => Promise<void>;

  // Instance actions
  addInstance: (inst: Omit<InstanceProfile, 'id' | 'createdAt'>) => void;
  updateInstance: (id: string, patch: Partial<InstanceProfile>) => void;
  removeInstance: (id: string) => void;
  switchInstance: (id: string) => void;
}

function createT(language: Language) {
  return translations[language];
}

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      config: null,
      configPath: '',
      openclawHome: '',
      isLoading: false,
      saveStatus: 'idle',
      loadError: null,
      cronJobs: { jobs: [] },
      isCronLoading: false,
      skills: [],
      isSkillsLoading: false,
      activeSection: 'dashboard',
      sidebarCollapsed: false,
      language: 'zh',
      theme: 'dark',
      toasts: [],
      t: createT('zh'),
      instances: [],
      activeInstanceId: null,

      setActiveSection: (activeSection) => set({ activeSection }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setLanguage: (language) => set({ language, t: createT(language) }),
      setTheme: (theme) => set({ theme }),

      addToast: (toast) => {
        const id = generateId();
        set(s => ({ toasts: [...s.toasts, { ...toast, id }] }));
        setTimeout(() => {
          set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
        }, 4000);
      },

      removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

      initPaths: async () => {
        try {
          const svc = getConfigService();
          const [configPath, openclawHome] = await Promise.all([
            svc.getConfigPath(),
            svc.getOpenClawHome(),
          ]);
          set({ configPath, openclawHome });
        } catch (e) {
          console.error('Failed to init paths:', e);
        }
      },

      loadConfig: async (path) => {
        set({ isLoading: true, loadError: null });
        try {
          const svc = getConfigService();
          const config = await svc.loadConfig(path || get().configPath || undefined);
          if (!get().configPath) {
            const configPath = await svc.getConfigPath();
            set({ configPath });
          }
          set({ config, isLoading: false });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ isLoading: false, loadError: msg });
          get().addToast({ type: 'error', message: msg });
        }
      },

      saveConfig: async (config) => {
        set({ saveStatus: 'saving' });
        try {
          const svc = getConfigService();
          await svc.saveConfig(config, get().configPath || undefined);
          set({ config, saveStatus: 'success' });
          get().addToast({ type: 'success', message: get().t.app.saved });
          setTimeout(() => set({ saveStatus: 'idle' }), 2000);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ saveStatus: 'error' });
          get().addToast({ type: 'error', message: msg });
          setTimeout(() => set({ saveStatus: 'idle' }), 3000);
        }
      },

      updateConfig: (updater) => {
        const current = get().config;
        if (!current) return;
        set({ config: updater(current) });
      },

      loadCronJobs: async () => {
        set({ isCronLoading: true });
        try {
          const jobs = await getConfigService().loadCronJobs();
          set({ cronJobs: jobs, isCronLoading: false });
        } catch (e) {
          set({ isCronLoading: false });
          console.error('Failed to load cron jobs:', e);
        }
      },

      saveCronJobs: async (cronJobs) => {
        try {
          await getConfigService().saveCronJobs(cronJobs);
          set({ cronJobs });
          get().addToast({ type: 'success', message: get().t.app.saved });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          get().addToast({ type: 'error', message: msg });
        }
      },

      loadSkills: async () => {
        set({ isSkillsLoading: true });
        try {
          const skills = await getConfigService().listSkills();
          set({ skills, isSkillsLoading: false });
        } catch (e) {
          set({ isSkillsLoading: false });
          console.error('Failed to load skills:', e);
        }
      },

      addInstance: (inst) => {
        const id = generateId();
        const newInst: InstanceProfile = { ...inst, id, createdAt: Date.now() };
        set(s => ({ instances: [...s.instances, newInst] }));
      },

      updateInstance: (id, patch) => {
        set(s => ({
          instances: s.instances.map(i => i.id === id ? { ...i, ...patch } : i),
        }));
      },

      removeInstance: (id) => {
        set(s => ({
          instances: s.instances.filter(i => i.id !== id),
          activeInstanceId: s.activeInstanceId === id ? null : s.activeInstanceId,
        }));
      },

      switchInstance: (id) => {
        set(s => ({
          activeInstanceId: id,
          instances: s.instances.map(i =>
            i.id === id ? { ...i, lastConnectedAt: Date.now() } : i
          ),
        }));
      },
    }),
    {
      name: 'openclaw-config-manager',
      partialize: (s) => ({
        language: s.language,
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
        activeSection: s.activeSection,
        configPath: s.configPath,
        instances: s.instances,
        activeInstanceId: s.activeInstanceId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.t = createT(state.language || 'zh');
        }
      },
    }
  )
);

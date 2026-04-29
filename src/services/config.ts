import { invoke } from '@tauri-apps/api/core';
import { OpenClawConfig, CronJobsFile, SkillInfo } from '../types';

export interface ConfigService {
  getConfigPath(): Promise<string>;
  loadConfig(path?: string): Promise<OpenClawConfig>;
  saveConfig(config: OpenClawConfig, path?: string): Promise<void>;
  getOpenClawHome(): Promise<string>;
  loadCronJobs(): Promise<CronJobsFile>;
  saveCronJobs(jobs: CronJobsFile): Promise<void>;
  listSkills(baseDir?: string): Promise<SkillInfo[]>;
}

class TauriConfigService implements ConfigService {
  private configPath: string | null = null;
  private openclawHome: string | null = null;

  async getConfigPath(): Promise<string> {
    if (this.configPath) return this.configPath;
    const path = await invoke<string>('get_config_path');
    this.configPath = path;
    return path;
  }

  async getOpenClawHome(): Promise<string> {
    if (this.openclawHome) return this.openclawHome;
    const home = await invoke<string>('get_openclaw_home_cmd');
    this.openclawHome = home;
    return home;
  }

  async loadConfig(path?: string): Promise<OpenClawConfig> {
    const configPath = path || await this.getConfigPath();
    const content = await invoke<string>('read_config_file', { path: configPath });
    try {
      return JSON.parse(content) as OpenClawConfig;
    } catch {
      throw new Error(`Invalid JSON in config file: ${configPath}`);
    }
  }

  async saveConfig(config: OpenClawConfig, path?: string): Promise<void> {
    const configPath = path || await this.getConfigPath();
    const content = JSON.stringify(config, null, 2);
    await invoke('write_config_file', { path: configPath, content });
  }

  async loadCronJobs(): Promise<CronJobsFile> {
    const home = await this.getOpenClawHome();
    const content = await invoke<string>('read_cron_jobs', { baseDir: home });
    try {
      return JSON.parse(content) as CronJobsFile;
    } catch {
      return { jobs: [] };
    }
  }

  async saveCronJobs(jobs: CronJobsFile): Promise<void> {
    const home = await this.getOpenClawHome();
    const content = JSON.stringify(jobs, null, 2);
    await invoke('write_cron_jobs', { baseDir: home, content });
  }

  async listSkills(baseDir?: string): Promise<SkillInfo[]> {
    const dir = baseDir || await this.getOpenClawHome();
    const raw = await invoke<Array<{ name: string; path: string; content: string }>>('list_skills', { baseDir: dir });
    return raw.map(s => ({
      ...s,
      description: extractDescription(s.content),
      enabled: true,
    }));
  }
}

function extractDescription(skillMd: string): string {
  const match = skillMd.match(/^description:\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

// Singleton
let _service: ConfigService | null = null;
export function getConfigService(): ConfigService {
  if (!_service) _service = new TauriConfigService();
  return _service;
}

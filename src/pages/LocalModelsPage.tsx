import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useAppStore } from '../store';
import { PageHeader, Badge } from '../components/ui';

// ── Types ───────────────────────────────────────────────────────────────────

interface GpuInfo {
  name: string;
  vram_total_mb: number;
  vram_used_mb: number;
  driver_version: string;
}

interface HardwareProfile {
  cpu_name: string;
  cpu_cores: number;
  ram_total_gb: number;
  gpus: GpuInfo[];
  max_vram_mb: number;
}

interface OllamaModel {
  name: string;
  tag: string;
  size_bytes: number;
  modified_at: string;
  digest: string;
}

interface OllamaStatus {
  running: boolean;
  version: string | null;
  models: OllamaModel[];
  base_url: string;
}

interface DiskPartition {
  mount_point: string;
  label: string;
  fs_type: string;
  total_gb: number;
  free_gb: number;
  recommended: boolean;
}

interface PullProgressEvent {
  model: string;
  status: string;
  percent: number;
}

interface ModelRecommendation {
  id: string;
  name: string;
  ollama_tag: string;
  icon: string;
  description: string;
  params: string;
  quant: string;
  vram_required_mb: number;
  disk_size_gb: number;
  category: 'recommended' | 'capable' | 'lightweight' | 'stretch';
  tags: string[];
  chinese: number;
}

// ── Model Catalog ───────────────────────────────────────────────────────────

const MODEL_CATALOG: ModelRecommendation[] = [
  {
    id: 'qwen3-8b',
    name: 'Qwen3 8B',
    ollama_tag: 'qwen3:8b',
    icon: '🇨🇳',
    description: '中文最强小模型，支持思考模式，工具调用出色',
    params: '8B',
    quant: 'Q4_K_M',
    vram_required_mb: 5120,
    disk_size_gb: 4.7,
    category: 'recommended',
    tags: ['中文最强', '工具调用', '思考模式'],
    chinese: 5,
  },
  {
    id: 'glm4-flash',
    name: 'GLM-4.7 Flash',
    ollama_tag: 'glm4.7-flash',
    icon: '💬',
    description: 'OpenClaw 官方推荐默认模型，速度与质量均衡',
    params: '9B',
    quant: 'Q4',
    vram_required_mb: 5200,
    disk_size_gb: 4.5,
    category: 'recommended',
    tags: ['官方推荐', '快速推理'],
    chinese: 5,
  },
  {
    id: 'llama3.1-8b',
    name: 'Llama 3.1 8B',
    ollama_tag: 'llama3.1:8b',
    icon: '🦙',
    description: 'Meta 开源旗舰小模型，英文通用能力最强',
    params: '8B',
    quant: 'Q4_K_M',
    vram_required_mb: 5120,
    disk_size_gb: 4.7,
    category: 'capable',
    tags: ['英文强', '通用'],
    chinese: 3,
  },
  {
    id: 'mistral-7b',
    name: 'Mistral 7B',
    ollama_tag: 'mistral:7b',
    icon: '🌀',
    description: '轻量高效，指令遵循和推理速度快',
    params: '7B',
    quant: 'Q4_K_M',
    vram_required_mb: 4608,
    disk_size_gb: 4.1,
    category: 'capable',
    tags: ['快速', '指令遵循'],
    chinese: 3,
  },
  {
    id: 'qwen3-4b',
    name: 'Qwen3 4B',
    ollama_tag: 'qwen3:4b',
    icon: '⚡',
    description: '速度飞快，中文能力出色，低显存首选',
    params: '4B',
    quant: 'Q4_K_M',
    vram_required_mb: 2867,
    disk_size_gb: 2.5,
    category: 'lightweight',
    tags: ['极速', '省显存', '中文好'],
    chinese: 4,
  },
  {
    id: 'phi4-mini',
    name: 'Phi-4 Mini',
    ollama_tag: 'phi4-mini',
    icon: '💎',
    description: '微软出品，小而精，推理效率极高',
    params: '3.8B',
    quant: 'Q8',
    vram_required_mb: 4096,
    disk_size_gb: 2.5,
    category: 'lightweight',
    tags: ['微软', '小而精'],
    chinese: 3,
  },
  {
    id: 'gemma3-4b',
    name: 'Gemma 3 4B',
    ollama_tag: 'gemma3:4b',
    icon: '🔮',
    description: 'Google 开源，支持图片输入（多模态）',
    params: '4B',
    quant: 'Q4_K_M',
    vram_required_mb: 3072,
    disk_size_gb: 2.8,
    category: 'lightweight',
    tags: ['多模态', '图片理解'],
    chinese: 3,
  },
  {
    id: 'deepseek-r1-7b',
    name: 'DeepSeek R1 7B',
    ollama_tag: 'deepseek-r1:7b',
    icon: '🧠',
    description: '推理/思考模型，擅长数学和逻辑推理',
    params: '7B',
    quant: 'Q4_K_M',
    vram_required_mb: 5120,
    disk_size_gb: 4.5,
    category: 'capable',
    tags: ['推理', '思考模式', '数学'],
    chinese: 4,
  },
  {
    id: 'qwen3-14b',
    name: 'Qwen3 14B',
    ollama_tag: 'qwen3:14b',
    icon: '🚀',
    description: '需 CPU offload，速度较慢但能力更强',
    params: '14B',
    quant: 'Q3_K_M',
    vram_required_mb: 8192,
    disk_size_gb: 7.5,
    category: 'stretch',
    tags: ['性能更强', '需offload', '较慢'],
    chinese: 5,
  },
  {
    id: 'deepseek-r1-14b',
    name: 'DeepSeek R1 14B',
    ollama_tag: 'deepseek-r1:14b',
    icon: '🔬',
    description: '需 CPU offload，推理能力接近大模型',
    params: '14B',
    quant: 'Q3_K_M',
    vram_required_mb: 8192,
    disk_size_gb: 7.8,
    category: 'stretch',
    tags: ['推理强', '需offload', '较慢'],
    chinese: 4,
  },
];

// ── Helper: category config ─────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, {
  label_zh: string; label_en: string;
  borderColor: string; bgColor: string; tagColor: string; tagBg: string;
  glowStyle?: React.CSSProperties;
}> = {
  recommended: {
    label_zh: '⭐ 强烈推荐', label_en: '⭐ Highly Recommended',
    borderColor: 'rgba(245, 158, 11, 0.5)',
    bgColor: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(234,179,8,0.04))',
    tagColor: '#F59E0B', tagBg: 'rgba(245,158,11,0.15)',
    glowStyle: { boxShadow: '0 0 20px rgba(245,158,11,0.12), inset 0 1px 0 rgba(245,158,11,0.1)' },
  },
  capable: {
    label_zh: '✅ 流畅运行', label_en: '✅ Runs Smoothly',
    borderColor: 'rgba(16,185,129,0.35)',
    bgColor: 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(6,182,212,0.03))',
    tagColor: '#10B981', tagBg: 'rgba(16,185,129,0.12)',
  },
  lightweight: {
    label_zh: '⚡ 轻量极速', label_en: '⚡ Lightweight & Fast',
    borderColor: 'rgba(99,102,241,0.35)',
    bgColor: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(37,99,235,0.03))',
    tagColor: '#6366F1', tagBg: 'rgba(99,102,241,0.12)',
  },
  stretch: {
    label_zh: '🔶 勉强能跑', label_en: '🔶 Stretch (CPU Offload)',
    borderColor: 'rgba(239,68,68,0.35)',
    bgColor: 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(239,68,68,0.02))',
    tagColor: '#EF4444', tagBg: 'rgba(239,68,68,0.12)',
  },
};

// ── Helper: format bytes ────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ── Sub-components ──────────────────────────────────────────────────────────

function HardwareCard({ hw, lang }: { hw: HardwareProfile; lang: 'zh' | 'en' }) {
  const vramUsed = hw.gpus.length > 0 ? hw.gpus[0].vram_used_mb : 0;
  const vramTotal = hw.max_vram_mb;
  const vramPercent = vramTotal > 0 ? Math.round((vramUsed / vramTotal) * 100) : 0;

  return (
    <div style={{
      background: 'var(--color-surface-2)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      padding: 20,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 16 }}>
        {lang === 'zh' ? '🖥️ 硬件配置' : '🖥️ Hardware Profile'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* CPU */}
        <div style={{ padding: '10px 14px', background: 'var(--color-surface-3)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>
            {lang === 'zh' ? '处理器' : 'CPU'}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {hw.cpu_name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            {hw.cpu_cores} {lang === 'zh' ? '核' : 'cores'}
          </div>
        </div>

        {/* RAM */}
        <div style={{ padding: '10px 14px', background: 'var(--color-surface-3)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>
            {lang === 'zh' ? '内存' : 'RAM'}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {hw.ram_total_gb} GB
          </div>
        </div>
      </div>

      {/* GPU */}
      {hw.gpus.length > 0 && hw.gpus.map((gpu, idx) => (
        <div key={idx} style={{
          marginTop: 12,
          padding: '12px 14px',
          background: 'var(--color-surface-3)',
          borderRadius: 8,
          borderLeft: '3px solid #6366F1',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                🎮 {gpu.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                {lang === 'zh' ? '驱动' : 'Driver'}: {gpu.driver_version}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#6366F1' }}>
                {(gpu.vram_total_mb / 1024).toFixed(1)} GB VRAM
              </div>
            </div>
          </div>
          {/* VRAM bar */}
          <div style={{
            width: '100%', height: 6, background: 'var(--color-surface-2)',
            borderRadius: 3, overflow: 'hidden',
          }}>
            <div style={{
              width: `${vramPercent}%`, height: '100%',
              background: vramPercent > 80 ? '#EF4444' : vramPercent > 50 ? '#F59E0B' : '#6366F1',
              borderRadius: 3, transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4, textAlign: 'right' }}>
            {gpu.vram_used_mb} / {gpu.vram_total_mb} MB {lang === 'zh' ? '已使用' : 'used'}
          </div>
        </div>
      ))}

      {hw.gpus.length === 0 && (
        <div style={{
          marginTop: 12, padding: 12,
          background: 'rgba(239,68,68,0.08)', borderRadius: 8,
          borderLeft: '3px solid #EF4444',
        }}>
          <div style={{ fontSize: 13, color: '#EF4444', fontWeight: 600 }}>
            {lang === 'zh' ? '⚠️ 未检测到独立显卡' : '⚠️ No dedicated GPU detected'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {lang === 'zh'
              ? '本地模型将使用 CPU 推理，速度较慢。建议选择 3B 以下参数模型。'
              : 'Local models will use CPU inference (slow). Consider models under 3B params.'}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Disk Path Selector ──────────────────────────────────────────────────────

function DiskPathSelector({
  partitions,
  currentDir,
  selectedPath,
  onSelectPath,
  lang,
}: {
  partitions: DiskPartition[];
  currentDir: string;
  selectedPath: string;
  onSelectPath: (path: string) => void;
  lang: 'zh' | 'en';
}) {
  return (
    <div style={{
      background: 'var(--color-surface-2)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          {lang === 'zh' ? '💾 部署路径' : '💾 Deploy Path'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {lang === 'zh' ? '当前' : 'Current'}: <code style={{ fontSize: 11, background: 'var(--color-surface-3)', padding: '2px 6px', borderRadius: 4 }}>{currentDir}</code>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(180px, 1fr))`, gap: 10 }}>
        {partitions.map((p) => {
          const usePercent = p.total_gb > 0 ? Math.round(((p.total_gb - p.free_gb) / p.total_gb) * 100) : 0;
          const isSelected = selectedPath === p.mount_point || currentDir.startsWith(p.mount_point);
          const barColor = usePercent > 90 ? '#EF4444' : usePercent > 70 ? '#F59E0B' : '#10B981';

          return (
            <div
              key={p.mount_point}
              onClick={() => onSelectPath(p.mount_point)}
              style={{
                padding: '12px 14px',
                background: isSelected
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(99,102,241,0.04))'
                  : 'var(--color-surface-3)',
                border: `1.5px solid ${isSelected ? 'rgba(99,102,241,0.6)' : 'var(--color-border)'}`,
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                position: 'relative',
                ...(isSelected ? { boxShadow: '0 0 12px rgba(99,102,241,0.15)' } : {}),
              }}
            >
              {/* Recommended badge */}
              {p.recommended && (
                <div style={{
                  position: 'absolute', top: -8, right: 10,
                  background: 'rgba(16,185,129,0.15)',
                  color: '#10B981',
                  padding: '2px 8px',
                  borderRadius: 8,
                  fontSize: 10,
                  fontWeight: 700,
                  border: '1px solid rgba(16,185,129,0.3)',
                }}>
                  {lang === 'zh' ? '推荐' : 'Best'}
                </div>
              )}

              {/* Drive letter */}
              <div style={{ fontSize: 15, fontWeight: 700, color: isSelected ? '#6366F1' : 'var(--color-text-primary)', marginBottom: 4 }}>
                📁 {p.mount_point}
              </div>

              {/* Label */}
              {p.label && (
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  {p.label} ({p.fs_type})
                </div>
              )}

              {/* Space info */}
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                {p.free_gb.toFixed(0)} GB {lang === 'zh' ? '可用' : 'free'} / {p.total_gb.toFixed(0)} GB
              </div>

              {/* Usage bar */}
              <div style={{
                width: '100%', height: 4, background: 'var(--color-surface-2)',
                borderRadius: 2, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${usePercent}%`, height: '100%',
                  background: barColor,
                  borderRadius: 2,
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Progress Bar ────────────────────────────────────────────────────────────

function ProgressBar({ percent, status, lang }: { percent: number; status: string; lang: 'zh' | 'en' }) {
  const isComplete = percent >= 100;
  const barColor = isComplete ? '#10B981' : '#6366F1';
  const bgColor = isComplete ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.08)';

  return (
    <div style={{ marginTop: 10 }}>
      {/* Status text */}
      <div style={{
        fontSize: 11, color: isComplete ? '#10B981' : 'var(--color-text-secondary)',
        marginBottom: 6, fontWeight: isComplete ? 600 : 400,
      }}>
        {isComplete
          ? (lang === 'zh' ? '✅ 部署完成' : '✅ Deploy complete')
          : status
            ? (status.length > 60 ? status.substring(0, 60) + '…' : status)
            : (lang === 'zh' ? '准备中...' : 'Preparing...')}
      </div>

      {/* Bar */}
      <div style={{
        width: '100%', height: 8,
        background: 'var(--color-surface-3)',
        borderRadius: 4, overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          width: `${Math.max(percent, 2)}%`,
          height: '100%',
          background: isComplete
            ? 'linear-gradient(90deg, #10B981, #34D399)'
            : 'linear-gradient(90deg, #6366F1, #818CF8)',
          borderRadius: 4,
          transition: 'width 0.4s ease',
          ...(percent > 0 && percent < 100 ? {
            backgroundImage: 'linear-gradient(90deg, #6366F1, #818CF8, #6366F1)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s linear infinite',
          } : {}),
        }} />
      </div>

      {/* Percentage */}
      <div style={{
        fontSize: 11, color: barColor,
        fontWeight: 700, marginTop: 4, textAlign: 'right',
      }}>
        {percent}%
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

// ── Model Card ──────────────────────────────────────────────────────────────

function ModelCard({
  model,
  isInstalled,
  pullProgress,
  vramMB,
  onPull,
  onDelete,
  onActivate,
  lang,
}: {
  model: ModelRecommendation;
  isInstalled: boolean;
  pullProgress: { percent: number; status: string } | null;
  vramMB: number;
  onPull: (m: ModelRecommendation) => void;
  onDelete: (m: ModelRecommendation) => void;
  onActivate: (m: ModelRecommendation) => void;
  lang: 'zh' | 'en';
}) {
  const catConfig = CATEGORY_CONFIG[model.category];
  const canFit = vramMB >= model.vram_required_mb;
  const isStretch = model.category === 'stretch';
  const isDeploying = pullProgress !== null;
  const stars = '★'.repeat(model.chinese) + '☆'.repeat(5 - model.chinese);

  return (
    <div style={{
      background: catConfig.bgColor,
      border: `1.5px solid ${catConfig.borderColor}`,
      borderRadius: 12,
      padding: '18px 22px',
      position: 'relative',
      ...catConfig.glowStyle,
    }}>
      {/* Category badge */}
      <div style={{
        position: 'absolute', top: -10, right: 16,
        background: catConfig.tagBg,
        color: catConfig.tagColor,
        padding: '3px 10px',
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 700,
        border: `1px solid ${catConfig.borderColor}`,
      }}>
        {lang === 'zh' ? catConfig.label_zh : catConfig.label_en}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: `${catConfig.tagBg}`,
          border: `1px solid ${catConfig.borderColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, flexShrink: 0,
        }}>
          {model.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {model.name}
            </span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)' }}>
              {model.params} · {model.quant}
            </span>
            {isInstalled && !isDeploying && (
              <Badge variant="success">{lang === 'zh' ? '已安装' : 'Installed'}</Badge>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {model.description}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          📦 {model.disk_size_gb} GB
        </div>
        <div style={{ fontSize: 12, color: canFit ? 'var(--color-text-muted)' : '#EF4444' }}>
          🎮 {model.vram_required_mb >= 1024 ? `${(model.vram_required_mb / 1024).toFixed(1)} GB` : `${model.vram_required_mb} MB`} VRAM
          {!canFit && (
            <span style={{ color: '#EF4444', fontWeight: 600, marginLeft: 4 }}>
              ({lang === 'zh' ? '超出' : 'exceeds'})
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          🇨🇳 {stars}
        </div>
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: isDeploying ? 8 : 14 }}>
        {model.tags.map(t => (
          <span key={t} style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 5,
            background: catConfig.tagBg, color: catConfig.tagColor,
            border: `1px solid ${catConfig.borderColor}`,
            fontWeight: 600,
          }}>{t}</span>
        ))}
      </div>

      {/* VRAM fit indicator */}
      {!canFit && !isDeploying && (
        <div style={{
          marginBottom: 12, padding: '8px 12px',
          background: 'rgba(239,68,68,0.08)', borderRadius: 6,
          fontSize: 11, color: '#EF4444', lineHeight: 1.5,
        }}>
          {isStretch
            ? (lang === 'zh'
              ? '⚠️ 显存不足，需要 CPU offload。推理速度约 3-5 token/s，内存占用较大。'
              : '⚠️ VRAM insufficient, requires CPU offload. ~3-5 token/s, high RAM usage.')
            : (lang === 'zh'
              ? `⚠️ 需要至少 ${(model.vram_required_mb / 1024).toFixed(1)} GB VRAM，你的 GPU 为 ${(vramMB / 1024).toFixed(1)} GB。`
              : `⚠️ Requires at least ${(model.vram_required_mb / 1024).toFixed(1)} GB VRAM, your GPU has ${(vramMB / 1024).toFixed(1)} GB.`)
          }
        </div>
      )}

      {/* Progress bar */}
      {isDeploying && (
        <ProgressBar
          percent={pullProgress.percent}
          status={pullProgress.status}
          lang={lang}
        />
      )}

      {/* Actions */}
      {!isDeploying && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {isInstalled && (
            <>
              <button
                onClick={() => onActivate(model)}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 14px' }}
              >
                ⚡ {lang === 'zh' ? '设为默认' : 'Set Default'}
              </button>
              <button
                onClick={() => onDelete(model)}
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: '6px 14px', color: '#EF4444' }}
              >
                🗑️
              </button>
            </>
          )}
          {!isInstalled && (
            <button
              onClick={() => onPull(model)}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 14px' }}
            >
              ⬇️ {lang === 'zh' ? '一键部署' : 'One-Click Deploy'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function LocalModelsPage() {
  const { addToast, language, config } = useAppStore();
  const lang = language as 'zh' | 'en';

  const [hw, setHw] = useState<HardwareProfile | null>(null);
  const [ollama, setOllama] = useState<OllamaStatus | null>(null);
  const [disks, setDisks] = useState<DiskPartition[]>([]);
  const [modelsDir, setModelsDir] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [pullProgress, setPullProgress] = useState<Record<string, { percent: number; status: string }>>({});
  const [pulling, setPulling] = useState<string | null>(null);
  const [isInstallingOllama, setIsInstallingOllama] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'catalog' | 'installed'>('catalog');
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Load all data
  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [hwProfile, ollamaStatus, diskParts, mDir] = await Promise.all([
        invoke<HardwareProfile>('get_hardware_profile'),
        invoke<OllamaStatus>('get_ollama_status'),
        invoke<DiskPartition[]>('get_disk_partitions'),
        invoke<string>('get_ollama_models_dir'),
      ]);
      setHw(hwProfile);
      setOllama(ollamaStatus);
      setDisks(diskParts);
      setModelsDir(mDir);
      // Auto-select the partition where current models dir is
      if (diskParts.length > 0) {
        const current = diskParts.find(d => mDir.startsWith(d.mount_point));
        setSelectedPath(current?.mount_point || diskParts[0].mount_point);
      }
    } catch (e) {
      addToast({ type: 'error', message: `${e}` });
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for pull progress events
  useEffect(() => {
    let unlisten: UnlistenFn;
    (async () => {
      unlisten = await listen<PullProgressEvent>('ollama-pull-progress', (event) => {
        const { model, status, percent } = event.payload;
        setPullProgress(prev => ({
          ...prev,
          [model]: { percent, status },
        }));
        if (percent >= 100 || status === 'success') {
          setPulling(null);
          // Refresh model list after completion
          setTimeout(async () => {
            try {
              const ollamaStatus = await invoke<OllamaStatus>('get_ollama_status');
              setOllama(ollamaStatus);
            } catch { /* ignore */ }
          }, 1000);
        }
        if (status === 'failed') {
          setPulling(null);
          setPullProgress(prev => {
            const next = { ...prev };
            delete next[model];
            return next;
          });
        }
      });
      unlistenRef.current = unlisten;
    })();
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  const vramMB = hw?.max_vram_mb ?? 0;

  // Install Ollama
  const handleInstallOllama = async () => {
    setIsInstallingOllama(true);
    try {
      const result = await invoke<{ success: boolean; message: string }>('install_ollama');
      addToast({ type: result.success ? 'success' : 'error', message: result.message });
      await refresh();
    } catch (e) {
      addToast({ type: 'error', message: `${e}` });
    } finally {
      setIsInstallingOllama(false);
    }
  };

  // Pull model with streaming progress
  const handlePull = async (model: ModelRecommendation) => {
    setPulling(model.ollama_tag);
    setPullProgress(prev => ({ ...prev, [model.ollama_tag]: { percent: 1, status: 'starting' } }));
    try {
      const result = await invoke<string>('ollama_pull_model_stream', { modelName: model.ollama_tag });
      addToast({ type: 'success', message: result });
    } catch (e) {
      addToast({ type: 'error', message: `${e}` });
      setPulling(null);
      setPullProgress(prev => {
        const next = { ...prev };
        delete next[model.ollama_tag];
        return next;
      });
    }
  };

  // Delete model
  const handleDelete = async (model: ModelRecommendation) => {
    try {
      const result = await invoke<string>('ollama_delete_model', { modelName: model.ollama_tag });
      addToast({ type: 'success', message: result });
      await refresh();
    } catch (e) {
      addToast({ type: 'error', message: `${e}` });
    }
  };

  // Set as default model
  const handleActivate = async (model: ModelRecommendation) => {
    try {
      const result = await invoke<string>('configure_ollama_model', { modelId: model.ollama_tag });
      addToast({ type: 'success', message: result });
    } catch (e) {
      addToast({ type: 'error', message: `${e}` });
    }
  };

  // Change deploy path
  const handlePathChange = async (path: string) => {
    setSelectedPath(path);
    const newDir = path + (path.endsWith('\\') ? '' : '\\') + 'ollama\\models';
    try {
      const result = await invoke<string>('set_ollama_models_dir', { path: newDir });
      addToast({ type: 'success', message: result });
      setModelsDir(newDir);
    } catch (e) {
      addToast({ type: 'error', message: `${e}` });
    }
  };

  // Group models by category
  const categorized = {
    recommended: MODEL_CATALOG.filter(m => m.category === 'recommended'),
    capable: MODEL_CATALOG.filter(m => m.category === 'capable'),
    lightweight: MODEL_CATALOG.filter(m => m.category === 'lightweight'),
    stretch: MODEL_CATALOG.filter(m => m.category === 'stretch'),
  };

  // Installed model names
  const installedNames = new Set((ollama?.models ?? []).map(m => m.name));

  // Current default model
  const currentModel = config?.agents?.defaults?.model?.primary || '';

  return (
    <div className="page-content animate-fade-in">
      <PageHeader
        title={lang === 'zh' ? '本地模型' : 'Local Models'}
        subtitle={lang === 'zh' ? '一键部署本地大语言模型，根据你的硬件智能推荐' : 'One-click deploy local LLMs with smart hardware recommendations'}
        icon={
          <svg width="20" height="20" fill="none" stroke="#A78BFA" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
        actions={
          <button
            className="btn btn-secondary"
            onClick={refresh}
            disabled={isLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {isLoading ? (
              <span className="loader" style={{ width: 14, height: 14, borderWidth: 2 }} />
            ) : (
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {lang === 'zh' ? '刷新' : 'Refresh'}
          </button>
        }
      />

      {/* Ollama Status Banner */}
      <div style={{
        marginBottom: 16,
        padding: '14px 18px',
        background: ollama?.running
          ? 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(6,182,212,0.05))'
          : 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.03))',
        border: `1px solid ${ollama?.running ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
        borderRadius: 10,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: ollama?.running ? '#10B981' : '#EF4444',
            boxShadow: ollama?.running ? '0 0 8px rgba(16,185,129,0.5)' : '0 0 8px rgba(239,68,68,0.5)',
          }} />
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Ollama
            </span>
            {ollama?.version && (
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 8 }}>
                v{ollama.version}
              </span>
            )}
            <span style={{ fontSize: 13, color: ollama?.running ? '#10B981' : '#EF4444', marginLeft: 8, fontWeight: 600 }}>
              {ollama?.running
                ? (lang === 'zh' ? '运行中' : 'Running')
                : (lang === 'zh' ? '未运行' : 'Not Running')}
            </span>
          </div>
          {ollama?.running && (
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {ollama.models.length} {lang === 'zh' ? '个模型' : 'models'}
            </span>
          )}
        </div>

        {!ollama?.running && (
          <button
            onClick={handleInstallOllama}
            disabled={isInstallingOllama}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 16px' }}
          >
            {isInstallingOllama ? (
              <>
                <span className="loader" style={{ width: 14, height: 14, borderWidth: 2 }} />
                {lang === 'zh' ? '安装中...' : 'Installing...'}
              </>
            ) : (
              <>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {lang === 'zh' ? '一键安装 Ollama' : 'Install Ollama'}
              </>
            )}
          </button>
        )}
      </div>

      {/* Current model indicator */}
      {currentModel && (
        <div style={{
          marginBottom: 16, padding: '10px 16px',
          background: 'var(--color-surface-2)', borderRadius: 8,
          borderLeft: '3px solid #6366F1',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {lang === 'zh' ? '当前默认模型:' : 'Current default model:'}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#6366F1' }}>
            {currentModel}
          </span>
          {currentModel.startsWith('ollama/') && (
            <Badge variant="success">{lang === 'zh' ? '本地' : 'Local'}</Badge>
          )}
        </div>
      )}

      {/* Hardware Profile */}
      {hw && <HardwareCard hw={hw} lang={lang} />}

      {/* Disk Path Selector */}
      {disks.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <DiskPathSelector
            partitions={disks}
            currentDir={modelsDir}
            selectedPath={selectedPath}
            onSelectPath={handlePathChange}
            lang={lang}
          />
        </div>
      )}

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 0, marginTop: 20, marginBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
        {(['catalog', 'installed'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: activeTab === tab ? 700 : 400,
              color: activeTab === tab ? '#6366F1' : 'var(--color-text-muted)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #6366F1' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {tab === 'catalog'
              ? (lang === 'zh' ? `📋 模型商店 (${MODEL_CATALOG.length})` : `📋 Model Store (${MODEL_CATALOG.length})`)
              : (lang === 'zh' ? `📦 已安装 (${ollama?.models.length ?? 0})` : `📦 Installed (${ollama?.models.length ?? 0})`)}
          </button>
        ))}
      </div>

      {/* Catalog tab */}
      {activeTab === 'catalog' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {(['recommended', 'capable', 'lightweight', 'stretch'] as const).map(cat => {
            const catModels = categorized[cat];
            if (catModels.length === 0) return null;
            const catCfg = CATEGORY_CONFIG[cat];
            const icons: Record<string, string> = {
              recommended: '⭐',
              capable: '✅',
              lightweight: '⚡',
              stretch: '🔶',
            };
            const labels: Record<string, Record<string, string>> = {
              recommended: { zh: '强烈推荐 — 最适合你的配置', en: 'Highly Recommended — Best for your setup' },
              capable: { zh: '流畅运行', en: 'Runs Smoothly' },
              lightweight: { zh: '轻量极速', en: 'Lightweight & Fast' },
              stretch: { zh: '勉强能跑（需 CPU offload）', en: 'Stretch (requires CPU offload)' },
            };

            return (
              <div key={cat}>
                <div style={{ fontSize: 13, fontWeight: 700, color: catCfg.tagColor, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {icons[cat]} {labels[cat][lang]}
                </div>
                <div style={{
                  display: cat === 'recommended' ? 'flex' : 'grid',
                  flexDirection: cat === 'recommended' ? 'column' : undefined,
                  gridTemplateColumns: cat === 'recommended' ? undefined : 'repeat(auto-fill, minmax(360px, 1fr))',
                  gap: 12,
                }}>
                  {catModels.map(m => (
                    <ModelCard
                      key={m.id}
                      model={m}
                      isInstalled={installedNames.has(m.ollama_tag) || installedNames.has(m.ollama_tag + ':latest')}
                      pullProgress={pullProgress[m.ollama_tag] || null}
                      vramMB={vramMB}
                      onPull={handlePull}
                      onDelete={handleDelete}
                      onActivate={handleActivate}
                      lang={lang}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Installed tab */}
      {activeTab === 'installed' && (
        <div>
          {!ollama?.running ? (
            <div style={{
              padding: 40, textAlign: 'center',
              background: 'var(--color-surface-2)', borderRadius: 12,
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔌</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>
                {lang === 'zh' ? 'Ollama 未运行' : 'Ollama is not running'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                {lang === 'zh'
                  ? '请先启动 Ollama，或点击上方按钮安装。'
                  : 'Please start Ollama first, or click Install above.'}
              </div>
              <button onClick={handleInstallOllama} className="btn btn-primary">
                {lang === 'zh' ? '安装 Ollama' : 'Install Ollama'}
              </button>
            </div>
          ) : ollama.models.length === 0 ? (
            <div style={{
              padding: 40, textAlign: 'center',
              background: 'var(--color-surface-2)', borderRadius: 12,
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>
                {lang === 'zh' ? '暂无已安装模型' : 'No models installed'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {lang === 'zh' ? '切换到「模型商店」标签页一键部署模型' : 'Switch to the Model Store tab to deploy models'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ollama.models.map(m => {
                const matchedCatalog = MODEL_CATALOG.find(c => m.name.startsWith(c.ollama_tag.split(':')[0]));
                return (
                  <div key={m.digest} style={{
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    padding: '14px 18px',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <span style={{ fontSize: 24 }}>{matchedCatalog?.icon || '📦'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {m.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                        {formatBytes(m.size_bytes)} · {m.modified_at.split('T')[0]}
                      </div>
                    </div>
                    <button
                      onClick={() => handleActivate({ ollama_tag: m.name } as ModelRecommendation)}
                      className="btn btn-primary"
                      style={{ fontSize: 11, padding: '5px 12px' }}
                    >
                      ⚡ {lang === 'zh' ? '设为默认' : 'Set Default'}
                    </button>
                    <button
                      onClick={() => handleDelete({ ollama_tag: m.name } as ModelRecommendation)}
                      className="btn btn-secondary"
                      style={{ fontSize: 11, padding: '5px 10px', color: '#EF4444' }}
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

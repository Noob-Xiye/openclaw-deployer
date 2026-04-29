import React, { useState } from 'react';
import { useAppStore } from '../../store';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

const icons = {
  success: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  error: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  info: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useAppStore();
  return (
    <div className={`toast toast-${toast.type}`}>
      <span style={{ opacity: 0.9 }}>{icons[toast.type]}</span>
      <span style={{ flex: 1, fontSize: '13px' }}>{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'inherit', opacity: 0.6, padding: '2px', borderRadius: '4px',
          lineHeight: 1, display: 'flex', alignItems: 'center',
        }}
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useAppStore();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map(t => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}

// ─── SaveBar ──────────────────────────────────────────────────
interface SaveBarProps {
  onSave: () => void;
  saving?: boolean;
  disabled?: boolean;
  label?: string;
}

export function SaveBar({ onSave, saving, disabled, label }: SaveBarProps) {
  const { t } = useAppStore();
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'flex-end',
      padding: '12px 0 0 0',
    }}>
      <button
        className="btn btn-primary"
        onClick={onSave}
        disabled={saving || disabled}
      >
        {saving ? (
          <>
            <span className="loader" style={{ width: 14, height: 14, borderWidth: 2 }} />
            {t.app.saving}
          </>
        ) : (
          <>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            {label || t.app.saveChanges}
          </>
        )}
      </button>
    </div>
  );
}

// ─── PageHeader ───────────────────────────────────────────────
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      paddingBottom: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {icon && (
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(37,99,235,0.12))',
            border: '1px solid rgba(124,58,237,0.2)',
          }}>
            {icon}
          </div>
        )}
        <div>
          <h1 className="gradient-text" style={{ fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '3px 0 0 0' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}

// ─── SectionCard ─────────────────────────────────────────────
interface SectionCardProps {
  title?: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function SectionCard({ title, subtitle, actions, children, className = '', style }: SectionCardProps) {
  return (
    <div className={`card ${className}`} style={{ padding: '20px', ...style }}>
      {(title || subtitle || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            {title && <div className="section-title">{title}</div>}
            {subtitle && <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{subtitle}</p>}
          </div>
          {actions && <div>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────
interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label className="toggle" style={{ gap: 10, opacity: disabled ? 0.5 : 1 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => !disabled && onChange(e.target.checked)}
        disabled={disabled}
      />
      <div className="toggle-track" />
      <div className="toggle-thumb" />
      {label && (
        <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
          {label}
        </span>
      )}
    </label>
  );
}

// ─── HelpTip ──────────────────────────────────────────────────
export function HelpTip({ content }: { content: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', marginLeft: 5, flexShrink: 0 }}>
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        style={{
          width: 15, height: 15, borderRadius: '50%',
          background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
          color: '#A5B4FC', fontSize: 9, fontWeight: 700, cursor: 'help',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1, padding: 0,
        }}
      >
        ?
      </button>
      {show && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
          background: '#1E2A3D', border: '1px solid rgba(124,162,225,0.3)',
          borderRadius: 8, padding: '10px 12px', width: 240, zIndex: 9999,
          fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.65,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', pointerEvents: 'none',
        }}>
          {content}
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderTop: '5px solid rgba(124,162,225,0.3)',
          }} />
        </div>
      )}
    </span>
  );
}

// ─── FormField ────────────────────────────────────────────────
interface FormFieldProps {
  label: string;
  hint?: string;
  tooltip?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function FormField({ label, hint, tooltip, required, children, style }: FormFieldProps) {
  return (
    <div className="form-group" style={style}>
      <label className="label" style={{ display: 'flex', alignItems: 'center' }}>
        {label}
        {required && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}
        {tooltip && <HelpTip content={tooltip} />}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

// ─── LoadingSpinner ───────────────────────────────────────────
export function LoadingSpinner({ size = 24 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size,
      border: '2px solid var(--color-surface-3)',
      borderTopColor: '#7C3AED',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  );
}

// ─── EmptyState ───────────────────────────────────────────────
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && (
        <div style={{ opacity: 0.35, marginBottom: 4 }}>
          {icon}
        </div>
      )}
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-secondary)', margin: 0 }}>
        {title}
      </p>
      {description && (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────
type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'purple' | 'gray';
interface BadgeProps { variant?: BadgeVariant; children: React.ReactNode }

export function Badge({ variant = 'gray', children }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}

// ─── ConfirmModal ─────────────────────────────────────────────
interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onCancel, danger }: ConfirmModalProps) {
  const { t } = useAppStore();
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}>
      <div className="card animate-fade-in" style={{ width: 400, padding: '24px', maxWidth: '90vw' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 600 }}>{title}</h3>
        <p style={{ margin: '0 0 20px 0', color: 'var(--color-text-secondary)', fontSize: 13 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel}>{t.app.cancel}</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel || t.app.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── InfoBox ──────────────────────────────────────────────────
type InfoBoxType = 'info' | 'tip' | 'warning' | 'success';
interface InfoBoxProps {
  type?: InfoBoxType;
  title?: string;
  children?: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

const INFO_BOX_THEME: Record<InfoBoxType, { bg: string; border: string; color: string; icon: string }> = {
  info:    { bg: 'rgba(59,130,246,0.07)',  border: 'rgba(59,130,246,0.22)',  color: '#93C5FD', icon: 'ℹ' },
  tip:     { bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.22)',  color: '#A5B4FC', icon: '✦' },
  warning: { bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.25)', color: '#FCD34D', icon: '⚠' },
  success: { bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.22)', color: '#6EE7B7', icon: '✓' },
};

export function InfoBox({ type = 'tip', title, children, collapsible = false, defaultCollapsed = false }: InfoBoxProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const theme = INFO_BOX_THEME[type];
  return (
    <div style={{ padding: '11px 15px', borderRadius: 9, background: theme.bg, border: `1px solid ${theme.border}`, fontSize: 12, color: theme.color, lineHeight: 1.7 }}>
      {(title || collapsible) ? (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: collapsed ? 0 : (children ? 7 : 0), cursor: collapsible ? 'pointer' : 'default', userSelect: 'none' }}
          onClick={collapsible ? () => setCollapsed(v => !v) : undefined}
        >
          <span style={{ fontWeight: 700, flexShrink: 0 }}>{theme.icon}</span>
          {title && <span style={{ fontWeight: 600 }}>{title}</span>}
          {collapsible && <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 10 }}>{collapsed ? '▶ 展开' : '▼ 收起'}</span>}
        </div>
      ) : null}
      {!collapsed && children && (
        <div style={{ fontSize: 12 }}>
          {!title && <span style={{ fontWeight: 700 }}>{theme.icon} </span>}
          {children}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { PageHeader, SectionCard, Badge } from '../components/ui';

function tryParse(str: string): { ok: boolean; error?: string } {
  try {
    JSON.parse(str);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export function RawConfig() {
  const { config, saveConfig, saveStatus, configPath, t } = useAppStore();
  const rt = t.rawConfig;

  const [text, setText] = useState('');
  const [parseStatus, setParseStatus] = useState<{ ok: boolean; error?: string } | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const originalText = config ? JSON.stringify(config, null, 2) : '';

  useEffect(() => {
    if (config) {
      const pretty = JSON.stringify(config, null, 2);
      setText(pretty);
      setIsDirty(false);
      setParseStatus({ ok: true });
    }
  }, [config]);

  const handleChange = (value: string) => {
    setText(value);
    setIsDirty(value !== originalText);
    if (value.trim()) {
      setParseStatus(tryParse(value));
    } else {
      setParseStatus(null);
    }
  };

  const handleFormat = () => {
    const result = tryParse(text);
    if (result.ok) {
      const formatted = JSON.stringify(JSON.parse(text), null, 2);
      setText(formatted);
      setIsDirty(formatted !== originalText);
    }
  };

  const handleReset = () => {
    setText(originalText);
    setIsDirty(false);
    setParseStatus({ ok: true });
  };

  const handleSave = async () => {
    const result = tryParse(text);
    if (!result.ok) return;
    const parsed = JSON.parse(text);
    await saveConfig(parsed);
    setIsDirty(false);
  };

  const lineCount = text.split('\n').length;

  return (
    <div className="page-content animate-fade-in">
      <PageHeader
        title={rt.title}
        subtitle={rt.subtitle}
        icon={
          <svg width="18" height="18" fill="none" stroke="#94A3B8" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        }
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {parseStatus && (
              <Badge variant={parseStatus.ok ? 'success' : 'error'}>
                {parseStatus.ok ? '✓ Valid JSON' : '✗ Invalid JSON'}
              </Badge>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleFormat}
              disabled={!parseStatus?.ok}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h12M4 18h8" />
              </svg>
              {rt.format}
            </button>
            {isDirty && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={handleReset}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {rt.reset}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSave}
                  disabled={!parseStatus?.ok || saveStatus === 'saving'}
                >
                  {saveStatus === 'saving' ? '...' : rt.save}
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Warning banner */}
      <div style={{
        padding: '12px 16px', borderRadius: 10, marginBottom: 20,
        background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.25)',
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <svg width="16" height="16" fill="none" stroke="#F59E0B" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#FCD34D' }}>{rt.warning}</p>
          <p style={{ margin: '3px 0 0 0', fontSize: 12, color: '#FDE68A', opacity: 0.8 }}>{rt.warningDesc}</p>
        </div>
      </div>

      {/* File path info */}
      {configPath && (
        <div style={{
          padding: '9px 14px', borderRadius: 8, marginBottom: 16,
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12,
        }}>
          <svg width="12" height="12" fill="none" stroke="#94A3B8" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <code style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-secondary)' }}>
            {configPath}
          </code>
          <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)' }}>
            {lineCount} lines
          </span>
        </div>
      )}

      {/* JSON Editor */}
      <SectionCard title={rt.editor} style={{ padding: 0, overflow: 'hidden' }}>
        {parseStatus && !parseStatus.ok && (
          <div style={{
            padding: '9px 16px',
            background: 'rgba(239,68,68,0.1)',
            borderBottom: '1px solid rgba(239,68,68,0.2)',
            display: 'flex', alignItems: 'center', gap: 7,
            fontSize: 12, color: '#FCA5A5',
          }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <code style={{ fontFamily: 'var(--font-family-mono)' }}>{parseStatus.error}</code>
          </div>
        )}
        <textarea
          className="json-editor"
          value={text}
          onChange={e => handleChange(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%',
            minHeight: 520,
            padding: '16px',
            boxSizing: 'border-box',
            borderRadius: 0,
            border: 'none',
            resize: 'vertical',
            outline: 'none',
          }}
        />
      </SectionCard>
    </div>
  );
}

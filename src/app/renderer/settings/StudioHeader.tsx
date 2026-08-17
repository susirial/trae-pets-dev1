import type { SettingsHealthSummary } from './health';
import { Button } from './ui';

interface Props {
  dirty: boolean;
  saving: boolean;
  health: SettingsHealthSummary;
  onOpenOfficialWebsite(): void;
  onReset(): void;
  onSave(): void;
}

const HEALTH_LABELS: Record<SettingsHealthSummary['level'], string> = {
  excellent: '健康优秀',
  good: '状态良好',
  attention: '需要关注',
  blocked: '需要修复',
};

export function StudioHeader({
  dirty,
  saving,
  health,
  onOpenOfficialWebsite,
  onReset,
  onSave,
}: Props) {
  return (
    <header className="studio-header">
      <div className="studio-header-brand">
        <div className="header-titles">
          <span>TRAE PETS STUDIO</span>
          <h1>宠物配置工作室</h1>
        </div>
      </div>
      <div className="studio-header-actions">
        <Button
          variant="official"
          aria-label="在浏览器打开 TRAE Pets 官网"
          onClick={onOpenOfficialWebsite}
        >
          官网 <span aria-hidden="true">↗</span>
        </Button>
        <span className={`health-chip health-${health.level}`} aria-label={`${HEALTH_LABELS[health.level]}，健康度 ${health.score}%`}>
          <i aria-hidden="true" />
          <span>{HEALTH_LABELS[health.level]}</span>
          <strong>{health.score}%</strong>
        </span>
        <span className={`save-status ${dirty ? 'is-dirty' : ''}`} role="status" aria-live="polite">
          <i aria-hidden="true" />
          {dirty ? '有未保存更改' : '配置已同步'}
        </span>
        <Button variant="ghost" className="reset-button" onClick={onReset}>恢复默认</Button>
        <Button variant="primary" onClick={onSave} disabled={!dirty || saving} kbd="⌘S">
          {saving ? '保存中…' : dirty ? '保存更改' : '已保存'}
        </Button>
      </div>
    </header>
  );
}

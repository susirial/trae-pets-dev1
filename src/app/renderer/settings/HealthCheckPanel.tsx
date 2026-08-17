import type { SettingsHealthSummary, StudioSectionId } from './health';
import { HookAccessPanel } from './HookAccessPanel';
import { StudioSectionFrame } from './StudioSectionFrame';
import { EmptyState, IssueList } from './ui';

interface Props {
  health: SettingsHealthSummary;
  onNavigate(section: StudioSectionId, stateId?: string, target?: string): void;
}

export function HealthCheckPanel({ health, onNavigate }: Props) {
  return (
    <StudioSectionFrame sectionId="checks">
      <div className={`health-summary-card health-${health.level}`}>
        <span>配置健康度</span>
        <strong>{health.score}%</strong>
        <small>{health.blockingCount} 个阻断问题 · {health.warningCount} 个警告 · {health.suggestionCount} 个建议</small>
      </div>
      {health.issues.length > 0 ? (
        <IssueList issues={health.issues} variant="checks" onNavigate={onNavigate} />
      ) : (
        <EmptyState title="配置状态优秀" description="没有发现阻断问题、警告或建议。" />
      )}
      <HookAccessPanel />
    </StudioSectionFrame>
  );
}

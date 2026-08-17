import type { PetPackageAsset, SoundLibraryAsset } from '@shared/ipc';
import type { PetConfig } from '@shared/pet-config';
import type { SettingsHealthSummary, StudioSectionId } from './health';
import { StudioSectionFrame } from './StudioSectionFrame';
import { Button, EmptyState, IssueList } from './ui';

interface Props {
  config: PetConfig;
  selectedPackage: PetPackageAsset | undefined;
  petPackages: PetPackageAsset[];
  librarySounds: SoundLibraryAsset[];
  health: SettingsHealthSummary;
  onNavigate(section: StudioSectionId, stateId?: string, target?: string): void;
}

export function OverviewPanel({
  config,
  selectedPackage,
  petPackages,
  librarySounds,
  health,
  onNavigate,
}: Props) {
  const enabledStates = config.states.filter((state) => state.enabled).length;
  const userPets = petPackages.filter((pkg) => pkg.source === 'user').length;
  const priorityIssues = health.issues.slice(0, 3);

  return (
    <StudioSectionFrame sectionId="overview">
      <div className="overview-grid">
        <button type="button" className="overview-card hero" onClick={() => onNavigate('role')}>
          <i aria-hidden="true">伙伴</i>
          <span>当前伙伴</span>
          <strong>{config.pet.displayName}</strong>
          <small>{selectedPackage?.name ?? '未找到宠物包'} · {config.pet.selectedId}</small>
        </button>
        <button type="button" className={`overview-card health-${health.level}`} onClick={() => onNavigate('checks')}>
          <i aria-hidden="true">质量</i>
          <span>配置健康度</span>
          <strong>{health.score}%</strong>
          <small>{health.blockingCount} 阻断 · {health.warningCount} 警告 · {health.suggestionCount} 建议</small>
        </button>
        <button type="button" className="overview-card" onClick={() => onNavigate('states')}>
          <i aria-hidden="true">内容</i>
          <span>状态与资源</span>
          <strong>{enabledStates}/{config.states.length} 已启用</strong>
          <small>{userPets} 个用户宠物 · {librarySounds.length} 个音效</small>
        </button>
      </div>
      <div className="overview-followup">
        <div className="overview-followup-head">
          <div>
            <span className="section-eyebrow">NEXT UP</span>
            <h3>优先处理</h3>
          </div>
          <Button size="tiny" onClick={() => onNavigate('checks')}>全部检查</Button>
        </div>
        {priorityIssues.length > 0 ? (
          <IssueList issues={priorityIssues} variant="overview" onNavigate={onNavigate} />
        ) : (
          <EmptyState title="一切就绪" description="当前配置没有需要处理的问题。" />
        )}
      </div>
    </StudioSectionFrame>
  );
}

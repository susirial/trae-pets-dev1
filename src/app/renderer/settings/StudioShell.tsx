import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SettingsHealthSummary, StudioSectionId } from './health';
import { StudioHeader } from './StudioHeader';
import { StudioRail } from './StudioRail';

interface Props {
  activeSection: StudioSectionId;
  dirty: boolean;
  saving: boolean;
  health: SettingsHealthSummary;
  stage: ReactNode;
  children: ReactNode;
  onSectionChange(section: StudioSectionId): void;
  onOpenOfficialWebsite(): void;
  onReset(): void;
  onSave(): void;
}

export function StudioShell({
  activeSection,
  dirty,
  saving,
  health,
  stage,
  children,
  onSectionChange,
  onOpenOfficialWebsite,
  onReset,
  onSave,
}: Props) {
  const [stageOpen, setStageOpen] = useState(false);
  const stageToggleRef = useRef<HTMLButtonElement>(null);
  const stageCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!stageOpen) return;
    stageCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setStageOpen(false);
        stageToggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stageOpen]);

  return (
    <div className="studio-root">
      <StudioRail activeSection={activeSection} onChange={onSectionChange} />
      <div className="studio-workspace">
        <StudioHeader
          dirty={dirty}
          saving={saving}
          health={health}
          onOpenOfficialWebsite={onOpenOfficialWebsite}
          onReset={onReset}
          onSave={onSave}
        />
        <main className="studio-main">
          <button
            type="button"
            className="stage-toggle"
            ref={stageToggleRef}
            aria-controls="studio-live-stage"
            aria-expanded={stageOpen}
            onClick={() => setStageOpen(true)}
          >
            实时预览
          </button>
          <div className="studio-canvas">
            <div className="studio-canvas-page" key={activeSection}>{children}</div>
          </div>
          <aside
            id="studio-live-stage"
            className={`studio-stage${stageOpen ? ' is-open' : ''}`}
            aria-label="宠物实时舞台"
          >
            <button
              type="button"
              className="stage-close"
              ref={stageCloseRef}
              aria-label="关闭实时预览"
              onClick={() => {
                setStageOpen(false);
                stageToggleRef.current?.focus();
              }}
            >
              ×
            </button>
            {stage}
          </aside>
        </main>
      </div>
    </div>
  );
}

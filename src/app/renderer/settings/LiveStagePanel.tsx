import type { PetPackageAsset, SoundLibraryAsset } from '@shared/ipc';
import type { PetSoundSelection, PetStateConfig } from '@shared/pet-config';
import type { StudioSectionId } from './health';
import { PreviewPane } from './PreviewPane';
import { Button } from './ui';

interface Props {
  state: PetStateConfig | undefined;
  visualUrl: string | null;
  petName: string;
  petPackage: PetPackageAsset | undefined;
  librarySounds: SoundLibraryAsset[];
  soundSelection: PetSoundSelection | undefined;
  scale: number;
  onPreviewState(): void;
  onNavigate(section: StudioSectionId): void;
}

export function LiveStagePanel({
  state,
  visualUrl,
  petName,
  petPackage,
  librarySounds,
  soundSelection,
  scale,
  onPreviewState,
  onNavigate,
}: Props) {
  return (
    <div className="live-stage-panel">
      <PreviewPane
        state={state}
        visualUrl={visualUrl}
        petName={petName}
        petPackage={petPackage}
        librarySounds={librarySounds}
        soundSelection={soundSelection}
        scale={scale}
      />
      <div className="live-stage-actions">
        <Button variant="primary" size="small" disabled={!state} onClick={onPreviewState}>在桌宠上预览</Button>
        <Button variant="ghost" size="small" onClick={() => onNavigate('checks')}>查看检查</Button>
      </div>
    </div>
  );
}

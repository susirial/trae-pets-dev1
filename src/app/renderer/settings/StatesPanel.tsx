import type { PetPackageAsset, SoundLibraryAsset } from '@shared/ipc';
import type { PetSoundSelection, PetStateConfig } from '@shared/pet-config';
import { petPackageVisualUrl } from '@shared/pet-package-view';
import { PetVisual } from './PetVisual';
import { StateEditor } from './StateEditor';
import { StudioSectionFrame } from './StudioSectionFrame';
import { Button } from './ui';
import type { StateDraftPatch } from './config-helpers';

export type { StateDraftPatch } from './config-helpers';

interface Props {
  states: PetStateConfig[];
  selectedId: string;
  petPackage: PetPackageAsset | undefined;
  librarySounds: SoundLibraryAsset[];
  globalVolume: number;
  getSoundSelection(state: PetStateConfig): PetSoundSelection | undefined;
  onSelect(id: string): void;
  onAdd(): void;
  onChange(id: string, patch: StateDraftPatch): void;
  onSoundSelection(id: string, selection: PetSoundSelection | undefined): void;
  onPreview(id: string): void;
  onRemove(id: string): void;
}

export function StatesPanel({
  states,
  selectedId,
  petPackage,
  librarySounds,
  globalVolume,
  getSoundSelection,
  onSelect,
  onAdd,
  onChange,
  onSoundSelection,
  onPreview,
  onRemove,
}: Props) {
  const selected = states.find((state) => state.id === selectedId) ?? states[0];

  return (
    <StudioSectionFrame
      sectionId="states"
      titleSuffix={` · ${states.length}`}
      actions={<Button size="small" onClick={onAdd}>+ 新增自定义表情</Button>}
    >
      <div className="states-master-detail">
        <div className="states-list" id="health-states-list" tabIndex={-1} aria-label="状态列表">
          {states.map((state) => {
            const visualUrl = petPackageVisualUrl(petPackage, state.id);
            const isSelected = state.id === selected?.id;
            return (
              <button
                key={state.id}
                type="button"
                aria-pressed={isSelected}
                className={`state-card${isSelected ? ' is-selected' : ''}${state.enabled ? '' : ' is-disabled'}`}
                onClick={() => onSelect(state.id)}
              >
                <div className="state-card-head">
                  <div className="thumb" title="当前宠物包预览">
                    <PetVisual
                      src={visualUrl}
                      alt={state.label}
                      fallback={<span className="thumb-empty">无预览</span>}
                    />
                  </div>
                  <div className="state-card-main">
                    <b>{state.label}</b>
                    <code className="state-id">{state.id}</code>
                    <small>
                      {state.enabled ? '已启用' : '未启用'} · {visualUrl ? '视觉正常' : '缺视觉'}
                    </small>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {selected && (
          <div id={`health-state-${selected.id}`} className="state-detail" tabIndex={-1}>
            <StateEditor
              state={selected}
              visualUrl={petPackageVisualUrl(petPackage, selected.id)}
              petPackage={petPackage}
              librarySounds={librarySounds}
              soundSelection={getSoundSelection(selected)}
              globalVolume={globalVolume}
              selected
              onSelect={() => onSelect(selected.id)}
              onChange={(patch) => onChange(selected.id, patch)}
              onSoundSelection={(selection) => onSoundSelection(selected.id, selection)}
              onPreview={() => onPreview(selected.id)}
              onRemove={selected.builtin ? undefined : () => onRemove(selected.id)}
            />
          </div>
        )}
      </div>
    </StudioSectionFrame>
  );
}

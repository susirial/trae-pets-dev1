import type { PetPackageAsset, SoundLibraryAsset } from '@shared/ipc';
import type { PetClickConfig, PetSoundSelection } from '@shared/pet-config';
import {
  effectivePetClickAction,
  petClickDuration,
  petPackageVisualUrl,
  resolvePetPackageSound,
} from '@shared/pet-package-view';
import { PetVisual } from './PetVisual';
import { Button, SoundPicker } from './ui';

interface Props {
  click: PetClickConfig | undefined;
  petPackage: PetPackageAsset | undefined;
  librarySounds: SoundLibraryAsset[];
  globalVolume: number;
  onChange(click: PetClickConfig): void;
  onPreview(): void;
}

function selectionValue(selection: PetSoundSelection | undefined): string {
  if (!selection || selection.mode === 'none') return 'none';
  return `${selection.mode}:${selection.soundId}`;
}

export function ClickInteractionEditor({
  click,
  petPackage,
  librarySounds,
  globalVolume,
  onChange,
  onPreview,
}: Props) {
  const action = effectivePetClickAction(petPackage, click);
  const soundSelection = click?.sound ?? { mode: 'none' };
  const sound = resolvePetPackageSound(
    petPackage,
    action ?? '',
    soundSelection,
    librarySounds,
  );
  const configuredAction = click?.action === undefined
    ? 'inherit'
    : click.action === null
      ? 'disabled'
      : `action:${click.action}`;
  const missingAction = typeof click?.action === 'string'
    && !petPackage?.actionOptions.some((option) => option.id === click.action);
  const missingSound = soundSelection.mode === 'sound'
    && !petPackage?.sounds[soundSelection.soundId];
  const missingLibrarySound = soundSelection.mode === 'library'
    && !librarySounds.some((asset) => asset.id === soundSelection.soundId);

  return (
    <div className="click-interaction-grid">
      <div className="click-preview control-card">
        <div className="click-preview-visual">
          <PetVisual
            src={action ? petPackageVisualUrl(petPackage, action) : null}
            alt={action ?? '点击互动已禁用'}
            fallback={<span className="thumb-empty">无点击动作</span>}
          />
        </div>
        <div>
          <b>{action ?? '点击互动已禁用'}</b>
          <small>
            {action ? `单轮约 ${petClickDuration(petPackage, action)} ms` : '点击宠物时保持当前状态'}
          </small>
        </div>
      </div>

      <div className="control-card click-controls">
        <label className="field">
          <span>点击动作</span>
          <select
            value={configuredAction}
            onChange={(event) => {
              const value = event.target.value;
              onChange({
                ...click,
                action: value === 'inherit'
                  ? undefined
                  : value === 'disabled'
                    ? null
                    : value.slice('action:'.length),
              });
            }}
          >
            <option value="inherit">
              继承包默认{petPackage?.clickAction ? ` · ${petPackage.clickAction}` : ' · 未配置'}
            </option>
            <option value="disabled">禁用点击互动</option>
            <optgroup label="包内动作">
              {(petPackage?.actionOptions ?? []).map((option) => (
                <option key={option.id} value={`action:${option.id}`}>
                  {option.id} · {option.file.split('/').pop()}
                </option>
              ))}
            </optgroup>
            {missingAction && (
              <option value={`action:${click.action}`}>动作不可用 · {click.action}</option>
            )}
          </select>
          {missingAction && <small className="is-error">所选动作已不在当前宠物包中</small>}
        </label>

        <label className="field">
          <span>点击语音（独立于状态音效）</span>
          <SoundPicker
            ariaLabel="点击语音曲目"
            value={selectionValue(soundSelection)}
            disabled={!action}
            onChange={(value) => {
              const selection: PetSoundSelection = value === 'none'
                ? { mode: 'none' }
                : value.startsWith('library:')
                  ? { mode: 'library', soundId: value.slice('library:'.length) }
                  : { mode: 'sound', soundId: value.slice('sound:'.length) };
              onChange({ ...click, sound: selection });
            }}
            petPackage={petPackage}
            librarySounds={librarySounds}
            leading={<option value="none">无语音</option>}
            missing={(
              <>
                {missingSound && (
                  <option value={`sound:${soundSelection.soundId}`}>
                    曲目不可用 · {soundSelection.soundId}
                  </option>
                )}
                {missingLibrarySound && (
                  <option value={`library:${soundSelection.soundId}`}>
                    公共音效不可用 · {soundSelection.soundId}
                  </option>
                )}
              </>
            )}
            preview={{
              sound,
              volume: globalVolume,
              label: sound.soundId ?? sound.file ?? '点击语音',
            }}
          />
          <small className={sound.error ? 'is-error' : undefined}>
            {sound.error ?? (sound.file ? `播放一次 · ${sound.file}` : '点击时不播放语音')}
          </small>
        </label>

        <Button size="small" disabled={!action} onClick={onPreview}>
          在桌宠上预览
        </Button>
      </div>
    </div>
  );
}

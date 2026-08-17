import type { LoopKind, Severity } from '@shared/state-schema';
import type { PetPackageAsset, SoundLibraryAsset } from '@shared/ipc';
import type { PetSoundSelection, PetStateConfig } from '@shared/pet-config';
import { resolvePetPackageSound } from '@shared/pet-package-view';
import { PetVisual } from './PetVisual';
import type { StateDraftPatch } from './config-helpers';
import { Badge, Button, SoundPicker, STATE_SEVERITY_LABELS, Switch } from './ui';

interface Props {
  state: PetStateConfig;
  visualUrl: string | null;
  petPackage: PetPackageAsset | undefined;
  librarySounds: SoundLibraryAsset[];
  soundSelection: PetSoundSelection | undefined;
  globalVolume: number;
  selected: boolean;
  onSelect(): void;
  onChange(patch: StateDraftPatch): void;
  onSoundSelection(selection: PetSoundSelection | undefined): void;
  onPreview(): void;
  onRemove?(): void;
}

const LOOP_LABELS: Record<LoopKind, string> = {
  'seamless-loop': '无缝循环',
  'one-shot': '播放一次',
  'one-shot-then-idle': '播放后待命',
};

const SEVERITIES: Severity[] = ['info', 'success', 'error'];

export function StateEditor({
  state,
  visualUrl,
  petPackage,
  librarySounds,
  soundSelection,
  globalVolume,
  selected,
  onSelect,
  onChange,
  onSoundSelection,
  onPreview,
  onRemove,
}: Props) {
  const sound = resolvePetPackageSound(petPackage, state.id, soundSelection, librarySounds);
  const soundDisabled = soundSelection?.mode === 'none';
  const selectionValue = soundSelection?.mode === 'sound'
    ? `sound:${soundSelection.soundId}`
    : soundSelection?.mode === 'library'
      ? `library:${soundSelection.soundId}`
      : soundSelection?.mode === 'none'
        ? 'none'
        : 'default';
  const missingSelectedSound = soundSelection?.mode === 'sound'
    && !petPackage?.sounds[soundSelection.soundId];
  const missingLibrarySound = soundSelection?.mode === 'library'
    && !librarySounds.some((asset) => asset.id === soundSelection.soundId);
  const soundLabel = sound.soundId ?? sound.file ?? '包默认音效';

  return (
    <article
      className={`state-card ${selected ? 'is-selected' : ''} ${state.enabled ? '' : 'is-disabled'}`}
      aria-label={`${state.label} 状态详情`}
      onFocusCapture={onSelect}
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
          <div className="state-card-row">
            <input
              className="state-label"
              aria-label={`${state.id} 状态名称`}
              value={state.label}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onChange({ label: e.target.value })}
            />
            <Badge tone={state.builtin ? 'builtin' : 'custom'}>
              {state.builtin ? '内置' : '自定义'}
            </Badge>
          </div>
          <code className="state-id">{state.id}</code>
        </div>

        <Switch
          checked={state.enabled}
          onChange={(enabled) => onChange({ enabled })}
          srLabel={`${state.enabled ? '停用' : '启用'} ${state.label}`}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <div className="state-card-grid" onClick={(e) => e.stopPropagation()}>
        <label className="mini-field">
          <span>标题文案</span>
          <input value={state.text.title} onChange={(e) => onChange({ text: { ...state.text, title: e.target.value } })} />
        </label>
        <label className="mini-field span2">
          <span>消息文案（支持 {'{summary} {result} {tool} {petName}'}）</span>
          <textarea
            rows={2}
            value={state.text.message}
            onChange={(e) => onChange({ text: { ...state.text, message: e.target.value } })}
          />
        </label>

        <label className="mini-field">
          <span>提示色</span>
          <select value={state.severity} onChange={(e) => onChange({ severity: e.target.value as Severity })}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {STATE_SEVERITY_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="mini-field">
          <span>播放方式</span>
          <select value={state.loopKind} onChange={(e) => onChange({ loopKind: e.target.value as LoopKind })}>
            {(Object.keys(LOOP_LABELS) as LoopKind[]).map((k) => (
              <option key={k} value={k}>
                {LOOP_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="mini-field">
          <span>帧率 FPS</span>
          <input
            type="number"
            min={1}
            max={60}
            value={state.fps}
            onChange={(e) => onChange({ fps: Number(e.target.value) })}
          />
        </label>
        <label className="mini-field">
          <span>优先级</span>
          <input
            type="number"
            min={0}
            max={100}
            value={state.priority}
            onChange={(e) => onChange({ priority: Number(e.target.value) })}
          />
        </label>
        <label className="mini-field">
          <span>保持时长(ms)</span>
          <input
            type="number"
            min={0}
            step={100}
            value={state.holdMs}
            onChange={(e) => onChange({ holdMs: Number(e.target.value) })}
          />
        </label>
        <div className="mini-field span2 sound-picker">
          <span>动作音效</span>
          <SoundPicker
            ariaLabel={`${state.label} 音效曲目`}
            value={selectionValue}
            onChange={(value) => {
              if (value === 'default') {
                onSoundSelection(undefined);
              } else if (value === 'none') {
                onSoundSelection({ mode: 'none' });
              } else if (value.startsWith('library:')) {
                onSoundSelection({ mode: 'library', soundId: value.slice('library:'.length) });
              } else {
                onSoundSelection({ mode: 'sound', soundId: value.slice('sound:'.length) });
              }
            }}
            petPackage={petPackage}
            librarySounds={librarySounds}
            leading={(
              <optgroup label="播放策略">
                <option value="default">
                  使用包默认{sound.source === 'missing' && !soundSelection ? '（无可用资源）' : ''}
                </option>
                <option value="none">无声音</option>
              </optgroup>
            )}
            missing={(
              <>
                {missingSelectedSound && (
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
              volume: globalVolume * (state.audio.volume ?? 1),
              label: soundLabel,
            }}
          />
          <small className={`sound-summary${sound.error ? ' is-error' : ''}`}>
            {soundDisabled
              ? '此宠物的该动作保持静音'
              : sound.error
                ? sound.error
                : sound.file
                  ? `${
                    sound.source === 'library'
                      ? '公共音效'
                      : sound.source === 'package-selected'
                        ? '用户指定'
                        : '包默认'
                  } · ${sound.file}`
                  : '当前宠物包没有为该动作提供音频'}
          </small>
        </div>
        <label className="mini-field">
          <span>播放模式</span>
          <select
            value={state.audio.mode}
            disabled={soundDisabled}
            onChange={(e) => onChange({ audio: { mode: e.target.value as PetStateConfig['audio']['mode'] } })}
          >
            <option value="once">一次</option>
            <option value="count">固定次数</option>
            <option value="infinite">无限循环</option>
          </select>
        </label>
        <label className="mini-field">
          <span>播放次数</span>
          <input
            type="number"
            min={1}
            value={state.audio.count}
            disabled={soundDisabled || state.audio.mode !== 'count'}
            onChange={(e) => onChange({ audio: { count: Number(e.target.value) } })}
          />
        </label>
        <label className="mini-field">
          <span>相对音量</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={state.audio.volume ?? 1}
            disabled={soundDisabled}
            onChange={(e) => onChange({ audio: { volume: Number(e.target.value) } })}
          />
        </label>
      </div>

      <div className="state-card-foot" onClick={(e) => e.stopPropagation()}>
        <Button size="tiny" onClick={onPreview}>在桌宠上预览</Button>
        {onRemove && (
          <Button size="tiny" variant="danger" onClick={onRemove}>删除</Button>
        )}
      </div>
    </article>
  );
}

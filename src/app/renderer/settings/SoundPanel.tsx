import type { SoundLibraryAsset } from '@shared/ipc';
import { StudioSectionFrame } from './StudioSectionFrame';
import { Button } from './ui';

interface Props {
  enabled: boolean;
  volume: number;
  librarySounds: SoundLibraryAsset[];
  onEnabledChange(enabled: boolean): void;
  onVolumeChange(volume: number): void;
  onNavigateResources(): void;
}

export function SoundPanel({
  enabled,
  volume,
  librarySounds,
  onEnabledChange,
  onVolumeChange,
  onNavigateResources,
}: Props) {
  const builtInCount = librarySounds.filter((sound) => sound.source === 'built-in').length;
  const userCount = librarySounds.length - builtInCount;

  return (
    <StudioSectionFrame
      sectionId="sound"
      actions={(
        <Button size="small" onClick={onNavigateResources}>
          管理音效资源
        </Button>
      )}
    >
      <div className="audio-controls" id="health-sound-global" tabIndex={-1}>
        <label className="audio-toggle">
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            aria-checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
          <span className="audio-toggle-icon" aria-hidden="true">♪</span>
          <span>
            <b>声音总开关</b>
            <small>{enabled ? '状态声音可以播放' : '所有声音保持静音'}</small>
          </span>
        </label>
        <label className="volume-control">
          <span>主音量 <output>{Math.round(volume * 100)}%</output></span>
          <input
            aria-label="主音量"
            aria-valuetext={`${Math.round(volume * 100)}%`}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            disabled={!enabled}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
          />
        </label>
      </div>
      <div className="sound-library">
        <div className="sound-library-head">
          <div>
            <b>公共音效库摘要</b>
            <small>
              共 {librarySounds.length} 个音效 · 内置 {builtInCount} · 用户 {userCount}
            </small>
          </div>
          <Button size="tiny" onClick={onNavigateResources}>
            查看音效库
          </Button>
        </div>
      </div>
    </StudioSectionFrame>
  );
}

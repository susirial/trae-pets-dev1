import {
  MAX_PET_SCALE,
  MIN_PET_SCALE,
  type PetConfig,
} from '@shared/pet-config';
import { StudioSectionFrame } from './StudioSectionFrame';
import { SegmentedControl } from './ui';

const SIZE_PRESETS: { label: string; scale: number }[] = [
  { label: '小', scale: 0.75 },
  { label: '标准', scale: 1 },
  { label: '大', scale: 1.5 },
  { label: '超大', scale: 2 },
];

interface Props {
  scale: number;
  position: PetConfig['window']['position'];
  onScaleChange(scale: number): void;
  onPositionChange(position: PetConfig['window']['position']): void;
}

export function StagePanel({ scale, position, onScaleChange, onPositionChange }: Props) {
  return (
    <StudioSectionFrame sectionId="stage">
      <div className="appearance-grid">
        <div className="control-card scale-card">
          <div className="control-card-head">
            <div>
              <span>宠物大小</span>
              <small>50% — 250%</small>
            </div>
            <output>{Math.round(scale * 100)}%</output>
          </div>
          <input
            className="scale-range"
            aria-label="宠物大小"
            aria-valuetext={`${Math.round(scale * 100)}%`}
            type="range"
            min={MIN_PET_SCALE}
            max={MAX_PET_SCALE}
            step={0.05}
            value={scale}
            onChange={(event) => onScaleChange(Number(event.target.value))}
          />
          <div className="range-labels" aria-hidden="true">
            <span>精巧</span><span>标准</span><span>醒目</span>
          </div>
          <SegmentedControl
            ariaLabel="宠物大小快捷设置"
            value={scale}
            onChange={onScaleChange}
            options={SIZE_PRESETS.map((preset) => ({
              value: preset.scale,
              label: preset.label,
              caption: `${Math.round(preset.scale * 100)}%`,
            }))}
          />
        </div>
        <label className="control-card position-card">
          <span>屏幕停靠位置</span>
          <small>改变预设会取消手动拖拽位置</small>
          <select
            value={position}
            onChange={(event) => onPositionChange(
              event.target.value as PetConfig['window']['position'],
            )}
          >
            <option value="bottom-right">右下角</option>
            <option value="bottom-left">左下角</option>
            <option value="top-right">右上角</option>
            <option value="top-left">左上角</option>
          </select>
          <div className={`position-map pos-${position}`} aria-hidden="true">
            <i />
          </div>
        </label>
      </div>
    </StudioSectionFrame>
  );
}

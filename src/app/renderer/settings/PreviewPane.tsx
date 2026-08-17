import type { CSSProperties } from 'react';
import type { PetPackageAsset, SoundLibraryAsset } from '@shared/ipc';
import {
  clampPetScale,
  interpolate,
  type PetSoundSelection,
  type PetStateConfig,
} from '@shared/pet-config';
import { resolvePetPackageSound } from '@shared/pet-package-view';
import { PetVisual } from './PetVisual';

interface Props {
  state: PetStateConfig | undefined;
  visualUrl: string | null;
  petName: string;
  petPackage: PetPackageAsset | undefined;
  librarySounds: SoundLibraryAsset[];
  soundSelection: PetSoundSelection | undefined;
  scale: number;
}

const SEVERITY_ICON: Record<string, string> = { success: '✓', error: '!', info: '•' };

export function PreviewPane({
  state,
  visualUrl,
  petName,
  petPackage,
  librarySounds,
  soundSelection,
  scale,
}: Props) {
  if (!state) {
    return <div className="preview-empty">选择一个状态查看预览</div>;
  }

  const effectiveScale = clampPetScale(scale);
  const stageStyle = {
    '--preview-scale': String(effectiveScale),
    '--preview-accent': petPackage?.theme.accent ?? '#78a6ff',
    '--preview-primary': petPackage?.theme.primary ?? '#6f72ff',
    '--preview-bubble': petPackage?.theme.bubble ?? 'rgba(20, 22, 32, 0.96)',
  } as CSSProperties;
  const vars: Record<string, string> = {
    petName,
    tool: 'Shell',
    summary: 'src/index.ts',
    result: '退出码 0',
    event: 'Preview',
    reason: state.label,
  };
  const title = interpolate(state.text.title || state.label, vars) || state.label;
  const message = interpolate(state.text.message || '{reason}', vars) || state.label;
  const sound = resolvePetPackageSound(petPackage, state.id, soundSelection, librarySounds);
  const soundSource = sound.source === 'package-selected'
    ? '包内指定'
    : sound.source === 'package-default'
      ? '包默认'
      : sound.source === 'library'
        ? '公共音效库'
      : sound.source === 'none'
        ? '静音'
        : '不可用';

  return (
    <div className="preview-pane">
      <div className="preview-heading">
        <div>
          <span>LIVE STAGE</span>
          <h2>实时舞台</h2>
        </div>
        <output>{Math.round(effectiveScale * 100)}%</output>
      </div>
      <div className="preview-stage" style={stageStyle}>
        <div className="preview-ambient" aria-hidden="true" />
        <div className={`preview-bubble sev-${state.severity}`}>
          <div className="pb-row">
            <span className="pb-badge">{SEVERITY_ICON[state.severity]}</span>
            <span className="pb-title">{title}</span>
          </div>
          <div className="pb-message">{message}</div>
          <span className="pb-tail" />
        </div>
        <div className="preview-viewport">
          <div className="preview-grid" aria-hidden="true" />
          <div className="preview-ground" aria-hidden="true" />
          <div className="preview-visual-shell">
            <PetVisual
              src={visualUrl}
              alt={`${petPackage?.name ?? petName} · ${state.label}`}
              className="preview-visual"
              fallback={(
                <div className="preview-noimg">
                  <span>资源不可用</span>
                  <small>检查 Manifest visuals 映射</small>
                </div>
              )}
            />
          </div>
        </div>
        <div className="preview-identity">
          <strong>{petName}</strong>
          <span>{petPackage?.name ?? '未选择宠物包'}</span>
        </div>
      </div>
      <ul className="preview-meta">
        <li><span>状态 ID</span><code>{state.id}</code></li>
        <li><span>启用</span><b>{state.enabled ? '是' : '否'}</b></li>
        <li><span>帧率</span><b>{state.fps} fps</b></li>
        <li><span>音效来源</span><b>{soundSource}</b></li>
      </ul>
    </div>
  );
}

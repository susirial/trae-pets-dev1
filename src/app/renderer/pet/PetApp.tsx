import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { clampPetScale, MAX_PET_SCALE, MIN_PET_SCALE } from '@shared/pet-config';
import type { PetWindowBounds } from '@shared/ipc';
import type { RendererStatePayload } from '@shared/state-schema';
import { HintBubble } from './HintBubble';
import { PetAudioController } from './PetAudioController';
import { isPetDrag, shouldTriggerPetClick } from './pointer-gesture';

const SCALE_STEP = 0.05;

interface DragSession {
  pointerId: number;
  start: { x: number; y: number };
  latest: { x: number; y: number };
  bounds: PetWindowBounds | null;
  boundsPromise: ReturnType<Window['petAPI']['getPetWindowBounds']>;
  dragging: boolean;
  frame: number | null;
}

function statusLabel(actionId: string): string {
  switch (actionId) {
    case 'review':
      return '查看中';
    case 'waiting':
      return '处理中';
    case 'happy':
      return '已完成';
    case 'failed':
      return '出错了';
    case 'jumping':
      return '已更新';
    case 'waving':
      return '欢迎中';
    default:
      return actionId;
  }
}

export function PetApp() {
  const [payload, setPayload] = useState<RendererStatePayload | null>(null);
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [scaleFeedback, setScaleFeedback] = useState(false);
  const scaleRef = useRef(1);
  const dragRef = useRef<DragSession | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const lastWheelAt = useRef(0);

  useEffect(() => {
    let mounted = true;
    void window.petAPI.getState().then((p) => {
      if (mounted) {
        setPayload(p);
      }
    });
    const off = window.petAPI.onStateUpdate((p) => setPayload(p));
    return () => {
      mounted = false;
      off();
    };
  }, []);

  useEffect(() => {
    window.petAPI.setIgnoreMouse(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    const applyConfigScale = (nextScale: number) => {
      const normalized = clampPetScale(nextScale);
      scaleRef.current = normalized;
      setScale(normalized);
    };
    void window.petAPI.getConfig().then((config) => {
      if (mounted) applyConfigScale(config.window.scale);
    });
    const off = window.petAPI.onConfigUpdate((config) => {
      applyConfigScale(config.window.scale);
    });
    return () => {
      mounted = false;
      off();
      if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
      const session = dragRef.current;
      if (session?.frame != null) window.cancelAnimationFrame(session.frame);
    };
  }, []);

  const handleContext = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    window.petAPI.openContextMenu();
  }, []);

  const ok = payload?.ok ?? false;
  const state = payload?.state;
  const interaction = payload?.interaction;
  const visualUrl = interaction ? interaction.visualUrl : payload?.visualUrl ?? null;
  const visualFile = interaction ? interaction.visualFile : payload?.visualFile ?? null;
  const visualError = interaction ? interaction.visualError : payload?.visualError ?? null;
  const stateError = ok ? null : payload?.error ?? '状态加载失败';
  const petName = state?.pet.displayName ?? 'TRAE 宠物';
  const actionId = interaction?.action ?? state?.action ?? 'idle';
  const version = interaction?.token ?? state?.version ?? 0;
  const triggerPetClick = useCallback(() => {
    window.petAPI.triggerPetClick();
  }, []);

  const scheduleDragMove = useCallback((session: DragSession) => {
    if (!session.bounds || session.frame !== null) return;
    session.frame = window.requestAnimationFrame(() => {
      session.frame = null;
      if (!session.bounds) return;
      const x = session.bounds.x + session.latest.x - session.start.x;
      const y = session.bounds.y + session.latest.y - session.start.y;
      void window.petAPI.movePetWindow(x, y);
    });
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dragRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const boundsPromise = window.petAPI.getPetWindowBounds();
    const session: DragSession = {
      pointerId: event.pointerId,
      start: { x: event.screenX, y: event.screenY },
      latest: { x: event.screenX, y: event.screenY },
      bounds: null,
      boundsPromise,
      dragging: false,
      frame: null,
    };
    dragRef.current = session;
    void boundsPromise.then((result) => {
      if (!result.ok || !result.bounds) return;
      session.bounds = result.bounds;
      if (session.dragging) scheduleDragMove(session);
    });
  }, [scheduleDragMove]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    session.latest = { x: event.screenX, y: event.screenY };
    if (!session.dragging && isPetDrag(session.start, session.latest)) {
      session.dragging = true;
      setDragging(true);
    }
    if (session.dragging) {
      event.preventDefault();
      scheduleDragMove(session);
    }
  }, [scheduleDragMove]);

  const finishPointer = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    canceled: boolean,
  ) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    session.latest = { x: event.screenX, y: event.screenY };
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (session.dragging) {
      scheduleDragMove(session);
      if (!session.bounds) {
        void session.boundsPromise.then((result) => {
          if (!result.ok || !result.bounds) return;
          const x = result.bounds.x + session.latest.x - session.start.x;
          const y = result.bounds.y + session.latest.y - session.start.y;
          void window.petAPI.movePetWindow(x, y);
        });
      }
      setDragging(false);
    } else if (shouldTriggerPetClick(session.dragging, canceled)) {
      triggerPetClick();
    }
  }, [scheduleDragMove, triggerPetClick]);

  const showScaleFeedback = useCallback(() => {
    setScaleFeedback(true);
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => {
      setScaleFeedback(false);
      feedbackTimer.current = null;
    }, 900);
  }, []);

  const applyScale = useCallback((nextScale: number) => {
    const normalized = clampPetScale(Math.round(nextScale * 20) / 20);
    scaleRef.current = normalized;
    setScale(normalized);
    showScaleFeedback();
    void window.petAPI.setPetWindowScale(normalized).then((result) => {
      if (!result.ok || result.scale === undefined) return;
      scaleRef.current = result.scale;
      setScale(result.scale);
    });
  }, [showScaleFeedback]);

  const adjustScale = useCallback((direction: -1 | 1) => {
    applyScale(scaleRef.current + direction * SCALE_STEP);
  }, [applyScale]);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const now = performance.now();
    if (now - lastWheelAt.current < 60 || event.deltaY === 0) return;
    lastWheelAt.current = now;
    adjustScale(event.deltaY > 0 ? -1 : 1);
  }, [adjustScale]);

  return (
    <>
      <PetAudioController payload={payload} />
      <div
        className="pet-shell"
        onContextMenu={handleContext}
      >
        <div className="pet-topbar">
          <span className="drag-handle" title="拖动移动">⠿</span>
          <div
            className={`pet-scale-controls${dragging ? ' is-dragging' : ''}`}
            role="group"
            aria-label="桌宠缩放"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="缩小桌宠"
              disabled={scale <= MIN_PET_SCALE}
              onClick={() => adjustScale(-1)}
            >
              −
            </button>
            <output aria-label={`当前缩放 ${Math.round(scale * 100)}%`}>
              {Math.round(scale * 100)}%
            </output>
            <button
              type="button"
              aria-label="放大桌宠"
              disabled={scale >= MAX_PET_SCALE}
              onClick={() => adjustScale(1)}
            >
              ＋
            </button>
          </div>
          <div className="pet-actions">
            <button className="icon-button" title="配置" onClick={() => window.petAPI.openSettings()}>
              ⚙
            </button>
            <button className="icon-button" title="关闭" onClick={() => window.petAPI.closePet()}>
              ×
            </button>
          </div>
        </div>

        <HintBubble hint={ok ? state?.hint : payload?.error ? {
          title: '状态加载失败',
          message: payload.error,
          detail: payload.statePath ?? 'state.json',
          severity: 'error',
          event: 'error',
          toolName: null,
          eventLabel: 'RendererStateError',
          toolLabel: null,
          summary: payload.error,
          result: payload.statePath ?? 'state.json',
          persistent: true,
          ttlMs: 0,
          updatedAt: new Date().toISOString(),
        } : undefined} />

        <PetStage
          visualUrl={visualUrl}
          visualFile={visualFile}
          actionId={actionId}
          version={version}
          petName={petName}
          stateError={stateError}
          visualError={visualError}
          dragging={dragging}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => finishPointer(event, false)}
          onPointerCancel={(event) => finishPointer(event, true)}
          onWheel={handleWheel}
        />

        <output
          className={`pet-scale-feedback${scaleFeedback ? ' is-visible' : ''}`}
          aria-live="polite"
        >
          {Math.round(scale * 100)}%
        </output>

        <div className="pet-status">
          <span className="pet-name">{petName}</span>
          <span className="pet-action">{statusLabel(actionId)}</span>
        </div>
      </div>
    </>
  );
}

interface StageProps {
  visualUrl: string | null;
  visualFile: string | null;
  actionId: string;
  version: number;
  petName: string;
  stateError: string | null;
  visualError: string | null;
  dragging: boolean;
  onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void;
  onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void;
  onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void;
  onPointerCancel(event: ReactPointerEvent<HTMLDivElement>): void;
  onWheel(event: ReactWheelEvent<HTMLDivElement>): void;
}

function PetStage({
  visualUrl,
  visualFile,
  actionId,
  version,
  petName,
  stateError,
  visualError,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onWheel,
}: StageProps) {
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    setImageError(null);
  }, [visualUrl, version]);

  const failure = stateError ?? visualError ?? imageError;
  const stageProps = {
    className: `pet-stage${dragging ? ' is-dragging' : ''}`,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onWheel,
  };
  if (failure) {
    return (
      <div {...stageProps}>
        <div className="pet-error-panel">
          <div className="pet-error-title">{actionId}</div>
          <div className="pet-error-message">{failure}</div>
          <div className="pet-error-detail">{visualFile ?? petName}</div>
        </div>
      </div>
    );
  }

  if (!visualUrl) {
    return (
      <div {...stageProps}>
        <div className="pet-error-panel">
          <div className="pet-error-title">{actionId}</div>
          <div className="pet-error-message">No visual configured for this state</div>
          <div className="pet-error-detail">{petName}</div>
        </div>
      </div>
    );
  }

  return (
    <div {...stageProps}>
      {/* key forces a remount so one-shot visuals replay when the state changes */}
      <img
        key={`${actionId}-${version}`}
        className="pet-visual"
        src={visualUrl}
        alt={actionId}
        draggable={false}
        onError={() => {
          setImageError(`Failed to render visual: ${visualFile ?? actionId}`);
        }}
      />
    </div>
  );
}

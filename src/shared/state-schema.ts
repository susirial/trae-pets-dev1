export type Severity = 'info' | 'success' | 'error';

export type LoopKind = 'seamless-loop' | 'one-shot' | 'one-shot-then-idle';

export interface EffectiveAudioState {
  enabled: boolean;
  mode: 'once' | 'count' | 'infinite';
  count: number;
  volume: number;
}

export interface PetHint {
  title: string;
  message: string;
  detail: string;
  severity: Severity;
  event: string;
  toolName: string | null;
  eventLabel?: string | null;
  toolLabel?: string | null;
  summary?: string | null;
  result?: string | null;
  persistent?: boolean;
  ttlMs: number;
  updatedAt: string;
}

export interface PetInfo {
  found: boolean;
  id: string;
  displayName: string;
  description: string;
}

export const RUNTIME_SCHEMA = 'trae.petRuntime.v2' as const;

export interface PetRuntimeState {
  schema: typeof RUNTIME_SCHEMA;
  version: number;
  updatedAt: string;
  updatedAtMs: number;
  holdUntilMs: number;
  source: {
    event: string;
    toolName: string | null;
    sessionId: string | null;
  };
  event: string;
  toolName: string | null;
  /** Active state id (matches a PetStateConfig.id). */
  action: string;
  reason: string;
  fps: number;
  loopKind: LoopKind;
  oneShot: boolean;
  fallbackAction: string;
  priority: number;
  pet: PetInfo;
  hint: PetHint;
}

/**
 * Payload the Electron main process sends to the renderer: the raw state plus
 * resolved, sandbox-safe asset urls the webview can load.
 */
export interface RendererStatePayload {
  ok: boolean;
  error?: string;
  statePath?: string;
  state?: PetRuntimeState;
  selectedPetId?: string;
  selectedPetName?: string;
  visualUrl?: string | null;
  visualFile?: string | null;
  visualError?: string | null;
  audioUrl?: string | null;
  audioFile?: string | null;
  resolvedSoundId?: string | null;
  audioError?: string | null;
  effectiveAudio?: EffectiveAudioState;
  interaction?: RendererInteractionPayload;
}

export interface RendererInteractionPayload {
  kind: 'click';
  token: number;
  action: string;
  durationMs: number;
  visualUrl: string | null;
  visualFile: string | null;
  visualError: string | null;
  audioUrl: string | null;
  audioFile: string | null;
  resolvedSoundId: string | null;
  audioError: string | null;
  effectiveAudio: EffectiveAudioState;
}

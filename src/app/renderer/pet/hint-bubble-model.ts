import type { PetHint, Severity } from '@shared/state-schema';

export interface HintBubbleModel {
  severity: Severity;
  title: string;
  context: string | null;
  summary: string | null;
  result: string | null;
}

const EVENT_CONTEXT: Record<string, string> = {
  UserPromptSubmit: 'INPUT',
  PreToolUse: 'PRE',
  PostToolUse: 'POST',
  PostToolUseFailure: 'ERROR',
  SessionStart: 'SESSION',
  SessionEnd: 'SESSION',
};

function meaningful(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function contextFor(hint: PetHint): string | null {
  const tool = meaningful(hint.toolLabel ?? hint.toolName);
  const rawEvent = meaningful(hint.eventLabel ?? hint.event);
  const event = rawEvent ? (EVENT_CONTEXT[rawEvent] ?? rawEvent) : null;

  return [tool, event].filter(Boolean).join(' · ') || null;
}

export function buildHintBubbleModel(hint: PetHint): HintBubbleModel {
  return {
    severity: hint.severity,
    title: hint.title,
    context: contextFor(hint),
    summary: meaningful(hint.summary) ?? meaningful(hint.message),
    result: hint.result === undefined ? meaningful(hint.detail) : meaningful(hint.result),
  };
}

export function shouldPersistHint(hint: PetHint): boolean {
  return hint.severity === 'error' || hint.persistent === true;
}

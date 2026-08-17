import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { StudioSectionId } from '../health';

interface Options {
  activeSection: StudioSectionId;
  setActiveSection: Dispatch<SetStateAction<StudioSectionId>>;
  setSelectedId: Dispatch<SetStateAction<string>>;
}

/**
 * Cross-panel navigation + focus: jumps to a section, selects a state, and
 * scrolls/highlights the matching `id="health-*"` anchor.
 */
export function useHealthFocus({ activeSection, setActiveSection, setSelectedId }: Options) {
  const [focusTarget, setFocusTarget] = useState<{ id: string; request: number } | null>(null);

  const navigateToSection = useCallback(
    (section: StudioSectionId, stateId?: string, target?: string) => {
      setActiveSection(section);
      if (stateId) {
        setSelectedId(stateId);
      }
      if (target || stateId) {
        setFocusTarget({
          id: `health-${target ?? `state-${stateId}`}`,
          request: Date.now(),
        });
      }
    },
    [setActiveSection, setSelectedId],
  );

  useEffect(() => {
    if (!focusTarget) return;
    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(focusTarget.id);
      if (!element) return;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.focus({ preventScroll: true });
      element.classList.add('is-health-focused');
      window.setTimeout(() => element.classList.remove('is-health-focused'), 1600);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSection, focusTarget]);

  return { navigateToSection };
}

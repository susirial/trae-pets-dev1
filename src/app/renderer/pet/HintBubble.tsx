import { useEffect, useState } from 'react';
import type { PetHint } from '@shared/state-schema';
import { buildHintBubbleModel, shouldPersistHint } from './hint-bubble-model';

export function HintBubble({ hint }: { hint?: PetHint }) {
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState<PetHint | null>(null);

  useEffect(() => {
    if (!hint) {
      setVisible(false);
      return;
    }
    setShown(hint);
    setVisible(true);

    if (hint.ttlMs > 0 && !shouldPersistHint(hint)) {
      const timer = setTimeout(() => setVisible(false), hint.ttlMs);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [hint]);

  if (!shown) {
    return null;
  }

  const model = buildHintBubbleModel(shown);
  const liveMode = model.severity === 'error' ? 'assertive' : 'polite';

  return (
    <div
      className={`hint-bubble hint-${model.severity} ${visible ? 'is-visible' : 'is-hidden'}`}
      role={model.severity === 'error' ? 'alert' : 'status'}
      aria-live={liveMode}
      aria-atomic="true"
    >
      <div className="hint-content" key={shown.updatedAt}>
        <div className="hint-header">
          <div className="hint-heading">
            <span className="hint-signal" aria-hidden="true">
              {model.severity === 'error' ? '!' : ''}
            </span>
            <span className="hint-title">{model.title}</span>
          </div>
          {model.context && (
            <span className="hint-context" title={model.context}>
              {model.context}
            </span>
          )}
        </div>
        {model.summary && (
          <div className="hint-summary" title={model.summary}>
            {model.summary}
          </div>
        )}
        {model.result && (
          <div className="hint-result" title={model.result}>
            <span className="hint-result-mark" aria-hidden="true">
              {model.severity === 'error' ? '×' : '✓'}
            </span>
            <span className="hint-result-text">{model.result}</span>
          </div>
        )}
      </div>
      <span className="hint-tail" aria-hidden="true" />
    </div>
  );
}

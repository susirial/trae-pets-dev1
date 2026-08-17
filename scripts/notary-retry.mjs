const TRANSIENT_NOTARY_PATTERNS = [
  /connection reset by peer/i,
  /\bECONNRESET\b/i,
  /\bETIMEDOUT\b/i,
  /\bEAI_AGAIN\b/i,
  /network connection was lost/i,
  /temporar(?:y|ily) unavailable/i,
  /service unavailable/i,
  /timed? out/i,
  /\bHTTP\s*5\d\d\b/i,
];

export function isTransientNotaryError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_NOTARY_PATTERNS.some((pattern) => pattern.test(message));
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function submitNotarizationWithRetry(submit, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  const wait = options.sleep ?? sleep;
  const delays = options.delays ?? [1_000, 3_000];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const submission = submit();
      if (submission?.status !== 'Accepted') {
        throw new Error(
          `Apple 公证未通过：${submission?.status ?? 'unknown'} (${submission?.id ?? 'no-id'})`,
        );
      }
      return submission;
    } catch (error) {
      if (!isTransientNotaryError(error)) {
        if (error instanceof Error && error.message.startsWith('Apple 公证未通过：')) {
          throw error;
        }
        throw new Error('Apple 公证提交失败（不可重试错误；详细信息已隐藏）');
      }
      if (attempt === maxAttempts) {
        throw new Error(`Apple 公证提交遇到瞬时网络错误，${maxAttempts} 次尝试均失败`);
      }
      wait(delays[Math.min(attempt - 1, delays.length - 1)] ?? 3_000);
    }
  }
  throw new Error('Apple 公证提交未执行');
}

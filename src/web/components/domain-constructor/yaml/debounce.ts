export interface DebouncedFn<T> {
  (value: T): void;
  flush(): void;
  cancel(): void;
}

export function debounce<T>(fn: (v: T) => void, ms: number): DebouncedFn<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | undefined;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending !== undefined) {
      const v = pending;
      pending = undefined;
      fn(v);
    }
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = undefined;
  };

  const call = ((value: T) => {
    pending = value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, ms);
  }) as DebouncedFn<T>;

  call.flush = flush;
  call.cancel = cancel;
  return call;
}

import { create } from "zustand";

export type ToastKind = "success" | "error" | "info" | "warning";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Опциональная подпись. */
  description?: string;
  /** Мс. По умолчанию 3500. */
  ttl?: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, "id" | "ttl"> & { ttl?: number }) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  push: (t) => {
    const id = nextId++;
    const toast: Toast = { ...t, id, ttl: t.ttl ?? 3500 };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (toast.ttl && toast.ttl > 0) {
      setTimeout(() => {
        get().dismiss(id);
      }, toast.ttl);
    }
    return id;
  },

  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}));

// ============ Императивный API ============

function push(
  kind: ToastKind,
  message: string,
  description?: string,
  ttl?: number,
) {
  return useToastStore.getState().push({ kind, message, description, ttl });
}

export const toast = {
  success: (message: string, description?: string, ttl?: number) =>
    push("success", message, description, ttl),
  error: (message: string, description?: string, ttl?: number) =>
    push("error", message, description, ttl ?? 5000),
  info: (message: string, description?: string, ttl?: number) =>
    push("info", message, description, ttl),
  warning: (message: string, description?: string, ttl?: number) =>
    push("warning", message, description, ttl ?? 4500),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
  clear: () => useToastStore.getState().clear(),
};

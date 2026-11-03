import { create } from "zustand";

export type DialogVariant = "info" | "warning" | "danger";

interface DialogConfig {
  kind: "alert" | "confirm";
  title: string;
  message: string;
  detail?: string;
  variant: DialogVariant;
  confirmLabel: string;
  cancelLabel: string | null;
  resolve: (ok: boolean) => void;
}

interface DialogStore {
  current: DialogConfig | null;
  queue: DialogConfig[];
  _show: (config: Omit<DialogConfig, "resolve">) => Promise<boolean>;
  _close: (ok: boolean) => void;
}

export const useDialogStore = create<DialogStore>((set, get) => ({
  current: null,
  queue: [],

  _show: (config) =>
    new Promise<boolean>((resolve) => {
      const dialog: DialogConfig = { ...config, resolve };
      // Один диалог за раз; следующий встаёт в очередь
      if (get().current) {
        set({ queue: [...get().queue, dialog] });
      } else {
        set({ current: dialog });
      }
    }),

  _close: (ok) => {
    const cur = get().current;
    if (!cur) return;
    cur.resolve(ok);
    const queue = get().queue;
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      set({ current: next, queue: rest });
    } else {
      set({ current: null });
    }
  },
}));

// ============ Public API ============

export interface AlertOptions {
  title?: string;
  detail?: string;
  variant?: DialogVariant;
  confirmLabel?: string;
}

export async function alertDialog(
  message: string,
  opts: AlertOptions = {},
): Promise<void> {
  await useDialogStore.getState()._show({
    kind: "alert",
    title: opts.title || "Внимание",
    message,
    detail: opts.detail,
    variant: opts.variant || "info",
    confirmLabel: opts.confirmLabel || "OK",
    cancelLabel: null,
  });
}

export interface ConfirmOptions {
  title?: string;
  detail?: string;
  variant?: DialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Красная кнопка + title по умолчанию «Подтвердите действие». */
  danger?: boolean;
}

export async function confirmDialog(
  message: string,
  opts: ConfirmOptions = {},
): Promise<boolean> {
  const variant: DialogVariant = opts.danger
    ? "danger"
    : opts.variant || "info";
  return useDialogStore.getState()._show({
    kind: "confirm",
    title:
      opts.title || (opts.danger ? "Подтвердите действие" : "Подтверждение"),
    message,
    detail: opts.detail,
    variant,
    confirmLabel: opts.confirmLabel || "OK",
    cancelLabel: opts.cancelLabel || "Отмена",
  });
}

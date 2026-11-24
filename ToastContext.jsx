import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

const STYLES = {
  success: 'border-neon-lime/50 text-neon-lime',
  error: 'border-neon-pink/60 text-neon-pink',
  info: 'border-neon-cyan/50 text-neon-cyan',
};
const ICONS = { success: '✓', error: '!', info: 'i' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (type, message, opts = {}) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, type, message, action: opts.action }]);
      setTimeout(() => dismiss(id), opts.duration ?? (type === 'error' ? 6000 : 4000));
      return id;
    },
    [dismiss],
  );

  const toast = useMemo(
    () => ({
      success: (m, o) => push('success', m, o),
      error: (m, o) => push('error', m, o),
      info: (m, o) => push('info', m, o),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl border bg-ink-900/95 px-4 py-3 shadow-xl backdrop-blur ${STYLES[t.type]}`}
          >
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-current font-display text-xs">
              {ICONS[t.type]}
            </span>
            <div className="min-w-0 flex-1 text-sm text-ink-100">
              {t.message}
              {t.action && (
                <button
                  className="ml-2 font-semibold underline underline-offset-2"
                  onClick={() => {
                    t.action.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button aria-label="Dismiss" className="text-ink-400 hover:text-ink-100" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};

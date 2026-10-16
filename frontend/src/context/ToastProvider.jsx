import { CircleAlert, CircleCheckBig, Info, TriangleAlert, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ToastContext } from './toastContext.js';

const ICONS = {
  info: Info,
  success: CircleCheckBig,
  pending: TriangleAlert,
  error: CircleAlert,
};

const TITLES = {
  info: 'Notice',
  success: 'Done',
  pending: 'Please note',
  error: 'Something went wrong',
};

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ tone = 'info', title, message, duration = 5000 } = {}) => {
      const id = nextId.current;
      nextId.current += 1;
      const resolvedTitle = title ?? TITLES[tone] ?? TITLES.info;

      setToasts((current) => [...current, { id, tone, title: resolvedTitle, message }]);

      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }

      return id;
    },
    [dismiss],
  );

  const showAlert = useCallback(
    (message, tone = 'error', title) => showToast({ tone, title, message }),
    [showToast],
  );

  const value = useMemo(
    () => ({ showToast, showAlert, dismiss }),
    [showToast, showAlert, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.tone] ?? Info;

          return (
            <div className={`toast toast--${toast.tone}`} key={toast.id} role="status">
              <span className="toast__icon" aria-hidden="true">
                <Icon size={16} />
              </span>
              <div className="toast__body">
                <span className="toast__title">{toast.title}</span>
                {toast.message ? <p className="toast__message">{toast.message}</p> : null}
              </div>
              <button
                type="button"
                className="toast__close"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

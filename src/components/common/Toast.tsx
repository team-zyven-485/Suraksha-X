import React from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle, X } from 'lucide-react';
import { useDisaster } from '../../context/DisasterContext';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useDisaster();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 left-5 z-[998] flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((toast) => {
        const icons = {
          success: <CheckCircle className="w-5 h-5 text-safe shrink-0" />,
          error: <XCircle className="w-5 h-5 text-critical shrink-0" />,
          warning: <AlertTriangle className="w-5 h-5 text-warn shrink-0" />,
          info: <Info className="w-5 h-5 text-brand shrink-0" />,
        };

        const bgColors = {
          success: 'bg-surface border-safe/30 text-ink',
          error: 'bg-surface border-critical/30 text-ink',
          warning: 'bg-surface border-warn/30 text-ink',
          info: 'bg-surface border-brand/30 text-ink',
        };

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2 ${bgColors[toast.type]}`}
          >
            {icons[toast.type]}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink">
                {toast.title}
              </h4>
              <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-ink-faint hover:text-ink p-1 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

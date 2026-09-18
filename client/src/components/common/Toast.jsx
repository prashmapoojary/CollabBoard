import React, { useEffect } from 'react';
import { Bell, CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const Toast = ({ toast, onClose }) => {
  const { id, title, message, type = 'info', duration = 4500 } = toast;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />;
      case 'info':
      default:
        return <Bell className="w-5 h-5 text-indigo-400 shrink-0" />;
    }
  };

  const getStyleTokens = () => {
    switch (type) {
      case 'success':
        return 'border-emerald-500/30 bg-slate-900/95 shadow-emerald-500/10';
      case 'error':
        return 'border-rose-500/30 bg-slate-900/95 shadow-rose-500/10';
      case 'warning':
        return 'border-amber-500/30 bg-slate-900/95 shadow-amber-500/10';
      case 'info':
      default:
        return 'border-indigo-500/30 bg-slate-900/95 shadow-indigo-500/10';
    }
  };

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md text-slate-100 transition-all duration-300 pointer-events-auto max-w-sm w-full ${getStyleTokens()}`}
    >
      <div className="mt-0.5">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        {title && <h4 className="text-sm font-semibold text-white truncate">{title}</h4>}
        <p className="text-xs text-slate-300 leading-relaxed break-words">{message}</p>
      </div>
      <button
        type="button"
        onClick={() => onClose(id)}
        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ToastContainer = ({ toasts, onClose }) => {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
};

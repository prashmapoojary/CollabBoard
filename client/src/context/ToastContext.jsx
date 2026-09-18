import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { ToastContainer } from '../components/common/Toast';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(({ type = 'info', title, message, duration = 4500 }) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 7);
    setToasts((prev) => [...prev, { id, type, title, message, duration }]);
    return id;
  }, []);

  const toast = useMemo(
    () => ({
      success: (message, title = 'Success', duration) =>
        addToast({ type: 'success', title, message, duration }),
      error: (message, title = 'Error', duration) =>
        addToast({ type: 'error', title, message, duration }),
      warning: (message, title = 'Warning', duration) =>
        addToast({ type: 'warning', title, message, duration }),
      info: (message, title = 'Notice', duration) =>
        addToast({ type: 'info', title, message, duration }),
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ toast, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    // Fallback safe dummy if used outside provider
    return {
      toast: {
        success: (msg) => console.log('[Toast Success]', msg),
        error: (msg) => console.error('[Toast Error]', msg),
        warning: (msg) => console.warn('[Toast Warning]', msg),
        info: (msg) => console.info('[Toast Info]', msg),
      },
      addToast: () => {},
      removeToast: () => {},
    };
  }
  return context;
};

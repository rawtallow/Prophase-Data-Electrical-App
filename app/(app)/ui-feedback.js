'use client';
import { useEffect, useState } from 'react';

// Lightweight pub/sub so any client component in the app can trigger a toast
// or a confirm dialog without prop-drilling. One <FeedbackHost/> (mounted
// once in the (app) layout) subscribes and renders the UI; everything else
// just calls toast(...)/confirmDialog(...) as plain functions.
let toastListeners = [];
let confirmListeners = [];
let nextId = 0;

export function toast(message, type = 'info') {
  const id = ++nextId;
  toastListeners.forEach((fn) => fn({ id, message, type }));
}
toast.success = (message) => toast(message, 'success');
toast.error = (message) => toast(message, 'error');

export function confirmDialog(message, opts = {}) {
  return new Promise((resolve) => {
    confirmListeners.forEach((fn) => fn({ message, ...opts, resolve }));
  });
}

export function FeedbackHost() {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  useEffect(() => {
    const onToast = (t) => {
      setToasts((cur) => [...cur, t]);
      setTimeout(() => {
        setToasts((cur) => cur.filter((x) => x.id !== t.id));
      }, 3800);
    };
    const onConfirm = (c) => setConfirmState(c);
    toastListeners.push(onToast);
    confirmListeners.push(onConfirm);
    return () => {
      toastListeners = toastListeners.filter((f) => f !== onToast);
      confirmListeners = confirmListeners.filter((f) => f !== onConfirm);
    };
  }, []);

  function respond(value) {
    confirmState?.resolve(value);
    setConfirmState(null);
  }

  return (
    <>
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
      {confirmState && (
        <div className="modal-overlay active" onClick={() => respond(false)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            {confirmState.title && <h3>{confirmState.title}</h3>}
            <p className="confirm-message">{confirmState.message}</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => respond(false)}>Cancel</button>
              <button className={`btn ${confirmState.danger ? 'danger-solid' : 'amber'}`} onClick={() => respond(true)}>
                {confirmState.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

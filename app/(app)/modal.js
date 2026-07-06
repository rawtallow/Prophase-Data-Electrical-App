'use client';
import { useEffect, useState } from 'react';

// A modal that animates BOTH in and out. Parents just toggle `open`; this
// component keeps the last-known children mounted for the close animation's
// duration before actually unmounting, so closing looks intentional instead
// of content just vanishing (the gap that made modals feel unfinished).
const CLOSE_MS = 160;

export default function Modal({ open, wide, onBackdropClick, children }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [content, setContent] = useState(children);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else {
      setClosing(true);
      const t = setTimeout(() => setMounted(false), CLOSE_MS);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (open) setContent(children);
  }, [open, children]);

  if (!mounted) return null;

  return (
    <div className={`modal-overlay active${closing ? ' closing' : ''}`} onClick={onBackdropClick}>
      <div
        className={`modal${wide ? ' modal-wide' : ''}${closing ? ' closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}

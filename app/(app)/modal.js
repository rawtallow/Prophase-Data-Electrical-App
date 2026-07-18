'use client';
import { useEffect, useRef, useState } from 'react';

// A modal that animates BOTH in and out. Parents just toggle `open`; this
// component keeps the last-known children mounted for the close animation's
// duration before actually unmounting, so closing looks intentional instead
// of content just vanishing (the gap that made modals feel unfinished).
//
// It also owns the behaviour every modal should have but none of the 18 call
// sites implemented individually: the page behind stops scrolling, Escape
// closes (when the parent gave us a way to close), and focus moves into the
// dialog and returns to whatever opened it. Backdrop-click close stays
// opt-in via onBackdropClick — form modals deliberately don't dismiss on a
// stray outside click, which would throw away a half-filled form.
const CLOSE_MS = 180;

export default function Modal({ open, wide, onBackdropClick, children }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [content, setContent] = useState(children);
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);

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

  // Freeze the page behind the dialog. Compensating for the scrollbar's width
  // keeps the layout from jumping sideways as it disappears.
  useEffect(() => {
    if (!open) return;
    const { body, documentElement } = document;
    const gap = window.innerWidth - documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, [open]);

  // Escape closes, but only when the parent actually handed us a close
  // handler — otherwise there'd be no way to tell it the dialog went away.
  useEffect(() => {
    if (!open || !onBackdropClick) return;
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onBackdropClick();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onBackdropClick]);

  // Move focus into the dialog on open, and put it back where it came from on
  // close, so keyboard users aren't dumped at the top of the page.
  //
  // This depends on `mounted`, not just `open`: on the render where `open`
  // first flips true the dialog hasn't been committed yet (mounted is still
  // false, so the component returns null and dialogRef is empty). Keying off
  // open alone means the effect runs once against a null ref and never again.
  useEffect(() => {
    if (!open || !mounted) return;
    returnFocusRef.current = document.activeElement;
    const node = dialogRef.current;
    if (!node) return;
    const firstField = node.querySelector(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
    );
    (firstField || node).focus({ preventScroll: true });
    return () => {
      const prev = returnFocusRef.current;
      if (prev && typeof prev.focus === 'function') prev.focus({ preventScroll: true });
    };
  }, [open, mounted]);

  if (!mounted) return null;

  return (
    <div className={`modal-overlay active${closing ? ' closing' : ''}`} onClick={onBackdropClick}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`modal${wide ? ' modal-wide' : ''}${closing ? ' closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}

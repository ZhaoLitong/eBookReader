import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    const back = (event: Event) => { event.preventDefault(); onClose(); };
    window.addEventListener('reader:back', back);
    return () => { window.removeEventListener('reader:back', back); dialog.close(); previous?.focus(); };
  }, [onClose]);
  return <dialog ref={ref} aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === ref.current) onClose(); }}>
    <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="Close panel" onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}

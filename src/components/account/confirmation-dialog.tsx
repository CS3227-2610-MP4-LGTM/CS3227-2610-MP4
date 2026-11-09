"use client";

import { useId, useLayoutEffect, useRef, type ReactNode } from "react";

export function ConfirmationDialog({ title, descriptionId, children, onCancel }: {
  title: string;
  descriptionId?: string;
  children: ReactNode;
  onCancel: () => void;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.open = true;
    if (!dialog.contains(document.activeElement)) dialog.focus();
    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return <dialog ref={dialogRef} aria-labelledby={id} aria-describedby={descriptionId} className="confirmation-dialog" tabIndex={-1}
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={id}>{title}</h2>
    {children}
  </dialog>;
}

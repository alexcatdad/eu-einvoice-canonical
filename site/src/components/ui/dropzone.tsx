/**
 * A file drop zone on react-dropzone, built as a <label> around a real file input: the input keeps the keyboard focus
 * (Enter or Space opens the picker), a click anywhere on the zone opens it, and files dropped on it are read.
 */
import type * as React from 'react';
import { useDropzone } from 'react-dropzone';
import { cn } from '@/lib/utils';

export function Dropzone({
  onFile,
  accept,
  className,
  children,
}: {
  onFile: (file: File) => void;
  /** The `accept` attribute of the file input. */
  accept: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    noClick: true,
    noKeyboard: true,
    useFsAccessApi: false,
    onDrop: (files) => {
      const f = files[0];
      if (f) onFile(f);
    },
  });
  // react-dropzone hides its input with display: none; this one stays focusable and is hidden visually only.
  // It also takes the input out of the tab order; here the input is how the keyboard reaches the picker. Clearing its
  // value on every click lets the same file be chosen again (after it changed on disk, say).
  const { style: _hidden, ...input } = getInputProps({
    accept,
    tabIndex: 0,
    onClick: (e: React.MouseEvent<HTMLInputElement>) => {
      e.currentTarget.value = '';
    },
  }) as React.InputHTMLAttributes<HTMLInputElement>;
  // Its root gets role="presentation", which a <label> may not carry; the label keeps its own semantics.
  const { role: _presentation, ...root } = getRootProps({
    className: cn('slot', isDragActive && 'dragging', className),
  }) as React.HTMLAttributes<HTMLLabelElement>;
  return (
    <label {...root}>
      <input {...input} className="visually-hidden" />
      {children}
    </label>
  );
}

'use client';

/**
 * The video page's settings, behind one gear in the header — the toggles and
 * the run-wide actions, kept out of the way of the loop and with room to grow.
 *
 * The actions that rewrite the run ask once, in place, before they do it.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, CheckCircle, GearSix } from '@phosphor-icons/react';

export type VideoSettingsProps = {
  slots: boolean;
  onSlotsChange: (value: boolean) => void;
  /** Absent when the captions have no punctuation to be strict about. */
  strict?: boolean;
  onStrictChange: (value: boolean) => void;
  /** Hidden when nothing is answered yet. */
  canReset: boolean;
  onReset: () => void;
  /** Hidden when every segment is already answered. */
  canComplete: boolean;
  onCompleteAll: () => void;
  /** Where focus goes back to when the menu closes. */
  onClose?: () => void;
};

type Confirming = 'reset' | 'complete' | null;

export function VideoSettings({
  slots,
  onSlotsChange,
  strict,
  onStrictChange,
  canReset,
  onReset,
  canComplete,
  onCompleteAll,
  onClose,
}: VideoSettingsProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = (refocus: 'trigger' | 'input' = 'input') => {
    setOpen(false);
    setConfirming(null);
    if (refocus === 'trigger') trigger.current?.focus();
    else onClose?.();
  };

  // Outside click and Escape close it, like any menu.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        setConfirming(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      setConfirming(null);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => (open ? close('trigger') : setOpen(true))}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="configurações do vídeo"
        title="Configurações"
        className={`flex size-11 items-center justify-center rounded-sm hover:text-fg ${
          open ? 'bg-raised text-fg' : 'text-muted'
        }`}
      >
        <GearSix size={22} weight={open ? 'fill' : 'regular'} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="configurações do vídeo"
          className="absolute top-full right-0 z-20 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col rounded-md border border-line bg-surface py-2 shadow-xl shadow-black/40"
        >
          <SectionLabel>Prática</SectionLabel>
          <Toggle checked={slots} onChange={onSlotsChange}>
            Dica de letras
          </Toggle>
          {strict !== undefined && (
            <Toggle checked={strict} onChange={onStrictChange}>
              Modo estrito
            </Toggle>
          )}

          {(canComplete || canReset) && (
            <>
              <div className="my-2 h-px bg-line-soft" />
              <SectionLabel>Progresso</SectionLabel>
            </>
          )}

          {canComplete &&
            (confirming === 'complete' ? (
              <Confirm
                question="Marcar todos os trechos restantes como feitos?"
                confirmLabel="marcar"
                tone="accent"
                onConfirm={() => {
                  onCompleteAll();
                  close();
                }}
                onCancel={() => setConfirming(null)}
              />
            ) : (
              <MenuItem onClick={() => setConfirming('complete')} icon={<CheckCircle size={18} aria-hidden="true" />}>
                Completar todas as legendas
              </MenuItem>
            ))}

          {canReset &&
            (confirming === 'reset' ? (
              <Confirm
                question="Zerar o progresso deste vídeo?"
                confirmLabel="zerar"
                tone="bad"
                onConfirm={() => {
                  onReset();
                  close();
                }}
                onCancel={() => setConfirming(null)}
              />
            ) : (
              <MenuItem
                onClick={() => setConfirming('reset')}
                icon={<ArrowCounterClockwise size={18} aria-hidden="true" />}
                danger
              >
                Zerar progresso
              </MenuItem>
            ))}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-4 pt-1 pb-1 text-[11px] font-semibold tracking-[0.08em] text-dim uppercase">
      {children}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 px-4 text-sm text-fg hover:bg-raised">
      {children}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-accent"
      />
    </label>
  );
}

function MenuItem({
  onClick,
  icon,
  danger = false,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 items-center gap-3 px-4 text-left text-sm hover:bg-raised ${
        danger ? 'text-muted hover:text-bad' : 'text-fg'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Confirm({
  question,
  confirmLabel,
  tone,
  onConfirm,
  onCancel,
}: {
  question: string;
  confirmLabel: string;
  tone: 'accent' | 'bad';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="alertdialog" aria-label={question} className="flex flex-col gap-3 bg-raised px-4 py-3 text-sm">
      <span className="text-fg">{question}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          autoFocus
          className={`rounded-sm px-3 py-1 font-medium text-bg ${tone === 'bad' ? 'bg-bad' : 'bg-accent'}`}
        >
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-sm border border-line px-3 py-1 text-fg">
          cancelar
        </button>
      </div>
    </div>
  );
}

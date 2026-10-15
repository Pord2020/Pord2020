'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  X,
  ArrowRight,
  Leaf,
  Circle,
  Layers3,
  Utensils,
  PenTool,
  Waves,
  WalletCards,
  Loader2,
} from 'lucide-react';
import { ApiError } from '@/lib/client';
import { errorMessage, messages, type Locale, type MessageKey } from '@/lib/i18n';

export const Logo = ({ small = false }: { small?: boolean }) => (
  <span className={`logo ${small ? 'logo-small' : ''}`}>
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="currentColor" />
      <path d="M11 29V13a2 2 0 0 1 2-2h8v7h-4v11zm13 0V11h6v18z" fill="#fff" />
      <path d="M18 11h3v7h-3z" fill="#bfd4b6" />
    </svg>
    {!small && (
      <span>
        pilotlane<span className="logo-dot">.</span>
      </span>
    )}
  </span>
);
const appIcons = {
  peach: Leaf,
  lilac: Circle,
  butter: Utensils,
  blue: PenTool,
  sage: WalletCards,
  rose: Waves,
};
export function AppIcon({
  variant = 'sage',
  size = 'normal',
}: {
  variant?: string;
  size?: 'small' | 'normal' | 'large';
}) {
  const Icon = appIcons[variant as keyof typeof appIcons] || Layers3;
  return (
    <span className={`app-icon ${variant} ${size}`}>
      <Icon aria-hidden="true" strokeWidth={1.5} />
    </span>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  large = false,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  large?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${large ? 'dialog-large' : ''} ${className}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" aria-label="Close / Cerrar" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function useAction(locale: Locale) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return {
    busy,
    error,
    async run(fn: () => Promise<void>) {
      setBusy(true);
      setError('');
      try {
        await fn();
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.code === 'NETWORK_ERROR'
              ? messages[locale].networkError
              : errorMessage(locale, err.code)
            : messages[locale].genericError,
        );
      } finally {
        setBusy(false);
      }
    },
  };
}
export function Busy({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <>
      {busy ? <Loader2 size={16} className="spin" /> : null}
      {children}
    </>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <div className="error-notice" role="alert">
      {message}
    </div>
  ) : null;
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Layers3 size={26} strokeWidth={1.3} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function StatusBadge({ status, locale }: { status: string; locale: Locale }) {
  const t = messages[locale];
  return (
    <span className={`status status-${status}`}>
      <span />
      {t[status as MessageKey] || status}
    </span>
  );
}

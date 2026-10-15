'use client';
import { useState } from 'react';
import { ArrowRight, Code2, MessageSquareText } from 'lucide-react';
import { api } from '@/lib/client';
import { messages, type Locale } from '@/lib/i18n';
import { Dialog, Logo, Busy, ErrorNotice, useAction } from './ui';

export function AuthDialog({
  locale,
  initialMode = 'register',
  initialRole = 'tester',
  google,
  onClose,
  onSuccess,
}: {
  locale: Locale;
  initialMode?: 'register' | 'login';
  initialRole?: 'founder' | 'tester';
  google: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const t = messages[locale];
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState(initialRole);
  const action = useAction(locale);
  return (
    <Dialog
      title={mode === 'register' ? t.welcomeTitle : t.welcomeBack}
      onClose={onClose}
      className="auth-dialog"
    >
      <div className="auth-intro">
        <Logo small />
        <p>{t.authDescription}</p>
      </div>
      {mode === 'register' && (
        <div className="role-picker">
          <button
            type="button"
            className={role === 'founder' ? 'selected' : ''}
            onClick={() => setRole('founder')}
          >
            <Code2 size={19} />
            {t.founder}
          </button>
          <button
            type="button"
            className={role === 'tester' ? 'selected' : ''}
            onClick={() => setRole('tester')}
          >
            <MessageSquareText size={19} />
            {t.tester}
          </button>
        </div>
      )}
      {google && (
        <>
          <a
            className="button button-secondary full-width"
            href={`/api/auth/google?role=${role}&locale=${locale}`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.2 3-7.4zM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a6 6 0 0 1-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22zM6.4 14a6 6 0 0 1 0-4V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14zM12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.4L6.4 10A6 6 0 0 1 12 5.9z"
              />
            </svg>
            {t.continueGoogle}
          </a>
          <div className="form-divider">
            <span>{t.orEmail}</span>
          </div>
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          void action.run(async () => {
            await api(`auth/${mode}`, {
              method: 'POST',
              body: {
                name: form.get('name'),
                email: form.get('email'),
                password: form.get('password'),
                role,
                locale,
              },
            });
            await onSuccess();
          });
        }}
      >
        {mode === 'register' && (
          <label>
            {t.name}
            <input name="name" autoComplete="name" required minLength={2} maxLength={80} />
          </label>
        )}
        <label>
          {t.email}
          <input name="email" type="email" autoComplete="email" required maxLength={254} />
        </label>
        <label>
          {t.password}
          <input
            name="password"
            aria-label={t.password}
            aria-describedby={mode === 'register' ? 'password-hint' : undefined}
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            minLength={12}
            maxLength={128}
          />
          {mode === 'register' && (
            <span id="password-hint" className="field-hint">
              {t.passwordHint}
            </span>
          )}
        </label>
        <ErrorNotice message={action.error} />
        <button className="button button-primary full-width" disabled={action.busy}>
          <Busy busy={action.busy}>{mode === 'register' ? t.createAccount : t.signIn}</Busy>
          <ArrowRight size={16} />
        </button>
      </form>
      <p className="auth-switch">
        {mode === 'register' ? t.haveAccount : t.noAccount}{' '}
        <button
          className="text-button"
          onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
        >
          {mode === 'register' ? t.signIn : t.createAccount}
        </button>
      </p>
      <p className="fine-print centered">{t.adultsOnly}</p>
    </Dialog>
  );
}

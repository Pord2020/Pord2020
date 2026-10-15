'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Check, CheckCircle2, Clock3, Send, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/client';
import { messages, money, dateTime, errorMessage, type Locale } from '@/lib/i18n';
import { Dialog, Busy, ErrorNotice, useAction, StatusBadge } from './ui';

type Detail = {
  participation: {
    id: string;
    study_id: string;
    tester_id: string;
    founder_id: string;
    status: string;
    title: string;
    app_name: string;
    reward_cents: number;
    duration_days: number;
    review_note: string | null;
    submitted_at: string | null;
  };
  inviteUrl: string;
  tasks: { id: string; instruction: string; feedback: string | null }[];
  checkIns: { day: string; note: string }[];
  progress: {
    completedDays: number;
    streakDays: number;
    requiredDays: number;
    tasksDone: number;
    totalTasks: number;
    earliestSubmitAt: string | null;
    canSubmit: boolean;
    todayCheckedIn: boolean;
  };
};
export function ParticipationDialog({
  id,
  locale,
  userId,
  onClose,
  onUpdated,
  notify,
}: {
  id: string;
  locale: Locale;
  userId: string;
  onClose: () => void;
  onUpdated: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const t = messages[locale];
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [disputeOpen, setDisputeOpen] = useState(false);
  const action = useAction(locale);
  const load = useCallback(async () => {
    try {
      setDetail(await api<Detail>(`participations/${id}`));
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof ApiError ? errorMessage(locale, e.code) : t.networkError);
    }
  }, [id, locale, t.networkError]);
  useEffect(() => {
    void load();
  }, [load]);
  const update = async () => {
    await load();
    await onUpdated();
  };
  const run = (path: string, body: unknown, message: string) =>
    action.run(async () => {
      await api(`participations/${id}/${path}`, { method: 'POST', body });
      notify(message);
      await update();
    });
  if (!detail)
    return (
      <Dialog title={t.myStudies} onClose={onClose}>
        <ErrorNotice message={loadError} />
        <p>{t.loading}</p>
      </Dialog>
    );
  const p = detail.participation,
    owner = p.tester_id === userId;
  const editable = owner && ['active', 'rejected'].includes(p.status);
  const disputeAvailable =
    owner &&
    (p.status === 'rejected' ||
      (p.status === 'submitted' &&
        p.submitted_at &&
        Date.now() >= new Date(p.submitted_at).getTime() + 7 * 86400000));
  return (
    <Dialog title={p.app_name} onClose={onClose} large>
      <div className="participation-title">
        <h3>{p.title}</h3>
        <StatusBadge status={p.status} locale={locale} />
      </div>
      <div className="participation-metrics">
        <div>
          <strong>
            {detail.progress.completedDays}
            <small> / {p.duration_days}</small>
          </strong>
          <span>{t.dayProgress}</span>
        </div>
        <div>
          <strong>
            {detail.progress.tasksDone}
            <small> / {detail.progress.totalTasks}</small>
          </strong>
          <span>{t.tasks}</span>
        </div>
        <div>
          <strong>{money(p.reward_cents, locale)}</strong>
          <span>USD · {t.netReward}</span>
        </div>
      </div>
      <div className="progress-track">
        <span
          style={{
            width: `${Math.min(100, (detail.progress.streakDays / p.duration_days) * 100)}%`,
          }}
        />
      </div>
      {owner && p.status === 'accepted' && (
        <div className="invitation-box">
          <ShieldCheck size={24} />
          <h4>{t.invitationReady}</h4>
          <a
            className="button button-secondary"
            href={detail.inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.openApp}
            <ArrowUpRight size={15} />
          </a>
          <button
            className="button button-primary"
            disabled={action.busy}
            onClick={() => void run('start', undefined, t.active)}
          >
            <Busy busy={action.busy}>{t.startStudy}</Busy>
          </button>
        </div>
      )}
      {p.review_note && (
        <div className="info-note review-note">
          <strong>{t.reviewNote}</strong>
          <p>{p.review_note}</p>
        </div>
      )}
      {editable && (
        <section className="detail-section">
          <h4>{t.dailyCheckIn}</h4>
          <p className="muted small-text">{t.checkInHelp}</p>
          {detail.progress.todayCheckedIn ? (
            <div className="success-note">
              <CheckCircle2 size={17} />
              {t.checkedIn}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = new FormData(form);
                void run('check-in', { note: data.get('note') }, t.checkedIn).then(() => {
                  form.reset();
                });
              }}
            >
              <label>
                <span className="sr-only">{t.dailyCheckIn}</span>
                <textarea
                  name="note"
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={3}
                  placeholder={t.checkInPlaceholder}
                />
              </label>
              <button className="button button-secondary" disabled={action.busy}>
                <Busy busy={action.busy}>{t.checkIn}</Busy>
              </button>
            </form>
          )}
          <p className="fine-print">
            {t.utcNote}{' '}
            {detail.progress.earliestSubmitAt && (
              <>
                {t.earliestSubmit}: {dateTime(detail.progress.earliestSubmitAt, locale)}.
              </>
            )}
          </p>
        </section>
      )}
      <section className="detail-section">
        <h4>{t.checklist}</h4>
        <div className="work-tasks">
          {detail.tasks.map((task, i) => (
            <div className="work-task" key={task.id}>
              <div className="task-instruction">
                <span className={task.feedback ? 'task-number task-done' : 'task-number'}>
                  {task.feedback ? <Check size={13} /> : i + 1}
                </span>
                <strong>{task.instruction}</strong>
              </div>
              {editable ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    void run(
                      'tasks',
                      { taskId: task.id, feedback: data.get('feedback') },
                      t.feedbackSaved,
                    );
                  }}
                >
                  <label>
                    <span className="sr-only">
                      {t.taskFeedback} {i + 1}
                    </span>
                    <textarea
                      name="feedback"
                      key={task.feedback}
                      defaultValue={task.feedback || ''}
                      required
                      minLength={30}
                      maxLength={5000}
                      rows={3}
                      placeholder={t.feedbackPlaceholder}
                    />
                  </label>
                  <button className="text-button" disabled={action.busy}>
                    <Busy busy={action.busy}>{t.saveFeedback}</Busy>
                    <Check size={13} />
                  </button>
                </form>
              ) : (
                <p className="task-answer">{task.feedback || '—'}</p>
              )}
            </div>
          ))}
        </div>
      </section>
      {detail.checkIns.length > 0 && (
        <section className="detail-section">
          <h4>{t.evidence}</h4>
          <div className="activity-list">
            {detail.checkIns.map((c) => (
              <div key={c.day}>
                <span>
                  {c.day.slice(0, 10)} <small>UTC</small>
                </span>
                <p>{c.note}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {editable && (
        <div className="submit-work">
          <p className="fine-print">{t.submitHelp}</p>
          <button
            className="button button-primary"
            disabled={action.busy || !detail.progress.canSubmit}
            onClick={() => void run('submit', undefined, t.workSubmitted)}
          >
            <Busy busy={action.busy}>{t.submitWork}</Busy>
            <Send size={15} />
          </button>
        </div>
      )}
      {!owner && p.status === 'submitted' && (
        <form
          className="detail-section"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const decision =
              (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') || 'approve';
            const note = String(data.get('note') || '');
            if (decision === 'reject' && note.trim().length < 10) {
              e.currentTarget.querySelector('textarea')?.focus();
              return;
            }
            void run(
              'review',
              { decision, note },
              decision === 'approve' ? t.rewardApproved : t.changesRequested,
            );
          }}
        >
          <label>
            {t.reviewNote}
            <textarea name="note" rows={3} placeholder={t.reviewPlaceholder} maxLength={2000} />
          </label>
          <div className="dialog-actions">
            <button
              className="button button-secondary"
              name="decision"
              value="reject"
              disabled={action.busy}
            >
              {t.requestChanges}
            </button>
            <button
              className="button button-primary"
              name="decision"
              value="approve"
              disabled={action.busy}
            >
              <Busy busy={action.busy}>{t.approveWork}</Busy>
              <Check size={16} />
            </button>
          </div>
        </form>
      )}
      {disputeAvailable && !disputeOpen && (
        <button className="text-button danger-text" onClick={() => setDisputeOpen(true)}>
          {t.dispute}
        </button>
      )}
      {disputeOpen && disputeAvailable && (
        <form
          className="detail-section"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void run('dispute', { reason: data.get('reason') }, t.disputeSent);
          }}
        >
          <label>
            {t.disputeReason}
            <textarea
              name="reason"
              required
              minLength={30}
              maxLength={2000}
              rows={4}
              placeholder={t.disputePlaceholder}
            />
          </label>
          <button className="button button-secondary" disabled={action.busy}>
            {t.dispute}
          </button>
        </form>
      )}
      <ErrorNotice message={action.error} />
    </Dialog>
  );
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  Clock3,
  Globe2,
  UsersRound,
  ListChecks,
  ShieldCheck,
} from 'lucide-react';
import { api, ApiError } from '@/lib/client';
import { messages, interestLabels, money, errorMessage, type Locale } from '@/lib/i18n';
import { quote } from '@/lib/domain/money';
import type { StudyView } from '@/lib/view-types';
import { Dialog, AppIcon, Busy, ErrorNotice, useAction, StatusBadge } from './ui';
import { QuotePanel } from './create-dialog';

type Applicant = {
  id: string;
  name: string;
  status: string;
  note: string;
  country: string;
  age: number;
  interests: string[];
  participation_id: string | null;
  participation_status: string | null;
};
type Detail = {
  study: StudyView;
  tasks: { id: string; instruction: string; position: number }[];
  applications: Applicant[];
  application: { id: string; status: string } | null;
  participation: { id: string; status: string } | null;
};
export function StudyDialog({
  id,
  locale,
  userId,
  mode,
  onClose,
  onUpdated,
  onParticipation,
  notify,
}: {
  id: string;
  locale: Locale;
  userId: string;
  mode: string;
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onParticipation: (id: string) => void;
  notify: (message: string) => void;
}) {
  const t = messages[locale];
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState('');
  const action = useAction(locale);
  const load = useCallback(async () => {
    try {
      setDetail(await api<Detail>(`studies/${id}`));
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
  const own = detail?.study.founder_id === userId;
  const s = detail?.study;
  return (
    <Dialog title={t.studyDetails} onClose={onClose} large>
      <ErrorNotice message={loadError} />
      {!detail || !s ? (
        <p className="dialog-loading">{t.loading}</p>
      ) : (
        <>
          <div className="study-dialog-title">
            <AppIcon
              variant={
                s.category === 'wellness'
                  ? 'peach'
                  : s.category === 'productivity'
                    ? 'lilac'
                    : 'sage'
              }
              size="large"
            />
            <div>
              <div className="app-name">
                {s.app_name}{' '}
                <span className="platform-label">
                  {s.platform === 'ios' ? 'iOS' : s.platform === 'android' ? 'Android' : 'Web'}
                </span>
              </div>
              <h3>{s.title}</h3>
            </div>
          </div>
          <div className="study-facts">
            <span>
              <Clock3 size={15} />
              {s.duration_days} {t.days}
            </span>
            <span>
              <UsersRound size={15} />
              {s.participants}/{s.seats} {t.testers}
            </span>
            <span>
              <ListChecks size={15} />
              {detail.tasks.length} {t.tasks}
            </span>
            <StatusBadge status={s.status} locale={locale} />
          </div>
          <div className="study-summary">
            <div>
              <h4>{t.objective}</h4>
              <p>{s.description}</p>
            </div>
            <div className="reward-callout">
              <span>{t.netReward}</span>
              <strong>{money(s.reward_cents, locale)}</strong>
              <small>USD · {t.perTester}</small>
            </div>
          </div>
          <section className="detail-section">
            <h4>{t.checklist}</h4>
            <ol className="task-list">
              {detail.tasks.map((task) => (
                <li key={task.id}>
                  <span>{task.position + 1}</span>
                  {task.instruction}
                </li>
              ))}
            </ol>
          </section>
          <section className="detail-section">
            <h4>{t.audienceLabel}</h4>
            <div className="chip-options">
              <span className="chip static">
                <Globe2 size={13} />
                {s.countries.length
                  ? s.countries
                      .map((c) => new Intl.DisplayNames([locale], { type: 'region' }).of(c))
                      .join(', ')
                  : t.countryWorldwide}
              </span>
              <span className="chip static">
                {s.minimum_age}–{s.maximum_age}
              </span>
              {s.gender !== 'any' && (
                <span className="chip static">{t[s.gender as 'woman' | 'man' | 'nonbinary']}</span>
              )}
              {s.required_interests.map((i) => (
                <span className="chip static" key={i}>
                  {interestLabels[locale][i]}
                </span>
              ))}
            </div>
          </section>
          <p className="info-note">
            <ShieldCheck size={16} />
            {t.rewardNotApproval}
          </p>
          {own && s.status === 'draft' && (
            <section className="detail-section">
              <QuotePanel
                q={quote({ rewardCents: s.reward_cents, seats: s.seats })}
                locale={locale}
              />
              <p className="fine-print">
                {mode === 'sandbox' ? t.sandboxFundHelp : t.liveUnavailable}
              </p>
              <button
                className="button button-primary full-width"
                disabled={action.busy || mode !== 'sandbox'}
                onClick={() =>
                  void action.run(async () => {
                    await api(`studies/${id}/sandbox-fund`, { method: 'POST' });
                    notify(t.fundSuccess);
                    await update();
                  })
                }
              >
                <Busy busy={action.busy}>{t.sandboxFund}</Busy>
                <ArrowRight size={16} />
              </button>
            </section>
          )}
          {own && s.status !== 'draft' && (
            <section className="detail-section">
              <div className="section-heading">
                <h4>{t.applicants}</h4>
                <span className="count-badge">{detail.applications.length}</span>
              </div>
              {detail.applications.length === 0 ? (
                <p className="muted">{t.noApplicants}</p>
              ) : (
                <div className="applicants-list">
                  {detail.applications.map((a) => (
                    <div className="applicant" key={a.id}>
                      <span className="avatar">{a.name.slice(0, 1)}</span>
                      <div className="applicant-info">
                        <strong>{a.name}</strong>
                        <span>
                          {a.country} · {a.age}
                        </span>
                        {a.note && <p>{a.note}</p>}
                      </div>
                      {a.status === 'applied' ? (
                        <div className="inline-actions">
                          <button
                            className="button button-small button-secondary"
                            disabled={action.busy}
                            onClick={() =>
                              void action.run(async () => {
                                await api(`applications/${a.id}/review`, {
                                  method: 'POST',
                                  body: { decision: 'reject' },
                                });
                                notify(t.applicantRejected);
                                await update();
                              })
                            }
                          >
                            {t.reject}
                          </button>
                          <button
                            className="button button-small button-primary"
                            disabled={action.busy}
                            onClick={() =>
                              void action.run(async () => {
                                await api(`applications/${a.id}/review`, {
                                  method: 'POST',
                                  body: { decision: 'accept' },
                                });
                                notify(t.applicantAccepted);
                                await update();
                              })
                            }
                          >
                            {t.accept}
                          </button>
                        </div>
                      ) : (
                        <div className="applicant-status">
                          <StatusBadge
                            status={a.participation_status || a.status}
                            locale={locale}
                          />
                          {a.participation_id && (
                            <button
                              className="text-button"
                              onClick={() => onParticipation(a.participation_id!)}
                            >
                              {t.reviewWork}
                              <ArrowRight size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {!own && detail.participation && (
            <div className="dialog-actions">
              <StatusBadge status={detail.participation.status} locale={locale} />
              <button
                className="button button-primary"
                onClick={() => onParticipation(detail.participation!.id)}
              >
                {t.myStudies}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {!own && !detail.participation && detail.application && (
            <div className="info-note">
              <Check size={17} />
              {t.applySuccess}
            </div>
          )}
          {!own && !detail.application && !detail.participation && (
            <form
              className="detail-section"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void action.run(async () => {
                  await api(`studies/${id}/apply`, {
                    method: 'POST',
                    body: { note: form.get('note') },
                  });
                  notify(t.applySuccess);
                  await update();
                });
              }}
            >
              <label>
                {t.applyNote}
                <textarea name="note" rows={3} maxLength={1000} placeholder={t.applyPlaceholder} />
              </label>
              <div className="dialog-actions">
                <span />
                {
                  <button className="button button-primary" disabled={action.busy}>
                    <Busy busy={action.busy}>{t.joinStudy}</Busy>
                    <ArrowRight size={16} />
                  </button>
                }
              </div>
            </form>
          )}
          <ErrorNotice message={action.error} />
        </>
      )}
    </Dialog>
  );
}

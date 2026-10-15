'use client';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/client';
import { quote, type Quote } from '@/lib/domain/money';
import { interests } from '@/lib/domain/schemas';
import { messages, interestLabels, money, type Locale } from '@/lib/i18n';
import { Dialog, Busy, ErrorNotice, useAction } from './ui';
import { CountryOptions } from './profile-dialog';

export function QuotePanel({ q, locale }: { q: Quote; locale: Locale }) {
  const t = messages[locale];
  return (
    <div className="quote-panel">
      <div className="quote-heading">
        <ShieldCheck size={20} />
        <span>{t.quoteTitle}</span>
      </div>
      <p>{t.quoteDescription}</p>
      <dl>
        {(
          [
            ['rewardBudget', 'rewardBudgetCents'],
            ['serviceFee', 'serviceFeeCents'],
            ['payoutReserve', 'payoutReserveCents'],
            ['riskReserve', 'riskReserveCents'],
            ['collectionEstimate', 'collectionEstimateCents'],
          ] as const
        ).map(([label, key]) => (
          <div key={key}>
            <dt>{t[label]}</dt>
            <dd>{money(q[key], locale)}</dd>
          </div>
        ))}
        <div className="quote-total">
          <dt>
            {t.total} <small>USD</small>
          </dt>
          <dd>{money(q.totalCents, locale)}</dd>
        </div>
      </dl>
      <p className="fine-print">{t.feeNote}</p>
    </div>
  );
}
export function CreateDialog({
  locale,
  onClose,
  onCreated,
}: {
  locale: Locale;
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const t = messages[locale];
  const [step, setStep] = useState(0);
  const action = useAction(locale);
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({
    title: '',
    appName: '',
    description: '',
    platform: 'android',
    kind: 'closed_test',
    category: 'wellness',
    rewardCents: 1500,
    seats: 20,
    durationDays: 14,
    country: '',
    minimumAge: 18,
    maximumAge: 100,
    gender: 'any',
    inviteUrl: '',
    taskText: '',
  });
  const [requiredInterests, setRequiredInterests] = useState<string[]>([]);
  const update = (key: string, value: string | number) =>
    setValues((v) => ({ ...v, [key]: value }));
  const q = quote({
    rewardCents: Math.max(500, Math.min(50000, values.rewardCents || 500)),
    seats: Math.max(1, Math.min(200, values.seats || 1)),
  });
  return (
    <Dialog title={t.createStudy} onClose={onClose} large>
      <div className="wizard-steps">
        {[t.appDetails, t.audience, t.review].map((label, i) => (
          <div className={step === i ? 'current' : step > i ? 'done' : ''} key={label}>
            <span>{step > i ? <Check size={12} /> : i + 1}</span>
            {label}
          </div>
        ))}
      </div>
      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 2) {
            setStep(step + 1);
            return;
          }
          void action.run(async () => {
            const result = await api<{ id: string }>('studies', {
              method: 'POST',
              body: {
                ...values,
                countries: values.country ? [values.country] : [],
                requiredInterests,
                tasks: values.taskText
                  .split('\n')
                  .map((t) => t.trim())
                  .filter(Boolean),
              },
            });
            await onCreated(result.id);
          });
        }}
      >
        {step === 0 && (
          <div className="form-step">
            <div className="form-grid">
              <label>
                {t.appName}
                <input
                  required
                  minLength={2}
                  maxLength={60}
                  value={values.appName}
                  onChange={(e) => update('appName', e.target.value)}
                  placeholder={t.appPlaceholder}
                />
              </label>
              <label>
                {t.platform}
                <select
                  value={values.platform}
                  onChange={(e) => {
                    update('platform', e.target.value);
                    if (e.target.value !== 'android') update('kind', 'usability');
                  }}
                >
                  {(['android', 'ios', 'web'] as const).map((p) => (
                    <option key={p} value={p}>
                      {t[p]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {t.studyName}
              <input
                required
                minLength={4}
                maxLength={100}
                value={values.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder={t.titlePlaceholder}
              />
            </label>
            <label>
              {t.description}
              <textarea
                rows={4}
                required
                minLength={30}
                maxLength={2000}
                value={values.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder={t.descriptionPlaceholder}
              />
            </label>
            <div className="form-grid">
              <label>
                {t.kind}
                <select
                  value={values.kind}
                  onChange={(e) => {
                    update('kind', e.target.value);
                    if (e.target.value === 'closed_test') {
                      update('seats', Math.max(values.seats, 12));
                      update('durationDays', Math.max(values.durationDays, 14));
                    }
                  }}
                >
                  <option value="usability">{t.usability}</option>
                  {values.platform === 'android' && (
                    <option value="closed_test">{t.closedTest}</option>
                  )}
                </select>
              </label>
              <label>
                {t.category}
                <select
                  value={values.category}
                  onChange={(e) => update('category', e.target.value)}
                >
                  {interests.map((i) => (
                    <option key={i} value={i}>
                      {interestLabels[locale][i]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {values.kind === 'closed_test' && <div className="info-note">{t.closedTestNote}</div>}
          </div>
        )}
        {step === 1 && (
          <div className="form-step">
            <div className="form-grid three">
              <label>
                {t.participantCount}
                <input
                  type="number"
                  required
                  min={values.kind === 'closed_test' ? 12 : 1}
                  max={200}
                  value={values.seats || ''}
                  onChange={(e) => update('seats', Number(e.target.value))}
                />
              </label>
              <label>
                {t.rewardAmount}
                <input
                  type="number"
                  required
                  min={5}
                  max={500}
                  step="0.01"
                  value={values.rewardCents / 100 || ''}
                  onChange={(e) => update('rewardCents', Math.round(Number(e.target.value) * 100))}
                />
              </label>
              <label>
                {t.studyDuration}
                <input
                  type="number"
                  required
                  min={values.kind === 'closed_test' ? 14 : 1}
                  max={45}
                  value={values.durationDays || ''}
                  onChange={(e) => update('durationDays', Number(e.target.value))}
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                {t.targetCountry}
                <select value={values.country} onChange={(e) => update('country', e.target.value)}>
                  <option value="">{t.allCountries}</option>
                  <CountryOptions locale={locale} />
                </select>
              </label>
              <label>
                {t.gender}
                <select value={values.gender} onChange={(e) => update('gender', e.target.value)}>
                  {(['any', 'woman', 'man', 'nonbinary'] as const).map((g) => (
                    <option key={g} value={g}>
                      {g === 'any' ? t.anyGender : t[g]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                {t.minAge}
                <input
                  type="number"
                  required
                  min={18}
                  max={100}
                  value={values.minimumAge}
                  onChange={(e) => update('minimumAge', Number(e.target.value))}
                />
              </label>
              <label>
                {t.maxAge}
                <input
                  type="number"
                  required
                  min={values.minimumAge}
                  max={100}
                  value={values.maximumAge}
                  onChange={(e) => update('maximumAge', Number(e.target.value))}
                />
              </label>
            </div>
            <fieldset>
              <legend>{t.interests}</legend>
              <div className="chip-options">
                {interests.map((i) => (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={requiredInterests.includes(i)}
                    className={`chip ${requiredInterests.includes(i) ? 'selected' : ''}`}
                    onClick={() =>
                      setRequiredInterests((v) =>
                        v.includes(i) ? v.filter((x) => x !== i) : v.length < 5 ? [...v, i] : v,
                      )
                    }
                  >
                    {interestLabels[locale][i]}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        )}
        {step === 2 && (
          <div className="form-step">
            <label>
              {t.invitation}
              <input
                name="invite"
                type="url"
                required
                maxLength={1000}
                pattern="https://.*"
                value={values.inviteUrl}
                onChange={(e) => update('inviteUrl', e.target.value)}
                placeholder="https://…"
              />
              <span className="field-hint">{t.invitationHint}</span>
            </label>
            <label>
              {t.taskPlan}
              <textarea
                required
                rows={4}
                minLength={8}
                maxLength={2400}
                value={values.taskText}
                onChange={(e) => update('taskText', e.target.value)}
                placeholder={t.taskPlaceholder}
              />
              <span className="field-hint">{t.taskHint}</span>
            </label>
            <QuotePanel q={q} locale={locale} />
            <p className="fine-print">
              {t.fundsNote} {t.rewardNotApproval}
            </p>
          </div>
        )}
        <ErrorNotice message={action.error} />
        <div className="dialog-actions">
          {step > 0 ? (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={16} />
              {t.back}
            </button>
          ) : (
            <span />
          )}
          <button className="button button-primary" disabled={action.busy}>
            <Busy busy={action.busy}>{step < 2 ? t.continue : t.createDraft}</Busy>
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}

'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '@/lib/client';
import { interests, type TesterProfile } from '@/lib/domain/schemas';
import { messages, interestLabels, type Locale } from '@/lib/i18n';
import { Dialog, Busy, ErrorNotice, useAction } from './ui';

export const countryCodes =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' ',
  );
export function CountryOptions({ locale }: { locale: Locale }) {
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  return (
    <>
      {[...countryCodes]
        .sort((a, b) => (names.of(a) || a).localeCompare(names.of(b) || b, locale))
        .map((c) => (
          <option value={c} key={c}>
            {names.of(c) || c}
          </option>
        ))}
    </>
  );
}
export function ProfileDialog({
  locale,
  profile,
  onClose,
  onSaved,
}: {
  locale: Locale;
  profile?: TesterProfile | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = messages[locale];
  const [selected, setSelected] = useState<string[]>(profile?.interests || []);
  const [devices, setDevices] = useState<string[]>(profile?.platforms || ['android']);
  const action = useAction(locale);
  const toggle = (list: string[], key: string) =>
    list.includes(key) ? list.filter((v) => v !== key) : [...list, key];
  return (
    <Dialog title={t.onboardingTitle} onClose={onClose} large>
      <p className="dialog-description">{t.onboardingDescription}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          void action.run(async () => {
            await api('profile', {
              method: 'PUT',
              body: {
                country: form.get('country'),
                age: Number(form.get('age')),
                gender: form.get('gender'),
                interests: selected,
                platforms: devices,
                matchingConsent: form.get('consent') === 'on',
              },
            });
            await onSaved();
          });
        }}
      >
        <div className="form-grid">
          <label>
            {t.country}
            <select name="country" defaultValue={profile?.country || 'CL'} required>
              <CountryOptions locale={locale} />
            </select>
          </label>
          <label>
            {t.age}
            <input
              name="age"
              type="number"
              min="18"
              max="100"
              required
              defaultValue={profile?.age || ''}
            />
          </label>
        </div>
        <label>
          {t.gender}
          <select name="gender" defaultValue={profile?.gender || 'undisclosed'}>
            {(['undisclosed', 'woman', 'man', 'nonbinary'] as const).map((g) => (
              <option value={g} key={g}>
                {t[g]}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>{t.devices}</legend>
          <div className="chip-options">
            {(['android', 'ios', 'web'] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={devices.includes(d)}
                className={`chip ${devices.includes(d) ? 'selected' : ''}`}
                onClick={() => setDevices(toggle(devices, d))}
              >
                {devices.includes(d) && <Check size={13} />} {t[d]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{t.interests}</legend>
          <div className="chip-options">
            {interests.map((i) => (
              <button
                key={i}
                type="button"
                aria-pressed={selected.includes(i)}
                className={`chip ${selected.includes(i) ? 'selected' : ''}`}
                onClick={() => setSelected(toggle(selected, i))}
              >
                {interestLabels[locale][i]}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="checkbox-label">
          <input
            name="consent"
            type="checkbox"
            defaultChecked={profile?.matchingConsent ?? false}
          />
          <span>{t.consent}</span>
        </label>
        <ErrorNotice message={action.error} />
        <div className="dialog-actions">
          <span className="fine-print">{t.adultsOnly}</span>
          <button className="button button-primary" disabled={action.busy || devices.length === 0}>
            <Busy busy={action.busy}>{t.save}</Busy>
          </button>
        </div>
      </form>
    </Dialog>
  );
}

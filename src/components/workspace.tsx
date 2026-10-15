'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Compass,
  FlaskConical,
  Globe2,
  LayoutGrid,
  Layers3,
  LogOut,
  Menu,
  MessageSquareText,
  Plus,
  Search,
  ShieldCheck,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react';
import { api, ApiError } from '@/lib/client';
import { examples, type Example } from '@/lib/examples';
import { interestLabels, messages, money, type Locale } from '@/lib/i18n';
import type { DashboardView, ParticipationView, StudyView } from '@/lib/view-types';
import { AppIcon, Busy, Dialog, EmptyState, ErrorNotice, Logo, StatusBadge, useAction } from './ui';
import { AuthDialog } from './auth-dialog';
import { ProfileDialog } from './profile-dialog';
import { CreateDialog } from './create-dialog';
import { StudyDialog } from './study-dialog';
import { ParticipationDialog } from './participation-dialog';

type View = 'discover' | 'studies' | 'wallet';
type Modal = 'create' | 'profile' | 'how' | 'trust' | 'account' | null;
type Selection = { type: 'study' | 'participation'; id: string } | null;
const categoryColor: Record<string, string> = {
  wellness: 'peach',
  productivity: 'lilac',
  food: 'butter',
  design: 'blue',
  finance: 'sage',
  education: 'rose',
};

export function Workspace({
  locale,
  requiresAuth = false,
}: {
  locale: Locale;
  requiresAuth?: boolean;
}) {
  const t = messages[locale];
  const router = useRouter();
  const action = useAction(locale);
  const [data, setData] = useState<DashboardView | null>(null);
  const [checking, setChecking] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<View>('discover');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [sample, setSample] = useState<Example | null>(null);
  const [auth, setAuth] = useState<{
    mode: 'register' | 'login';
    role: 'founder' | 'tester';
  } | null>(null);
  const [afterAuth, setAfterAuth] = useState<string>();
  const [toast, setToast] = useState('');
  const [google, setGoogle] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const refresh = useCallback(async () => {
    const next = await api<DashboardView>('dashboard');
    setData(next);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem('pilotlane_locale', locale);
    void api<{ google: boolean }>('capabilities')
      .then((v) => setGoogle(v.google))
      .catch(() => {});
    void refresh()
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          if (requiresAuth) setAuth({ mode: 'login', role: 'tester' });
        } else setLoadError(true);
      })
      .finally(() => setChecking(false));
  }, [refresh, locale, requiresAuth]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const actor = data?.actor;
  const founder = actor?.role === 'founder';
  const requestAuth = (mode: 'register' | 'login', role: 'founder' | 'tester', intent?: string) => {
    setAfterAuth(intent);
    setAuth({ mode, role });
  };
  const navigate = (next: View) => {
    setMobileNav(false);
    setSearch('');
    setFilter('all');
    if (!actor && next !== 'discover') {
      requestAuth('login', 'tester', next);
      return;
    }
    setView(next);
  };
  const create = () => {
    if (!actor) {
      requestAuth('register', 'founder', 'create');
      return;
    }
    if (founder) setModal('create');
  };
  const authSuccess = async () => {
    const next = await api<DashboardView>('dashboard');
    setData(next);
    setAuth(null);
    window.history.replaceState(null, '', `/${locale}/workspace`);
    if (afterAuth === 'create' && next.actor.role === 'founder') setModal('create');
    else if (next.actor.role === 'tester' && !next.profile) setModal('profile');
    if (afterAuth === 'studies' || afterAuth === 'wallet') setView(afterAuth);
    setAfterAuth(undefined);
  };
  const signOut = () =>
    void action.run(async () => {
      await api('auth/logout', { method: 'POST' });
      setData(null);
      setView('discover');
      setSelection(null);
      router.replace(`/${locale}`);
    });
  const title =
    view === 'wallet'
      ? t.wallet
      : view === 'studies'
        ? t.myStudies
        : founder
          ? t.overview
          : t.discover;
  const publicFiltered = examples.filter(
    (e) =>
      (filter === 'all' || e.platform === filter) &&
      `${e.app} ${e.title[locale]} ${e.description[locale]}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const studies = (data?.studies || []).filter(
    (s) =>
      (filter === 'all' || s.platform === filter || s.status === filter) &&
      `${s.app_name} ${s.title} ${s.description}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {locale === 'es' ? 'Saltar al contenido' : 'Skip to content'}
      </a>
      {mobileNav && <div className="nav-overlay" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <Link className="brand" href={`/${locale}`} aria-label="Pilotlane">
          <Logo />
        </Link>
        <div className="workspace-switch">
          <span className="workspace-symbol">
            <Layers3 size={16} />
          </span>
          <div>
            <strong>Pilotlane</strong>
            <span>{founder ? t.founderSpace : actor ? t.testerSpace : t.publicSpace}</span>
          </div>
          <span className="workspace-chevron">
            <LayoutGrid size={12} />
          </span>
        </div>
        <div className="nav-label">{t.workspace}</div>
        <nav className="primary-nav" aria-label={t.workspace}>
          <button
            aria-label={founder ? t.overview : t.discover}
            className={view === 'discover' ? 'nav-item current' : 'nav-item'}
            onClick={() => navigate('discover')}
          >
            <Compass size={18} />
            <span>{founder ? t.overview : t.discover}</span>
            {view === 'discover' && <span className="nav-dot" />}
          </button>
          <button
            aria-label={t.myStudies}
            className={view === 'studies' ? 'nav-item current' : 'nav-item'}
            onClick={() => navigate('studies')}
          >
            <Layers3 size={18} />
            <span>{t.myStudies}</span>
            {data && (founder ? data.studies.length : data.participations?.length || 0) > 0 && (
              <span className="nav-count">
                {founder ? data.studies.length : data.participations?.length}
              </span>
            )}
          </button>
          {!founder && (
            <button
              aria-label={t.wallet}
              className={view === 'wallet' ? 'nav-item current' : 'nav-item'}
              onClick={() => navigate('wallet')}
            >
              <Wallet size={18} />
              <span>{t.wallet}</span>
            </button>
          )}
        </nav>
        <div className="nav-label resources-label">{t.resources}</div>
        <nav className="primary-nav" aria-label={t.resources}>
          <button aria-label={t.howItWorks} className="nav-item" onClick={() => setModal('how')}>
            <MessageSquareText size={18} />
            <span>{t.howItWorks}</span>
            <ArrowUpRight size={13} />
          </button>
          <button aria-label={t.trust} className="nav-item" onClick={() => setModal('trust')}>
            <ShieldCheck size={18} />
            <span>{t.trust}</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="small-leaf">
              <ArrowUpRight size={25} strokeWidth={1.3} />
            </span>
            <strong>{t.tagline}</strong>
            <p>{t.heroNote}</p>
          </div>
          {actor ? (
            <div className="user-menu">
              <button
                className="user-profile"
                onClick={() => setModal(founder ? 'account' : 'profile')}
              >
                <span className="avatar">{actor.name.slice(0, 1).toUpperCase()}</span>
                <span>
                  <strong>{actor.name}</strong>
                  <small>{founder ? t.founderSpace : t.testerSpace}</small>
                </span>
              </button>
              <button
                className="icon-button"
                onClick={signOut}
                aria-label={t.signOut}
                title={t.signOut}
              >
                <LogOut size={17} />
              </button>
            </div>
          ) : (
            <button className="sidebar-signin" onClick={() => requestAuth('login', 'tester')}>
              <span className="avatar guest">
                <UsersRound size={17} />
              </span>
              <span>{t.signIn}</span>
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label={t.workspace}
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-brand">Pilotlane</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <div className="language-switch" aria-label={t.language}>
              <Link
                href={`/en${requiresAuth ? '/workspace' : ''}`}
                className={locale === 'en' ? 'selected' : ''}
                aria-label="English"
                aria-current={locale === 'en' ? 'true' : undefined}
              >
                EN
              </Link>
              <Link
                href={`/es${requiresAuth ? '/workspace' : ''}`}
                className={locale === 'es' ? 'selected' : ''}
                aria-label="Español"
                aria-current={locale === 'es' ? 'true' : undefined}
              >
                ES
              </Link>
            </div>
            <span className="topbar-divider" />
            {actor ? (
              <>
                <span className="mode-badge">
                  <FlaskConical size={12} />
                  {data?.capabilities.mode === 'sandbox' ? t.sandbox : 'USD'}
                </span>
                {founder && (
                  <button className="button button-primary button-small" onClick={create}>
                    <Plus size={15} />
                    {t.newStudy}
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  className="text-button top-signin"
                  onClick={() => requestAuth('login', 'tester')}
                >
                  {t.signIn}
                </button>
                <button
                  className="button button-primary button-small"
                  onClick={() => requestAuth('register', 'tester')}
                >
                  {t.join}
                  <ArrowRight size={14} />
                </button>
              </>
            )}
          </div>
        </header>
        <main id="main-content" className="main-content">
          {loadError && (
            <div className="error-notice" role="alert">
              {t.networkError}{' '}
              <button
                className="text-button"
                onClick={() => {
                  setLoadError(false);
                  void refresh().catch(() => setLoadError(true));
                }}
              >
                {t.retry}
              </button>
            </div>
          )}
          {checking && requiresAuth ? (
            <div className="loading-state">{t.loading}</div>
          ) : (
            <>
              {!actor && (
                <>
                  <section className="hero">
                    <div className="hero-copy">
                      <span className="eyebrow">
                        <span />
                        {t.eyebrow}
                      </span>
                      <h1>
                        {t.heroTitle.split('\n').map((line, i) => (
                          <span key={i}>{line}</span>
                        ))}
                      </h1>
                      <p>{t.heroDescription}</p>
                      <div className="hero-actions">
                        <button className="button button-primary" onClick={create}>
                          {t.heroPrimary}
                          <ArrowRight size={16} />
                        </button>
                        <button
                          className="button button-quiet"
                          onClick={() => requestAuth('register', 'tester', 'profile')}
                        >
                          {t.heroSecondary}
                          <ArrowUpRight size={16} />
                        </button>
                      </div>
                      <div className="hero-footnote">
                        <ShieldCheck size={13} />
                        {t.heroNote}
                      </div>
                    </div>
                    <div className="hero-visual" aria-hidden="true">
                      <div className="visual-orbit orbit-one" />
                      <div className="visual-orbit orbit-two" />
                      <div className="floating-app floating-one">
                        <AppIcon variant="peach" size="large" />
                      </div>
                      <div className="floating-app floating-two">
                        <AppIcon variant="lilac" />
                      </div>
                      <div className="visual-card">
                        <span className="visual-eyebrow">PILOTLANE</span>
                        <span className="visual-mark">
                          <ArrowUpRight size={43} strokeWidth={1.1} />
                        </span>
                        <strong>
                          {locale === 'es' ? 'Una nueva\nperspectiva.' : 'A fresh\nperspective.'}
                        </strong>
                        <div className="visual-rule" />
                        <div className="visual-person">
                          <span className="person-dot">
                            <Check size={12} />
                          </span>
                          <span>
                            {locale === 'es'
                              ? 'Personas reales. Buenas ideas.'
                              : 'Real people. Thoughtful feedback.'}
                          </span>
                        </div>
                      </div>
                      <span className="visual-caption">
                        {locale === 'es' ? 'HECHO PARA MEJORAR.' : 'MADE TO GET BETTER.'}
                      </span>
                    </div>
                  </section>
                  <section className="principles-strip">
                    <div>
                      <span>01</span>
                      <strong>{t.how1}</strong>
                    </div>
                    <div>
                      <span>02</span>
                      <strong>{t.how2}</strong>
                    </div>
                    <div>
                      <span>03</span>
                      <strong>{t.how3}</strong>
                    </div>
                  </section>
                </>
              )}
              {actor && view !== 'wallet' && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        {t.welcome}, {actor.name.split(' ')[0]} <span className="welcome-dot" />
                      </span>
                      <h1>{founder ? t.allFounder : t.testerTitle}</h1>
                      <p>{founder ? t.founderDescription : t.testerDescription}</p>
                    </div>
                    {founder && (
                      <button className="button button-primary" onClick={create}>
                        <Plus size={16} />
                        {t.createStudy}
                      </button>
                    )}
                  </div>
                  <div className="stats-grid">
                    {(founder
                      ? [
                          [t.activeStudies, data?.stats.activeStudies || 0],
                          [t.participants, data?.stats.participants || 0],
                          [t.budgetCommitted, money(data?.stats.committedCents || 0, locale)],
                          [t.awaitingReview, data?.stats.awaitingReview || 0],
                        ]
                      : [
                          [t.activeStudies, data?.stats.activeStudies || 0],
                          [t.matchedStudies, data?.stats.matchingStudies || 0],
                          [t.pendingRewards, money(data?.stats.pendingCents || 0, locale)],
                          [t.paidRewards, money(data?.stats.paidCents || 0, locale)],
                        ]
                    ).map(([label, value], i) => (
                      <div className="stat" key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                        <span className="stat-marker">
                          {i < 2 ? <Layers3 size={15} /> : <Wallet size={15} />}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {actor && data?.capabilities.mode === 'sandbox' && (
                <div className="sandbox-banner">
                  <FlaskConical size={15} />
                  {t.sandboxNotice}
                </div>
              )}
              {actor?.role === 'tester' &&
                !data?.profile?.matchingConsent &&
                view === 'discover' && (
                  <div className="onboarding-card">
                    <span className="onboarding-icon">
                      <UsersRound size={23} />
                    </span>
                    <div>
                      <h3>{t.onboardingTitle}</h3>
                      <p>{t.onboardingDescription}</p>
                    </div>
                    <button
                      className="button button-primary button-small"
                      onClick={() => setModal('profile')}
                    >
                      {t.completeProfile}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              {view === 'wallet' && data ? (
                <section>
                  <div className="page-heading wallet-heading">
                    <div>
                      <span className="eyebrow">PILOTLANE / {t.wallet}</span>
                      <h1>{t.walletTitle}</h1>
                      <p>{t.walletDescription}</p>
                    </div>
                    <span className="wallet-emblem">
                      <Wallet size={32} strokeWidth={1.3} />
                    </span>
                  </div>
                  <div className="wallet-balances">
                    <div>
                      <span>{t.pendingRewards}</span>
                      <strong>
                        {money(data.wallet?.pendingCents || 0, locale)}
                        <small>USD</small>
                      </strong>
                    </div>
                    <div>
                      <span>{t.paidRewards}</span>
                      <strong>
                        {money(data.wallet?.paidCents || 0, locale)}
                        <small>USD</small>
                      </strong>
                    </div>
                  </div>
                  <p className="info-note">
                    <ShieldCheck size={16} />
                    {t.payoutNote}
                  </p>
                  {!data.wallet?.rewards.length ? (
                    <EmptyState title={t.noRewards} description={t.noRewardsText} />
                  ) : (
                    <div className="table-wrapper">
                      <table>
                        <thead>
                          <tr>
                            <th>{t.study}</th>
                            <th>{t.amount}</th>
                            <th>{t.status}</th>
                            <th>
                              <span className="sr-only">{t.simulatePayout}</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.wallet.rewards.map((r) => (
                            <tr key={r.id}>
                              <td>
                                <strong>{r.app_name}</strong>
                                <span className="table-subtitle">{r.title}</span>
                              </td>
                              <td>
                                {money(r.amount_cents, locale)} <small>USD</small>
                              </td>
                              <td>
                                <StatusBadge status={r.status} locale={locale} />
                              </td>
                              <td>
                                {r.status === 'pending' && r.app_mode === 'sandbox' && (
                                  <button
                                    className="button button-secondary button-small"
                                    disabled={action.busy}
                                    onClick={() =>
                                      void action.run(async () => {
                                        await api(`rewards/${r.id}/sandbox-payout`, {
                                          method: 'POST',
                                        });
                                        await refresh();
                                        setToast(t.payoutDone);
                                      })
                                    }
                                  >
                                    <Busy busy={action.busy}>{t.simulatePayout}</Busy>
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ) : view === 'studies' && actor && !founder ? (
                <section className="studies-section">
                  <div className="section-heading">
                    <h2>{t.myStudies}</h2>
                    <span className="count-badge">{data?.participations?.length || 0}</span>
                  </div>
                  {!data?.participations?.length ? (
                    <EmptyState
                      title={t.noParticipations}
                      description={t.noParticipationsText}
                      action={
                        <button
                          className="button button-secondary"
                          onClick={() => navigate('discover')}
                        >
                          {t.discover}
                          <ArrowRight size={15} />
                        </button>
                      }
                    />
                  ) : (
                    <div className="participations-grid">
                      {data.participations.map((p) => (
                        <ParticipationCard
                          key={p.id}
                          p={p}
                          locale={locale}
                          onClick={() => setSelection({ type: 'participation', id: p.id })}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ) : (
                <section className="studies-section">
                  <div className="section-heading study-section-heading">
                    <div>
                      <div className="section-title-line">
                        <h2>{actor ? (founder ? t.myStudies : t.matched) : t.featured}</h2>
                        <span className="count-badge">
                          {actor ? studies.length : publicFiltered.length}
                        </span>
                      </div>
                      <p>
                        {actor
                          ? founder
                            ? t.fundsNote
                            : t.matchedDescription
                          : t.featuredDescription}
                      </p>
                    </div>
                    {actor?.role === 'tester' && (
                      <button className="text-button" onClick={() => setModal('profile')}>
                        {t.editProfile}
                        <ArrowUpRight size={14} />
                      </button>
                    )}
                  </div>
                  <div className="study-controls">
                    <div className="filter-tabs" role="group" aria-label={t.platform}>
                      {['all', 'android', 'ios', 'web'].map((f) => (
                        <button
                          key={f}
                          className={filter === f ? 'selected' : ''}
                          aria-pressed={filter === f}
                          onClick={() => setFilter(f)}
                        >
                          {t[f as 'all' | 'android' | 'ios' | 'web']}
                        </button>
                      ))}
                    </div>
                    <label className="search-input">
                      <Search size={16} />
                      <input
                        type="search"
                        aria-label={t.searchLabel}
                        placeholder={t.search}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <span className="search-shortcut">⌕</span>
                    </label>
                  </div>
                  {!actor && (
                    <div className="sample-notice">
                      <span />
                      {t.sampleBanner}
                    </div>
                  )}
                  {actor ? (
                    studies.length ? (
                      <div className="study-grid">
                        {studies.map((s) => (
                          <StudyCard
                            key={s.id}
                            study={s}
                            locale={locale}
                            onClick={() => setSelection({ type: 'study', id: s.id })}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        title={founder ? t.noStudies : t.noResults}
                        description={founder ? t.noStudiesText : t.noResultsText}
                        action={
                          founder ? (
                            <button className="button button-primary" onClick={create}>
                              <Plus size={15} />
                              {t.createStudy}
                            </button>
                          ) : undefined
                        }
                      />
                    )
                  ) : publicFiltered.length ? (
                    <div className="study-grid">
                      {publicFiltered.map((e) => (
                        <ExampleCard
                          key={e.key}
                          example={e}
                          locale={locale}
                          onClick={() => setSample(e)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState title={t.noResults} description={t.noResultsText} />
                  )}
                </section>
              )}
            </>
          )}
          <ErrorNotice message={action.error} />
          <footer className="main-footer">
            <Logo small />
            <span>pilotlane.</span>
            <span className="footer-tagline">{t.tagline}</span>
            <button className="text-button" onClick={() => setModal('trust')}>
              {t.trust}
              <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={15} />
          </span>
          {toast}
          <button className="icon-button" aria-label={t.close} onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {auth && (
        <AuthDialog
          key={`${auth.mode}-${auth.role}`}
          locale={locale}
          initialMode={auth.mode}
          initialRole={auth.role}
          google={google}
          onClose={() => setAuth(null)}
          onSuccess={authSuccess}
        />
      )}
      {modal === 'profile' && (
        <ProfileDialog
          locale={locale}
          profile={data?.profile}
          onClose={() => setModal(null)}
          onSaved={async () => {
            await refresh();
            setModal(null);
            setToast(t.profileSaved);
          }}
        />
      )}
      {modal === 'create' && (
        <CreateDialog
          locale={locale}
          onClose={() => setModal(null)}
          onCreated={async (id) => {
            await refresh();
            setModal(null);
            setSelection({ type: 'study', id });
            setToast(t.draftCreated);
          }}
        />
      )}
      {(modal === 'how' || modal === 'trust') && (
        <Dialog
          title={modal === 'how' ? t.howTitle : t.trustTitle}
          onClose={() => setModal(null)}
          large
        >
          <p className="dialog-description">
            {modal === 'how' ? t.howDescription : t.trustDescription}
          </p>
          <div className="resource-steps">
            {(modal === 'how'
              ? [
                  [t.how1, t.how1Text],
                  [t.how2, t.how2Text],
                  [t.how3, t.how3Text],
                ]
              : [
                  [t.trust1, t.trust1Text],
                  [t.trust2, t.trust2Text],
                  [t.trust3, t.trust3Text],
                ]
            ).map(([heading, text], i) => (
              <div key={heading}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{heading}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="info-note">{t.sandboxNotice}</p>
        </Dialog>
      )}
      {modal === 'account' && actor && (
        <Dialog title={t.profileTab} onClose={() => setModal(null)}>
          <div className="account-details">
            <span className="avatar large-avatar">{actor.name[0]}</span>
            <h3>{actor.name}</h3>
            <p>{actor.email}</p>
            <StatusBadge status={actor.role} locale={locale} />
          </div>
        </Dialog>
      )}
      {sample && (
        <Dialog title={t.sample} onClose={() => setSample(null)}>
          <div className="sample-detail">
            <AppIcon variant={sample.color} size="large" />
            <h3>{sample.app}</h3>
            <h4>{sample.title[locale]}</h4>
            <p>{sample.description[locale]}</p>
            <div className="study-facts">
              <span>
                <Clock3 size={15} />
                {sample.days} {t.days}
              </span>
              <span>
                {money(sample.reward, locale)} USD · {t.perTester}
              </span>
            </div>
            <p className="info-note">{t.sampleDetails}</p>
            <button
              className="button button-primary full-width"
              onClick={() => {
                setSample(null);
                requestAuth('register', 'tester', 'profile');
              }}
            >
              {t.join}
              <ArrowRight size={15} />
            </button>
          </div>
        </Dialog>
      )}
      {selection &&
        actor &&
        (selection.type === 'study' ? (
          <StudyDialog
            key={selection.id}
            id={selection.id}
            locale={locale}
            userId={actor.id}
            mode={data!.capabilities.mode}
            onClose={() => setSelection(null)}
            onUpdated={refresh}
            notify={setToast}
            onParticipation={(id) => setSelection({ type: 'participation', id })}
          />
        ) : (
          <ParticipationDialog
            key={selection.id}
            id={selection.id}
            locale={locale}
            userId={actor.id}
            onClose={() => setSelection(null)}
            onUpdated={refresh}
            notify={setToast}
          />
        ))}
    </div>
  );
}

function ExampleCard({
  example: e,
  locale,
  onClick,
}: {
  example: Example;
  locale: Locale;
  onClick: () => void;
}) {
  const t = messages[locale];
  return (
    <button className="study-card" onClick={onClick}>
      <div className="card-top">
        <AppIcon variant={e.color} />
        <span className="sample-tag">{t.sample}</span>
      </div>
      <div className="card-app-row">
        <span className="card-app-name">{e.app}</span>
        <span className="card-platform">
          {e.platform === 'ios' ? 'iOS' : e.platform === 'android' ? 'Android' : 'Web'}
        </span>
      </div>
      <h3>{e.title[locale]}</h3>
      <p className="card-description">{e.description[locale]}</p>
      <div className="card-tags">
        <span>{interestLabels[locale][e.category]}</span>
        <span>
          <Clock3 size={12} />
          {e.days} {t.days}
        </span>
      </div>
      <div className="card-bottom">
        <div>
          <strong>{money(e.reward, locale)}</strong>
          <span>USD · {t.perTester}</span>
        </div>
        <span className="card-arrow">
          <ArrowUpRight size={18} />
        </span>
      </div>
    </button>
  );
}
function StudyCard({
  study: s,
  locale,
  onClick,
}: {
  study: StudyView;
  locale: Locale;
  onClick: () => void;
}) {
  const t = messages[locale];
  return (
    <button className="study-card" onClick={onClick}>
      <div className="card-top">
        <AppIcon variant={categoryColor[s.category] || 'sage'} />
        <StatusBadge status={s.status} locale={locale} />
      </div>
      <div className="card-app-row">
        <span className="card-app-name">{s.app_name}</span>
        <span className="card-platform">
          {s.platform === 'ios' ? 'iOS' : s.platform === 'android' ? 'Android' : 'Web'}
        </span>
      </div>
      <h3>{s.title}</h3>
      <p className="card-description">{s.description}</p>
      <div className="card-tags">
        <span>
          <UsersRound size={12} />
          {s.participants}/{s.seats} {t.testers}
        </span>
        <span>
          <Clock3 size={12} />
          {s.duration_days} {t.days}
        </span>
      </div>
      <div className="card-bottom">
        <div>
          <strong>{money(s.reward_cents, locale)}</strong>
          <span>USD · {t.perTester}</span>
        </div>
        <span className="card-arrow">
          <ArrowUpRight size={18} />
        </span>
      </div>
    </button>
  );
}
function ParticipationCard({
  p,
  locale,
  onClick,
}: {
  p: ParticipationView;
  locale: Locale;
  onClick: () => void;
}) {
  const t = messages[locale];
  return (
    <button className="participation-card" onClick={onClick}>
      <div className="card-top">
        <div className="participation-app">
          <AppIcon size="small" />
          <strong>{p.app_name}</strong>
        </div>
        <StatusBadge status={p.status} locale={locale} />
      </div>
      <h3>{p.title}</h3>
      <div className="progress-track">
        <span style={{ width: `${Math.min(100, (p.check_in_count / p.duration_days) * 100)}%` }} />
      </div>
      <div className="participation-card-facts">
        <span>
          {p.check_in_count}/{p.duration_days} {t.days}
        </span>
        <span>
          {p.completed_tasks}/{p.task_count} {t.tasks}
        </span>
        <strong>{money(p.reward_cents, locale)}</strong>
      </div>
      <span className="text-button">
        {t.viewStudy}
        <ArrowRight size={14} />
      </span>
    </button>
  );
}

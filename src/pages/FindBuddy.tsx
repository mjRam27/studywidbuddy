import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Sidebar } from '../components/Sidebar';
import { firstName, people, type Person } from '../data/people';

type Filters = { level: string[]; lang: string[]; avail: string[]; tz: string[] };
type FilterKey = keyof Filters;
type RequestState = 'compose' | 'sent' | 'accepted' | 'declined' | 'expired';

const NO_FILTERS: Filters = { level: [], lang: [], avail: [], tz: [] };

const FILTER_GROUPS: { key: FilterKey; heading: string; options: string[] }[] = [
  { key: 'level', heading: 'Level', options: ['Beginner', 'Intermediate'] },
  { key: 'lang', heading: 'Language', options: ['English', 'German'] },
  { key: 'avail', heading: 'Availability', options: ['Weekday evenings', 'Weekends'] },
  { key: 'tz', heading: 'Timezone', options: ['CET ±1h', 'GMT'] },
];

const matchesOption = (p: Person, key: FilterKey, value: string) => {
  switch (key) {
    case 'level': return p.level === value;
    case 'lang': return (p.languages as string[]).includes(value);
    case 'avail': return p.availability === value;
    case 'tz': return p.timezoneBand === value;
  }
};

const passes = (p: Person, f: Filters) =>
  (Object.keys(f) as FilterKey[]).every((k) => !f[k].length || f[k].some((v) => matchesOption(p, k, v)));

export function FindBuddy() {
  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, level: ['Beginner'] });
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [modalId, setModalId] = useState<string | null>(null);
  const [request, setRequest] = useState<RequestState>('compose');
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const shown = people.filter((p) => passes(p, filters));
  const drawerPerson = people.find((p) => p.id === drawerId);
  const modalPerson = people.find((p) => p.id === modalId);

  const toggle = (k: FilterKey, v: string) =>
    setFilters((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));

  const openRequest = (id: string) => {
    setDrawerId(null);
    setModalId(id);
    setRequest(sent[id] ? 'sent' : 'compose');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modalId) setModalId(null);
      else setDrawerId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalId]);

  return (
    <div className="app">
      <Sidebar active="learn" />
      <main className="main">
        <header className="topbar crumbs">
          <Link to="/learn">Learn</Link><Icon name="chevron_right" size={16} color="#9AA1B1" />
          <span>AI Engineering</span><Icon name="chevron_right" size={16} color="#9AA1B1" />
          <b>Find Study Buddy</b>
        </header>

        <div className="buddy-body">
          <aside className="filters">
            <div className="filter-block">
              <span className="eyebrow">MATCHING FOR</span>
              <div className="matching-for"><span>AI Engineering</span><span>Beginner · Build projects</span></div>
            </div>
            {FILTER_GROUPS.map((g) => (
              <div key={g.key} className="filter-group" role="group" aria-label={g.heading}>
                <span className="filter-heading">{g.heading}</span>
                {g.options.map((o) => {
                  const on = filters[g.key].includes(o);
                  const count = people.filter((p) => matchesOption(p, g.key, o)).length;
                  return (
                    <button key={o} type="button" className="filter-opt" role="checkbox" aria-checked={on} onClick={() => toggle(g.key, o)}>
                      <span className={on ? 'check on' : 'check'}>{on && <Icon name="check" size={13} color="#fff" />}</span>
                      {o}
                      <span className="mono count">{count}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </aside>

          <div className="matches">
            <div className="page-head">
              <div className="page-head-text tight">
                <h1 className="display">Find your Study Buddy</h1>
                <span className="subline">{shown.length} people starting AI Engineering at your level. Ranked by course, level, goals, schedule and language.</span>
              </div>
              <span className="sort">Sort: Best match<Icon name="expand_more" size={16} /></span>
            </div>

            {shown.map((p) => (
              <MatchCard key={p.id} person={p} sent={!!sent[p.id]} onStudy={() => openRequest(p.id)} onView={() => setDrawerId(p.id)} />
            ))}

            {shown.length === 0 && (
              <div className="no-matches">
                <span className="panel-title">No one matches all of these filters yet</span>
                <span>Try removing a filter. We'll also let you know when someone matching joins.</span>
                <button type="button" className="btn-outline sm" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
              </div>
            )}
          </div>
        </div>
      </main>

      {drawerPerson && <ProfileDrawer person={drawerPerson} onClose={() => setDrawerId(null)} onStudy={() => openRequest(drawerPerson.id)} />}

      {modalPerson && (
        <RequestModal
          person={modalPerson}
          state={request}
          onStateChange={setRequest}
          onClose={() => setModalId(null)}
          onSend={() => { setRequest('sent'); setSent((s) => ({ ...s, [modalPerson.id]: true })); }}
        />
      )}
    </div>
  );
}

function MatchCard({ person: p, sent, onStudy, onView }: { person: Person; sent: boolean; onStudy: () => void; onView: () => void }) {
  return (
    <div className={sent ? 'match-card sent' : 'match-card'}>
      <div className="match-who">
        <div className="match-avatar" style={{ background: p.bg, color: p.fg }}>
          {p.initials}<span className={p.online ? 'presence online' : 'presence'} />
        </div>
        <div className="match-info">
          <div className="match-name"><span>{p.name}</span><span>{p.headline}</span></div>
          <span className="match-goal"><span>Goal · </span>{p.goal}</span>
          <div className="chips">{p.skills.map((s) => <span key={s} className="chip">{s}</span>)}</div>
          <div className="match-meta">
            <span><Icon name="translate" size={15} />{p.languagesLabel}</span>
            <span><Icon name="schedule" size={15} />{p.availabilityLabel}</span>
            <span><Icon name="public" size={15} />{p.timezone}</span>
          </div>
        </div>
      </div>
      <div className="why">
        <span className="eyebrow">WHY YOU MATCH</span>
        {p.why.map((w) => (
          <div key={w.key} className="why-row">
            <span>{w.key}</span>
            <span className="why-bar"><span style={{ width: `${w.value}%` }} /></span>
            <span>{w.text}</span>
          </div>
        ))}
      </div>
      <div className="match-actions">
        <div className="score"><span className="display">{p.score}%</span><span>match</span></div>
        <button type="button" className={sent ? 'btn-study sent' : 'btn-study'} onClick={onStudy}>
          <Icon name={sent ? 'schedule' : 'group_add'} size={17} />{sent ? 'Request sent' : 'Study Together'}
        </button>
        <button type="button" className="btn-outline view" onClick={onView}>View Profile</button>
      </div>
    </div>
  );
}

function ProfileDrawer({ person: p, onClose, onStudy }: { person: Person; onClose: () => void; onStudy: () => void }) {
  return (
    <div className="drawer" role="dialog" aria-label={`${p.name} profile`}>
      <div className="drawer-head">
        <span className="eyebrow">PROFILE PREVIEW</span>
        <button type="button" className="close-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </div>
      <div className="drawer-body">
        <div className="drawer-who">
          <div className="drawer-avatar" style={{ background: p.bg, color: p.fg }}>{p.initials}</div>
          <div><span>{p.name}</span><span>{p.headline}</span></div>
        </div>
        <p className="bio">{p.bio}</p>
        <div className="drawer-stats">
          {p.stats.map((s) => <div key={s.label}><span className="display">{s.value}</span><span>{s.label}</span></div>)}
        </div>
        <div className="drawer-section">
          <span>Shared with you</span>
          <div className="chips">{p.shared.map((s) => <span key={s} className="chip-ok"><Icon name="check" size={13} />{s}</span>)}</div>
        </div>
        <div className="drawer-section">
          <span>Learning history</span>
          {p.history.map((h) => <div key={h} className="history-item"><Icon name="check_circle" size={16} color="var(--success)" />{h}</div>)}
        </div>
        <div className="trust"><Icon name="verified_user" size={16} />Responds within about 4 hours · member since 2025</div>
      </div>
      <div className="drawer-foot">
        <button type="button" className="btn-primary grow" onClick={onStudy}>Study Together</button>
        <button type="button" className="btn-outline">Full profile</button>
        <button type="button" className="btn-outline square" title="Report or block" aria-label="Report or block"><Icon name="flag" /></button>
      </div>
    </div>
  );
}

type Step = { title: string; detail: string; ring: string; fill: string; muted?: boolean };
type StatusView = {
  icon: string; bg: string; fg: string; message: string; title: string;
  cta: string; ctaPrimary: boolean; steps: Step[];
};

function statusView(state: Exclude<RequestState, 'compose'>, name: string): StatusView {
  const brand = '#4B4FE0', ok = '#15803D', grey = '#4A5266', warn = '#B45309', off = '#CDD2DB', white = '#fff';
  switch (state) {
    case 'sent': return {
      icon: 'schedule_send', bg: '#EEF0FD', fg: '#2E31A8', title: 'Request sent', cta: 'Done', ctaPrimary: false,
      message: `Request sent. ${name} usually replies within 4 hours.`,
      steps: [
        { title: 'Request sent', detail: 'Today 17:42', ring: brand, fill: brand },
        { title: `Waiting for ${name}`, detail: 'Expires in 71 h', ring: brand, fill: white },
        { title: 'Shared workspace opens', detail: 'AI Engineering · Module 1', ring: off, fill: white, muted: true }] };
    case 'accepted': return {
      icon: 'handshake', bg: '#E8F6EC', fg: ok, title: "You're Study Buddies", cta: 'Open Study Workspace', ctaPrimary: true,
      message: `${name} accepted. Your shared workspace is ready.`,
      steps: [
        { title: 'Request sent', detail: 'Today 17:42', ring: ok, fill: ok },
        { title: 'Accepted', detail: 'Today 18:05 · "Tue/Thu works!"', ring: ok, fill: ok },
        { title: 'First session suggested', detail: 'Tue 19:00 CET · Module 1', ring: brand, fill: white }] };
    case 'declined': return {
      icon: 'do_not_disturb_on', bg: '#F0F2F5', fg: grey, title: 'Not this time', cta: 'See next best match', ctaPrimary: true,
      message: `${name} can't take on a partner right now. That happens, and it isn't personal.`,
      steps: [
        { title: 'Request sent', detail: 'Today 17:42', ring: grey, fill: grey },
        { title: 'Declined', detail: 'Today 19:10', ring: grey, fill: white },
        { title: '3 other matches above 75%', detail: 'Tobias, Mei and James are available', ring: brand, fill: white }] };
    case 'expired': return {
      icon: 'timer_off', bg: '#FDF3E3', fg: warn, title: 'Request expired', cta: 'Send again', ctaPrimary: false,
      message: 'This request expired after 72 hours without a reply.',
      steps: [
        { title: 'Request sent', detail: 'Mon 17:42', ring: warn, fill: warn },
        { title: 'No reply', detail: 'Expired Thu 17:42', ring: warn, fill: white },
        { title: 'You can resend once', detail: 'or pick another match', ring: off, fill: white, muted: true }] };
  }
}

const PREVIEW_TABS: [Exclude<RequestState, 'compose'>, string][] = [['sent', 'Pending'], ['accepted', 'Accepted'], ['declined', 'Declined'], ['expired', 'Expired']];

type ModalProps = {
  person: Person;
  state: RequestState;
  onStateChange: (s: RequestState) => void;
  onClose: () => void;
  onSend: () => void;
};

function RequestModal({ person: p, state, onStateChange, onClose, onSend }: ModalProps) {
  const name = firstName(p);
  const view = state === 'compose' ? null : statusView(state, name);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="req-title">
        <div className="modal-head">
          <div className="pair">
            <div className="pair-me">MK</div>
            <div className="pair-them" style={{ background: p.bg, color: p.fg, borderColor: state === 'accepted' ? '#15803D' : '#4B4FE0' }}>{p.initials}</div>
          </div>
          <div className="modal-title">
            <span id="req-title" className="display">{view ? view.title : `Study with ${name}?`}</span>
            <span>AI Engineering · Beginner</span>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>

        {!view ? (
          <>
            <div className="modal-body">
              <div className="field">
                <span className="field-label">Shared goals</span>
                <div className="chips">
                  <span className="chip-goal"><Icon name="check" size={14} />Build real applications</span>
                  <span className="chip-goal"><Icon name="check" size={14} />Finish the RAG capstone</span>
                </div>
              </div>
              <div className="proposal">
                <div><span>Proposed rhythm</span><span>Tue + Thu, 19:00 CET</span></div>
                <div><span>Start at</span><span>Module 1 · together</span></div>
              </div>
              <label className="message-field">Message <span>optional</span>
                <textarea defaultValue="Hey! I'm also coming from data work. Want to do two evenings a week and actually ship the capstone?" />
              </label>
              <span className="fine-print"><Icon name="shield_person" size={15} />Requests expire after 72 hours. You can only have one open request per course.</span>
            </div>
            <div className="modal-foot end">
              <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
              <button type="button" className="btn-primary" onClick={onSend}>Send Study Request</button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body status">
              <div className="status-banner" style={{ background: view.bg, color: view.fg }}><Icon name={view.icon} />{view.message}</div>
              <div className="steps">
                {view.steps.map((s) => (
                  <div key={s.title} className="step">
                    <span className="step-dot" style={{ borderColor: s.ring, background: s.fill }} />
                    <div><span className={s.muted ? 'muted' : ''}>{s.title}</span><span>{s.detail}</span></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-foot">
              {import.meta.env.DEV && (
                <>
                  <span className="eyebrow">PREVIEW STATE</span>
                  {PREVIEW_TABS.map(([id, label]) => (
                    <button key={id} type="button" className={state === id ? 'preview-tab on' : 'preview-tab'} onClick={() => onStateChange(id)}>{label}</button>
                  ))}
                </>
              )}
              {state === 'accepted' ? (
                <Link to="/workspace" className="btn-primary cta">{view.cta}</Link>
              ) : (
                <button
                  type="button"
                  className={view.ctaPrimary ? 'btn-primary cta' : 'btn-outline cta'}
                  onClick={() => (state === 'expired' ? onStateChange('compose') : onClose())}
                >
                  {view.cta}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

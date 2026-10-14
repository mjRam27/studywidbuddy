import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Sidebar } from '../components/Sidebar';
import { useCourses } from '../store';
import {
  MAX_ACTIVE_COURSES, STREAK_DAYS, monthStats, quickPicks, recentActivity, recommendations, streak, upcomingSessions,
  type Course,
} from '../data/courses';

const LIMIT_HINT = `You can have up to ${MAX_ACTIVE_COURSES} active courses. Complete or leave a course to start another.`;

export function MyLearning() {
  const { active, leaveCourse } = useCourses();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);

  const full = active.length >= MAX_ACTIVE_COURSES;
  const leaving = active.find((c) => c.id === leavingId);
  const onlineBuddy = active.find((c) => c.buddy.online && c.buddy.onlineFor)?.buddy;
  const subline = full
    ? `All ${MAX_ACTIVE_COURSES} slots are in use.` + (onlineBuddy ? ` ${onlineBuddy.name.split(' ')[0]} has been online for ${onlineBuddy.onlineFor}.` : '')
    : `${active.length} of ${MAX_ACTIVE_COURSES} slots in use. You have room for ${MAX_ACTIVE_COURSES - active.length === 1 ? 'one more' : 'more'}.`;

  return (
    <div className="app">
      <Sidebar active="learn" showCourses />
      <main className="main">
        <header className="topbar">
          <span className="topbar-title">Learn</span>
          <nav className="tabs">
            <Link to="/learn" className="tab on">My Learning</Link>
            <span className="tab">Discover</span>
            <Link to="/learn/buddies" className="tab">Study Buddies</Link>
            <span className="tab">Certificates</span>
          </nav>
          <div className="search"><Icon name="search" />Search courses<kbd>⌘K</kbd></div>
        </header>

        <div className="learn-body">
          <div className="page-head">
            <div className="page-head-text">
              <h1 className="display">My Learning</h1>
              <span className="subline">{subline}</span>
            </div>
            <div className="page-head-actions">
              <div className="slots">
                <span className="mono">{active.length} / {MAX_ACTIVE_COURSES} ACTIVE</span>
                <div className="slot-meter">
                  {Array.from({ length: MAX_ACTIVE_COURSES }, (_, k) => <span key={k} className={k < active.length ? 'used' : ''} />)}
                </div>
              </div>
              <button type="button" className="btn-start" disabled={full} title={full ? LIMIT_HINT : 'Start a new course'}>
                <Icon name="add" size={18} />Start New Course
              </button>
            </div>
          </div>

          {full && (
            <div className="limit-banner">
              <Icon name="info" color="var(--brand)" />
              <span><b>You can have up to {MAX_ACTIVE_COURSES} active courses.</b> Complete or leave a course to start another. With fewer courses, you and your buddies finish more of them.</span>
              <span className="link-strong">Manage courses</span>
            </div>
          )}

          <div className="course-grid">
            {active.map((c, k) => (
              <CourseCard
                key={c.id}
                course={c}
                slot={k + 1}
                primary={k === 0}
                menuOpen={menuOpen === c.id}
                onToggleMenu={() => setMenuOpen(menuOpen === c.id ? null : c.id)}
                onCloseMenu={() => setMenuOpen(null)}
                onLeave={() => { setLeavingId(c.id); setMenuOpen(null); }}
              />
            ))}
            {!full && <EmptySlot slot={active.length + 1} />}
          </div>

          {leaving && (
            <div className="leave-confirm" role="alertdialog" aria-labelledby="leave-title">
              <Icon name="logout" color="var(--danger)" />
              <div className="leave-text">
                <b id="leave-title">Leave {leaving.title}?</b>
                <span>Your progress and notes are kept for 90 days. Your Study Buddy gets a heads-up and can find a new partner.</span>
              </div>
              <div className="leave-actions">
                <button type="button" className="btn-outline sm" onClick={() => setLeavingId(null)}>Keep course</button>
                <button type="button" className="btn-danger sm" onClick={() => { leaveCourse(leaving.id); setLeavingId(null); }}>Leave course</button>
              </div>
            </div>
          )}

          <div className="row-3">
            <section className="panel">
              <div className="panel-head"><span className="panel-title">Upcoming sessions</span><span className="link-strong sm">Calendar</span></div>
              {upcomingSessions.map((s) => (
                <div key={s.day + s.time} className="session">
                  <div className="session-when"><span className="mono">{s.day}</span><span>{s.time}</span></div>
                  <div className="session-what"><span>{s.course}</span><span>{s.detail}</span></div>
                  <span className={`session-status ${s.status}`}>
                    <Icon name={s.status === 'confirmed' ? 'check_circle' : 'schedule'} size={14} />{s.statusLabel}
                  </span>
                </div>
              ))}
            </section>
            <section className="panel">
              <div className="panel-head baseline">
                <span className="panel-title">Study streak</span>
                <span className="display streak-count">{STREAK_DAYS}</span><span className="muted sm">days</span>
              </div>
              <div className="streak-grid">
                {streak.map((d, k) => <span key={k} className={d} />)}
              </div>
              <div className="streak-legend">
                <span className="sw together" />Together<span className="sw solo" />Solo<span className="sw today" />Today
              </div>
            </section>
            <section className="panel">
              <span className="panel-title">This month</span>
              <div className="stat-grid">
                {monthStats.map((s) => (
                  <div key={s.label} className="stat"><span className="display">{s.value}</span><span>{s.label}</span></div>
                ))}
              </div>
            </section>
          </div>

          <div className="row-2">
            <section className="panel activity">
              <span className="panel-title">Recent activity</span>
              {recentActivity.map((a) => (
                <div key={a.text} className="activity-item">
                  <Icon name={a.icon} size={16} color={a.color} />
                  <span className="grow">{a.text}</span>
                  <span className="when">{a.when}</span>
                </div>
              ))}
            </section>
            <section className="recs">
              <div className="recs-head">
                <span className="panel-title">Recommended for you</span>
                <span className="muted sm">Based on Angular, TypeScript and your goal: build projects</span>
              </div>
              <div className="recs-grid">
                {recommendations.map((r) => (
                  <div key={r.title} className="rec">
                    <span className="eyebrow">{r.category}</span>
                    <span className="rec-title">{r.title}</span>
                    <span className="rec-desc">{r.description}</span>
                    <div className="rec-meta"><span>{r.level}</span><span>{r.duration}</span><span>{r.learners} learners</span></div>
                    <button type="button" className="btn-rec" disabled={full} title={full ? LIMIT_HINT : 'Start a new course'}>
                      {full ? 'Slots full · save for later' : 'Start Learning'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

type CardProps = {
  course: Course;
  slot: number;
  primary: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onLeave: () => void;
};

function CourseCard({ course: c, slot, primary, menuOpen, onToggleMenu, onCloseMenu, onLeave }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onCloseMenu(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseMenu(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen, onCloseMenu]);

  return (
    <div className="course-card" ref={ref}>
      <div className="course-top">
        <span className="eyebrow">SLOT {slot} · {c.category}</span>
        <button type="button" className={menuOpen ? 'icon-btn on' : 'icon-btn'} onClick={onToggleMenu} aria-label={`${c.title} options`} aria-expanded={menuOpen}>
          <Icon name="more_horiz" size={18} />
        </button>
      </div>
      <div className="course-title">
        <span className="display">{c.title}</span>
        <span>{c.level}</span>
      </div>
      <div className="progress">
        <div className="progress-track"><div style={{ width: `${c.progress}%` }} /></div>
        <span className="mono">{c.progress}%</span>
      </div>
      <div className="buddy-row">
        <div className="buddy-avatar" style={{ background: c.buddy.bg, color: c.buddy.fg }}>
          {c.buddy.initials}
          <span className={c.buddy.online ? 'presence online' : 'presence'} />
        </div>
        <div className="buddy-text"><span>Study Buddy</span><span>{c.buddy.name}</span></div>
        <span className="buddy-status">{c.buddy.online ? 'Online' : 'Offline'}</span>
      </div>
      <div className="course-facts">
        <span>Module</span><span>{c.module}</span>
        <span>Next</span><span>{c.next}</span>
        <span>Session</span><span className={`tone-${c.sessionTone}`}>{c.session}</span>
      </div>
      <Link to="/workspace" className={primary ? 'btn-continue primary' : 'btn-continue'}>
        Continue Learning<Icon name="arrow_forward" size={17} />
      </Link>
      {menuOpen && (
        <div className="menu" role="menu">
          <button type="button" role="menuitem" onClick={onCloseMenu}><Icon name="event" size={16} />Schedule session</button>
          <button type="button" role="menuitem" onClick={onCloseMenu}><Icon name="notifications_paused" size={16} />Pause reminders</button>
          <Link to="/learn/buddies" role="menuitem"><Icon name="swap_horiz" size={16} />Change Study Buddy</Link>
          <div className="menu-sep" />
          <button type="button" role="menuitem" className="danger" onClick={onLeave}><Icon name="logout" size={16} />Leave course…</button>
        </div>
      )}
    </div>
  );
}

function EmptySlot({ slot }: { slot: number }) {
  return (
    <div className="empty-slot">
      <span className="eyebrow">SLOT {slot} · OPEN</span>
      <span className="display empty-title">Start learning something new.</span>
      <span className="empty-desc">Pick a course and we'll match you with a buddy at your level within a day or so.</span>
      <div className="quick-picks">
        {quickPicks.map((q) => (
          <button type="button" key={q.title} className="quick-pick">
            <span className="qp-title">{q.title}</span><span className="qp-note">{q.note}</span><Icon name="add" size={16} color="var(--brand)" />
          </button>
        ))}
      </div>
      <button type="button" className="btn-primary">Browse courses</button>
    </div>
  );
}

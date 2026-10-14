import { Link } from 'react-router-dom';
import { useCourses } from '../store';
import { Icon } from './Icon';

export type NavId = 'home' | 'learn' | 'projects' | 'people' | 'messages' | 'jobs';

const NAV: { id: NavId; icon: string; label: string; to: string; badge?: string }[] = [
  { id: 'home', icon: 'home', label: 'Home', to: '/home' },
  { id: 'learn', icon: 'school', label: 'Learn', to: '/learn' },
  { id: 'projects', icon: 'deployed_code', label: 'Projects', to: '/projects' },
  { id: 'people', icon: 'group', label: 'People', to: '/people' },
  { id: 'messages', icon: 'forum', label: 'Messages', to: '/messages', badge: '3' },
  { id: 'jobs', icon: 'work', label: 'Jobs', to: '/jobs' },
];

type Props = { active: NavId; showCourses?: boolean };

export function Sidebar({ active, showCourses = false }: Props) {
  const { active: courses } = useCourses();
  return (
    <aside className="sidebar">
      <Link to="/learn" className="brand">
        <span className="brand-mark"><span /><span /></span>
        <span className="brand-name">Studywid<span>Buddy</span></span>
      </Link>
      {NAV.map((n) => {
        const on = n.id === active;
        return (
          <div key={n.id} className="nav-group">
            <Link to={n.to} className={on ? 'nav-item on' : 'nav-item'} aria-current={on ? 'page' : undefined}>
              <Icon name={n.icon} size={19} />
              <span className="grow">{n.label}</span>
              {n.badge && <span className="nav-badge">{n.badge}</span>}
            </Link>
            {on && showCourses && (
              <div className="nav-sub">
                {courses.map((c) => (
                  <Link key={c.id} to="/workspace">
                    <span className="dot" />
                    <span className="grow">{c.title}</span>
                    <span className="mono">{c.progress}%</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="side-divider" />
      <button type="button" className="ai-buddy">
        <span className="diamond" />
        <span className="grow">AI Buddy</span>
        <span className="mono">⌘J</span>
      </button>
      <div className="side-user">
        <div className="avatar-me">MK</div>
        <div className="side-user-text">
          <span className="name">Manoj Kumar</span>
          <span className="handle">@manoj.dev</span>
        </div>
      </div>
    </aside>
  );
}

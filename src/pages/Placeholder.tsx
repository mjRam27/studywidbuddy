import { Link } from 'react-router-dom';
import { Sidebar, type NavId } from '../components/Sidebar';

/** Stand-in for screens that exist in the design project but aren't built yet. */
export function Placeholder({ title, nav }: { title: string; nav: NavId }) {
  return (
    <div className="app">
      <Sidebar active={nav} />
      <main className="main">
        <header className="topbar"><span className="topbar-title">{title}</span></header>
        <div className="placeholder">
          <h1 className="display">{title}</h1>
          <p>This screen isn't built yet. <Link to="/learn">Back to My Learning</Link></p>
        </div>
      </main>
    </div>
  );
}

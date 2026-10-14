import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { CoursesProvider } from './store';
import { MyLearning } from './pages/MyLearning';
import { FindBuddy } from './pages/FindBuddy';
import { Placeholder } from './pages/Placeholder';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CoursesProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/learn" replace />} />
          <Route path="/learn" element={<MyLearning />} />
          <Route path="/learn/buddies" element={<FindBuddy />} />
          <Route path="/workspace" element={<Placeholder title="Study Workspace" nav="learn" />} />
          <Route path="/home" element={<Placeholder title="Home" nav="home" />} />
          <Route path="/projects" element={<Placeholder title="Projects" nav="projects" />} />
          <Route path="/people" element={<Placeholder title="People" nav="people" />} />
          <Route path="/messages" element={<Placeholder title="Messages" nav="messages" />} />
          <Route path="/jobs" element={<Placeholder title="Jobs" nav="jobs" />} />
          <Route path="*" element={<Navigate to="/learn" replace />} />
        </Routes>
      </CoursesProvider>
    </BrowserRouter>
  </StrictMode>,
);

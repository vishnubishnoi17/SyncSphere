import React from 'react';
import { useAuthStore } from './state/authStore';
import { AuthPage } from './pages/AuthPage';
import { WorkspacePage } from './pages/WorkspacePage';

const App: React.FC = () => {
  const { accessToken } = useAuthStore();
  return accessToken ? <WorkspacePage /> : <AuthPage />;
};

export default App;

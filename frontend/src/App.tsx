import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { EventCatalogPage } from './pages/EventCatalogPage';
import { AuthModal } from './components/AuthModal';

export const AppContent: React.FC = () => {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <div className="app-layout">
      <Navbar onOpenAuth={() => setIsAuthModalOpen(true)} />

      <main style={{ minHeight: 'calc(100vh - 140px)' }}>
        <EventCatalogPage onOpenAuth={() => setIsAuthModalOpen(true)} />
      </main>

      <footer className="footer">
        <div className="container" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <p>© 2026 EventPass Ticket Booking System. Engineered with Node.js, Express, TypeScript, and MongoDB.</p>
        </div>
      </footer>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;

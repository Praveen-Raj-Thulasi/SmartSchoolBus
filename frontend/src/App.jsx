import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from './context/AppContext';
import Login from './components/Login';
import SchoolAdminDashboard from './components/SchoolAdminDashboard';
import DriverDashboard from './components/DriverDashboard';
import ParentDashboard from './components/ParentDashboard';
import { LogOut, Sun, Moon, Trash2 } from 'lucide-react';
import './App.css';

export default function App() {
  const { currentUser, logout, deleteAccount } = useContext(AppContext);
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const handleDeleteAccount = async () => {
    if (window.confirm("Are you sure you want to permanently delete your account? This action cannot be undone and you will be signed out immediately.")) {
      const res = await deleteAccount();
      if (!res.success) {
        window.alert(res.message);
      }
    }
  };

  const renderDashboard = () => {
    switch (currentUser?.role) {
      case 'admin':
        return <SchoolAdminDashboard />;
      case 'driver':
        return <DriverDashboard />;
      case 'parent':
        return <ParentDashboard />;
      default:
        return (
          <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', maxWidth: '400px', margin: '4rem auto' }}>
            <h2 style={{ color: 'var(--text-main)', marginBottom: '1rem' }}>Unknown User Role</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>The role "{currentUser?.role}" is not recognized by the system.</p>
            <button onClick={logout} className="btn btn-primary btn-block">Sign Out</button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-color)', color: 'var(--text-main)', transition: 'background-color 0.3s, color 0.3s' }}>
      {/* Top Navbar Header - only when logged in */}
      {currentUser && (
        <header className="main-header" style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '1rem 2rem', 
          backgroundColor: 'var(--panel-bg)', 
          borderBottom: '1px solid var(--border-color)',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.75rem', transform: 'scaleX(-1)', display: 'inline-block' }}>🚌</span>
            <div>
              <h1 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: 'var(--primary-color)', letterSpacing: '-0.025em' }}>Smart School Bus</h1>
              <p style={{ fontSize: '0.65rem', margin: 0, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>Operations Center</p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>
                {currentUser.name}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize', fontWeight: '600' }}>
                System {currentUser.role}
              </span>
            </div>
            
            {currentUser.role !== 'admin' && (
              <button 
                onClick={handleDeleteAccount} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.35rem', 
                  backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                  color: '#ef4444', 
                  border: '1px solid rgba(239, 68, 68, 0.2)', 
                  padding: '0.45rem 0.85rem', 
                  borderRadius: '8px', 
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  transition: 'all 0.2s',
                  marginRight: '0.5rem'
                }}
                onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#b91c1c'; e.currentTarget.style.color = '#fff'; }}
                onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444'; }}
              >
                <Trash2 size={13} /> Delete Account
              </button>
            )}
            
            <button 
              onClick={logout} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.35rem', 
                backgroundColor: 'rgba(220, 38, 38, 0.1)', 
                color: '#ef4444', 
                border: '1px solid rgba(220, 38, 38, 0.2)', 
                padding: '0.45rem 0.85rem', 
                borderRadius: '8px', 
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: '700',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#dc2626'; e.currentTarget.style.color = '#fff'; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.1)'; e.currentTarget.style.color = '#ef4444'; }}
            >
              <LogOut size={13} /> Sign Out
            </button>
          </div>
        </header>
      )}

      {/* Floating Theme Toggle (visible globally: both Login & Logged In) */}
      <button
        onClick={() => setIsDark(!isDark)}
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '24px',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: 'var(--panel-bg)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 99999,
          transition: 'all 0.2s'
        }}
        title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        aria-label="Toggle theme mode"
      >
        {isDark ? <Sun size={20} color="#eab308" /> : <Moon size={20} color="#475569" />}
      </button>

      {/* Viewport content */}
      <main className="flex-1" style={{ position: 'relative' }}>
        {currentUser ? renderDashboard() : <Login />}
      </main>
    </div>
  );
}

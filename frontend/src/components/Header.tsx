import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Terminal, LogOut, User as UserIcon } from 'lucide-react';

interface HeaderProps {
  onOpenAuth: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenAuth }) => {
  const { user, logout } = useAuth();

  return (
    <header className="header">
      <div className="logo">
        <div className="logo-icon">
          <Terminal size={18} />
        </div>
        <span>CodeSphere</span>
      </div>

      <div className="user-info">
        {user ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <UserIcon size={14} color="#8b949e" />
              <span>{user.email}</span>
            </div>
            <button className="btn btn-secondary" onClick={logout} style={{ padding: '4px 10px', fontSize: '12px' }}>
              <LogOut size={14} />
              Logout
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={onOpenAuth}>
            Sign In / Register
          </button>
        )}
      </div>
    </header>
  );
};

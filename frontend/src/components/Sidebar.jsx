import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { usuario } = useAuth();

  const isActive = (path) => location.pathname === path;
  const isAdmin = usuario?.rol === 'admin';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-text">NG</span>
      </div>

      <nav className="sidebar-nav">
        <button className="nav-item" title="Inicio">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </button>

        <button
          className={`nav-item ${isActive('/') ? 'active' : ''}`}
          title="Pipeline"
          onClick={() => navigate('/')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v20M2 12h20"/>
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </button>

        <button className="nav-item has-badge" title="Mensajes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <span className="badge">9+</span>
        </button>

        <button
          className={`nav-item ${isActive('/calendario') ? 'active' : ''}`}
          title="Calendario"
          onClick={() => navigate('/calendario')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </button>

        <button className="nav-item" title="Contactos">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </button>

        {isAdmin && (
          <>
            <button
              className={`nav-item ${isActive('/reportes') ? 'active' : ''}`}
              title="Reportes Operativos"
              onClick={() => navigate('/reportes')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </button>
            <button
              className={`nav-item ${isActive('/reportes-financieros') ? 'active' : ''}`}
              title="Reportes Financieros"
              onClick={() => navigate('/reportes-financieros')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </button>
          </>
        )}

        <button className="nav-item" title="Configuración">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
        </button>
      </nav>

      <div className="sidebar-bottom">
        <button className="nav-item" title="Más opciones">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1"/>
            <circle cx="12" cy="5" r="1"/>
            <circle cx="12" cy="19" r="1"/>
          </svg>
        </button>
      </div>
    </aside>
  );
}

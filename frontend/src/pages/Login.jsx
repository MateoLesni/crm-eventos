import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError('Credenciales inválidas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Panel izquierdo - Formulario */}
      <div className="login-form-panel">
        <div className="login-form-content">
          {/* Logo */}
          <div className="login-logo">
            <div className="logo-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M16 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 10H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 14H8.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 14H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M16 14H16.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 18H8.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 18H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="logo-text">Nuevo Gastro</span>
          </div>

          {/* Bienvenida */}
          <div className="login-welcome">
            <h1>Bienvenido</h1>
            <p>Ingresá tus credenciales para acceder al sistema</p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="login-error">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="login-field">
              <label htmlFor="email">Email</label>
              <div className="input-wrapper">
                <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@nuevogastro.com"
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="password">Contraseña</label>
              <div className="input-wrapper">
                <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  required
                />
              </div>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Ingresando...
                </>
              ) : (
                'Ingresar'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="login-footer">
            <p>Equipo de Desarrollo</p>
          </div>
        </div>
      </div>

      {/* Panel derecho - Branding */}
      <div className="login-brand-panel">
        <div className="brand-content">
          {/* Decoración de fondo */}
          <div className="brand-decoration">
            <div className="decoration-circle circle-1"></div>
            <div className="decoration-circle circle-2"></div>
            <div className="decoration-circle circle-3"></div>
          </div>

          {/* Contenido principal */}
          <div className="brand-main">
            <div className="brand-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2>CRM Eventos</h2>
            <p className="brand-subtitle">Todo lo que necesitás para organizar eventos exitosos en un solo lugar</p>
          </div>

          {/* Features */}
          <div className="brand-features">
            <div className="feature-item">
              <div className="feature-icon">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="feature-text">
                <span className="feature-title">Agenda Inteligente</span>
                <span className="feature-desc">Visualizá todos tus eventos en calendario</span>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="feature-text">
                <span className="feature-title">Control Financiero</span>
                <span className="feature-desc">Cotizaciones, pagos y reportes en tiempo real</span>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
              </div>
              <div className="feature-text">
                <span className="feature-title">Equipo Conectado</span>
                <span className="feature-desc">Asignación y seguimiento de vendedores</span>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="feature-text">
                <span className="feature-title">Análisis Estratégico</span>
                <span className="feature-desc">Métricas y reportes para decisiones inteligentes</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="brand-stats">
            <div className="stat-item">
              <span className="stat-number">6</span>
              <span className="stat-label">Locales</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-number">500+</span>
              <span className="stat-label">Eventos</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-number">100%</span>
              <span className="stat-label">Control</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Kanban from './components/Kanban';
import Calendario from './pages/Calendario';
import Reportes from './pages/Reportes';
import ReportesFinancieros from './pages/ReportesFinancieros';
import Login from './pages/Login';
import Sidebar from './components/Sidebar';
import './App.css';

function PrivateRoute({ children }) {
  const { usuario, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Cargando...</div>;
  }

  return usuario ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { usuario, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Cargando...</div>;
  }

  if (!usuario) {
    return <Navigate to="/login" />;
  }

  if (usuario.rol !== 'admin') {
    return <Navigate to="/" />;
  }

  return children;
}

function AppRoutes() {
  const { usuario } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={usuario ? <Navigate to="/" /> : <Login />}
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout>
              <Kanban />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/calendario"
        element={
          <PrivateRoute>
            <Layout>
              <Calendario />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/reportes"
        element={
          <AdminRoute>
            <Layout>
              <Reportes />
            </Layout>
          </AdminRoute>
        }
      />
      <Route
        path="/reportes-financieros"
        element={
          <AdminRoute>
            <Layout>
              <ReportesFinancieros />
            </Layout>
          </AdminRoute>
        }
      />
    </Routes>
  );
}

function Layout({ children }) {
  const { usuario, logout } = useAuth();
  const location = useLocation();

  const getTitulo = () => {
    if (location.pathname === '/calendario') return 'Calendario';
    if (location.pathname === '/reportes') return 'Reportes Operativos';
    if (location.pathname === '/reportes-financieros') return 'Reportes Financieros';
    return 'Eventos';
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-content">
        <header className="app-header">
          <div className="header-left">
            <h1>{getTitulo()}</h1>
          </div>
          <div className="header-center">
            <div className="search-box">
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <input type="text" placeholder="Buscar eventos..." />
            </div>
          </div>
          <div className="header-right">
            <button className="btn-icon" title="Agregar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
            <button className="btn-icon" title="Notificaciones">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </button>
            <button className="btn-icon" title="Ayuda">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <path d="M12 17h.01"/>
              </svg>
            </button>
            <div className="user-avatar" onClick={logout} title={`${usuario?.nombre} - Click para salir`}>
              {usuario?.nombre?.charAt(0)}
            </div>
          </div>
        </header>
        <main className="app-main">
          {children}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

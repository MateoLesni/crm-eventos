import { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await authApi.me();
      setUsuario(response.data.usuario);
    } catch (error) {
      setUsuario(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await authApi.login(email, password);
    setUsuario(response.data.usuario);
    return response.data;
  };

  const logout = async () => {
    await authApi.logout();
    setUsuario(null);
  };

  const value = {
    usuario,
    loading,
    login,
    logout,
    isAdmin: usuario?.rol === 'admin',
    isTesoreria: usuario?.rol === 'tesoreria',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};

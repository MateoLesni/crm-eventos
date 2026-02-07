import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://crm-eventos-backend-656730419070.us-central1.run.app/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token a cada request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para manejar errores de autenticación
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Eventos
export const eventosApi = {
  listar: () => api.get('/eventos'),
  obtener: (id) => api.get(`/eventos/${id}`),
  crear: (data) => api.post('/eventos', data),
  actualizar: (id, data) => api.put(`/eventos/${id}`, data),
  asignar: (id, comercialId) => api.put(`/eventos/${id}/asignar`, { comercial_id: comercialId }),
  agregarActividad: (id, data) => api.post(`/eventos/${id}/actividades`, data),
};

// Clientes
export const clientesApi = {
  listar: () => api.get('/clientes'),
  obtener: (id) => api.get(`/clientes/${id}`),
  buscarPorTelefono: (telefono) => api.get(`/clientes/buscar/${telefono}`),
  actualizar: (id, data) => api.put(`/clientes/${id}`, data),
};

// Usuarios
export const usuariosApi = {
  listar: (rol) => api.get('/usuarios', { params: { rol } }),
  crear: (data) => api.post('/usuarios', data),
};

// Auth
export const authApi = {
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('usuario', JSON.stringify(response.data.usuario));
    }
    return response;
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    return api.post('/auth/logout');
  },
  me: () => api.get('/auth/me'),
  getStoredUser: () => {
    const usuario = localStorage.getItem('usuario');
    return usuario ? JSON.parse(usuario) : null;
  },
  isAuthenticated: () => !!localStorage.getItem('token'),
};

export default api;

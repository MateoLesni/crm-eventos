import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

export default api;

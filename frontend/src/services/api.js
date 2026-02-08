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
    // Solo redirigir a login si NO estamos ya en login y recibimos 401
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      // Solo redirigir si no estamos ya en login
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
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

// WhatsApp
const WEBHOOK_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://crm-eventos-backend-656730419070.us-central1.run.app';

export const whatsappApi = {
  obtenerConversacionPorNumero: (numero) =>
    axios.get(`${WEBHOOK_URL}/webhook/conversacion-por-numero/${encodeURIComponent(numero)}`),
  obtenerConversacion: (conversacionId) =>
    axios.get(`${WEBHOOK_URL}/webhook/conversacion/${conversacionId}`),
  obtenerMensajes: (conversacionId, limit = 100) =>
    axios.get(`${WEBHOOK_URL}/webhook/conversacion/${conversacionId}/mensajes`, { params: { limit } }),
};

// Pre-Check
export const precheckApi = {
  obtener: (eventoId) => api.get(`/precheck/${eventoId}`),
  // Conceptos
  agregarConcepto: (eventoId, data) => api.post(`/precheck/${eventoId}/conceptos`, data),
  actualizarConcepto: (eventoId, conceptoId, data) => api.put(`/precheck/${eventoId}/conceptos/${conceptoId}`, data),
  eliminarConcepto: (eventoId, conceptoId) => api.delete(`/precheck/${eventoId}/conceptos/${conceptoId}`),
  // Adicionales
  agregarAdicional: (eventoId, data) => api.post(`/precheck/${eventoId}/adicionales`, data),
  actualizarAdicional: (eventoId, adicionalId, data) => api.put(`/precheck/${eventoId}/adicionales/${adicionalId}`, data),
  eliminarAdicional: (eventoId, adicionalId) => api.delete(`/precheck/${eventoId}/adicionales/${adicionalId}`),
  // Pagos
  agregarPago: (eventoId, data) => api.post(`/precheck/${eventoId}/pagos`, data),
  actualizarPago: (eventoId, pagoId, data) => api.put(`/precheck/${eventoId}/pagos/${pagoId}`, data),
  eliminarPago: (eventoId, pagoId) => api.delete(`/precheck/${eventoId}/pagos/${pagoId}`),
  // Comprobantes
  subirComprobante: (eventoId, pagoId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/precheck/${eventoId}/pagos/${pagoId}/comprobante`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  eliminarComprobante: (eventoId, pagoId) => api.delete(`/precheck/${eventoId}/pagos/${pagoId}/comprobante`),
  // Facturada
  actualizarFacturada: (eventoId, facturada) => api.put(`/precheck/${eventoId}/facturada`, { facturada }),
  // PDF
  descargarPdf: (eventoId) => api.get(`/precheck/${eventoId}/pdf`, { responseType: 'blob' }),
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

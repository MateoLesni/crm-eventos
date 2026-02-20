import { useState, useEffect } from 'react';
import { eventosApi, usuariosApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import EventoCard from './EventoCard';
import EventoModal from './EventoModal';
import NuevoEventoModal from './NuevoEventoModal';
import './Kanban.css';

const ESTADOS = [
  { id: 'CONSULTA_ENTRANTE', nombre: 'Consulta Entrante', color: '#6b7280' },
  { id: 'ASIGNADO', nombre: 'Asignado', color: '#3b82f6' },
  { id: 'CONTACTADO', nombre: 'Contactado', color: '#8b5cf6' },
  { id: 'COTIZADO', nombre: 'Cotizado', color: '#f59e0b' },
  { id: 'APROBADO', nombre: 'Aprobado', color: '#10b981' },
  { id: 'RECHAZADO', nombre: 'Rechazado', color: '#ef4444' },
  { id: 'CONCLUIDO', nombre: 'Concluido', color: '#059669' },
  { id: 'MULTIRESERVA', nombre: 'Multireserva', color: '#0ea5e9' },
];

const LOCALES = [
  { id: 1, nombre: 'Costa7070' },
  { id: 2, nombre: 'Kona' },
  { id: 3, nombre: 'MilVidas' },
  { id: 4, nombre: 'CoChinChina' },
  { id: 5, nombre: 'Cruza Polo' },
  { id: 6, nombre: 'Cruza Recoleta' },
  { id: 7, nombre: 'La Mala' },
];

// Mapeo de nombres de color a códigos hex
const COLOR_MAP = {
  'azul': '#3b82f6',
  'verde': '#22c55e',
  'amarillo': '#f59e0b',
  'violeta': '#8b5cf6',
  'rojo': '#ef4444',
  'rosa': '#ec4899',
  'naranja': '#f97316',
  'cyan': '#06b6d4',
};

const getColorHex = (color) => {
  if (!color) return '#6b7280';
  // Si ya es un código hex, devolverlo
  if (color.startsWith('#')) return color;
  // Si es un nombre, mapearlo
  return COLOR_MAP[color.toLowerCase()] || '#6b7280';
};

// Claves de localStorage
const STORAGE_KEYS = {
  FILTROS_GLOBALES: 'crm_filtros_globales',
  VISTA_ACTIVA: 'crm_vista_activa',
  ORDEN_LISTA: 'crm_orden_lista',
  SHOW_FILTROS: 'crm_show_filtros',
};

// Helpers de localStorage
const loadFromStorage = (key, defaultValue) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const saveToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignorar errores de localStorage
  }
};

export default function Kanban() {
  const { isAdmin } = useAuth();

  // Comerciales no ven CONSULTA_ENTRANTE para evitar especulación
  const estadosVisibles = isAdmin
    ? ESTADOS
    : ESTADOS.filter(e => e.id !== 'CONSULTA_ENTRANTE');

  const [kanban, setKanban] = useState({});
  const [totales, setTotales] = useState({});
  const [loading, setLoading] = useState(true);
  const [eventoSeleccionado, setEventoSeleccionado] = useState(null);
  const [showNuevoModal, setShowNuevoModal] = useState(false);
  const [tabInicial, setTabInicial] = useState('detalle');

  // Vista activa (persistente)
  const [vistaActiva, setVistaActiva] = useState(() =>
    loadFromStorage(STORAGE_KEYS.VISTA_ACTIVA, 'kanban')
  );

  // Filtros generales (persistentes)
  const [filtrosGlobales, setFiltrosGlobales] = useState(() =>
    loadFromStorage(STORAGE_KEYS.FILTROS_GLOBALES, {
      fechaDesde: '',
      fechaHasta: '',
      local_id: '',
      tipo: '',
      presupuestoMin: '',
      presupuestoMax: '',
      comercial_id: '',
      paxMin: '',
      paxMax: '',
    })
  );
  const [showFiltrosGlobales, setShowFiltrosGlobales] = useState(() =>
    loadFromStorage(STORAGE_KEYS.SHOW_FILTROS, false)
  );

  // Lista de comerciales (para filtro admin)
  const [comerciales, setComerciales] = useState([]);

  // Filtros y orden por columna
  const [filtrosColumna, setFiltrosColumna] = useState({});
  const [ordenColumna, setOrdenColumna] = useState({}); // 'asc' = antiguos primero (default), 'desc' = recientes primero
  const [filtroActivo, setFiltroActivo] = useState(null); // columna con input abierto

  // Orden para vista lista (persistente)
  const [ordenLista, setOrdenLista] = useState(() =>
    loadFromStorage(STORAGE_KEYS.ORDEN_LISTA, { campo: 'created_at', direccion: 'desc' })
  );
  const [busquedaLista, setBusquedaLista] = useState('');

  useEffect(() => {
    cargarEventos();
    if (isAdmin) {
      cargarComerciales();
    }
  }, [isAdmin]);

  // Persistir cambios en localStorage
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.FILTROS_GLOBALES, filtrosGlobales);
  }, [filtrosGlobales]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.VISTA_ACTIVA, vistaActiva);
  }, [vistaActiva]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.ORDEN_LISTA, ordenLista);
  }, [ordenLista]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SHOW_FILTROS, showFiltrosGlobales);
  }, [showFiltrosGlobales]);

  const cargarEventos = async () => {
    try {
      const response = await eventosApi.listar();
      setKanban(response.data.kanban);
      setTotales(response.data.totales);
    } catch (error) {
      console.error('Error cargando eventos:', error);
    } finally {
      setLoading(false);
    }
  };

  const cargarComerciales = async () => {
    try {
      const response = await usuariosApi.listar();
      setComerciales(response.data.usuarios || []);
    } catch (error) {
      console.error('Error cargando comerciales:', error);
    }
  };

  // Función auxiliar para aplicar filtros
  const aplicarFiltros = (eventos) => {
    let resultado = [...eventos];

    if (filtrosGlobales.fechaDesde) {
      resultado = resultado.filter(e => e.fecha_evento >= filtrosGlobales.fechaDesde);
    }
    if (filtrosGlobales.fechaHasta) {
      resultado = resultado.filter(e => e.fecha_evento <= filtrosGlobales.fechaHasta);
    }
    if (filtrosGlobales.local_id) {
      resultado = resultado.filter(e => e.local?.id === parseInt(filtrosGlobales.local_id));
    }
    if (filtrosGlobales.tipo) {
      resultado = resultado.filter(e => e.tipo === filtrosGlobales.tipo);
    }
    if (filtrosGlobales.presupuestoMin) {
      const min = parseInt(filtrosGlobales.presupuestoMin);
      resultado = resultado.filter(e => (e.presupuesto || 0) >= min);
    }
    if (filtrosGlobales.presupuestoMax) {
      const max = parseInt(filtrosGlobales.presupuestoMax);
      resultado = resultado.filter(e => (e.presupuesto || 0) <= max);
    }
    if (filtrosGlobales.comercial_id) {
      resultado = resultado.filter(e => e.comercial?.id === parseInt(filtrosGlobales.comercial_id));
    }
    if (filtrosGlobales.paxMin) {
      const min = parseInt(filtrosGlobales.paxMin);
      resultado = resultado.filter(e => (e.cantidad_personas || 0) >= min);
    }
    if (filtrosGlobales.paxMax) {
      const max = parseInt(filtrosGlobales.paxMax);
      resultado = resultado.filter(e => (e.cantidad_personas || 0) <= max);
    }

    return resultado;
  };

  // Función para filtrar y ordenar eventos de una columna
  const getEventosFiltrados = (estadoId) => {
    let eventos = kanban[estadoId] || [];

    // Aplicar filtros globales
    eventos = aplicarFiltros(eventos);

    // Aplicar filtro de columna (búsqueda de texto)
    const filtroTexto = filtrosColumna[estadoId]?.toLowerCase() || '';
    if (filtroTexto) {
      eventos = eventos.filter(e => {
        const clienteNombre = e.cliente?.nombre?.toLowerCase() || '';
        const clienteTelefono = e.cliente?.telefono?.toLowerCase() || '';
        const clienteEmail = e.cliente?.email?.toLowerCase() || '';
        const localNombre = e.local?.nombre?.toLowerCase() || '';
        const fechaEvento = e.fecha_evento || '';
        const titulo = e.titulo_display?.toLowerCase() || '';

        return clienteNombre.includes(filtroTexto) ||
               clienteTelefono.includes(filtroTexto) ||
               clienteEmail.includes(filtroTexto) ||
               localNombre.includes(filtroTexto) ||
               fechaEvento.includes(filtroTexto) ||
               titulo.includes(filtroTexto);
      });
    }

    // Ordenar: por defecto antiguos primero (asc), toggle para recientes primero (desc)
    const orden = ordenColumna[estadoId] || 'asc';
    eventos = [...eventos].sort((a, b) => {
      const fechaA = new Date(a.created_at);
      const fechaB = new Date(b.created_at);
      return orden === 'asc' ? fechaA - fechaB : fechaB - fechaA;
    });

    return eventos;
  };

  // Verificar si hay filtros globales activos
  const hayFiltrosGlobalesActivos = Object.values(filtrosGlobales).some(v => v !== '');

  // Obtener todos los eventos para vista lista
  const getTodosLosEventos = () => {
    let eventos = [];

    // Combinar eventos de las columnas visibles según rol
    const idsVisibles = estadosVisibles.map(e => e.id);
    Object.keys(kanban).forEach(estadoId => {
      if (!idsVisibles.includes(estadoId)) return;
      const eventosEstado = kanban[estadoId] || [];
      eventos = [...eventos, ...eventosEstado];
    });

    // Aplicar filtros globales
    eventos = aplicarFiltros(eventos);

    // Aplicar búsqueda de texto
    if (busquedaLista) {
      const busqueda = busquedaLista.toLowerCase();
      eventos = eventos.filter(e => {
        const clienteNombre = e.cliente?.nombre?.toLowerCase() || '';
        const clienteTelefono = e.cliente?.telefono?.toLowerCase() || '';
        const clienteEmail = e.cliente?.email?.toLowerCase() || '';
        const localNombre = e.local?.nombre?.toLowerCase() || '';
        const comercialNombre = e.comercial?.nombre?.toLowerCase() || '';
        const estado = e.estado?.toLowerCase() || '';
        const titulo = e.titulo_display?.toLowerCase() || '';

        return clienteNombre.includes(busqueda) ||
               clienteTelefono.includes(busqueda) ||
               clienteEmail.includes(busqueda) ||
               localNombre.includes(busqueda) ||
               comercialNombre.includes(busqueda) ||
               estado.includes(busqueda) ||
               titulo.includes(busqueda);
      });
    }

    // Ordenar
    eventos.sort((a, b) => {
      let valorA, valorB;

      switch (ordenLista.campo) {
        case 'cliente':
          valorA = a.cliente?.nombre?.toLowerCase() || '';
          valorB = b.cliente?.nombre?.toLowerCase() || '';
          break;
        case 'local':
          valorA = a.local?.nombre?.toLowerCase() || '';
          valorB = b.local?.nombre?.toLowerCase() || '';
          break;
        case 'fecha_evento':
          valorA = a.fecha_evento || '';
          valorB = b.fecha_evento || '';
          break;
        case 'estado':
          valorA = a.estado || '';
          valorB = b.estado || '';
          break;
        case 'presupuesto':
          valorA = a.presupuesto || 0;
          valorB = b.presupuesto || 0;
          break;
        case 'comercial':
          valorA = a.comercial?.nombre?.toLowerCase() || '';
          valorB = b.comercial?.nombre?.toLowerCase() || '';
          break;
        case 'created_at':
        default:
          valorA = new Date(a.created_at);
          valorB = new Date(b.created_at);
          break;
      }

      if (valorA < valorB) return ordenLista.direccion === 'asc' ? -1 : 1;
      if (valorA > valorB) return ordenLista.direccion === 'asc' ? 1 : -1;
      return 0;
    });

    return eventos;
  };

  const handleOrdenarLista = (campo) => {
    if (ordenLista.campo === campo) {
      setOrdenLista({ campo, direccion: ordenLista.direccion === 'asc' ? 'desc' : 'asc' });
    } else {
      setOrdenLista({ campo, direccion: 'asc' });
    }
  };

  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return '-';
    const fecha = new Date(fechaStr + 'T00:00:00');
    return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  };

  const getEstadoInfo = (estadoId) => {
    return ESTADOS.find(e => e.id === estadoId) || { nombre: estadoId, color: '#6b7280' };
  };

  const limpiarFiltrosGlobales = () => {
    setFiltrosGlobales({
      fechaDesde: '',
      fechaHasta: '',
      local_id: '',
      tipo: '',
      presupuestoMin: '',
      presupuestoMax: '',
      comercial_id: '',
      paxMin: '',
      paxMax: '',
    });
  };

  const handleEventoClick = (evento, tab = 'detalle') => {
    setTabInicial(tab);
    setEventoSeleccionado(evento);
  };

  const handleEventoUpdated = () => {
    cargarEventos();
    setEventoSeleccionado(null);
  };

  const handleEventoRefresh = () => {
    cargarEventos();
  };

  const handleNuevoEvento = () => {
    cargarEventos();
    setShowNuevoModal(false);
  };

  // Función para descargar CSV
  const descargarCSV = () => {
    const eventos = getTodosLosEventos();

    if (eventos.length === 0) {
      alert('No hay eventos para descargar');
      return;
    }

    // Encabezados
    const headers = ['Cliente', 'Teléfono', 'Email', 'Local', 'Fecha Evento', 'PAX', 'Estado', 'Presupuesto', 'Comercial', 'Tipo', 'Creado'];

    // Función para escapar valores CSV
    const escaparCSV = (valor) => {
      if (valor === null || valor === undefined) return '';
      const str = String(valor);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Generar filas
    const filas = eventos.map(evento => {
      const estadoInfo = getEstadoInfo(evento.estado);
      return [
        escaparCSV(evento.cliente?.nombre || ''),
        escaparCSV(evento.cliente?.telefono || ''),
        escaparCSV(evento.cliente?.email || ''),
        escaparCSV(evento.local?.nombre || ''),
        escaparCSV(evento.fecha_evento || ''),
        escaparCSV(evento.cantidad_personas || ''),
        escaparCSV(estadoInfo.nombre),
        escaparCSV(evento.presupuesto || ''),
        escaparCSV(evento.comercial?.nombre || 'Sin asignar'),
        escaparCSV(evento.tipo || ''),
        escaparCSV(evento.created_at ? new Date(evento.created_at).toLocaleDateString('es-AR') : ''),
      ].join(',');
    });

    // Crear contenido CSV con BOM para Excel
    const BOM = '\uFEFF';
    const contenido = BOM + headers.join(',') + '\n' + filas.join('\n');

    // Crear y descargar archivo
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `eventos_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Calcular totales generales
  const totalEventos = Object.values(totales).reduce((sum, t) => sum + (t?.cantidad || 0), 0);
  const totalMonto = Object.values(totales).reduce((sum, t) => sum + (t?.monto || 0), 0);

  if (loading) {
    return <div className="loading">Cargando eventos...</div>;
  }

  return (
    <div className="kanban-container">
      {/* Toolbar */}
      <div className="kanban-toolbar">
        <div className="toolbar-left">
          <div className="view-buttons">
            <button
              className={`view-btn ${vistaActiva === 'kanban' ? 'active' : ''}`}
              onClick={() => setVistaActiva('kanban')}
              title="Vista Pipeline"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
              </svg>
            </button>
            <button
              className={`view-btn ${vistaActiva === 'lista' ? 'active' : ''}`}
              onClick={() => setVistaActiva('lista')}
              title="Vista Lista"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/>
                <line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
            <button
              className={`view-btn ${vistaActiva === 'forecast' ? 'active' : ''}`}
              onClick={() => setVistaActiva('forecast')}
              title="Forecast"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </button>
          </div>

          <button className="btn-nuevo" onClick={() => setShowNuevoModal(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Evento
          </button>
        </div>

        <div className="toolbar-right">
          <div className="totales-generales">
            <span className="total-monto">${totalMonto.toLocaleString()}</span>
            <span className="total-separator">·</span>
            <span className="total-count">{totalEventos} eventos</span>
          </div>

          <div className="toolbar-actions">
            <button
              className={`toolbar-btn ${hayFiltrosGlobalesActivos ? 'active-filter' : ''}`}
              onClick={() => setShowFiltrosGlobales(!showFiltrosGlobales)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              Filtros
              {hayFiltrosGlobalesActivos && <span className="filter-badge"></span>}
            </button>
          </div>
        </div>
      </div>

      {/* Barra de filtros globales */}
      {showFiltrosGlobales && (
        <div className="filtros-globales-bar">
          <div className="filtros-row">
            <div className="filtro-group">
              <label>Fecha desde</label>
              <input
                type="date"
                value={filtrosGlobales.fechaDesde}
                onChange={(e) => setFiltrosGlobales({...filtrosGlobales, fechaDesde: e.target.value})}
              />
            </div>
            <div className="filtro-group">
              <label>Fecha hasta</label>
              <input
                type="date"
                value={filtrosGlobales.fechaHasta}
                onChange={(e) => setFiltrosGlobales({...filtrosGlobales, fechaHasta: e.target.value})}
              />
            </div>
            <div className="filtro-group">
              <label>Local</label>
              <select
                value={filtrosGlobales.local_id}
                onChange={(e) => setFiltrosGlobales({...filtrosGlobales, local_id: e.target.value})}
              >
                <option value="">Todos</option>
                {LOCALES.map(local => (
                  <option key={local.id} value={local.id}>{local.nombre}</option>
                ))}
              </select>
            </div>
            <div className="filtro-group">
              <label>Tipo</label>
              <select
                value={filtrosGlobales.tipo}
                onChange={(e) => setFiltrosGlobales({...filtrosGlobales, tipo: e.target.value})}
              >
                <option value="">Todos</option>
                <option value="social">Social</option>
                <option value="corporativo">Corporativo</option>
              </select>
            </div>
            <div className="filtro-group">
              <label>PAX desde</label>
              <input
                type="number"
                placeholder="0"
                min="0"
                value={filtrosGlobales.paxMin}
                onChange={(e) => setFiltrosGlobales({...filtrosGlobales, paxMin: e.target.value})}
              />
            </div>
            <div className="filtro-group">
              <label>PAX hasta</label>
              <input
                type="number"
                placeholder="Sin límite"
                min="0"
                value={filtrosGlobales.paxMax}
                onChange={(e) => setFiltrosGlobales({...filtrosGlobales, paxMax: e.target.value})}
              />
            </div>
            {isAdmin && (
              <div className="filtro-group">
                <label>Comercial</label>
                <select
                  value={filtrosGlobales.comercial_id}
                  onChange={(e) => setFiltrosGlobales({...filtrosGlobales, comercial_id: e.target.value})}
                >
                  <option value="">Todos</option>
                  {comerciales.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="filtro-group">
              <label>Presupuesto mín</label>
              <input
                type="number"
                placeholder="$0"
                value={filtrosGlobales.presupuestoMin}
                onChange={(e) => setFiltrosGlobales({...filtrosGlobales, presupuestoMin: e.target.value})}
              />
            </div>
            <div className="filtro-group">
              <label>Presupuesto máx</label>
              <input
                type="number"
                placeholder="Sin límite"
                value={filtrosGlobales.presupuestoMax}
                onChange={(e) => setFiltrosGlobales({...filtrosGlobales, presupuestoMax: e.target.value})}
              />
            </div>
            {hayFiltrosGlobalesActivos && (
              <button className="btn-limpiar-filtros" onClick={limpiarFiltrosGlobales}>
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {vistaActiva === 'kanban' && (
      <div className="kanban-board">
        {estadosVisibles.map((estado) => {
          const eventosFiltrados = getEventosFiltrados(estado.id);
          const tieneFiltroBusqueda = !!filtrosColumna[estado.id];
          const ordenActual = ordenColumna[estado.id] || 'asc';

          return (
            <div key={estado.id} className="kanban-column">
              <div className="column-header" style={{ borderTopColor: estado.color }}>
                <div className="column-header-top">
                  <h3>{estado.nombre}</h3>
                  <div className="column-actions">
                    {/* Icono de filtro */}
                    <button
                      className={`column-action-btn ${tieneFiltroBusqueda ? 'filter-active' : ''}`}
                      onClick={() => setFiltroActivo(filtroActivo === estado.id ? null : estado.id)}
                      title="Filtrar"
                    >
                      <svg viewBox="0 0 24 24" fill={tieneFiltroBusqueda ? '#16a34a' : 'none'} stroke={tieneFiltroBusqueda ? '#16a34a' : 'currentColor'} strokeWidth="2">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                      </svg>
                    </button>
                    {/* Icono de orden */}
                    <button
                      className={`column-action-btn ${ordenActual === 'desc' ? 'sort-desc' : ''}`}
                      onClick={() => setOrdenColumna({...ordenColumna, [estado.id]: ordenActual === 'asc' ? 'desc' : 'asc'})}
                      title={ordenActual === 'asc' ? 'Mostrando antiguos primero' : 'Mostrando recientes primero'}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M6 12h12M9 18h6"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Input de búsqueda (visible cuando se clickea el filtro) */}
                {filtroActivo === estado.id && (
                  <div className="column-filter-input">
                    <input
                      type="text"
                      placeholder="Buscar cliente, tel, fecha..."
                      value={filtrosColumna[estado.id] || ''}
                      onChange={(e) => setFiltrosColumna({...filtrosColumna, [estado.id]: e.target.value})}
                      autoFocus
                    />
                    {filtrosColumna[estado.id] && (
                      <button
                        className="clear-filter-btn"
                        onClick={() => {
                          setFiltrosColumna({...filtrosColumna, [estado.id]: ''});
                          setFiltroActivo(null);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}

                <div className="column-stats">
                  <span className="stat-monto">
                    ${(totales[estado.id]?.monto || 0).toLocaleString()}
                  </span>
                  <span className="stat-separator">·</span>
                  <span className="stat-count">{eventosFiltrados.length} eventos</span>
                </div>
              </div>

              <div className="column-content">
                {eventosFiltrados.map((evento) => (
                  <EventoCard
                    key={evento.id}
                    evento={evento}
                    onClick={() => handleEventoClick(evento)}
                    onPrecheckClick={() => handleEventoClick(evento, 'precheck')}
                    onEtiquetaChange={cargarEventos}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Vista Lista */}
      {vistaActiva === 'lista' && (
        <div className="lista-container">
          {/* Barra de búsqueda para lista */}
          <div className="lista-toolbar">
            <div className="lista-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder="Buscar por cliente, local, comercial, estado..."
                value={busquedaLista}
                onChange={(e) => setBusquedaLista(e.target.value)}
              />
              {busquedaLista && (
                <button className="clear-search" onClick={() => setBusquedaLista('')}>×</button>
              )}
            </div>
            <div className="lista-actions">
              <button className="btn-csv" onClick={descargarCSV} title="Descargar CSV">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                CSV
              </button>
              <span className="lista-info">
                {getTodosLosEventos().length} eventos
              </span>
            </div>
          </div>

          {/* Tabla */}
          <div className="lista-tabla-container">
            <table className="lista-tabla">
              <thead>
                <tr>
                  <th className="col-sortable" onClick={() => handleOrdenarLista('cliente')}>
                    Cliente
                    {ordenLista.campo === 'cliente' && (
                      <span className="sort-indicator">{ordenLista.direccion === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th className="col-sortable" onClick={() => handleOrdenarLista('local')}>
                    Local
                    {ordenLista.campo === 'local' && (
                      <span className="sort-indicator">{ordenLista.direccion === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th className="col-sortable" onClick={() => handleOrdenarLista('fecha_evento')}>
                    Fecha Evento
                    {ordenLista.campo === 'fecha_evento' && (
                      <span className="sort-indicator">{ordenLista.direccion === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th>PAX</th>
                  <th className="col-sortable" onClick={() => handleOrdenarLista('estado')}>
                    Estado
                    {ordenLista.campo === 'estado' && (
                      <span className="sort-indicator">{ordenLista.direccion === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th className="col-sortable col-monto" onClick={() => handleOrdenarLista('presupuesto')}>
                    Presupuesto
                    {ordenLista.campo === 'presupuesto' && (
                      <span className="sort-indicator">{ordenLista.direccion === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th className="col-sortable" onClick={() => handleOrdenarLista('comercial')}>
                    Comercial
                    {ordenLista.campo === 'comercial' && (
                      <span className="sort-indicator">{ordenLista.direccion === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th className="col-sortable" onClick={() => handleOrdenarLista('created_at')}>
                    Creado
                    {ordenLista.campo === 'created_at' && (
                      <span className="sort-indicator">{ordenLista.direccion === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {getTodosLosEventos().length === 0 ? (
                  <tr>
                    <td colSpan="8" className="sin-resultados">
                      No hay eventos que coincidan con los filtros
                    </td>
                  </tr>
                ) : (
                  getTodosLosEventos().map((evento) => {
                    const estadoInfo = getEstadoInfo(evento.estado);
                    return (
                      <tr
                        key={evento.id}
                        onClick={() => handleEventoClick(evento)}
                        className="fila-evento"
                      >
                        <td className="col-cliente">
                          <div className="cliente-info">
                            <span className="cliente-nombre">{evento.cliente?.nombre || '-'}</span>
                            <span className="cliente-telefono">{evento.cliente?.telefono || ''}</span>
                          </div>
                        </td>
                        <td className="col-local-lista">
                          {evento.local?.nombre || <span className="sin-asignar">Sin local</span>}
                        </td>
                        <td>{formatearFecha(evento.fecha_evento)}</td>
                        <td className="col-pax">{evento.cantidad_personas || '-'}</td>
                        <td>
                          <span className="badge-estado-lista" style={{ backgroundColor: estadoInfo.color }}>
                            {estadoInfo.nombre}
                          </span>
                        </td>
                        <td className="col-monto">
                          {evento.presupuesto ? `$${evento.presupuesto.toLocaleString()}` : '-'}
                        </td>
                        <td>{evento.comercial?.nombre || <span className="sin-asignar">Sin asignar</span>}</td>
                        <td className="col-fecha-creado">
                          {new Date(evento.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vista Forecast (placeholder) */}
      {vistaActiva === 'forecast' && (
        <div className="forecast-placeholder">
          <p>Vista Forecast - Próximamente</p>
        </div>
      )}

      {eventoSeleccionado && (
        <EventoModal
          evento={eventoSeleccionado}
          onClose={() => setEventoSeleccionado(null)}
          onUpdated={handleEventoUpdated}
          onRefresh={handleEventoRefresh}
          tabInicial={tabInicial}
        />
      )}

      {showNuevoModal && (
        <NuevoEventoModal
          onClose={() => setShowNuevoModal(false)}
          onCreated={handleNuevoEvento}
        />
      )}
    </div>
  );
}

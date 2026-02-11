import { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { eventosApi, usuariosApi } from '../services/api';
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
];

const LOCALES = [
  { id: 1, nombre: 'Costa7070' },
  { id: 2, nombre: 'Kona' },
  { id: 3, nombre: 'MilVidas' },
  { id: 4, nombre: 'CoChinChina' },
];

export default function Kanban() {
  const [kanban, setKanban] = useState({});
  const [totales, setTotales] = useState({});
  const [loading, setLoading] = useState(true);
  const [eventoSeleccionado, setEventoSeleccionado] = useState(null);
  const [showNuevoModal, setShowNuevoModal] = useState(false);
  const [vistaActiva, setVistaActiva] = useState('kanban');
  const [tabInicial, setTabInicial] = useState('detalle');
  const [comerciales, setComerciales] = useState([]);

  // Filtros generales
  const [filtrosGlobales, setFiltrosGlobales] = useState({
    fechaDesde: '',
    fechaHasta: '',
    local_id: '',
    comercial_id: '',
    tipo: '',
  });
  const [showFiltrosGlobales, setShowFiltrosGlobales] = useState(false);

  // Filtros y orden por columna
  const [filtrosColumna, setFiltrosColumna] = useState({});
  const [ordenColumna, setOrdenColumna] = useState({}); // 'asc' = antiguos primero (default), 'desc' = recientes primero
  const [filtroActivo, setFiltroActivo] = useState(null); // columna con input abierto

  useEffect(() => {
    cargarEventos();
    cargarComerciales();
  }, []);

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
      const response = await usuariosApi.listar('comercial');
      setComerciales(response.data.usuarios || []);
    } catch (error) {
      console.error('Error cargando comerciales:', error);
    }
  };

  // Función para filtrar y ordenar eventos de una columna
  const getEventosFiltrados = (estadoId) => {
    let eventos = kanban[estadoId] || [];

    // Aplicar filtros globales
    if (filtrosGlobales.fechaDesde) {
      eventos = eventos.filter(e => e.fecha_evento >= filtrosGlobales.fechaDesde);
    }
    if (filtrosGlobales.fechaHasta) {
      eventos = eventos.filter(e => e.fecha_evento <= filtrosGlobales.fechaHasta);
    }
    if (filtrosGlobales.local_id) {
      eventos = eventos.filter(e => e.local?.id === parseInt(filtrosGlobales.local_id));
    }
    if (filtrosGlobales.comercial_id) {
      eventos = eventos.filter(e => e.comercial?.id === parseInt(filtrosGlobales.comercial_id));
    }
    if (filtrosGlobales.tipo) {
      eventos = eventos.filter(e => e.tipo === filtrosGlobales.tipo);
    }

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

  const limpiarFiltrosGlobales = () => {
    setFiltrosGlobales({
      fechaDesde: '',
      fechaHasta: '',
      local_id: '',
      comercial_id: '',
      tipo: '',
    });
  };

  const handleDragEnd = async (result) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const eventoId = parseInt(draggableId);
    const nuevoEstado = destination.droppableId;
    const estadoAnterior = source.droppableId;

    // Actualizar UI optimisticamente
    const evento = kanban[estadoAnterior].find(e => e.id === eventoId);
    const newKanban = { ...kanban };
    newKanban[estadoAnterior] = kanban[estadoAnterior].filter(e => e.id !== eventoId);
    newKanban[nuevoEstado] = [...(kanban[nuevoEstado] || []), { ...evento, estado: nuevoEstado }];
    setKanban(newKanban);

    // Actualizar en backend
    try {
      await eventosApi.actualizar(eventoId, { estado: nuevoEstado });
    } catch (error) {
      console.error('Error actualizando estado:', error);
      cargarEventos(); // Recargar si falla
    }
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
            <span className="total-weighted">${Math.round(totalMonto * 0.6).toLocaleString()}</span>
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
            {hayFiltrosGlobalesActivos && (
              <button className="btn-limpiar-filtros" onClick={limpiarFiltrosGlobales}>
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="kanban-board">
          {ESTADOS.map((estado) => {
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

              <Droppable droppableId={estado.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`column-content ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                  >
                    {eventosFiltrados.map((evento, index) => (
                      <Draggable
                        key={evento.id}
                        draggableId={String(evento.id)}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                          >
                            <EventoCard
                              evento={evento}
                              isDragging={snapshot.isDragging}
                              onClick={() => handleEventoClick(evento)}
                              onPrecheckClick={() => handleEventoClick(evento, 'precheck')}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}

                    {/* Botón agregar en columna */}
                    <button className="add-in-column" onClick={() => setShowNuevoModal(true)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14"/>
                      </svg>
                    </button>
                  </div>
                )}
              </Droppable>
            </div>
          );
          })}
        </div>
      </DragDropContext>

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

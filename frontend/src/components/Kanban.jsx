import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { eventosApi } from '../services/api';
import EventoCard from './EventoCard';
import EventoModal from './EventoModal';
import NuevoEventoModal from './NuevoEventoModal';
import './Kanban.css';

const ESTADOS = [
  { id: 'CONSULTA_ENTRANTE', nombre: 'Consulta Entrante', color: '#6b7280' },
  { id: 'ASIGNADO', nombre: 'Asignado', color: '#3b82f6' },
  { id: 'CONTACTADO', nombre: 'Contactado', color: '#8b5cf6' },
  { id: 'COTIZADO', nombre: 'Cotizado', color: '#f59e0b' },
  { id: 'CONFIRMADO', nombre: 'Confirmado', color: '#10b981' },
];

export default function Kanban() {
  const [kanban, setKanban] = useState({});
  const [totales, setTotales] = useState({});
  const [loading, setLoading] = useState(true);
  const [eventoSeleccionado, setEventoSeleccionado] = useState(null);
  const [showNuevoModal, setShowNuevoModal] = useState(false);
  const [vistaActiva, setVistaActiva] = useState('kanban');
  const [tabInicial, setTabInicial] = useState('detalle');

  useEffect(() => {
    cargarEventos();
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
            <button className="toolbar-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              Pipeline
              <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            <button className="toolbar-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>

            <button className="toolbar-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="21" x2="4" y2="14"/>
                <line x1="4" y1="10" x2="4" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12" y2="3"/>
                <line x1="20" y1="21" x2="20" y2="16"/>
                <line x1="20" y1="12" x2="20" y2="3"/>
                <line x1="1" y1="14" x2="7" y2="14"/>
                <line x1="9" y1="8" x2="15" y2="8"/>
                <line x1="17" y1="16" x2="23" y2="16"/>
              </svg>
              Todos
              <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="kanban-board">
          {ESTADOS.map((estado) => (
            <div key={estado.id} className="kanban-column">
              <div className="column-header" style={{ borderTopColor: estado.color }}>
                <h3>{estado.nombre}</h3>
                <div className="column-stats">
                  <span className="stat-monto">
                    ${(totales[estado.id]?.monto || 0).toLocaleString()}
                  </span>
                  <span className="stat-separator">·</span>
                  <span className="stat-count">{totales[estado.id]?.cantidad || 0} eventos</span>
                </div>
              </div>

              <Droppable droppableId={estado.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`column-content ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                  >
                    {(kanban[estado.id] || []).map((evento, index) => (
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
          ))}
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

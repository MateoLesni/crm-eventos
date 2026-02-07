import { useState, useEffect } from 'react';
import { eventosApi, usuariosApi } from '../services/api';
import './Modal.css';

const LOCALES = [
  { id: 1, nombre: 'Costa7070' },
  { id: 2, nombre: 'Kona' },
  { id: 3, nombre: 'MilVidas' },
  { id: 4, nombre: 'CoChinChina' },
  { id: 5, nombre: 'Cruza Polo' },
  { id: 6, nombre: 'Cruza Recoleta' },
];

export default function EventoModal({ evento, onClose, onUpdated }) {
  const [eventoDetalle, setEventoDetalle] = useState(null);
  const [actividades, setActividades] = useState([]);
  const [comerciales, setComerciales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevaActividad, setNuevaActividad] = useState({ tipo: 'nota', contenido: '' });

  // Estados para modales de acciones
  const [showCotizacion, setShowCotizacion] = useState(false);
  const [montoCotizacion, setMontoCotizacion] = useState('');
  const [showEditar, setShowEditar] = useState(false);
  const [datosEdicion, setDatosEdicion] = useState({});
  const [guardandoCotizacion, setGuardandoCotizacion] = useState(false);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, [evento.id]);

  const cargarDatos = async () => {
    try {
      const [eventoRes, comercialesRes] = await Promise.all([
        eventosApi.obtener(evento.id),
        usuariosApi.listar('comercial'),
      ]);
      setEventoDetalle(eventoRes.data.evento);
      setActividades(eventoRes.data.actividades);
      setComerciales(comercialesRes.data.usuarios);
      // Inicializar datos de edicion con todos los campos
      const ev = eventoRes.data.evento;
      setDatosEdicion({
        titulo: ev.titulo || '',
        cantidad_personas: ev.cantidad_personas || '',
        fecha_evento: ev.fecha_evento || '',
        horario_inicio: ev.horario_inicio || '',
        horario_fin: ev.horario_fin || '',
        tipo: ev.tipo || '',
        local_id: ev.local?.id || '',
        comercial_id: ev.comercial?.id || '',
      });
      setMontoCotizacion(ev.presupuesto || '');
    } catch (error) {
      console.error('Error cargando detalle:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAsignar = async (comercialId) => {
    try {
      await eventosApi.asignar(evento.id, comercialId);
      cargarDatos();
      onUpdated();
    } catch (error) {
      console.error('Error asignando:', error);
    }
  };

  const handleAgregarActividad = async (e) => {
    e.preventDefault();
    if (!nuevaActividad.contenido.trim()) return;

    try {
      await eventosApi.agregarActividad(evento.id, nuevaActividad);
      setNuevaActividad({ tipo: 'nota', contenido: '' });
      cargarDatos();
    } catch (error) {
      console.error('Error agregando actividad:', error);
    }
  };

  const handleGuardarCotizacion = async () => {
    if (!montoCotizacion) return;

    setGuardandoCotizacion(true);
    try {
      await eventosApi.actualizar(evento.id, {
        presupuesto: parseFloat(montoCotizacion),
      });
      setShowCotizacion(false);
      cargarDatos();
      onUpdated();
    } catch (error) {
      console.error('Error guardando cotizacion:', error);
    } finally {
      setGuardandoCotizacion(false);
    }
  };

  const handleGuardarEdicion = async () => {
    setGuardandoEdicion(true);
    try {
      await eventosApi.actualizar(evento.id, datosEdicion);
      setShowEditar(false);
      cargarDatos();
      onUpdated();
    } catch (error) {
      console.error('Error guardando edicion:', error);
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const handleCambiarEstadoFinal = async (nuevoEstado) => {
    try {
      await eventosApi.actualizar(evento.id, { estado: nuevoEstado });
      cargarDatos();
      onUpdated();
    } catch (error) {
      console.error('Error cambiando estado:', error);
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="loading">Cargando...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Modal principal */}
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>x</button>

          <div className="modal-header">
            <h2>{eventoDetalle?.titulo_display || eventoDetalle?.titulo || `Evento de ${eventoDetalle?.cliente?.nombre}`}</h2>
            {eventoDetalle?.es_cliente_recurrente && (
              <span className="badge-recurrente-large">Cliente Recurrente</span>
            )}
            <span className={`badge-estado estado-${eventoDetalle?.estado?.toLowerCase()}`}>
              {eventoDetalle?.estado}
            </span>
          </div>

          <div className="modal-body">
            <div className="modal-grid">
              {/* Columna izquierda - Datos */}
              <div className="modal-col">
                <section className="modal-section">
                  <h3>Cliente</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <label>Nombre</label>
                      <span>{eventoDetalle?.cliente?.nombre}</span>
                    </div>
                    <div className="info-item">
                      <label>Telefono</label>
                      <span>{eventoDetalle?.cliente?.telefono}</span>
                    </div>
                    <div className="info-item">
                      <label>Email</label>
                      <span>{eventoDetalle?.cliente?.email || '-'}</span>
                    </div>
                    <div className="info-item">
                      <label>Eventos anteriores</label>
                      <span>{eventoDetalle?.cliente?.cantidad_eventos - 1 || 0}</span>
                    </div>
                  </div>
                </section>

                <section className="modal-section">
                  <h3>Evento</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <label>Local</label>
                      <span>{eventoDetalle?.local?.nombre || 'Sin asignar'}</span>
                    </div>
                    <div className="info-item">
                      <label>Fecha</label>
                      <span>
                        {eventoDetalle?.fecha_evento
                          ? new Date(eventoDetalle.fecha_evento).toLocaleDateString('es-AR')
                          : 'Sin definir'}
                      </span>
                    </div>
                    <div className="info-item">
                      <label>Personas</label>
                      <span>{eventoDetalle?.cantidad_personas || '-'}</span>
                    </div>
                    <div className="info-item">
                      <label>Tipo</label>
                      <span>{eventoDetalle?.tipo || '-'}</span>
                    </div>
                    <div className="info-item">
                      <label>Horario</label>
                      <span>
                        {eventoDetalle?.horario_inicio || eventoDetalle?.horario_fin
                          ? `${eventoDetalle?.horario_inicio || '?'} - ${eventoDetalle?.horario_fin || '?'}`
                          : '-'}
                      </span>
                    </div>
                    <div className="info-item">
                      <label>Presupuesto</label>
                      <span className="monto">
                        {eventoDetalle?.presupuesto
                          ? `$${eventoDetalle.presupuesto.toLocaleString()}`
                          : '-'}
                      </span>
                    </div>
                    <div className="info-item">
                      <label>Canal</label>
                      <span>{eventoDetalle?.canal_origen || '-'}</span>
                    </div>
                  </div>
                </section>

                <section className="modal-section">
                  <h3>Asignacion</h3>
                  <div className="asignacion-control">
                    <select
                      value={eventoDetalle?.comercial?.id || ''}
                      onChange={(e) => handleAsignar(e.target.value)}
                    >
                      <option value="">Sin asignar</option>
                      {comerciales.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </section>

                {/* Acciones */}
                <section className="modal-section">
                  <h3>Acciones</h3>
                  <div className="acciones-grid">
                    {/* Cotizacion */}
                    <button
                      className="accion-btn"
                      onClick={() => setShowCotizacion(true)}
                      title="Agregar cotizacion"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="1" x2="12" y2="23"/>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                      </svg>
                    </button>

                    {/* Editar */}
                    <button
                      className="accion-btn"
                      onClick={() => setShowEditar(true)}
                      title="Editar datos"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>

                    {/* WhatsApp */}
                    <button
                      className="accion-btn"
                      onClick={() => alert('Funcion de WhatsApp proximamente')}
                      title="Ver conversacion WhatsApp"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                      </svg>
                    </button>
                  </div>

                  {/* Botones de estado final */}
                  {eventoDetalle?.estado !== 'CONFIRMADO' && eventoDetalle?.estado !== 'RECHAZADO' && (
                    <div className="estado-final-btns">
                      <button
                        className="btn-confirmar"
                        onClick={() => handleCambiarEstadoFinal('CONFIRMADO')}
                      >
                        Confirmar evento
                      </button>
                      <button
                        className="btn-rechazar"
                        onClick={() => handleCambiarEstadoFinal('RECHAZADO')}
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </section>
              </div>

              {/* Columna derecha - Actividades */}
              <div className="modal-col">
                <section className="modal-section">
                  <h3>Historial de Actividades</h3>

                  <form onSubmit={handleAgregarActividad} className="nueva-actividad">
                    <select
                      value={nuevaActividad.tipo}
                      onChange={(e) => setNuevaActividad({ ...nuevaActividad, tipo: e.target.value })}
                    >
                      <option value="nota">Nota</option>
                      <option value="llamada">Llamada</option>
                      <option value="mail">Mail</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="reunion">Reunion</option>
                      <option value="presupuesto">Presupuesto</option>
                    </select>
                    <textarea
                      placeholder="Agregar actividad..."
                      value={nuevaActividad.contenido}
                      onChange={(e) => setNuevaActividad({ ...nuevaActividad, contenido: e.target.value })}
                      rows={2}
                    />
                    <button type="submit" className="btn-agregar">Agregar</button>
                  </form>

                  <div className="actividades-lista">
                    {actividades.map((act) => (
                      <div key={act.id} className="actividad-item">
                        <div className="actividad-header">
                          <span className={`actividad-tipo tipo-${act.tipo}`}>
                            {act.tipo}
                          </span>
                          <span className="actividad-fecha">
                            {new Date(act.created_at).toLocaleDateString('es-AR', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <p className="actividad-contenido">{act.contenido}</p>
                        <span className="actividad-usuario">{act.usuario}</span>
                      </div>
                    ))}

                    {actividades.length === 0 && (
                      <p className="sin-actividades">Sin actividades registradas</p>
                    )}
                  </div>
                </section>

                {eventoDetalle?.mensaje_original && (
                  <section className="modal-section">
                    <h3>Mensaje Original</h3>
                    <div className="mensaje-original">
                      {eventoDetalle.mensaje_original}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Cotizacion - Centrado */}
      {showCotizacion && (
        <div className="modal-overlay modal-cotizacion-overlay" onClick={() => setShowCotizacion(false)}>
          <div className="modal-cotizacion" onClick={(e) => e.stopPropagation()}>
            <h3>Agregar Cotizacion</h3>
            <div className="cotizacion-input">
              <span className="input-prefix">$</span>
              <input
                type="number"
                value={montoCotizacion}
                onChange={(e) => setMontoCotizacion(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="cotizacion-btns">
              <button className="btn-secondary" onClick={() => setShowCotizacion(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleGuardarCotizacion}
                disabled={guardandoCotizacion || !montoCotizacion}
              >
                {guardandoCotizacion ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edicion - Mismo formato que NuevoEventoModal */}
      {showEditar && (
        <div className="modal-overlay" onClick={() => setShowEditar(false)}>
          <div className="modal-content modal-medium" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowEditar(false)}>x</button>

            <div className="modal-header">
              <h2>Editar Evento</h2>
            </div>

            <div className="modal-body">
              {/* Datos del evento */}
              <section className="form-section">
                <h3>Evento</h3>

                <div className="form-group">
                  <label htmlFor="edit-titulo">Titulo del evento</label>
                  <input
                    type="text"
                    id="edit-titulo"
                    value={datosEdicion.titulo}
                    onChange={(e) => setDatosEdicion({...datosEdicion, titulo: e.target.value})}
                    placeholder="Ej: Cumpleanos de Maria, Corporativo Acme"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="edit-local">Local</label>
                    <select
                      id="edit-local"
                      value={datosEdicion.local_id}
                      onChange={(e) => setDatosEdicion({...datosEdicion, local_id: e.target.value})}
                    >
                      <option value="">Seleccionar local</option>
                      {LOCALES.map((local) => (
                        <option key={local.id} value={local.id}>
                          {local.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="edit-tipo">Tipo</label>
                    <select
                      id="edit-tipo"
                      value={datosEdicion.tipo}
                      onChange={(e) => setDatosEdicion({...datosEdicion, tipo: e.target.value})}
                    >
                      <option value="">Seleccionar</option>
                      <option value="social">Social</option>
                      <option value="corporativo">Corporativo</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="edit-fecha">Fecha</label>
                    <input
                      type="date"
                      id="edit-fecha"
                      value={datosEdicion.fecha_evento}
                      onChange={(e) => setDatosEdicion({...datosEdicion, fecha_evento: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="edit-personas">Cantidad de personas</label>
                    <input
                      type="number"
                      id="edit-personas"
                      value={datosEdicion.cantidad_personas}
                      onChange={(e) => setDatosEdicion({...datosEdicion, cantidad_personas: e.target.value})}
                      min="20"
                      placeholder="Minimo 20"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="edit-horario-inicio">Horario inicio</label>
                    <input
                      type="time"
                      id="edit-horario-inicio"
                      value={datosEdicion.horario_inicio}
                      onChange={(e) => setDatosEdicion({...datosEdicion, horario_inicio: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="edit-horario-fin">Horario fin</label>
                    <input
                      type="time"
                      id="edit-horario-fin"
                      value={datosEdicion.horario_fin}
                      onChange={(e) => setDatosEdicion({...datosEdicion, horario_fin: e.target.value})}
                    />
                  </div>
                </div>
              </section>

              {/* Asignacion */}
              <section className="form-section">
                <h3>Asignacion</h3>
                <div className="form-group">
                  <label htmlFor="edit-comercial">Comercial</label>
                  <select
                    id="edit-comercial"
                    value={datosEdicion.comercial_id}
                    onChange={(e) => setDatosEdicion({...datosEdicion, comercial_id: e.target.value})}
                  >
                    <option value="">Sin asignar</option>
                    {comerciales.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowEditar(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleGuardarEdicion}
                  disabled={guardandoEdicion}
                >
                  {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

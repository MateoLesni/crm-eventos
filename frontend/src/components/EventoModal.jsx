import { useState, useEffect } from 'react';
import { eventosApi, usuariosApi, clientesApi, calendarioApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import WhatsAppChat from './WhatsAppChat';
import GmailChat from './GmailChat';
import PreCheckTab from './PreCheckTab';
import './Modal.css';

const LOCALES = [
  { id: 1, nombre: 'Costa7070' },
  { id: 2, nombre: 'Kona' },
  { id: 3, nombre: 'MilVidas' },
  { id: 4, nombre: 'CoChinChina' },
  { id: 5, nombre: 'Cruza Polo' },
  { id: 6, nombre: 'Cruza Recoleta' },
  { id: 7, nombre: 'La Mala' },
];

export default function EventoModal({ evento, onClose, onUpdated, onRefresh, tabInicial = 'detalle' }) {
  const { usuario } = useAuth();
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
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [activeTab, setActiveTab] = useState(tabInicial); // detalle, precheck, whatsapp
  const [tienePrecheck, setTienePrecheck] = useState(false);

  // Estados para editar cliente
  const [showEditarCliente, setShowEditarCliente] = useState(false);
  const [datosCliente, setDatosCliente] = useState({});
  const [guardandoCliente, setGuardandoCliente] = useState(false);

  // Estados para advertencia de fecha duplicada
  const [showAdvertenciaFecha, setShowAdvertenciaFecha] = useState(false);
  const [eventosEnFecha, setEventosEnFecha] = useState([]);
  const [pendienteGuardar, setPendienteGuardar] = useState(null);

  // Estados para modal de rechazo
  const [showRechazo, setShowRechazo] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [guardandoRechazo, setGuardandoRechazo] = useState(false);

  // Estados para modal de revertir estado
  const [showRevertir, setShowRevertir] = useState(false);
  const [guardandoRevertir, setGuardandoRevertir] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, [evento.id]);

  const cargarDatos = async () => {
    try {
      const [eventoRes, comercialesRes] = await Promise.all([
        eventosApi.obtener(evento.id),
        usuariosApi.listar(),
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
      // Inicializar datos del cliente
      if (ev.cliente) {
        setDatosCliente({
          nombre: ev.cliente.nombre || '',
          telefono: ev.cliente.telefono || '',
          email: ev.cliente.email || '',
          empresa: ev.cliente.empresa || '',
        });
      }
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

  // Formatear número con separador de miles
  const formatearNumero = (valor) => {
    if (valor === '' || valor === null || valor === undefined) return '';
    const numero = parseInt(String(valor).replace(/\./g, ''), 10);
    if (isNaN(numero)) return '';
    return numero.toLocaleString('es-AR');
  };

  // Parsear número formateado a número real
  const parsearNumero = (valorFormateado) => {
    if (!valorFormateado) return 0;
    return parseInt(String(valorFormateado).replace(/\./g, ''), 10) || 0;
  };

  const handleGuardarCotizacion = async () => {
    const montoNumerico = parsearNumero(montoCotizacion);
    if (!montoNumerico) return;

    // Validar que tenga comercial asignado
    if (!eventoDetalle?.comercial?.id) {
      alert('Para agregar presupuesto, primero debe asignar un comercial.');
      return;
    }

    setGuardandoCotizacion(true);
    try {
      await eventosApi.actualizar(evento.id, {
        presupuesto: montoNumerico,
      });
      setShowCotizacion(false);
      cargarDatos();
      onUpdated();
    } catch (error) {
      console.error('Error guardando cotizacion:', error);
      const errorMsg = error.response?.data?.error || 'Error guardando cotización';
      alert(errorMsg);
    } finally {
      setGuardandoCotizacion(false);
    }
  };

  const verificarFechaYGuardar = async (datos, forzar = false) => {
    // Si hay fecha y local, verificar si hay eventos existentes
    if (datos.fecha_evento && datos.local_id && !forzar) {
      try {
        const res = await calendarioApi.verificarFecha(datos.fecha_evento, datos.local_id, evento.id);
        const verificacion = res.data;

        if (verificacion.tiene_eventos) {
          // Mostrar advertencia
          setEventosEnFecha(verificacion.eventos);
          setPendienteGuardar(datos);
          setShowAdvertenciaFecha(true);
          return false; // No guardar todavía
        }
      } catch (error) {
        console.error('Error verificando fecha:', error);
        // Si falla la verificación, continuar con el guardado
      }
    }
    return true; // Continuar con el guardado
  };

  const handleGuardarEdicion = async () => {
    // Validar que si hay horario, haya comercial asignado
    if ((datosEdicion.horario_inicio || datosEdicion.horario_fin) && !datosEdicion.comercial_id) {
      alert('Para asignar horario, primero debe asignar un comercial.');
      return;
    }

    // Verificar si la fecha está ocupada
    const puedeGuardar = await verificarFechaYGuardar(datosEdicion);
    if (!puedeGuardar) return;

    await ejecutarGuardadoEdicion(datosEdicion);
  };

  const ejecutarGuardadoEdicion = async (datos) => {
    setGuardandoEdicion(true);
    try {
      await eventosApi.actualizar(evento.id, datos);
      setShowEditar(false);
      setShowAdvertenciaFecha(false);
      setPendienteGuardar(null);
      cargarDatos();
      onUpdated();
    } catch (error) {
      console.error('Error guardando edicion:', error);
      const errorMsg = error.response?.data?.error || 'Error guardando cambios';
      alert(errorMsg);
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const handleConfirmarFechaDuplicada = async () => {
    if (pendienteGuardar) {
      await ejecutarGuardadoEdicion(pendienteGuardar);
    }
  };

  const handleCancelarFechaDuplicada = () => {
    setShowAdvertenciaFecha(false);
    setPendienteGuardar(null);
    setEventosEnFecha([]);
  };

  const handleCambiarEstadoFinal = async (nuevoEstado) => {
    try {
      await eventosApi.actualizar(evento.id, { estado: nuevoEstado });
      cargarDatos();
      onUpdated();
    } catch (error) {
      console.error('Error cambiando estado:', error);
      alert(error.response?.data?.error || 'Error cambiando estado');
    }
  };

  const handleConfirmarRechazo = async () => {
    if (!motivoRechazo.trim()) return;
    setGuardandoRechazo(true);
    try {
      await eventosApi.actualizar(evento.id, {
        estado: 'RECHAZADO',
        motivo_rechazo: motivoRechazo.trim()
      });
      setShowRechazo(false);
      setMotivoRechazo('');
      cargarDatos();
      onUpdated();
    } catch (error) {
      console.error('Error rechazando evento:', error);
      alert(error.response?.data?.error || 'Error al rechazar evento');
    } finally {
      setGuardandoRechazo(false);
    }
  };

  // Calcula el estado destino al revertir (replica la lógica del backend)
  const calcularEstadoDestino = () => {
    if (!eventoDetalle) return 'COTIZADO';
    const comercial = eventoDetalle.comercial;
    if (!comercial?.id) return 'CONSULTA_ENTRANTE';
    if (comercial.email === 'reservasmultiples@opgroup.com.ar') return 'MULTIRESERVA';
    if (eventoDetalle.presupuesto) return 'COTIZADO';
    if (eventoDetalle.horario_inicio || eventoDetalle.horario_fin) return 'CONTACTADO';
    return 'ASIGNADO';
  };

  const handleConfirmarRevertir = async () => {
    setGuardandoRevertir(true);
    try {
      await eventosApi.actualizar(evento.id, { estado: 'REVERTIR_ESTADO' });
      setShowRevertir(false);
      cargarDatos();
      onUpdated();
    } catch (error) {
      console.error('Error revirtiendo estado:', error);
      alert(error.response?.data?.error || 'Error al revertir estado');
    } finally {
      setGuardandoRevertir(false);
    }
  };

  const handleGuardarCliente = async () => {
    if (!datosCliente.nombre?.trim()) {
      alert('El nombre del cliente es requerido');
      return;
    }
    if (!datosCliente.telefono?.trim() && !datosCliente.email?.trim()) {
      alert('Se requiere al menos teléfono o email');
      return;
    }

    setGuardandoCliente(true);
    try {
      await clientesApi.actualizar(eventoDetalle.cliente.id, datosCliente);
      setShowEditarCliente(false);
      cargarDatos();
      onRefresh();
    } catch (error) {
      console.error('Error guardando cliente:', error);
      const errorMsg = error.response?.data?.error || 'Error guardando cliente';
      alert(errorMsg);
    } finally {
      setGuardandoCliente(false);
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

          {/* Tabs de navegacion */}
          <div className="modal-tabs">
            <button
              className={`modal-tab ${activeTab === 'detalle' ? 'active' : ''}`}
              onClick={() => setActiveTab('detalle')}
            >
              Detalle
            </button>
            {(eventoDetalle?.estado === 'APROBADO' || eventoDetalle?.estado === 'CONCLUIDO') && (
              <button
                className={`modal-tab ${activeTab === 'precheck' ? 'active' : ''}`}
                onClick={() => setActiveTab('precheck')}
              >
                Pre-Check
                {tienePrecheck && <span className="tab-badge">P</span>}
              </button>
            )}
            <button
              className={`modal-tab ${activeTab === 'whatsapp' ? 'active' : ''}`}
              onClick={() => setActiveTab('whatsapp')}
            >
              WhatsApp
            </button>
            {eventoDetalle?.thread_id && (
              <button
                className={`modal-tab ${activeTab === 'gmail' ? 'active' : ''}`}
                onClick={() => setActiveTab('gmail')}
              >
                Gmail
              </button>
            )}
          </div>

          <div className="modal-body">
            {/* Tab Detalle */}
            {activeTab === 'detalle' && (
            <div className="modal-grid">
              {/* Columna izquierda - Datos */}
              <div className="modal-col">
                <section className="modal-section">
                  <div className="section-header">
                    <h3>Cliente</h3>
                    <button
                      className="btn-editar-small"
                      onClick={() => setShowEditarCliente(true)}
                      title="Editar cliente"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                  </div>
                  <div className="info-grid">
                    <div className="info-item">
                      <label>Nombre</label>
                      <span>{eventoDetalle?.cliente?.nombre}</span>
                    </div>
                    <div className="info-item">
                      <label>Telefono</label>
                      <span>
                        {eventoDetalle?.cliente?.telefono?.startsWith('email:')
                          ? <em style={{color: '#f59e0b'}}>Sin teléfono</em>
                          : eventoDetalle?.cliente?.telefono}
                      </span>
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

                {/* Agregar Actividad */}
                <section className="modal-section">
                  <h3>Agregar Actividad</h3>
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

              {/* Columna derecha - Acciones */}
              <div className="modal-col">
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
                      className="accion-btn accion-whatsapp"
                      onClick={() => setShowWhatsApp(true)}
                      title="Ver conversacion WhatsApp"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                      </svg>
                    </button>
                  </div>

                  {/* Motivo de rechazo visible */}
                  {eventoDetalle?.estado === 'RECHAZADO' && eventoDetalle?.motivo_rechazo && (
                    <div className="motivo-rechazo-display">
                      <strong>Motivo del rechazo:</strong>
                      <p>{eventoDetalle.motivo_rechazo}</p>
                    </div>
                  )}

                  {/* Botones de estado final - para eventos que NO están en estado final */}
                  {eventoDetalle?.estado !== 'APROBADO' && eventoDetalle?.estado !== 'RECHAZADO' && eventoDetalle?.estado !== 'CONCLUIDO' && (
                    <div className="estado-final-btns">
                      <button
                        className="btn-confirmar"
                        onClick={() => handleCambiarEstadoFinal('APROBADO')}
                      >
                        Aprobar evento
                      </button>
                      <button
                        className="btn-rechazar"
                        onClick={() => setShowRechazo(true)}
                      >
                        Rechazar
                      </button>
                    </div>
                  )}

                  {/* Botones de reversión - para RECHAZADO */}
                  {eventoDetalle?.estado === 'RECHAZADO' && (
                    <div className="estado-revertir-btns">
                      <button
                        className="btn-revertir"
                        onClick={() => setShowRevertir(true)}
                      >
                        Revertir estado
                      </button>
                    </div>
                  )}

                  {/* Botones de reversión - para APROBADO */}
                  {eventoDetalle?.estado === 'APROBADO' && (
                    <div className="estado-revertir-btns">
                      <button
                        className="btn-revertir"
                        onClick={() => setShowRevertir(true)}
                      >
                        Revertir estado
                      </button>
                    </div>
                  )}
                </section>

                {/* Historial de Actividades */}
                <section className="modal-section">
                  <h3>Historial de Actividades</h3>
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
              </div>
            </div>
            )}

            {/* Tab Pre-Check */}
            {activeTab === 'precheck' && (
              <PreCheckTab
                eventoId={evento.id}
                estado={eventoDetalle?.estado}
                onPrecheckChange={(tiene) => {
                  setTienePrecheck(tiene);
                  if (onRefresh) onRefresh(); // Refrescar la lista de eventos sin cerrar modal
                }}
              />
            )}

            {/* Tab WhatsApp */}
            {activeTab === 'whatsapp' && eventoDetalle?.cliente?.telefono && (
              <div className="whatsapp-tab-container">
                <WhatsAppChat
                  telefono={eventoDetalle.cliente.telefono}
                  nombreCliente={eventoDetalle.cliente.nombre}
                  onClose={() => setActiveTab('detalle')}
                  embedded={true}
                  vendedorId={eventoDetalle?.comercial?.id}
                  isAdmin={usuario?.rol === 'admin'}
                />
              </div>
            )}

            {activeTab === 'whatsapp' && !eventoDetalle?.cliente?.telefono && (
              <div className="no-whatsapp">
                <p>No hay numero de telefono registrado para este cliente</p>
              </div>
            )}

            {/* Tab Gmail */}
            {activeTab === 'gmail' && eventoDetalle?.thread_id && (
              <div className="gmail-tab-container">
                <GmailChat
                  threadId={eventoDetalle.thread_id}
                  nombreCliente={eventoDetalle.cliente?.nombre || 'Cliente'}
                  embedded={true}
                />
              </div>
            )}

            {activeTab === 'gmail' && !eventoDetalle?.thread_id && (
              <div className="no-gmail">
                <p>Este evento no tiene un thread de Gmail asociado</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Cotizacion - Centrado */}
      {showCotizacion && (
        <div className="modal-overlay modal-cotizacion-overlay" onClick={() => setShowCotizacion(false)}>
          <div className="modal-cotizacion" onClick={(e) => e.stopPropagation()}>
            <h3>Agregar Cotizacion</h3>
            {!eventoDetalle?.comercial?.id && (
              <div className="field-warning" style={{ marginBottom: '12px' }}>
                Para agregar cotizacion, primero debe asignar un comercial
              </div>
            )}
            <div className="cotizacion-input">
              <span className="input-prefix">$</span>
              <input
                type="text"
                value={formatearNumero(montoCotizacion)}
                onChange={(e) => {
                  const soloNumeros = e.target.value.replace(/[^\d]/g, '');
                  setMontoCotizacion(soloNumeros);
                }}
                placeholder="100.000"
                autoFocus
                disabled={!eventoDetalle?.comercial?.id}
                className={!eventoDetalle?.comercial?.id ? 'disabled-field' : ''}
              />
            </div>
            <div className="cotizacion-btns">
              <button className="btn-secondary" onClick={() => setShowCotizacion(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleGuardarCotizacion}
                disabled={guardandoCotizacion || !montoCotizacion || !eventoDetalle?.comercial?.id}
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

              </section>

              {/* Asignacion - ANTES de horarios porque es requerido */}
              <section className="form-section">
                <h3>Asignacion</h3>
                <div className="form-group">
                  <label htmlFor="edit-comercial">
                    Comercial {!datosEdicion.comercial_id && <span className="required-hint">(requerido para horarios)</span>}
                  </label>
                  <select
                    id="edit-comercial"
                    value={datosEdicion.comercial_id}
                    onChange={(e) => setDatosEdicion({...datosEdicion, comercial_id: e.target.value})}
                    className={!datosEdicion.comercial_id ? 'highlight-required' : ''}
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

              {/* Horarios - requieren comercial asignado */}
              <section className="form-section">
                <h3>Horarios</h3>
                {!datosEdicion.comercial_id && (
                  <div className="field-warning">
                    Para asignar horarios, primero debe asignar un comercial
                  </div>
                )}
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="edit-horario-inicio">Horario inicio</label>
                    <input
                      type="time"
                      id="edit-horario-inicio"
                      value={datosEdicion.horario_inicio}
                      onChange={(e) => setDatosEdicion({...datosEdicion, horario_inicio: e.target.value})}
                      disabled={!datosEdicion.comercial_id}
                      className={!datosEdicion.comercial_id ? 'disabled-field' : ''}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="edit-horario-fin">Horario fin</label>
                    <input
                      type="time"
                      id="edit-horario-fin"
                      value={datosEdicion.horario_fin}
                      onChange={(e) => setDatosEdicion({...datosEdicion, horario_fin: e.target.value})}
                      disabled={!datosEdicion.comercial_id}
                      className={!datosEdicion.comercial_id ? 'disabled-field' : ''}
                    />
                  </div>
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

      {/* Modal de Edicion de Cliente */}
      {showEditarCliente && (
        <div className="modal-overlay" onClick={() => setShowEditarCliente(false)}>
          <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowEditarCliente(false)}>×</button>

            <div className="modal-header">
              <h2>Editar Cliente</h2>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-group">
                  <label htmlFor="edit-cliente-nombre">Nombre *</label>
                  <input
                    type="text"
                    id="edit-cliente-nombre"
                    value={datosCliente.nombre}
                    onChange={(e) => setDatosCliente({...datosCliente, nombre: e.target.value})}
                    placeholder="Nombre del cliente"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="edit-cliente-telefono">Teléfono</label>
                  <input
                    type="text"
                    id="edit-cliente-telefono"
                    value={datosCliente.telefono?.startsWith('email:') ? '' : datosCliente.telefono}
                    onChange={(e) => setDatosCliente({...datosCliente, telefono: e.target.value})}
                    placeholder="+54 11 1234-5678"
                  />
                  {eventoDetalle?.cliente?.telefono?.startsWith('email:') && (
                    <small style={{color: '#f59e0b', marginTop: '4px', display: 'block'}}>
                      Este cliente fue creado solo con email. Agregue el teléfono cuando lo obtenga.
                    </small>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="edit-cliente-email">Email</label>
                  <input
                    type="email"
                    id="edit-cliente-email"
                    value={datosCliente.email}
                    onChange={(e) => setDatosCliente({...datosCliente, email: e.target.value})}
                    placeholder="email@ejemplo.com"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="edit-cliente-empresa">Empresa</label>
                  <input
                    type="text"
                    id="edit-cliente-empresa"
                    value={datosCliente.empresa}
                    onChange={(e) => setDatosCliente({...datosCliente, empresa: e.target.value})}
                    placeholder="Nombre de la empresa (opcional)"
                  />
                </div>
              </section>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowEditarCliente(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleGuardarCliente}
                  disabled={guardandoCliente}
                >
                  {guardandoCliente ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Advertencia de Fecha Duplicada */}
      {showAdvertenciaFecha && (
        <div className="modal-overlay" onClick={handleCancelarFechaDuplicada}>
          <div className="modal-content modal-small modal-warning" onClick={(e) => e.stopPropagation()}>
            <div className="warning-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>

            <h3>Fecha con eventos existentes</h3>

            <p className="warning-message">
              Ya existe{eventosEnFecha.length > 1 ? 'n' : ''} <strong>{eventosEnFecha.length} evento{eventosEnFecha.length > 1 ? 's' : ''}</strong> cotizado{eventosEnFecha.length > 1 ? 's' : ''} o aprobado{eventosEnFecha.length > 1 ? 's' : ''} para esta fecha en este local:
            </p>

            <div className="eventos-existentes">
              {eventosEnFecha.map(ev => (
                <div key={ev.id} className={`evento-existente ${ev.estado === 'APROBADO' || ev.estado === 'CONCLUIDO' ? 'aprobado' : 'cotizado'}`}>
                  <span className="evento-cliente">{ev.cliente_nombre}</span>
                  <span className="evento-horario">{ev.hora_inicio || '--:--'} - {ev.hora_fin || '--:--'}</span>
                  <span className={`evento-estado ${ev.estado.toLowerCase()}`}>{ev.estado}</span>
                </div>
              ))}
            </div>

            <p className="warning-question">
              ¿Deseas cotizar igualmente en esta fecha?
            </p>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={handleCancelarFechaDuplicada}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-warning"
                onClick={handleConfirmarFechaDuplicada}
                disabled={guardandoEdicion}
              >
                {guardandoEdicion ? 'Guardando...' : 'Sí, continuar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Revertir Estado */}
      {showRevertir && (
        <div className="modal-overlay" onClick={() => { if (!guardandoRevertir) setShowRevertir(false); }}>
          <div className="modal-content modal-small modal-revertir" onClick={(e) => e.stopPropagation()}>
            <div className="revertir-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="44" height="44">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
            </div>

            <h3>Revertir estado</h3>

            <p className="revertir-message">
              ¿Seguro que quieres revertir el estado de <strong>{eventoDetalle?.estado}</strong> a <strong>{calcularEstadoDestino()}</strong> en este evento?
            </p>

            {tienePrecheck && (
              <div className="revertir-precheck-warning">
                Este evento tiene un pre-check cargado. Al revertir se eliminarán los conceptos y adicionales del pre-check. Los pagos se conservan.
              </div>
            )}

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowRevertir(false)}
                disabled={guardandoRevertir}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-revertir-confirm"
                onClick={handleConfirmarRevertir}
                disabled={guardandoRevertir}
              >
                {guardandoRevertir ? 'Revirtiendo...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Motivo de Rechazo */}
      {showRechazo && (
        <div className="modal-overlay" onClick={() => { setShowRechazo(false); setMotivoRechazo(''); }}>
          <div className="modal-content modal-small modal-rechazo" onClick={(e) => e.stopPropagation()}>
            <div className="rechazo-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>

            <h3>Motivo del rechazo</h3>

            <p className="rechazo-message">
              Describe el motivo por el cual se rechaza este evento. Esta informacion es obligatoria.
            </p>

            <textarea
              className="rechazo-textarea"
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              placeholder="Ej: El cliente cancelo por falta de presupuesto, cambio de fecha no disponible, etc."
              maxLength={2000}
              autoFocus
            />

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setShowRechazo(false); setMotivoRechazo(''); }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-rechazar-confirm"
                onClick={handleConfirmarRechazo}
                disabled={!motivoRechazo.trim() || guardandoRechazo}
              >
                {guardandoRechazo ? 'Rechazando...' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

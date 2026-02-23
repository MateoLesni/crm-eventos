import { useState, useEffect, useRef } from 'react';
import { whatsappApi } from '../services/api';
import './WhatsAppChat.css';

export default function WhatsAppChat({
  telefono, nombreCliente, onClose, embedded = false,
  vendedorId, isAdmin
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [conversacion, setConversacion] = useState(null);
  const [conversaciones, setConversaciones] = useState([]);
  const [mensajes, setMensajes] = useState([]);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (telefono) cargarConversacion();
  }, [telefono]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [mensajes]);

  const cargarConversacion = async (conversacionId = null) => {
    try {
      setLoading(true);
      setError(null);
      setNoEncontrado(false);

      const params = {};
      // Comerciales solo ven su propia conversacion
      if (!isAdmin && vendedorId) {
        params.usuario_id = vendedorId;
      }
      if (conversacionId) {
        params.conversacion_id = conversacionId;
      }

      const response = await whatsappApi.obtenerConversacionPorNumero(telefono, params);
      const data = response.data;

      if (!data.found) {
        setNoEncontrado(true);
        setMensajes([]);
        setConversacion(null);
        setConversaciones([]);
      } else {
        setConversacion(data.conversacion);
        setConversaciones(data.conversaciones_disponibles || []);
        setMensajes(data.mensajes || []);
      }
    } catch (err) {
      console.error('Error cargando conversacion:', err);
      if (err.response?.status === 404 || err.response?.data?.found === false) {
        setNoEncontrado(true);
      } else {
        setError('Error al cargar la conversacion');
      }
    } finally {
      setLoading(false);
    }
  };

  const cambiarConversacion = (conv) => {
    if (conv.id !== conversacion?.id) {
      cargarConversacion(conv.id);
    }
  };

  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return '';
    const fecha = new Date(fechaStr);
    const hoy = new Date();
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);

    const esHoy = fecha.toDateString() === hoy.toDateString();
    const esAyer = fecha.toDateString() === ayer.toDateString();

    if (esHoy) {
      return fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    } else if (esAyer) {
      return `Ayer ${fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return fecha.toLocaleDateString('es-AR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const renderMensaje = (mensaje) => {
    const esEnviado = mensaje.es_enviado;
    const tipoClase = mensaje.tipo !== 'text' ? 'mensaje-multimedia' : '';

    return (
      <div
        key={mensaje.id}
        className={`mensaje ${esEnviado ? 'mensaje-enviado' : 'mensaje-recibido'} ${tipoClase}`}
      >
        {mensaje.tipo !== 'text' && (
          <span className="mensaje-tipo-badge">{mensaje.tipo}</span>
        )}
        <p className="mensaje-texto">{mensaje.texto || '[Sin contenido]'}</p>
        <span className="mensaje-hora">{formatearFecha(mensaje.fecha)}</span>
      </div>
    );
  };

  const agruparMensajesPorFecha = (mensajes) => {
    const grupos = {};
    mensajes.forEach((msg) => {
      const fecha = new Date(msg.fecha).toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
      if (!grupos[fecha]) {
        grupos[fecha] = [];
      }
      grupos[fecha].push(msg);
    });
    return grupos;
  };

  const renderSelectorVendedor = () => {
    if (!isAdmin || conversaciones.length <= 1) return null;

    return (
      <div className="wa-vendedor-selector">
        {conversaciones.map(c => (
          <button
            key={c.id}
            className={`wa-vendedor-tab ${c.id === conversacion?.id ? 'active' : ''}`}
            onClick={() => cambiarConversacion(c)}
          >
            {c.vendedor_nombre || 'Sin asignar'}
            <span className="wa-msg-count">{c.total_mensajes}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderChatBody = () => (
    <div className="whatsapp-chat-body" ref={chatContainerRef}>
      {loading && (
        <div className="chat-loading">
          <div className="spinner"></div>
          <p>Cargando conversacion...</p>
        </div>
      )}

      {error && (
        <div className="chat-error">
          <p>{error}</p>
          <button onClick={() => cargarConversacion()}>Reintentar</button>
        </div>
      )}

      {noEncontrado && !loading && (
        <div className="chat-no-encontrado">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
          <p>No se encontro conversacion de WhatsApp</p>
          <span>No hay mensajes registrados para el numero {telefono}</span>
        </div>
      )}

      {!loading && !error && !noEncontrado && mensajes.length > 0 && (
        <div className="mensajes-container">
          {Object.entries(agruparMensajesPorFecha(mensajes)).map(([fecha, msgs]) => (
            <div key={fecha} className="mensajes-grupo">
              <div className="fecha-separador">
                <span>{fecha}</span>
              </div>
              {msgs.map(renderMensaje)}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderFooter = () => {
    if (!conversacion) return null;

    return (
      <div className="whatsapp-chat-footer">
        <span>
          {conversacion.total_mensajes} mensajes
          {conversacion.vendedor_nombre ? ` — ${conversacion.vendedor_nombre}` : ''}
        </span>
        <span className="solo-lectura">
          Solo lectura
        </span>
      </div>
    );
  };

  if (embedded) {
    return (
      <div className="whatsapp-chat-embedded">
        <div className="whatsapp-chat-header embedded">
          <div className="header-info">
            <div className="avatar">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <div className="header-text">
              <h3>{nombreCliente || 'Cliente'}</h3>
              <span className="telefono">{telefono}</span>
            </div>
          </div>
          <button className="wa-refresh-btn" onClick={() => cargarConversacion()} title="Refrescar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>

        {renderSelectorVendedor()}
        {renderChatBody()}
        {renderFooter()}
      </div>
    );
  }

  return (
    <div className="whatsapp-chat-overlay" onClick={onClose}>
      <div className="whatsapp-chat-container" onClick={(e) => e.stopPropagation()}>
        <div className="whatsapp-chat-header">
          <div className="header-info">
            <div className="avatar">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <div className="header-text">
              <h3>{nombreCliente || 'Cliente'}</h3>
              <span className="telefono">{telefono}</span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {renderSelectorVendedor()}
        {renderChatBody()}
        {renderFooter()}
      </div>
    </div>
  );
}

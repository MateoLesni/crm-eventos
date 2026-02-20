import { useState, useEffect, useRef } from 'react';
import { gmailApi } from '../services/api';
import './GmailChat.css';

export default function GmailChat({ threadId, nombreCliente, embedded = false }) {
  const [mensajes, setMensajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const chatRef = useRef(null);

  useEffect(() => {
    if (threadId) {
      cargarMensajes();
    }
  }, [threadId]);

  const cargarMensajes = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await gmailApi.obtenerConversacion(threadId);
      setMensajes(response.data.mensajes || []);
    } catch (err) {
      console.error('Error cargando conversacion Gmail:', err);
      setError('No se pudo cargar la conversacion');
    } finally {
      setLoading(false);
    }
  };

  // Scroll al final cuando se cargan mensajes
  useEffect(() => {
    if (chatRef.current && mensajes.length > 0) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [mensajes]);

  const formatearFecha = (fecha, hora) => {
    if (!fecha) return '';
    const fechaObj = new Date(fecha + (hora ? 'T' + hora : ''));
    return fechaObj.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: hora ? '2-digit' : undefined,
      minute: hora ? '2-digit' : undefined
    });
  };

  if (loading) {
    return (
      <div className={`gmail-chat ${embedded ? 'embedded' : ''}`}>
        <div className="gmail-loading">Cargando conversacion...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`gmail-chat ${embedded ? 'embedded' : ''}`}>
        <div className="gmail-error">{error}</div>
      </div>
    );
  }

  if (mensajes.length === 0) {
    return (
      <div className={`gmail-chat ${embedded ? 'embedded' : ''}`}>
        <div className="gmail-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <p>No hay correos en esta conversacion</p>
          <small>Los correos apareceran aqui cuando se sincronicen desde Gmail</small>
        </div>
      </div>
    );
  }

  return (
    <div className={`gmail-chat ${embedded ? 'embedded' : ''}`}>
      <div className="gmail-header">
        <div className="gmail-header-info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <span>Conversacion con {nombreCliente}</span>
        </div>
        <span className="gmail-count">{mensajes.length} correos</span>
      </div>

      <div className="gmail-messages" ref={chatRef}>
        {mensajes.map((msg, idx) => (
          <div
            key={msg.message_id || idx}
            className={`gmail-message ${msg.tipo_emisor === 'equipo' ? 'outgoing' : 'incoming'}`}
          >
            <div className="gmail-message-header">
              <div className="gmail-sender">
                <span className="sender-name">
                  {msg.de_nombre || msg.de_email || 'Sin nombre'}
                </span>
                <span className="sender-email">{msg.de_email}</span>
              </div>
              <span className="gmail-date">{formatearFecha(msg.fecha, msg.hora)}</span>
            </div>

            {msg.asunto && idx === 0 && (
              <div className="gmail-subject">
                <strong>Asunto:</strong> {msg.asunto}
              </div>
            )}

            <div className="gmail-body">
              {msg.mensaje || '(Sin contenido)'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { eventosApi, clientesApi, usuariosApi } from '../services/api';
import './Modal.css';

export default function NuevoEventoModal({ onClose, onCreated }) {
  const [formData, setFormData] = useState({
    telefono: '',
    nombre_cliente: '',
    email_cliente: '',
    titulo: '',
    local_id: '',
    fecha_evento: '',
    horario_inicio: '',
    horario_fin: '',
    cantidad_personas: '',
    tipo: 'social',
    canal_origen: 'manual',
    comercial_id: '',
    mensaje_original: '',
  });

  const [locales, setLocales] = useState([]);
  const [comerciales, setComerciales] = useState([]);
  const [clienteExistente, setClienteExistente] = useState(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const comercialesRes = await usuariosApi.listar('comercial');
      setComerciales(comercialesRes.data.usuarios);

      // TODO: Agregar endpoint para listar locales
      setLocales([
        { id: 1, nombre: 'Costa7070', color: 'azul' },
        { id: 2, nombre: 'Kona', color: 'verde' },
        { id: 3, nombre: 'MilVidas', color: 'amarillo' },
        { id: 4, nombre: 'CoChinChina', color: 'violeta' },
        { id: 5, nombre: 'Cruza Polo', color: 'rojo' },
        { id: 6, nombre: 'Cruza Recoleta', color: 'rosa' },
      ]);
    } catch (error) {
      console.error('Error cargando datos:', error);
    }
  };

  const buscarCliente = async (telefono) => {
    if (telefono.length < 8) {
      setClienteExistente(null);
      return;
    }

    setBuscandoCliente(true);
    try {
      const response = await clientesApi.buscarPorTelefono(telefono);
      if (response.data.encontrado) {
        setClienteExistente(response.data.cliente);
        setFormData((prev) => ({
          ...prev,
          nombre_cliente: response.data.cliente.nombre,
          email_cliente: response.data.cliente.email || '',
        }));
      } else {
        setClienteExistente(null);
      }
    } catch (error) {
      console.error('Error buscando cliente:', error);
    } finally {
      setBuscandoCliente(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === 'telefono') {
      buscarCliente(value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validación frontend: horario o presupuesto requieren comercial
    if ((formData.horario_inicio || formData.horario_fin) && !formData.comercial_id) {
      alert('Para asignar horario, primero debe asignar un comercial.');
      return;
    }

    setGuardando(true);

    try {
      const response = await eventosApi.crear(formData);

      // Mostrar mensaje del estado calculado
      let mensaje = response.data.mensaje_estado || 'Evento creado correctamente.';

      if (response.data.sugerencia_comercial) {
        mensaje += `\n\nCliente recurrente detectado. Sugerencia: asignar a ${response.data.sugerencia_comercial.nombre}`;
      }

      alert(mensaje);
      onCreated();
    } catch (error) {
      console.error('Error creando evento:', error);
      const errorMsg = error.response?.data?.error || 'Error al crear el evento';
      alert(errorMsg);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-medium" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <div className="modal-header">
          <h2>Nuevo Evento</h2>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Datos del cliente */}
          <section className="form-section">
            <h3>Cliente</h3>

            <div className="form-group">
              <label htmlFor="telefono">Teléfono *</label>
              <div className="input-with-indicator">
                <input
                  type="text"
                  id="telefono"
                  name="telefono"
                  value={formData.telefono}
                  onChange={handleChange}
                  placeholder="Ej: +54 11 1234-5678"
                  required
                />
                {buscandoCliente && <span className="indicator">Buscando...</span>}
                {clienteExistente && (
                  <span className="indicator found">
                    Cliente encontrado ({clienteExistente.cantidad_eventos} eventos)
                  </span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="nombre_cliente">Nombre *</label>
                <input
                  type="text"
                  id="nombre_cliente"
                  name="nombre_cliente"
                  value={formData.nombre_cliente}
                  onChange={handleChange}
                  placeholder="Nombre del cliente"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="email_cliente">Email</label>
                <input
                  type="email"
                  id="email_cliente"
                  name="email_cliente"
                  value={formData.email_cliente}
                  onChange={handleChange}
                  placeholder="email@ejemplo.com"
                />
              </div>
            </div>
          </section>

          {/* Datos del evento */}
          <section className="form-section">
            <h3>Evento</h3>

            <div className="form-group">
              <label htmlFor="titulo">Título del evento</label>
              <input
                type="text"
                id="titulo"
                name="titulo"
                value={formData.titulo}
                onChange={handleChange}
                placeholder="Ej: Cumpleaños de María, Corporativo Acme"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="local_id">Local</label>
                <select
                  id="local_id"
                  name="local_id"
                  value={formData.local_id}
                  onChange={handleChange}
                >
                  <option value="">Seleccionar local</option>
                  {locales.map((local) => (
                    <option key={local.id} value={local.id}>
                      {local.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="tipo">Tipo</label>
                <select
                  id="tipo"
                  name="tipo"
                  value={formData.tipo}
                  onChange={handleChange}
                >
                  <option value="social">Social</option>
                  <option value="corporativo">Corporativo</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="fecha_evento">Fecha</label>
                <input
                  type="date"
                  id="fecha_evento"
                  name="fecha_evento"
                  value={formData.fecha_evento}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="cantidad_personas">Cantidad de personas</label>
                <input
                  type="number"
                  id="cantidad_personas"
                  name="cantidad_personas"
                  value={formData.cantidad_personas}
                  onChange={handleChange}
                  min="20"
                  placeholder="Mínimo 20"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="horario_inicio">Horario inicio</label>
                <input
                  type="time"
                  id="horario_inicio"
                  name="horario_inicio"
                  value={formData.horario_inicio}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="horario_fin">Horario fin</label>
                <input
                  type="time"
                  id="horario_fin"
                  name="horario_fin"
                  value={formData.horario_fin}
                  onChange={handleChange}
                />
              </div>
            </div>
          </section>

          {/* Asignación */}
          <section className="form-section">
            <h3>Asignación</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="comercial_id">Comercial</label>
                <select
                  id="comercial_id"
                  name="comercial_id"
                  value={formData.comercial_id}
                  onChange={handleChange}
                >
                  <option value="">Sin asignar</option>
                  {comerciales.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="canal_origen">Canal de origen</label>
                <select
                  id="canal_origen"
                  name="canal_origen"
                  value={formData.canal_origen}
                  onChange={handleChange}
                >
                  <option value="manual">Manual</option>
                  <option value="web">Web</option>
                  <option value="mail_directo">Mail Directo</option>
                  <option value="instagram">Instagram</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telefono">Teléfono</option>
                  <option value="referido">Referido</option>
                </select>
              </div>
            </div>
          </section>

          {/* Notas */}
          <section className="form-section">
            <div className="form-group">
              <label htmlFor="mensaje_original">Notas / Mensaje original</label>
              <textarea
                id="mensaje_original"
                name="mensaje_original"
                value={formData.mensaje_original}
                onChange={handleChange}
                rows={3}
                placeholder="Información adicional del cliente..."
              />
            </div>
          </section>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Crear Evento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { precheckApi } from '../services/api';
import './PreCheckTab.css';

const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otros'];
const MODALIDAD_CORTA = { por_persona: 'x persona', por_unidad: 'x unidad', fijo: 'fijo' };

const ESTADOS = {
  BORRADOR: { label: 'Borrador', clase: 'borrador', ayuda: 'El comercial lo está armando.' },
  EN_REVISION: { label: 'En revisión', clase: 'revision', ayuda: 'Esperando que lo revisen Pilar o el Tano.' },
  APROBADO: { label: 'Aprobado', clase: 'aprobado', ayuda: 'Revisado. Se cierra el primer día hábil después del evento.' },
  CERRADO: { label: 'Cerrado', clase: 'cerrado', ayuda: 'Cerrado con el total final del evento.' },
};
const ESTADO_CUOTA = { PAGADO: 'Pagado', PARCIAL: 'Parcial', PENDIENTE: 'Pendiente', VENCIDO: 'Vencido', SIN_MONTO: '—' };

const pesos = (v) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);

const fechaCorta = (iso) => {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

const fechaHora = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

const errorDe = (err, porDefecto) => err?.response?.data?.error || porDefecto;

// Input de pesos con separador de miles; permite negativo para descuentos
function InputPesos({ value, onChange, permitirNegativo = false, placeholder = '0' }) {
  const mostrar = value === '' || value === null || value === undefined ? '' :
    (value < 0 ? '-' : '') + Math.abs(Number(value)).toLocaleString('es-AR');
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={mostrar}
      onChange={(e) => {
        const neg = permitirNegativo && e.target.value.trim().startsWith('-');
        const limpio = e.target.value.replace(/[^\d]/g, '');
        if (limpio === '') onChange(neg ? '-' : '');
        else onChange((neg ? -1 : 1) * parseInt(limpio, 10));
      }}
    />
  );
}

const numero = (v) => (v === '' || v === '-' || v === null || v === undefined ? NaN : Number(v));

// ==================== CABECERA ====================

function DatosEvento({ data, puedeEditar, onGuardar, onToggleFacturada }) {
  const { evento, precheck, sectores } = data;
  const [motivo, setMotivo] = useState(precheck.motivo || '');
  const [razon, setRazon] = useState(precheck.razon_social || '');
  const [propina, setPropina] = useState(String(precheck.propina_porcentaje ?? 0));

  const sector = precheck.sector;
  const horario = evento.horario_inicio ? `${evento.horario_inicio}${evento.horario_fin ? ` a ${evento.horario_fin}` : ''} h` : '—';

  return (
    <section className="pc-datos">
      <div className="pc-dato">
        <span>Fecha</span>
        <strong>{fechaCorta(evento.fecha_evento)}</strong>
      </div>
      <div className="pc-dato">
        <span>Horario</span>
        <strong>{horario}</strong>
      </div>
      <div className="pc-dato">
        <span>Personas</span>
        <strong>{evento.cantidad_personas || '—'}</strong>
      </div>
      <div className="pc-dato pc-dato-ancho">
        <span>Espacio en {evento.local || 'el local'}</span>
        {puedeEditar ? (
          <select value={precheck.sector_id || ''} onChange={(e) => onGuardar({ sector_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">{sectores.length ? 'Elegí el espacio' : 'No hay espacios cargados en el catálogo'}</option>
            {sectores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}{s.pax_min || s.pax_max ? ` (${s.pax_min || '?'}–${s.pax_max || '?'} pax)` : ''}
              </option>
            ))}
          </select>
        ) : (
          <strong>{sector ? sector.nombre : '—'}</strong>
        )}
      </div>
      <div className="pc-dato pc-dato-ancho">
        <span>Motivo</span>
        {puedeEditar ? (
          <input value={motivo} placeholder="Ej.: fin de año, cumpleaños 40, lanzamiento" maxLength={200}
            onChange={(e) => setMotivo(e.target.value)}
            onBlur={() => motivo !== (precheck.motivo || '') && onGuardar({ motivo })} />
        ) : <strong>{precheck.motivo || '—'}</strong>}
      </div>
      <div className="pc-dato pc-dato-ancho">
        <span>Razón social {evento.es_agencia ? '(agencia)' : '/ empresa'}</span>
        {puedeEditar ? (
          <input value={razon} placeholder="Si factura una empresa o agencia" maxLength={200}
            onChange={(e) => setRazon(e.target.value)}
            onBlur={() => razon !== (precheck.razon_social || '') && onGuardar({ razon_social: razon })} />
        ) : <strong>{precheck.razon_social || '—'}</strong>}
      </div>
      <div className="pc-dato">
        <span>Propina</span>
        {puedeEditar ? (
          <span className="pc-pct">
            <input value={propina} inputMode="decimal" onChange={(e) => setPropina(e.target.value.replace(/[^\d.]/g, ''))}
              onBlur={() => Number(propina || 0) !== Number(precheck.propina_porcentaje || 0) && onGuardar({ propina_porcentaje: Number(propina || 0) })} />%
          </span>
        ) : <strong>{precheck.propina_porcentaje || 0}%</strong>}
      </div>
      <div className="pc-dato">
        <span>Factura</span>
        <label className="toggle-switch" title="Con factura suma IVA 21%">
          <input type="checkbox" checked={!!data.facturada} onChange={onToggleFacturada} disabled={!puedeEditar} />
          <span className="toggle-slider"></span>
        </label>
      </div>
    </section>
  );
}

// ==================== FORM DE ÍTEM ====================

function FormItem({ data, editando, onCancelar, onGuardar, guardando }) {
  const pax = data.evento.cantidad_personas || 1;
  const esIpc = editando?.es_ajuste_ipc;
  const [modo, setModo] = useState(editando ? (editando.catalogo_item_id ? 'lista' : 'mano') : (data.catalogo.length ? 'lista' : 'mano'));
  const [itemId, setItemId] = useState(editando?.catalogo_item_id ? String(editando.catalogo_item_id) : '');
  const [form, setForm] = useState(() => editando ? {
    categoria: editando.categoria,
    categoria_otro: editando.categoria_otro || '',
    descripcion: editando.descripcion,
    cantidad: editando.cantidad,
    precio_unitario: editando.precio_unitario,
    observaciones: editando.observaciones || '',
  } : { categoria: 'Menú', categoria_otro: '', descripcion: '', cantidad: 1, precio_unitario: '', observaciones: '' });

  const porCategoria = useMemo(() => {
    const g = {};
    data.catalogo.forEach((i) => { (g[i.categoria] = g[i.categoria] || []).push(i); });
    return g;
  }, [data.catalogo]);

  const item = data.catalogo.find((i) => String(i.id) === itemId);
  const precioLista = editando ? editando.precio_lista : item?.precio;
  const distintoDeLista = precioLista !== null && precioLista !== undefined && numero(form.precio_unitario) !== Number(precioLista);

  const elegirItem = (id) => {
    setItemId(id);
    const it = data.catalogo.find((i) => String(i.id) === id);
    if (it) {
      setForm((f) => ({
        ...f,
        categoria: it.categoria,
        descripcion: it.nombre,
        cantidad: it.modalidad === 'por_persona' ? pax : 1,
        precio_unitario: it.precio,
      }));
    }
  };

  const enviar = () => {
    const cant = numero(form.cantidad);
    const precio = numero(form.precio_unitario);
    if (Number.isNaN(cant) || cant < 0) return alert('Revisá la cantidad');
    if (Number.isNaN(precio)) return alert('Revisá el precio');
    if (!editando && modo === 'lista' && !itemId) return alert('Elegí un ítem de la lista');
    if (modo === 'mano' && !form.descripcion.trim()) return alert('Poné una descripción');
    const datos = { cantidad: cant, precio_unitario: precio, observaciones: form.observaciones };
    if (!editando && modo === 'lista') datos.catalogo_item_id = Number(itemId);
    if (modo === 'mano' || editando) {
      datos.descripcion = form.descripcion;
      if (!esIpc) {
        datos.categoria = form.categoria;
        datos.categoria_otro = form.categoria_otro;
      }
    }
    onGuardar(datos);
  };

  const subtotal = (numero(form.cantidad) || 0) * (numero(form.precio_unitario) || 0);

  return (
    <div className="form-inline pc-form">
      {!editando && (
        <div className="pc-modo">
          <button className={modo === 'lista' ? 'activo' : ''} onClick={() => setModo('lista')} disabled={!data.catalogo.length}
            title={data.catalogo.length ? '' : 'Todavía no hay ítems cargados en el catálogo para este local'}>
            De la lista de precios
          </button>
          <button className={modo === 'mano' ? 'activo' : ''} onClick={() => setModo('mano')}>A mano</button>
        </div>
      )}
      <div className="form-row form-row-labels">
        {modo === 'lista' && !editando ? (
          <div className="form-field" style={{ flex: 3 }}>
            <label>Ítem</label>
            <select value={itemId} onChange={(e) => elegirItem(e.target.value)} autoFocus>
              <option value="">Elegí de la lista…</option>
              {Object.entries(porCategoria).map(([cat, items]) => (
                <optgroup key={cat} label={cat}>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.nombre} · {pesos(i.precio)} {MODALIDAD_CORTA[i.modalidad] || ''}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        ) : (
          <>
            {!esIpc && (
              <div className="form-field">
                <label>Rubro</label>
                <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  disabled={!!editando?.catalogo_item_id}>
                  {[...data.categorias, ...(data.categorias.includes(form.categoria) ? [] : [form.categoria])].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            )}
            {form.categoria === 'Otros' && (
              <div className="form-field">
                <label>¿Cuál?</label>
                <input type="text" value={form.categoria_otro} onChange={(e) => setForm({ ...form, categoria_otro: e.target.value })} />
              </div>
            )}
            <div className="form-field" style={{ flex: 2 }}>
              <label>Descripción</label>
              <input type="text" value={form.descripcion} autoFocus={!editando} placeholder="Ej.: Bonificación por volumen"
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </div>
          </>
        )}
        <div className="form-field" style={{ width: 80 }}>
          <label>Cantidad</label>
          <input type="text" inputMode="decimal" value={form.cantidad}
            onChange={(e) => setForm({ ...form, cantidad: e.target.value.replace(/[^\d.]/g, '') })} />
        </div>
        <div className="form-field" style={{ width: 130 }}>
          <label>Precio unit.</label>
          <InputPesos value={form.precio_unitario} permitirNegativo onChange={(v) => setForm((f) => ({
            ...f,
            precio_unitario: v,
            // un precio negativo cargado a mano es un descuento
            categoria: modo === 'mano' && !editando && (v === '-' || v < 0) && f.categoria === 'Menú' ? 'Descuento' : f.categoria,
          }))} />
        </div>
      </div>
      <div className="form-row form-row-labels">
        <div className="form-field" style={{ flex: 1 }}>
          <label>Observaciones</label>
          <input type="text" value={form.observaciones} placeholder="Ej.: 3 celíacos, Malbec, brindis con espumante…"
            onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
        </div>
      </div>
      <div className="pc-form-pie">
        <span className="pc-form-subtotal">Subtotal: <strong>{pesos(subtotal)}</strong></span>
        {distintoDeLista && !esIpc && (
          <span className="pc-aviso-lista">Precio de lista {pesos(precioLista)}: queda marcado para que lo aprueben Pilar o el Tano</span>
        )}
        {modo === 'mano' && !editando && (
          <span className="pc-aviso-lista">Los ítems cargados a mano los aprueban Pilar o el Tano</span>
        )}
        <div className="form-actions">
          <button className="btn-guardar" onClick={enviar} disabled={guardando}>{guardando ? 'Guardando…' : (editando ? 'Actualizar' : 'Agregar')}</button>
          <button className="btn-cancelar" onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ==================== COMPONENTE PRINCIPAL ====================

export default function PreCheckTab({ eventoId, onPrecheckChange }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const ultimoTieneItems = useRef(null);

  const [formItem, setFormItem] = useState(null); // null | 'nuevo' | concepto
  const [showAdicionalForm, setShowAdicionalForm] = useState(false);
  const [showPagoForm, setShowPagoForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [verHistorial, setVerHistorial] = useState(false);
  const [ipc, setIpc] = useState(null);

  const [adicionalForm, setAdicionalForm] = useState({ categoria: 'Vinos', categoria_otro: '', descripcion: '', monto: '', observaciones: '' });
  const [pagoForm, setPagoForm] = useState({
    metodo_pago: 'Transferencia', monto: '', fecha_deposito: new Date().toISOString().split('T')[0], fecha_acreditacion: '', notas: '',
  });
  const [comprobanteFile, setComprobanteFile] = useState(null);
  const [comprobantePreview, setComprobantePreview] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargarPrecheck = async ({ silencioso = false } = {}) => {
    try {
      if (!silencioso) setLoading(true);
      setError(null);
      const response = await precheckApi.obtener(eventoId);
      setData(response.data);
      const tiene = response.data.resumen.tiene_items;
      if (onPrecheckChange) {
        // segundo parámetro: si cambió (para refrescar el tablero solo cuando hace falta)
        onPrecheckChange(tiene, ultimoTieneItems.current !== null && ultimoTieneItems.current !== tiene);
      }
      ultimoTieneItems.current = tiene;
    } catch (err) {
      if (err.response?.status === 403) setError(errorDe(err, 'No tenés acceso a este pre-check'));
      else setError('Error al cargar el pre-check');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    ultimoTieneItems.current = null;
    setIpc(null);
    cargarPrecheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoId]);

  const ejecutar = async (accion, mensajeError) => {
    try {
      setGuardando(true);
      await accion();
      await cargarPrecheck({ silencioso: true });
      return true;
    } catch (err) {
      alert(errorDe(err, mensajeError));
      return false;
    } finally {
      setGuardando(false);
    }
  };

  // ---------- Cabecera y estado
  const guardarCabecera = (cambios) => ejecutar(() => precheckApi.actualizarCabecera(eventoId, cambios), 'No se pudo guardar');
  const toggleFacturada = () => ejecutar(() => precheckApi.actualizarFacturada(eventoId, !data.facturada), 'Error al actualizar la facturación');

  const cambiarEstado = async (accion) => {
    let comentario = '';
    if (accion === 'devolver') {
      comentario = window.prompt('¿Qué hay que corregir? (lo ve el comercial en el historial)');
      if (!comentario) return;
    } else if (accion === 'reabrir') {
      comentario = window.prompt('¿Por qué se reabre?');
      if (!comentario) return;
    } else if (accion === 'cerrar') {
      const pendiente = data.resumen.pendiente;
      const texto = pendiente > 0.5
        ? `Queda un saldo de ${pesos(pendiente)}. Dejá un comentario para cerrar igual (ej.: pasa a cuenta corriente del local):`
        : `Se cierra con un total final de ${pesos(data.resumen.total)}. Comentario opcional:`;
      const r = window.prompt(texto, '');
      if (r === null) return;
      comentario = r;
    } else if (accion === 'aprobar' && data.alertas.some((a) => a.nivel === 'error')) {
      if (!window.confirm('Hay avisos marcados en rojo. ¿Aprobar igual?')) return;
    } else if (accion === 'enviar') {
      if (!window.confirm('¿Mandar el pre-check a revisión de Pilar o el Tano?')) return;
    }
    await ejecutar(() => precheckApi.cambiarEstado(eventoId, accion, comentario), 'No se pudo cambiar el estado');
  };

  // ---------- Ítems
  const guardarItem = async (datos) => {
    const ok = await ejecutar(
      () => (formItem === 'nuevo' ? precheckApi.agregarConcepto(eventoId, datos) : precheckApi.actualizarConcepto(eventoId, formItem.id, datos)),
      'Error al guardar el ítem');
    if (ok) setFormItem(null);
  };

  const eliminarItem = (c) => {
    if (!window.confirm(`¿Eliminar "${c.descripcion}"?`)) return;
    ejecutar(() => precheckApi.eliminarConcepto(eventoId, c.id), 'Error al eliminar');
  };

  const agregarExclusividad = () =>
    ejecutar(() => precheckApi.agregarConcepto(eventoId, { exclusividad_sector: true }), 'No se pudo agregar la exclusividad');

  // ---------- Adicionales
  const resetAdicionalForm = () => {
    setAdicionalForm({ categoria: 'Vinos', categoria_otro: '', descripcion: '', monto: '', observaciones: '' });
    setEditingItem(null);
    setShowAdicionalForm(false);
  };

  const handleGuardarAdicional = async () => {
    if (!adicionalForm.descripcion.trim()) return alert('Poné una descripción');
    if (Number.isNaN(numero(adicionalForm.monto))) return alert('Poné el monto');
    const datos = { ...adicionalForm, monto: numero(adicionalForm.monto) };
    const ok = await ejecutar(
      () => (editingItem ? precheckApi.actualizarAdicional(eventoId, editingItem.id, datos) : precheckApi.agregarAdicional(eventoId, datos)),
      'Error al guardar el adicional');
    if (ok) resetAdicionalForm();
  };

  const handleEditarAdicional = (a) => {
    setAdicionalForm({ categoria: a.categoria, categoria_otro: a.categoria_otro || '', descripcion: a.descripcion, monto: a.monto, observaciones: a.observaciones || '' });
    setEditingItem(a);
    setShowAdicionalForm(true);
  };

  const handleEliminarAdicional = (a) => {
    if (!window.confirm(`¿Eliminar "${a.descripcion}"?`)) return;
    ejecutar(() => precheckApi.eliminarAdicional(eventoId, a.id), 'Error al eliminar');
  };

  // ---------- IPC
  const verIpc = async () => {
    try {
      const r = await precheckApi.simularIpc(eventoId);
      setIpc(r.data);
    } catch (err) {
      alert(errorDe(err, 'No se pudo calcular el IPC'));
    }
  };

  const aplicarIpc = async () => {
    if (!window.confirm(`Se agrega una línea de ajuste por ${pesos(ipc.ajuste)} (+${ipc.variacion_pct}%). ¿Aplicar?`)) return;
    const ok = await ejecutar(() => precheckApi.aplicarIpc(eventoId), 'No se pudo aplicar el ajuste');
    if (ok) setIpc(null);
  };

  // ---------- Pagos
  const resetPagoForm = () => {
    setPagoForm({ metodo_pago: 'Transferencia', monto: '', fecha_deposito: new Date().toISOString().split('T')[0], fecha_acreditacion: '', notas: '' });
    setComprobanteFile(null);
    if (comprobantePreview) URL.revokeObjectURL(comprobantePreview);
    setComprobantePreview(null);
    setEditingItem(null);
    setShowPagoForm(false);
  };

  const handleGuardarPago = async () => {
    if (!pagoForm.fecha_deposito || !pagoForm.fecha_acreditacion) return alert('Las fechas de depósito y acreditación son obligatorias');
    if (!(numero(pagoForm.monto) > 0)) return alert('Poné el monto del pago');
    if (!editingItem && !comprobanteFile) return alert('Adjuntá el comprobante para registrar el pago');
    const datos = { ...pagoForm, monto: numero(pagoForm.monto) };
    try {
      setGuardando(true);
      if (editingItem) {
        await precheckApi.actualizarPago(eventoId, editingItem.id, datos);
        if (comprobanteFile) await precheckApi.subirComprobante(eventoId, editingItem.id, comprobanteFile);
      } else {
        const res = await precheckApi.agregarPago(eventoId, datos);
        const nuevoPagoId = res.data.pago.id;
        try {
          await precheckApi.subirComprobante(eventoId, nuevoPagoId, comprobanteFile);
        } catch (uploadErr) {
          try { await precheckApi.eliminarPago(eventoId, nuevoPagoId); } catch { /* ya informamos el error de subida */ }
          throw uploadErr;
        }
      }
      await cargarPrecheck({ silencioso: true });
      resetPagoForm();
    } catch (err) {
      alert(errorDe(err, 'Error al guardar el pago. Verificá que el comprobante sea válido.'));
      await cargarPrecheck({ silencioso: true });
    } finally {
      setGuardando(false);
    }
  };

  const handleEditarPago = (pago) => {
    setPagoForm({ metodo_pago: pago.metodo_pago, monto: pago.monto, fecha_deposito: pago.fecha_deposito || '', fecha_acreditacion: pago.fecha_acreditacion || '', notas: pago.notas || '' });
    setEditingItem(pago);
    setShowPagoForm(true);
  };

  const handleEliminarPago = (pagoId) => {
    if (!window.confirm('¿Eliminar este pago?')) return;
    ejecutar(() => precheckApi.eliminarPago(eventoId, pagoId), 'Error al eliminar el pago');
  };

  const handleSubirComprobante = (pagoId, file) =>
    ejecutar(() => precheckApi.subirComprobante(eventoId, pagoId, file), 'Error al subir el comprobante');

  const handleExportarPdf = async () => {
    try {
      const response = await precheckApi.descargarPdf(eventoId);
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      const cliente = (data.evento.cliente || 'cliente').replace(/[^A-Za-z0-9]+/g, '_');
      link.setAttribute('download', `precheck_${cliente}_${(data.evento.fecha_evento || '').replace(/-/g, '')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Error al generar el PDF');
    }
  };

  // ==================== RENDER ====================

  if (loading) {
    return (
      <div className="precheck-loading">
        <div className="spinner"></div>
        <p>Cargando pre-check...</p>
      </div>
    );
  }
  if (error) return <div className="precheck-error"><p>{error}</p></div>;
  if (!data) return <div className="precheck-no-disponible"><p>Pre-check no disponible</p></div>;

  const { conceptos, adicionales, pagos, resumen, permisos, precheck, alertas, historial } = data;
  const puede_editar = permisos.puede_editar;
  const puede_editar_pagos = permisos.puede_editar_pagos;
  const estado = ESTADOS[precheck.estado] || ESTADOS.BORRADOR;
  const sector = precheck.sector;
  const tieneExclusividad = conceptos.some((c) => c.categoria === 'Exclusividad');
  const fueraDeLista = conceptos.filter((c) => c.fuera_de_lista).length;
  const quien = precheck.estado === 'CERRADO' ? (precheck.cerrado_por && `por ${precheck.cerrado_por}${precheck.cerrado_at ? ` el ${fechaHora(precheck.cerrado_at)}` : ''}`)
    : precheck.estado === 'APROBADO' ? (precheck.aprobado_por && `por ${precheck.aprobado_por}${precheck.aprobado_at ? ` el ${fechaHora(precheck.aprobado_at)}` : ''}`)
      : precheck.estado === 'EN_REVISION' ? (precheck.enviado_revision_por && `enviado por ${precheck.enviado_revision_por}${precheck.enviado_revision_at ? ` el ${fechaHora(precheck.enviado_revision_at)}` : ''}`)
        : null;

  return (
    <div className="precheck-container">
      {/* Estado y acciones */}
      <div className="pc-estado-barra">
        <div className="pc-estado-info">
          <span className={`pc-estado pc-estado-${estado.clase}`}>{estado.label}</span>
          {precheck.modificado_post_aprobacion && <span className="pc-estado pc-estado-cambio">Con cambios sin aprobar</span>}
          <span className="pc-estado-ayuda">{quien || estado.ayuda}</span>
        </div>
        <div className="pc-estado-acciones">
          {permisos.puede_enviar_revision && <button className="pc-btn primario" onClick={() => cambiarEstado('enviar')} disabled={guardando}>Enviar a revisión</button>}
          {permisos.puede_devolver && <button className="pc-btn" onClick={() => cambiarEstado('devolver')} disabled={guardando}>Devolver</button>}
          {permisos.puede_aprobar && (
            <button className="pc-btn primario" onClick={() => cambiarEstado('aprobar')} disabled={guardando}>
              {precheck.estado === 'APROBADO' ? 'Aprobar cambios' : 'Aprobar'}
            </button>
          )}
          {permisos.puede_cerrar && <button className="pc-btn" onClick={() => cambiarEstado('cerrar')} disabled={guardando}>Cerrar pre-check</button>}
          {permisos.puede_reabrir && <button className="pc-btn" onClick={() => cambiarEstado('reabrir')} disabled={guardando}>Reabrir</button>}
          <button className="btn-exportar-pdf" onClick={handleExportarPdf} title="PDF para el cliente, con el anexo de condiciones">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <polyline points="9 15 12 18 15 15" />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {!puede_editar && permisos.motivo_no_editable && <div className="pc-solo-lectura">{permisos.motivo_no_editable}</div>}

      {alertas.length > 0 && (
        <ul className="pc-alertas">
          {alertas.map((a, i) => <li key={i} className={`pc-alerta pc-alerta-${a.nivel}`}>{a.texto}</li>)}
        </ul>
      )}

      <DatosEvento
        key={`${precheck.motivo}|${precheck.razon_social}|${precheck.propina_porcentaje}`}
        data={data} puedeEditar={puede_editar} onGuardar={guardarCabecera} onToggleFacturada={toggleFacturada} />

      {/* Lo contratado */}
      <section className="precheck-section">
        <div className="section-header">
          <h4>Lo contratado</h4>
          {puede_editar && (
            <div className="pc-header-btns">
              {sector?.precio_exclusividad !== null && sector?.precio_exclusividad !== undefined && !tieneExclusividad && (
                <button className="btn-agregar secundario" onClick={agregarExclusividad} disabled={guardando}>
                  + Exclusividad {sector.nombre} ({pesos(sector.precio_exclusividad)})
                </button>
              )}
              <button className="btn-agregar" onClick={() => setFormItem('nuevo')} disabled={formItem !== null}>+ Agregar ítem</button>
            </div>
          )}
        </div>

        {formItem === 'nuevo' && (
          <FormItem data={data} onCancelar={() => setFormItem(null)} onGuardar={guardarItem} guardando={guardando} />
        )}

        {conceptos.length === 0 ? (
          <p className="empty-message">
            {data.catalogo.length ? 'Todavía no hay ítems. Agregá menú, barra y lo que corresponda.' : 'Todavía no hay ítems. Ojo: este local no tiene lista de precios cargada en el Catálogo.'}
          </p>
        ) : (
          <div className="pc-tabla-wrap">
            <table className="precheck-table pc-tabla-items">
              <thead>
                <tr>
                  <th>Rubro</th>
                  <th>Detalle</th>
                  <th className="text-right">Cant.</th>
                  <th className="text-right">P. unit.</th>
                  <th className="text-right">Subtotal</th>
                  {puede_editar && <th></th>}
                </tr>
              </thead>
              <tbody>
                {conceptos.map((c) => (formItem?.id === c.id ? (
                  <tr key={c.id}><td colSpan={puede_editar ? 6 : 5} className="pc-celda-form">
                    <FormItem data={data} editando={c} onCancelar={() => setFormItem(null)} onGuardar={guardarItem} guardando={guardando} />
                  </td></tr>
                ) : (
                  <tr key={c.id} className={`${c.precio_unitario < 0 ? 'row-negativo' : ''} ${c.es_ajuste_ipc ? 'pc-fila-ipc' : ''}`}>
                    <td><span className="pc-rubro">{c.categoria === 'Otros' ? c.categoria_otro || 'Otros' : c.categoria}</span></td>
                    <td>
                      <div className="pc-desc">{c.descripcion}</div>
                      {c.observaciones && <div className="pc-obs">{c.observaciones}</div>}
                      {c.fuera_de_lista && (
                        <span className="pc-marca" title="Lo aprueban Pilar o el Tano">
                          {c.precio_unitario < 0 ? 'Descuento' : c.precio_lista === null ? 'Cargado a mano' : `Fuera de lista (lista ${pesos(c.precio_lista)})`}
                        </span>
                      )}
                    </td>
                    <td className="text-right">{Number(c.cantidad).toLocaleString('es-AR')}</td>
                    <td className="text-right pc-num">{pesos(c.precio_unitario)}</td>
                    <td className="text-right pc-num">{pesos(c.subtotal)}</td>
                    {puede_editar && (
                      <td className="text-center acciones-cell">
                        {(!c.es_ajuste_ipc || permisos.es_admin) && (
                          <>
                            <button onClick={() => setFormItem(c)} title="Editar" disabled={formItem !== null}>✏️</button>
                            <button onClick={() => eliminarItem(c)} title="Eliminar">🗑️</button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                )))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="text-right"><strong>Total contratado</strong></td>
                  <td className="text-right pc-num"><strong>{pesos(resumen.total_conceptos)}</strong></td>
                  {puede_editar && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {fueraDeLista > 0 && precheck.estado !== 'CERRADO' && (
          <p className="pc-nota">{fueraDeLista} ítem(s) fuera de lista o con descuento: se aprueban al aprobar el pre-check.</p>
        )}
      </section>

      {/* Adicionales */}
      <section className="precheck-section">
        <div className="section-header">
          <h4>Adicionales del evento</h4>
          {puede_editar && (
            <button className="btn-agregar" onClick={() => { resetAdicionalForm(); setShowAdicionalForm(true); }}>+ Agregar</button>
          )}
        </div>
        <p className="pc-nota pc-nota-arriba">Lo que se suma durante el evento. Se cobra al terminar (o se factura el día hábil siguiente) y no se ajusta por IPC.</p>

        {adicionales.length === 0 ? (
          <p className="empty-message">Sin adicionales</p>
        ) : (
          <div className="pc-tabla-wrap">
            <table className="precheck-table">
              <thead>
                <tr>
                  <th>Rubro</th>
                  <th>Detalle</th>
                  <th className="text-right">Monto</th>
                  {puede_editar && <th></th>}
                </tr>
              </thead>
              <tbody>
                {adicionales.map((a) => (
                  <tr key={a.id} className={a.monto < 0 ? 'row-negativo' : ''}>
                    <td><span className="pc-rubro">{a.categoria === 'Otros' ? a.categoria_otro || 'Otros' : a.categoria}</span></td>
                    <td>
                      <div className="pc-desc">{a.descripcion}</div>
                      {a.observaciones && <div className="pc-obs">{a.observaciones}</div>}
                    </td>
                    <td className="text-right pc-num">{pesos(a.monto)}</td>
                    {puede_editar && (
                      <td className="text-center acciones-cell">
                        <button onClick={() => handleEditarAdicional(a)} title="Editar">✏️</button>
                        <button onClick={() => handleEliminarAdicional(a)} title="Eliminar">🗑️</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="text-right"><strong>Total adicionales</strong></td>
                  <td className="text-right pc-num"><strong>{pesos(resumen.total_adicionales)}</strong></td>
                  {puede_editar && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {showAdicionalForm && (
          <div className="form-inline">
            <div className="form-row form-row-labels">
              <div className="form-field">
                <label>Rubro</label>
                <select value={adicionalForm.categoria} onChange={(e) => setAdicionalForm({ ...adicionalForm, categoria: e.target.value })}>
                  {[...data.categorias, ...(data.categorias.includes(adicionalForm.categoria) ? [] : [adicionalForm.categoria])].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              {adicionalForm.categoria === 'Otros' && (
                <div className="form-field">
                  <label>¿Cuál?</label>
                  <input type="text" value={adicionalForm.categoria_otro} onChange={(e) => setAdicionalForm({ ...adicionalForm, categoria_otro: e.target.value })} />
                </div>
              )}
              <div className="form-field" style={{ flex: 2 }}>
                <label>Descripción</label>
                <input type="text" placeholder="Ej.: 10 botellas de vino extra" value={adicionalForm.descripcion}
                  onChange={(e) => setAdicionalForm({ ...adicionalForm, descripcion: e.target.value })} />
              </div>
              <div className="form-field" style={{ width: 130 }}>
                <label>Monto</label>
                <InputPesos value={adicionalForm.monto} permitirNegativo onChange={(v) => setAdicionalForm({ ...adicionalForm, monto: v })} />
              </div>
            </div>
            <div className="form-row form-row-labels">
              <div className="form-field" style={{ flex: 1 }}>
                <label>Observaciones</label>
                <input type="text" value={adicionalForm.observaciones} onChange={(e) => setAdicionalForm({ ...adicionalForm, observaciones: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-guardar" onClick={handleGuardarAdicional} disabled={guardando}>{guardando ? 'Guardando…' : (editingItem ? 'Actualizar' : 'Agregar')}</button>
              <button className="btn-cancelar" onClick={resetAdicionalForm}>Cancelar</button>
            </div>
          </div>
        )}
      </section>

      {/* Totales */}
      <section className="precheck-totales">
        <div className="totales-row"><span>Subtotal</span><span>{pesos(resumen.subtotal)}</span></div>
        {data.facturada && <div className="totales-row iva"><span>IVA 21%</span><span>{pesos(resumen.iva)}</span></div>}
        {resumen.propina > 0 && <div className="totales-row iva"><span>Propina ({resumen.propina_porcentaje}%)</span><span>{pesos(resumen.propina)}</span></div>}
        <div className="totales-row total"><span>TOTAL</span><span>{pesos(resumen.total)}</span></div>
        {precheck.estado === 'CERRADO' && precheck.monto_final !== null && (
          <div className="totales-row iva"><span>Total final al cierre</span><span>{pesos(precheck.monto_final)}</span></div>
        )}
      </section>

      {/* Plan de pagos */}
      {resumen.tiene_items && (
        <section className="precheck-section">
          <div className="section-header">
            <h4>Plan de pagos</h4>
            <button className="btn-agregar secundario" onClick={verIpc}>Ajuste por IPC</button>
          </div>
          <div className="pc-tabla-wrap">
            <table className="precheck-table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Vence</th>
                  <th className="text-right">Monto</th>
                  <th className="text-right">Pagado</th>
                  <th className="text-right">Falta</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {resumen.plan_pagos.filter((p) => p.monto).map((p) => (
                  <tr key={p.concepto}>
                    <td>{p.concepto}</td>
                    <td>{p.vence ? fechaCorta(p.vence) : 'Al confirmar'}</td>
                    <td className="text-right pc-num">{pesos(p.monto)}</td>
                    <td className="text-right pc-num">{pesos(p.pagado)}</td>
                    <td className="text-right pc-num">{p.falta ? pesos(p.falta) : '—'}</td>
                    <td><span className={`pc-cuota pc-cuota-${p.estado.toLowerCase()}`}>{ESTADO_CUOTA[p.estado] || p.estado}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pc-nota">Solo cuentan los pagos validados por tesorería.{resumen.en_revision > 0 && ` Hay ${pesos(resumen.en_revision)} esperando validación.`}</p>

          {ipc && (
            <div className="pc-ipc">
              <button className="pc-ipc-cerrar" onClick={() => setIpc(null)} aria-label="Cerrar">&times;</button>
              <h5>Ajuste por IPC (INDEC)</h5>
              {ipc.aplica ? (
                <>
                  <p>
                    {ipc.es_continuacion ? 'Desde el último ajuste' : 'Desde la seña'} ({ipc.periodo_base}) hasta el último IPC publicado ({ipc.periodo_final}):{' '}
                    <strong>+{ipc.variacion_pct.toLocaleString('es-AR')}%</strong>
                  </p>
                  <p>Sobre el saldo pendiente de lo contratado ({pesos(ipc.monto_base)}, sin IVA ni propina, sin la seña ni adicionales):{' '}
                    <strong>{pesos(ipc.ajuste)}</strong> más IVA/propina si corresponden.</p>
                  {permisos.puede_aplicar_ipc ? (
                    <button className="pc-btn primario" onClick={aplicarIpc} disabled={guardando}>Aplicar ajuste</button>
                  ) : (
                    <p className="pc-nota">El ajuste lo aplica administración.</p>
                  )}
                </>
              ) : (
                <p>{ipc.motivo}</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Pagos */}
      <section className="precheck-section pagos-section">
        <div className="section-header">
          <h4>Pagos recibidos</h4>
          {puede_editar_pagos && (
            <button className="btn-agregar" onClick={() => { resetPagoForm(); setShowPagoForm(true); }}>+ Agregar pago</button>
          )}
        </div>

        {pagos.length === 0 ? (
          <p className="empty-message">No hay pagos registrados</p>
        ) : (
          <div className="pc-tabla-wrap">
            <table className="precheck-table pagos-table">
              <thead>
                <tr>
                  <th>F. depósito</th>
                  <th>F. acreditación</th>
                  <th>Método</th>
                  <th className="text-right">Monto</th>
                  <th>Estado</th>
                  <th>Comprobante</th>
                  <th>Notas</th>
                  {puede_editar_pagos && <th className="text-center"></th>}
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id}>
                    <td>{fechaCorta(p.fecha_deposito)}</td>
                    <td>{fechaCorta(p.fecha_acreditacion)}</td>
                    <td>{p.metodo_pago}</td>
                    <td className="text-right pc-num">
                      {p.monto_original ? (
                        <div>
                          <div>{pesos(p.monto)}</div>
                          <div className="pc-tachado">{pesos(p.monto_original)}</div>
                          {p.observacion_monto && <div className="pc-obs">{p.observacion_monto}</div>}
                        </div>
                      ) : pesos(p.monto)}
                    </td>
                    <td>
                      <span className={`pago-estado-badge pago-estado-${(p.estado || 'VALIDADO').toLowerCase()}`}>
                        {p.estado === 'REVISION' ? 'En revisión' : p.estado === 'RECHAZADO' ? 'Rechazado' : 'Validado'}
                      </span>
                      {p.estado === 'VALIDADO' && p.numero_oppen && <div className="pc-oppen">Oppen: {p.numero_oppen}</div>}
                      {p.estado === 'RECHAZADO' && p.motivo_rechazo && <div className="pc-rechazo">{p.motivo_rechazo}</div>}
                    </td>
                    <td>
                      {p.comprobante_url ? (
                        <div className="comprobante-cell-view">
                          {/\.(jpg|jpeg|png|gif|webp)/i.test(p.comprobante_nombre || p.comprobante_url.split('?')[0]) ? (
                            <img src={p.comprobante_url} alt="Comprobante" className="comprobante-thumb" onClick={() => setLightboxUrl(p.comprobante_url)} />
                          ) : (
                            <a href={p.comprobante_url} target="_blank" rel="noopener noreferrer" className="comprobante-link">📎 {p.comprobante_nombre || 'Ver PDF'}</a>
                          )}
                        </div>
                      ) : puede_editar_pagos && p.estado === 'REVISION' ? (
                        <label className="upload-label">
                          <input type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                            onChange={(e) => e.target.files[0] && handleSubirComprobante(p.id, e.target.files[0])} />
                          <span className="upload-btn">📤 Subir</span>
                        </label>
                      ) : <span className="sin-comprobante">-</span>}
                    </td>
                    <td className="notas-cell">{p.notas || '-'}</td>
                    {puede_editar_pagos && (
                      <td className="text-center acciones-cell">
                        {p.estado === 'REVISION' ? (
                          <>
                            <button onClick={() => handleEditarPago(p)} title="Editar">✏️</button>
                            <button onClick={() => handleEliminarPago(p.id)} title="Eliminar">🗑️</button>
                          </>
                        ) : <span className="pc-guion">—</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="text-right"><strong>Total validado</strong></td>
                  <td className="text-right pc-num"><strong>{pesos(resumen.total_pagado)}</strong></td>
                  <td colSpan={puede_editar_pagos ? 4 : 3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {showPagoForm && (
          <div className="form-inline">
            <div className="form-row form-row-labels">
              <div className="form-field">
                <label>Fecha depósito *</label>
                <input type="date" value={pagoForm.fecha_deposito} onChange={(e) => setPagoForm({ ...pagoForm, fecha_deposito: e.target.value })} required />
              </div>
              <div className="form-field">
                <label>Fecha acreditación *</label>
                <input type="date" value={pagoForm.fecha_acreditacion} onChange={(e) => setPagoForm({ ...pagoForm, fecha_acreditacion: e.target.value })} required />
              </div>
              <div className="form-field">
                <label>Método</label>
                <select value={pagoForm.metodo_pago} onChange={(e) => setPagoForm({ ...pagoForm, metodo_pago: e.target.value })}>
                  {METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-field" style={{ width: 130 }}>
                <label>Monto</label>
                <InputPesos value={pagoForm.monto} placeholder="100.000" onChange={(v) => setPagoForm({ ...pagoForm, monto: v })} />
              </div>
              <div className="form-field" style={{ flex: 1 }}>
                <label>Notas</label>
                <input type="text" placeholder="Opcional" value={pagoForm.notas} onChange={(e) => setPagoForm({ ...pagoForm, notas: e.target.value })} />
              </div>
            </div>
            <div className="form-row" style={{ marginTop: '8px', alignItems: 'center', gap: '12px' }}>
              <div className="form-field">
                <label>Comprobante {!editingItem && '*'}</label>
                <input type="file" accept="image/*,.pdf" className="file-input-pago"
                  onChange={(e) => {
                    const file = e.target.files[0] || null;
                    setComprobanteFile(file);
                    setComprobantePreview(file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
                  }} />
              </div>
              {comprobanteFile && (
                <div className="comprobante-preview-container">
                  {comprobantePreview ? (
                    <img src={comprobantePreview} alt="Preview" className="comprobante-preview-thumb" onClick={() => setLightboxUrl(comprobantePreview)} />
                  ) : <span className="comprobante-preview-file">PDF: {comprobanteFile.name}</span>}
                </div>
              )}
            </div>
            <div className="form-actions">
              <button className="btn-guardar" onClick={handleGuardarPago} disabled={guardando}>{guardando ? 'Guardando…' : (editingItem ? 'Actualizar' : 'Agregar')}</button>
              <button className="btn-cancelar" onClick={resetPagoForm}>Cancelar</button>
            </div>
          </div>
        )}
      </section>

      {/* Saldo */}
      <section className={`precheck-pendiente ${resumen.pendiente <= 0 ? 'saldado' : 'pendiente'}`}>
        <div className="pendiente-row">
          <span>{resumen.pendiente <= 0 ? 'SALDADO' : 'SALDO PENDIENTE:'}</span>
          <span>{pesos(Math.abs(resumen.pendiente))}</span>
        </div>
      </section>

      {/* Historial */}
      <section className="precheck-section pc-historial">
        <button className="pc-historial-toggle" onClick={() => setVerHistorial(!verHistorial)}>
          {verHistorial ? '▾' : '▸'} Historial de cambios ({historial.length})
        </button>
        {verHistorial && (
          historial.length === 0 ? <p className="empty-message">Sin cambios registrados todavía.</p> : (
            <ol className="pc-historial-lista">
              {historial.map((h) => (
                <li key={h.id}>
                  <span className="pc-hist-fecha">{fechaHora(h.created_at)}</span>
                  <span className="pc-hist-quien">{h.usuario}</span>
                  <span className="pc-hist-que">
                    <span className="pc-hist-accion">{h.accion}</span>
                    {h.detalle && <span className="pc-hist-detalle">{h.detalle}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )
        )}
      </section>

      {lightboxUrl && (
        <div className="comprobante-lightbox" onClick={() => setLightboxUrl(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightboxUrl(null)}>&times;</button>
            <img src={lightboxUrl} alt="Comprobante" className="lightbox-img" />
            <a href={lightboxUrl} target="_blank" rel="noopener noreferrer" className="lightbox-open-new" onClick={(e) => e.stopPropagation()}>
              Abrir en nueva pestaña
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

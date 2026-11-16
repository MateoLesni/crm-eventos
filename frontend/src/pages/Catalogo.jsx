import { useEffect, useMemo, useState } from 'react';
import { catalogoApi, localesApi } from '../services/api';
import './Catalogo.css';

const MODALIDADES = { por_persona: 'Por persona', por_unidad: 'Por unidad', fijo: 'Precio fijo' };

const pesos = (v) =>
  v === null || v === undefined || v === ''
    ? '—'
    : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(v);

// Input de dinero con separador de miles; guarda el número limpio
function InputPesos({ value, onChange, placeholder = '0', permitirNegativo = false, ...rest }) {
  const mostrar = value === '' || value === null || value === undefined ? '' : Number(value).toLocaleString('es-AR');
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={mostrar}
      onChange={(e) => {
        const neg = permitirNegativo && e.target.value.trim().startsWith('-');
        const limpio = e.target.value.replace(/[^\d]/g, '');
        onChange(limpio === '' ? '' : (neg ? -1 : 1) * parseInt(limpio, 10));
      }}
      {...rest}
    />
  );
}

function errorDe(err, porDefecto) {
  return err?.response?.data?.error || porDefecto;
}

// ==================== LISTA DE PRECIOS ====================

const ITEM_VACIO = { local_id: '', categoria: 'Menú', nombre: '', descripcion: '', modalidad: 'por_persona', precio: '', ajusta_ipc: true, activo: true };

function ListaPrecios({ locales }) {
  const [items, setItems] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroLocal, setFiltroLocal] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState(null); // id | 'nuevo'
  const [form, setForm] = useState(ITEM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [copia, setCopia] = useState({ abierta: false, desde: '', hacia: '' });

  const cargar = () =>
    catalogoApi.items({ incluir_inactivos: 1 }).then((r) => {
      setItems(r.data.items);
      setCategorias(r.data.categorias);
      setCargando(false);
    });

  useEffect(() => {
    cargar().catch(() => setCargando(false));
  }, []);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return items.filter((i) => {
      if (!verInactivos && !i.activo) return false;
      if (filtroLocal === 'general' && i.local_id) return false;
      if (filtroLocal && filtroLocal !== 'general' && String(i.local_id) !== filtroLocal) return false;
      if (filtroCategoria && i.categoria !== filtroCategoria) return false;
      if (q && !`${i.nombre} ${i.descripcion || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, filtroLocal, filtroCategoria, busqueda, verInactivos]);

  const abrirNuevo = () => {
    setForm({ ...ITEM_VACIO, local_id: filtroLocal && filtroLocal !== 'general' ? filtroLocal : '', categoria: filtroCategoria || 'Menú' });
    setEditando('nuevo');
  };

  const abrirEdicion = (item) => {
    setForm({ ...item, local_id: item.local_id ? String(item.local_id) : '', descripcion: item.descripcion || '' });
    setEditando(item.id);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) return alert('Poné un nombre');
    if (form.precio === '' || form.precio === null) return alert('Poné un precio');
    setGuardando(true);
    const datos = { ...form, local_id: form.local_id || null };
    try {
      if (editando === 'nuevo') await catalogoApi.crearItem(datos);
      else await catalogoApi.actualizarItem(editando, datos);
      await cargar();
      setEditando(null);
    } catch (err) {
      alert(errorDe(err, 'No se pudo guardar'));
    } finally {
      setGuardando(false);
    }
  };

  const alternarActivo = async (item) => {
    try {
      await catalogoApi.actualizarItem(item.id, { activo: !item.activo });
      await cargar();
    } catch (err) {
      alert(errorDe(err, 'No se pudo actualizar'));
    }
  };

  const copiar = async () => {
    if (!copia.desde || !copia.hacia || copia.desde === copia.hacia) return alert('Elegí dos locales distintos');
    try {
      const r = await catalogoApi.copiarItems(Number(copia.desde), Number(copia.hacia));
      alert(`Se copiaron ${r.data.copiados} ítems. Los que ya existían con el mismo nombre no se tocaron.`);
      setCopia({ abierta: false, desde: '', hacia: '' });
      await cargar();
    } catch (err) {
      alert(errorDe(err, 'No se pudo copiar'));
    }
  };

  const filaFormulario = (
    <tr className="cat-fila-form">
      <td>
        <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
          {categorias.map((c) => <option key={c}>{c}</option>)}
        </select>
      </td>
      <td>
        <input autoFocus placeholder="Nombre (ej.: Menú 3 pasos)" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <input className="cat-input-sec" placeholder="Detalle que ve el comercial (opcional)" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
      </td>
      <td>
        <select value={form.modalidad} onChange={(e) => setForm({ ...form, modalidad: e.target.value })}>
          {Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </td>
      <td><InputPesos value={form.precio} onChange={(v) => setForm({ ...form, precio: v })} className="cat-num" /></td>
      <td>
        <select value={form.local_id} onChange={(e) => setForm({ ...form, local_id: e.target.value })}>
          <option value="">Todos los locales</option>
          {locales.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
      </td>
      <td className="cat-centro">
        <input type="checkbox" checked={form.ajusta_ipc} onChange={(e) => setForm({ ...form, ajusta_ipc: e.target.checked })} title="Se ajusta por IPC" />
      </td>
      <td className="cat-acciones">
        <button className="cat-btn primario" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button className="cat-btn" onClick={() => setEditando(null)}>Cancelar</button>
      </td>
    </tr>
  );

  if (cargando) return <p className="cat-vacio">Cargando lista de precios…</p>;

  return (
    <section>
      <div className="cat-barra">
        <select value={filtroLocal} onChange={(e) => setFiltroLocal(e.target.value)}>
          <option value="">Todos los locales</option>
          <option value="general">Solo ítems generales</option>
          {locales.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
        <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
          <option value="">Todos los rubros</option>
          {categorias.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="cat-buscar" placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <label className="cat-check">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver dados de baja
        </label>
        <div className="cat-barra-der">
          <button className="cat-btn" onClick={() => setCopia({ ...copia, abierta: !copia.abierta })}>Copiar de otro local</button>
          <button className="cat-btn primario" onClick={abrirNuevo} disabled={editando !== null}>+ Nuevo ítem</button>
        </div>
      </div>

      {copia.abierta && (
        <div className="cat-copia">
          <span>Copiar los ítems activos de</span>
          <select value={copia.desde} onChange={(e) => setCopia({ ...copia, desde: e.target.value })}>
            <option value="">elegí local</option>
            {locales.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
          <span>a</span>
          <select value={copia.hacia} onChange={(e) => setCopia({ ...copia, hacia: e.target.value })}>
            <option value="">elegí local</option>
            {locales.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
          <button className="cat-btn primario" onClick={copiar}>Copiar</button>
          <span className="cat-ayuda">Después ajustás los precios del local nuevo.</span>
        </div>
      )}

      <div className="cat-tabla-wrap">
        <table className="cat-tabla">
          <thead>
            <tr>
              <th>Rubro</th>
              <th>Ítem</th>
              <th>Se cobra</th>
              <th className="cat-der">Precio</th>
              <th>Local</th>
              <th className="cat-centro" title="Se ajusta por IPC sobre el saldo">IPC</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {editando === 'nuevo' && filaFormulario}
            {visibles.length === 0 && editando !== 'nuevo' && (
              <tr><td colSpan={7} className="cat-vacio">
                {items.length === 0 ? 'Todavía no hay ítems. Cargá el primero con "+ Nuevo ítem".' : 'No hay ítems con esos filtros.'}
              </td></tr>
            )}
            {visibles.map((i) =>
              editando === i.id ? (
                <tr key={i.id} className="cat-fila-form">{filaFormulario.props.children}</tr>
              ) : (
                <tr key={i.id} className={i.activo ? '' : 'cat-inactivo'}>
                  <td><span className="cat-rubro">{i.categoria}</span></td>
                  <td>
                    <div className="cat-nombre">{i.nombre}</div>
                    {i.descripcion && <div className="cat-desc">{i.descripcion}</div>}
                  </td>
                  <td>{MODALIDADES[i.modalidad] || i.modalidad}</td>
                  <td className="cat-der cat-precio">{pesos(i.precio)}</td>
                  <td className={i.local_id ? '' : 'cat-general'}>{i.local_nombre}</td>
                  <td className="cat-centro">{i.ajusta_ipc ? 'Sí' : 'No'}</td>
                  <td className="cat-acciones">
                    <button className="cat-btn chico" onClick={() => abrirEdicion(i)} disabled={editando !== null}>Editar</button>
                    <button className="cat-btn chico" onClick={() => alternarActivo(i)} disabled={editando !== null}>
                      {i.activo ? 'Dar de baja' : 'Reactivar'}
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      <p className="cat-ayuda">
        Cambiar un precio acá no toca los pre-checks ya armados: cada pre-check guarda el precio del momento en que se cargó.
        Los ítems dados de baja dejan de aparecer para los comerciales.
      </p>
    </section>
  );
}

// ==================== ESPACIOS ====================

const SECTOR_VACIO = { nombre: '', pax_min: '', pax_max: '', precio_exclusividad: '', observaciones: '', activo: true };

function Espacios({ locales }) {
  const [sectores, setSectores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(null); // {id|'nuevo', local_id}
  const [form, setForm] = useState(SECTOR_VACIO);
  const [guardando, setGuardando] = useState(false);

  const cargar = () => catalogoApi.sectores({ incluir_inactivos: 1 }).then((r) => {
    setSectores(r.data.sectores);
    setCargando(false);
  });

  useEffect(() => {
    cargar().catch(() => setCargando(false));
  }, []);

  const guardar = async () => {
    if (!form.nombre.trim()) return alert('Poné un nombre');
    setGuardando(true);
    const datos = { ...form, local_id: editando.local_id };
    try {
      if (editando.id === 'nuevo') await catalogoApi.crearSector(datos);
      else await catalogoApi.actualizarSector(editando.id, datos);
      await cargar();
      setEditando(null);
    } catch (err) {
      alert(errorDe(err, 'No se pudo guardar'));
    } finally {
      setGuardando(false);
    }
  };

  const alternarActivo = async (s) => {
    try {
      await catalogoApi.actualizarSector(s.id, { activo: !s.activo });
      await cargar();
    } catch (err) {
      alert(errorDe(err, 'No se pudo actualizar'));
    }
  };

  const fila = (
    <tr className="cat-fila-form">
      <td><input autoFocus placeholder="Ej.: Terraza, Salón principal, Exclusivo total" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></td>
      <td><input className="cat-num" inputMode="numeric" value={form.pax_min ?? ''} onChange={(e) => setForm({ ...form, pax_min: e.target.value.replace(/\D/g, '') })} /></td>
      <td><input className="cat-num" inputMode="numeric" value={form.pax_max ?? ''} onChange={(e) => setForm({ ...form, pax_max: e.target.value.replace(/\D/g, '') })} /></td>
      <td><InputPesos value={form.precio_exclusividad ?? ''} onChange={(v) => setForm({ ...form, precio_exclusividad: v })} placeholder="Sin exclusividad" className="cat-num" /></td>
      <td><input placeholder="Opcional" value={form.observaciones || ''} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></td>
      <td className="cat-acciones">
        <button className="cat-btn primario" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button className="cat-btn" onClick={() => setEditando(null)}>Cancelar</button>
      </td>
    </tr>
  );

  if (cargando) return <p className="cat-vacio">Cargando espacios…</p>;

  return (
    <section className="cat-locales">
      {locales.map((l) => {
        const propios = sectores.filter((s) => s.local_id === l.id);
        return (
          <div key={l.id} className="cat-local">
            <div className="cat-local-cab">
              <h3>{l.nombre}</h3>
              <button className="cat-btn chico" disabled={editando !== null}
                onClick={() => { setForm(SECTOR_VACIO); setEditando({ id: 'nuevo', local_id: l.id }); }}>
                + Espacio
              </button>
            </div>
            {propios.length === 0 && !(editando?.id === 'nuevo' && editando.local_id === l.id) ? (
              <p className="cat-vacio chico">Sin espacios cargados.</p>
            ) : (
              <table className="cat-tabla">
                <thead>
                  <tr>
                    <th>Espacio</th>
                    <th className="cat-der">Pax mín.</th>
                    <th className="cat-der">Pax máx.</th>
                    <th className="cat-der">Exclusividad</th>
                    <th>Observaciones</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {editando?.id === 'nuevo' && editando.local_id === l.id && fila}
                  {propios.map((s) => editando?.id === s.id ? (
                    <tr key={s.id} className="cat-fila-form">{fila.props.children}</tr>
                  ) : (
                    <tr key={s.id} className={s.activo ? '' : 'cat-inactivo'}>
                      <td className="cat-nombre">{s.nombre}</td>
                      <td className="cat-der">{s.pax_min ?? '—'}</td>
                      <td className="cat-der">{s.pax_max ?? '—'}</td>
                      <td className="cat-der cat-precio">{s.precio_exclusividad !== null ? pesos(s.precio_exclusividad) : '—'}</td>
                      <td className="cat-desc">{s.observaciones || ''}</td>
                      <td className="cat-acciones">
                        <button className="cat-btn chico" disabled={editando !== null}
                          onClick={() => { setForm({ ...s, pax_min: s.pax_min ?? '', pax_max: s.pax_max ?? '', precio_exclusividad: s.precio_exclusividad ?? '' }); setEditando({ id: s.id, local_id: l.id }); }}>
                          Editar
                        </button>
                        <button className="cat-btn chico" disabled={editando !== null} onClick={() => alternarActivo(s)}>
                          {s.activo ? 'Dar de baja' : 'Reactivar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
      <p className="cat-ayuda">
        El pre-check avisa si la cantidad de personas queda fuera del mínimo o máximo del espacio elegido.
        La exclusividad se agrega al pre-check con un botón, al precio cargado acá.
      </p>
    </section>
  );
}

// ==================== CONDICIONES Y PARÁMETROS ====================

function Parametros() {
  const [cfg, setCfg] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    catalogoApi.config().then((r) => setCfg(r.data)).catch(() => setCfg(false));
  }, []);

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await catalogoApi.guardarConfig(cfg);
      setCfg(r.data);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (err) {
      alert(errorDe(err, 'No se pudo guardar'));
    } finally {
      setGuardando(false);
    }
  };

  if (cfg === null) return <p className="cat-vacio">Cargando…</p>;
  if (cfg === false) return <p className="cat-vacio">No se pudo cargar la configuración.</p>;

  return (
    <section className="cat-param">
      <div className="cat-param-grid">
        <div className="cat-tarjeta">
          <h3>Plan de pagos</h3>
          <label>Seña (% de lo contratado)
            <input className="cat-num" inputMode="decimal" value={cfg.sena_porcentaje}
              onChange={(e) => setCfg({ ...cfg, sena_porcentaje: e.target.value.replace(/[^\d.]/g, '') })} />
          </label>
          <label>El saldo vence (días antes del evento)
            <input className="cat-num" inputMode="numeric" value={cfg.dias_saldo_antes_evento}
              onChange={(e) => setCfg({ ...cfg, dias_saldo_antes_evento: e.target.value.replace(/\D/g, '') })} />
          </label>
          <p className="cat-ayuda">El ajuste por IPC se suma al saldo, nunca a la seña.</p>
        </div>
        <div className="cat-tarjeta">
          <h3>Propina por local</h3>
          {cfg.propinas.map((p, idx) => (
            <label key={p.local_id} className="cat-propina">
              <span>{p.local}</span>
              <span className="cat-pct">
                <input className="cat-num" inputMode="decimal" value={p.porcentaje}
                  onChange={(e) => {
                    const propinas = [...cfg.propinas];
                    propinas[idx] = { ...p, porcentaje: e.target.value.replace(/[^\d.]/g, '') };
                    setCfg({ ...cfg, propinas });
                  }} />%
              </span>
            </label>
          ))}
          <p className="cat-ayuda">Se calcula sobre el subtotal sin IVA y se muestra aparte. En 0 no aparece. Se toma al crear cada pre-check y el comercial la puede cambiar en ese evento.</p>
        </div>
      </div>
      <div className="cat-tarjeta">
        <h3>Condiciones y políticas de pago</h3>
        <p className="cat-ayuda">Va como anexo, en hoja aparte, en el PDF que se le manda al cliente. Cada renglón es un párrafo.</p>
        <textarea rows={14} value={cfg.condiciones}
          placeholder={'Ej.:\nLa reserva se confirma con el pago del 50% del total.\nEl saldo se abona hasta 7 días antes del evento...'}
          onChange={(e) => setCfg({ ...cfg, condiciones: e.target.value })} />
      </div>
      <div className="cat-guardar">
        {guardado && <span className="cat-ok">Guardado</span>}
        <button className="cat-btn primario" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
      </div>
    </section>
  );
}

// ==================== PÁGINA ====================

const PESTANAS = [
  { id: 'precios', label: 'Lista de precios' },
  { id: 'espacios', label: 'Espacios y capacidad' },
  { id: 'parametros', label: 'Condiciones y parámetros' },
];

export default function Catalogo() {
  const [pestana, setPestana] = useState(() => {
    try { return localStorage.getItem('catalogo_pestana') || 'precios'; } catch { return 'precios'; }
  });
  const [locales, setLocales] = useState([]);

  useEffect(() => {
    localesApi.listar().then((r) => setLocales(r.data)).catch(() => setLocales([]));
  }, []);

  const elegir = (id) => {
    setPestana(id);
    try { localStorage.setItem('catalogo_pestana', id); } catch { /* sin storage */ }
  };

  return (
    <div className="catalogo-page">
      <p className="cat-intro">
        Lo que se carga acá es lo que eligen los comerciales al armar el pre-check. Los precios distintos a los de esta lista
        y los descuentos quedan marcados para que los aprueben Pilar o el Tano.
      </p>
      <nav className="cat-tabs">
        {PESTANAS.map((p) => (
          <button key={p.id} className={pestana === p.id ? 'activo' : ''} onClick={() => elegir(p.id)}>{p.label}</button>
        ))}
      </nav>
      {pestana === 'precios' && <ListaPrecios locales={locales} />}
      {pestana === 'espacios' && <Espacios locales={locales} />}
      {pestana === 'parametros' && <Parametros />}
    </div>
  );
}

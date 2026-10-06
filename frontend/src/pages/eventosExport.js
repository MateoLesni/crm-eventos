import ExcelJS from 'exceljs';
import api from '../services/api';

const ESTADO_NOMBRES = {
  CONSULTA_ENTRANTE: 'Consulta Entrante',
  ASIGNADO: 'Asignado',
  CONTACTADO: 'Contactado',
  COTIZADO: 'Cotizado',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
  MULTIRESERVA: 'Multireserva',
  CONCLUIDO: 'Concluido',
  ELIMINADO: 'Eliminado',
};

const siNo = (v) => (v ? 'Sí' : 'No');

const fechaHora = (iso) => {
  if (!iso) return '';
  return iso.replace('T', ' ').slice(0, 16);
};

// Descarga el dataset completo del backend (paginado) y arma un Excel
// con todos los datos de las tarjetas filtradas (idsFiltrados, en orden).
export async function exportarEventosCompletoAExcel(idsFiltrados) {
  // 1. Bajar el dataset completo en páginas de 1000
  const porId = new Map();
  let afterId = 0;
  let hasMore = true;
  while (hasMore) {
    const { data } = await api.get('/eventos/exportar', {
      params: { after_id: afterId, limit: 1000 },
    });
    data.eventos.forEach((e) => porId.set(e.id, e));
    hasMore = data.has_more;
    afterId = data.next_after_id;
  }

  // 2. Filas en el mismo orden que la vista filtrada
  const filas = idsFiltrados.map((id) => porId.get(id)).filter(Boolean);

  // 3. Armar Excel
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CRM Eventos';
  wb.created = new Date();

  const ws = wb.addWorksheet('Eventos');

  ws.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Estado', key: 'estado', width: 18 },
    { header: 'Cliente', key: 'cliente', width: 26 },
    { header: 'Teléfono', key: 'telefono', width: 16 },
    { header: 'Email cliente', key: 'email_cliente', width: 28 },
    { header: 'Empresa', key: 'empresa', width: 20 },
    { header: 'Notas del cliente', key: 'notas_cliente', width: 30 },
    { header: 'Cliente desde', key: 'cliente_desde', width: 16 },
    { header: 'Local', key: 'local', width: 16 },
    { header: 'Comercial', key: 'comercial', width: 20 },
    { header: 'Email comercial', key: 'email_comercial', width: 26 },
    { header: 'Tipo', key: 'tipo', width: 12 },
    { header: 'Canal de origen', key: 'canal', width: 14 },
    { header: 'Fecha evento', key: 'fecha_evento', width: 14 },
    { header: 'Horario inicio', key: 'horario_inicio', width: 12 },
    { header: 'Horario fin', key: 'horario_fin', width: 12 },
    { header: 'Hora consulta', key: 'hora_consulta', width: 12 },
    { header: 'PAX', key: 'pax', width: 8 },
    { header: 'Presupuesto', key: 'presupuesto', width: 16 },
    { header: 'Fecha presupuesto', key: 'fecha_presupuesto', width: 16 },
    { header: 'Facturada', key: 'facturada', width: 10 },
    { header: 'Prioritario', key: 'prioritario', width: 10 },
    { header: 'Tentativo', key: 'tentativo', width: 10 },
    { header: 'Motivo rechazo', key: 'motivo_rechazo', width: 30 },
    { header: 'Mensaje original', key: 'mensaje_original', width: 40 },
    { header: 'Título', key: 'titulo', width: 28 },
    { header: 'Creado', key: 'creado', width: 17 },
    { header: 'Última actualización', key: 'actualizado', width: 17 },
    { header: 'Último cambio de estado', key: 'ultimo_cambio', width: 17 },
  ];

  filas.forEach((e) => {
    ws.addRow({
      id: e.id,
      estado: ESTADO_NOMBRES[e.estado] || e.estado,
      cliente: e.cliente?.nombre || '',
      telefono: e.cliente?.telefono || '',
      email_cliente: e.cliente?.email || '',
      empresa: e.cliente?.empresa || '',
      notas_cliente: e.cliente?.notas || '',
      cliente_desde: fechaHora(e.cliente?.fecha_creacion),
      local: e.local?.nombre || '',
      comercial: e.vendedor?.nombre || 'Sin asignar',
      email_comercial: e.vendedor?.email || '',
      tipo: e.tipo || '',
      canal: e.canal_origen || '',
      fecha_evento: e.fecha_evento || '',
      horario_inicio: e.horario_inicio || '',
      horario_fin: e.horario_fin || '',
      hora_consulta: e.hora_consulta || '',
      pax: e.cantidad_personas ?? '',
      presupuesto: e.presupuesto ?? '',
      fecha_presupuesto: e.fecha_presupuesto || '',
      facturada: siNo(e.facturada),
      prioritario: siNo(e.es_prioritario),
      tentativo: siNo(e.es_tentativo),
      motivo_rechazo: e.motivo_rechazo || '',
      mensaje_original: e.mensaje_original || '',
      titulo: e.titulo || '',
      creado: fechaHora(e.fecha_creacion),
      actualizado: fechaHora(e.fecha_actualizacion),
      ultimo_cambio: fechaHora(e.fecha_ultimo_cambio_estado),
    });
  });

  // Estilo del header + freeze
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } } };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.getColumn('presupuesto').numFmt = '#,##0';
  ws.autoFilter = { from: 'A1', to: 'AC1' };

  // 4. Descargar
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `eventos_completo_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return filas.length;
}

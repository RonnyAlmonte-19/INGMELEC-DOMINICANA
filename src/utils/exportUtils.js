import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';

const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Neutraliza vectores de CSV / Formula Injection (CWE-1236) sin alterar valores numéricos puros.
 */
export function neutralizeSpreadsheetFormula(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }
  const str = String(value);
  if (!str) return '';
  if (FORMULA_TRIGGER_CHARS.has(str[0])) {
    return `'${str}`;
  }
  let idx = 0;
  while (idx < str.length) {
    const code = str.charCodeAt(idx);
    if (code <= 32 || code === 0xFEFF) {
      if (str[idx] === '\t' || str[idx] === '\r') {
        return `'${str}`;
      }
      idx++;
      continue;
    }
    break;
  }
  if (idx < str.length && FORMULA_TRIGGER_CHARS.has(str[idx])) {
    return `'${str}`;
  }
  return str;
}

/**
 * Escapa y neutraliza una celda individual para formato CSV RFC-4180.
 */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  const safeVal = neutralizeSpreadsheetFormula(value);
  if (typeof safeVal === 'number' && Number.isFinite(safeVal)) {
    return String(safeVal);
  }
  const str = String(safeVal).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Construye el contenido CSV completo con BOM UTF-8 y protección contra inyección de fórmulas.
 */
export function buildCsvContent(headers = [], rows = []) {
  const headerLine = headers.map((h) => escapeCsvCell(h)).join(',');
  const dataLines = rows.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => escapeCsvCell(cell)).join(',')
  );
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

/**
 * Descarga un archivo CSV en el navegador y libera su ObjectURL.
 */
export function downloadCsvFile(filename, headers, rows) {
  const csvContent = buildCsvContent(headers, rows);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return csvContent;
}

/**
 * Construye una hoja formateada para write-excel-file neutralizando fórmulas en celdas de texto.
 */
export function buildSafeXlsxSheet(sheetName, headers = [], rows = [], columnWidths = []) {
  const headerRow = headers.map((h) => ({
    value: neutralizeSpreadsheetFormula(h),
    type: String,
    fontWeight: 'bold',
    backgroundColor: '#F1F5F9',
    color: '#0F172A'
  }));

  const bodyRows = rows.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => {
      if (cell === null || cell === undefined || cell === '') {
        return { value: '', type: String };
      }
      if (typeof cell === 'number' && Number.isFinite(cell)) {
        return { value: cell, type: Number };
      }
      if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
        return { value: cell, type: Date, format: 'yyyy-mm-dd' };
      }
      return {
        value: String(neutralizeSpreadsheetFormula(cell)),
        type: String
      };
    })
  );

  const safeTitle = String(sheetName || 'Hoja1').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Hoja1';
  return {
    sheet: safeTitle,
    columns: headers.map((_, idx) => ({ width: columnWidths[idx] || 20 })),
    data: [headerRow, ...bodyRows]
  };
}

/**
 * Genera y descarga un libro .xlsx real en el navegador utilizando write-excel-file/browser.
 */
export async function downloadXlsxWorkbook(filename, sheets = []) {
  const formatted = sheets.map((s) =>
    buildSafeXlsxSheet(s.sheetName || s.sheet, s.headers || [], s.rows || [], s.columnWidths || [])
  );
  await writeXlsxFile(formatted, {
    fontFamily: 'Calibri',
    fontSize: 10
  }).toFile(filename);
}

/**
 * Parser RFC-4180 para CSV que transforma texto CSV en matriz 2D.
 */
export function parseCsvTextToMatrix(csvText = '') {
  const cleanText = String(csvText || '').replace(/^\uFEFF/, '');
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const next = cleanText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentVal += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentVal += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentVal);
      currentVal = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentVal);
      rows.push(currentRow);
      currentRow = [];
      currentVal = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentVal);
      rows.push(currentRow);
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += ch;
    }
  }

  if (currentVal.length > 0 || currentRow.length > 0) {
    currentRow.push(currentVal);
    rows.push(currentRow);
  }

  return rows.filter((r) => r.some((cell) => String(cell ?? '').trim() !== ''));
}

/**
 * Convierte una matriz 2D (fila cabecera + datos) a objetos clave-valor seguros.
 */
export function sheetMatrixToObjects(matrix = []) {
  if (!Array.isArray(matrix) || matrix.length < 2) return [];
  const rawHeaders = matrix[0].map((cell, idx) => {
    const text = String(cell ?? '').trim();
    return text || `COL_${idx + 1}`;
  });

  const result = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!Array.isArray(row)) continue;
    const hasContent = row.some((c) => c !== null && c !== undefined && String(c).trim() !== '');
    if (!hasContent) continue;

    const obj = {};
    rawHeaders.forEach((header, colIdx) => {
      const val = row[colIdx];
      if (val instanceof Date && !Number.isNaN(val.getTime())) {
        obj[header] = val.toISOString().slice(0, 10);
      } else {
        obj[header] = val ?? '';
      }
    });
    result.push(obj);
  }
  return result;
}

/**
 * Lee un archivo .xlsx o .csv del usuario sin depender de la librería vulnerable SheetJS/xlsx.
 */
export async function readSpreadsheetFileToSheets(file) {
  if (!file || !file.name) {
    throw new Error('No se recibió un archivo válido.');
  }
  const lowerName = String(file.name).toLowerCase();
  if (lowerName.endsWith('.xls')) {
    throw new Error('El formato heredado .xls binario no está permitido por seguridad. Guarde el archivo como .xlsx o .csv e intente nuevamente.');
  }

  if (lowerName.endsWith('.csv')) {
    const text = typeof file.text === 'function'
      ? await file.text()
      : await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Error leyendo archivo CSV.'));
          reader.readAsText(file, 'utf-8');
        });
    const matrix = parseCsvTextToMatrix(text);
    return [{ sheet: 'CSV', objects: sheetMatrixToObjects(matrix) }];
  }

  if (!lowerName.endsWith('.xlsx')) {
    throw new Error('Extensión no compatible. Seleccione un archivo .xlsx o .csv.');
  }

  const input = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file;
  const rawSheets = await readXlsxFile(input);
  return (Array.isArray(rawSheets) ? rawSheets : []).map((s) => ({
    sheet: s.sheet || 'Hoja1',
    objects: sheetMatrixToObjects(s.data || [])
  }));
}

/**
 * Columnas estándar unificadas para exportación maestra de artículos (InventoryTable y ReportesPage).
 */
export const INVENTARIO_EXPORT_HEADERS = [
  'ID',
  'Código',
  'Campamento / Sede Verificada',
  'Área',
  'Categoría',
  'Artículo',
  'Marca / Modelo',
  'Serie / IMEI',
  'Cantidad',
  'Unidad',
  'Estado',
  'Ubicación Excel',
  'Zona / Estante',
  'Propietario',
  'Custodio',
  'Observaciones',
  'Hoja Origen',
  'Fila Origen'
];

export const INVENTARIO_EXPORT_WIDTHS = [
  8, 14, 30, 14, 22, 34, 24, 20, 12, 12, 18, 26, 18, 14, 24, 34, 14, 12
];

export function mapArticulosToExportRows(articulos = []) {
  return (Array.isArray(articulos) ? articulos : []).map((a) => [
    a.id ?? '',
    a.codigo_original || '',
    a.campamento_nombre || 'SIN SEDE VERIFICADA (PENDIENTE DE CLASIFICACIÓN)',
    a.area || '',
    a.categoria || '',
    a.articulo_nombre || '',
    a.marca_modelo || '',
    a.serie_imei || '',
    a.cantidad_num !== null && a.cantidad_num !== undefined
      ? Number(a.cantidad_num)
      : (a.cantidad_texto || 'PENDIENTE DE VERIFICACIÓN'),
    a.unidad_medida || 'Unidad',
    a.estado_fisico || '',
    a.ubicacion_nombre || '',
    a.zona_estante || '',
    a.propietario || '',
    a.asignado_a || '',
    a.observaciones || '',
    a.hoja_origen || '',
    a.fila_origen ?? ''
  ]);
}

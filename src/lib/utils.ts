import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseNumber(value: string): string {
  if (value === '') return '';
  const num = Number(value);
  return isNaN(num) ? '' : String(num);
}

export function getNumberFromString(value: string | number): number {
  if (value === '' || value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : (isNaN(Number(value)) ? 0 : Number(value));
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateNumber(
  value: string,
  options?: {
    required?: boolean;
    min?: number;
    max?: number;
    fieldName?: string;
  }
): ValidationResult {
  const { required = false, min, max, fieldName = 'Campo' } = options || {};
  
  if (required && (value === '' || value === null || value === undefined)) {
    return { isValid: false, error: `${fieldName} es requerido` };
  }
  
  if (value === '' || value === null || value === undefined) {
    return { isValid: true };
  }
  
  const numValue = Number(value);
  
  if (isNaN(numValue)) {
    return { isValid: false, error: `${fieldName} debe ser un número válido` };
  }
  
  if (min !== undefined && numValue < min) {
    return { isValid: false, error: `${fieldName} debe ser mayor o igual a ${min}` };
  }
  
  if (max !== undefined && numValue > max) {
    return { isValid: false, error: `${fieldName} debe ser menor o igual a ${max}` };
  }
  
  return { isValid: true };
}

export interface ExportColumn {
  header: string;
  key: string;
  format?: (value: any, row?: any) => string;
}

export function exportToCSV(columns: ExportColumn[], data: any[], filename: string): void {
  if (!data || data.length === 0) return;
  
  const headers = columns.map(col => col.header);
  const rows = data.map(row => 
    columns.map(col => {
      const value = row[col.key];
      let formattedValue = '';
      
      if (col.format) {
        formattedValue = col.format(value, row);
      } else if (value === null || value === undefined) {
        formattedValue = '';
      } else {
        formattedValue = String(value);
      }
      
      // Escapar comillas dobles y puntos y coma para CSV con separador ;
      // Si el valor contiene ; o " o saltos de línea, lo envolvemos en comillas
      const needsQuoting = formattedValue.includes(';') || formattedValue.includes('"') || formattedValue.includes('\n');
      let result = formattedValue.replace(/"/g, '""');
      if (needsQuoting) {
        result = `"${result}"`;
      }
      // Prevenir CSV injection: prefijos peligrosos se neutralizan con comilla simple
      if (/^[=+\-@\t\r]/.test(result)) {
        result = `'${result}`;
      }
      return result;
    })
  );
  
  // Usar punto y coma (;) como separador para mejor compatibilidad con Excel en español/Cuba
  const csvContent = '\uFEFF' + [headers, ...rows]
    .map(row => row.join(';'))
    .join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function calculateMargin(cost: number, price: number): number {
  if (!price || price <= 0) return 0;
  return ((price - cost) / price) * 100;
}

export function normalizeStr(str: string): string {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Determina si un producto está activo. El servidor (node:sqlite) devuelve
// is_active como INTEGER 0/1, por lo que hay que aceptar ambos: booleano y número.
export function isActive(p: { is_active?: boolean | number | null } | null | undefined): boolean {
  return p?.is_active === true || p?.is_active === 1;
}

export function esVitalicia(validUntil?: string | null): boolean {
  if (!validUntil) return false;
  return new Date(validUntil).getUTCFullYear() >= 2900;
}

// Genera un UUID v4 seguro. `crypto.randomUUID` solo existe en contextos seguros
// (HTTPS o localhost). En las cajas remotas por LAN (http://<IP>:4173) NO está
// disponible, así que se usa un fallback RFC4122 v4 con `crypto.getRandomValues`
// (que sí funciona sobre HTTP) y, en último caso, Math.random.
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const exportToExcel = exportToCSV;
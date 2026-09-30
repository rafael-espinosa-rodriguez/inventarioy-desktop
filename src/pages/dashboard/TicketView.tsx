import React, { useRef, useState } from 'react';
import { Printer, X, Building2, Calendar, User, FileText } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { useDatabaseStore, folioLabel } from '../../store/dbStore';

interface TicketItem {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface TicketData {
  items: TicketItem[];
  total: number;
  employeeName: string;
  businessName: string;
  ticketMessage: string;
  date: Date;
  saleLabel?: string;
  isPreticket?: boolean;
  isPendingAccount?: boolean;
  saleType?: 'SALON' | 'DOMICILIO' | 'BAR' | 'VENTA_RAPIDA';
  isAccountHouse?: boolean;
  deliveryFee?: number;
  employeeRole?: string;
}

interface TicketViewProps {
  ticketData: TicketData;
  onClose: () => void;
  isPreticket?: boolean;
  // Id de la venta registrada (spec 003): habilita el botón "Facturar".
  saleId?: string | null;
}

export default function TicketView({ ticketData, onClose, isPreticket = false, saleId = null }: TicketViewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [invoicing, setInvoicing] = useState(false);
  const [invoicedFolio, setInvoicedFolio] = useState<string | null>(null);

  const handlePrint = () => {
    printTicket(ticketData);
  };

  const canInvoice = !!saleId && !isPreticket && !ticketData.isPendingAccount && !invoicedFolio;

  const handleInvoice = async () => {
    if (!saleId || invoicing) return;
    setInvoicing(true);
    try {
      const res = await useDatabaseStore.getState().createInvoiceFromSale(saleId);
      if (!res.success || !res.invoice) {
        toast.error(res.error || 'No se pudo facturar la venta');
      } else {
        setInvoicedFolio(folioLabel(res.invoice));
        toast.success(`Factura ${folioLabel(res.invoice)} creada`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo facturar la venta');
    }
    setInvoicing(false);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }) + ' ' + date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return '$' + amount.toFixed(2);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" id="ticket-container">
      <div className="bg-bg rounded-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto">
        <div className="p-4 border-b border-border flex items-center justify-between print-hide">
          <div>
            <h2 className="text-lg font-semibold text-text">{isPreticket || ticketData.isPreticket ? 'Preticket' : 'Ticket'}</h2>
            {ticketData.isPendingAccount && (
              <p className="text-xs text-text-secondary">Agregado a cuenta pendiente</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="print-hide">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-4" ref={printRef}>
          <div className="bg-white text-black p-6 rounded-lg font-mono text-sm">
            <div className="text-center mb-4">
              <div className="text-lg font-bold">
                {ticketData.businessName || 'Mi Negocio'}
              </div>
              <div className="border-t border-b border-black my-2 py-1">
                =====================
              </div>
            </div>

            <div className="flex justify-between mb-3 text-xs">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(ticketData.date)}
              </div>
            </div>

            <div className="flex items-center gap-1 mb-2 text-xs">
              <User className="h-3 w-3" />
              {ticketData.employeeRole ? `${ticketData.employeeRole}: ${ticketData.employeeName}` : (ticketData.employeeName || 'Dueño')}
            </div>

            {(ticketData.saleType || ticketData.saleLabel) && (
              <div className="mb-2 text-xs font-medium">
                Tipo: {ticketData.saleLabel || (ticketData.saleType === 'DOMICILIO' ? 'Domicilio' : ticketData.saleType === 'BAR' ? 'Bar' : ticketData.saleType === 'VENTA_RAPIDA' ? 'Venta Rápida' : 'Salón')}
              </div>
            )}

            {ticketData.isAccountHouse && (
              <div className="mb-2 text-xs font-bold text-gray-900">
                CUENTA CASA
              </div>
            )}

            {(ticketData.deliveryFee ?? 0) > 0 && (
              <div className="mb-2 text-xs">
                Costo Domicilio: {formatCurrency(ticketData.deliveryFee ?? 0)}
              </div>
            )}

            <div className="space-y-1 mb-3">
              {ticketData.items.map((item, index) => (
                <div key={`${item.name}-${item.quantity}-${index}`} className="flex justify-between">
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                  <span>
                    {formatCurrency(item.subtotal)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-black my-2 py-1" />

            <div className="flex justify-between font-bold text-base">
              <span>TOTAL:</span>
              <span>{formatCurrency(ticketData.total)}</span>
            </div>

            {ticketData.isPendingAccount && (
              <div className="text-center text-xs mt-3 text-gray-600 italic">
                El ticket final se generará al cobrar la cuenta
              </div>
            )}

            <div className="border-t border-black my-2 py-1" />

            <div className="text-center text-xs mt-4">
              {ticketData.isPendingAccount ? 'Items agregados a cuenta pendiente' : (ticketData.ticketMessage || '¡Gracias por su visita!')}
            </div>

            <div className="text-center mt-2 text-xs">
              =====================
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border flex gap-2">
          <Button onClick={handlePrint} className="flex-1 gap-2 print-hide">
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          {(canInvoice || invoicedFolio) && (
            <Button
              variant="outline"
              onClick={handleInvoice}
              disabled={!canInvoice || invoicing}
              className="flex-1 gap-2 print-hide"
              title={invoicedFolio ? `Ya facturada: ${invoicedFolio}` : 'Crear comprobante de esta venta'}
            >
              <FileText className="h-4 w-4" />
              {invoicing ? 'Facturando…' : invoicedFolio ? invoicedFolio : 'Facturar'}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} className="flex-1 print-hide">
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface InvoicePrintItem {
  description: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface InvoicePrintData {
  folio: string;
  businessName: string;
  clientName: string;
  date: string;
  items: InvoicePrintItem[];
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentMethod?: string | null;
  status: 'emitida' | 'anulada';
  notes?: string | null;
}

// Impresión de comprobantes (spec 003): térmico 58mm o hoja A5.
// Reutiliza el patrón window.open + document.write de printTicket.
export function printInvoice(data: InvoicePrintData, format: 'thermal' | 'a5' = 'thermal') {
  const money = (n: number) => '$' + (Number(n) || 0).toFixed(2);
  const safe = {
    folio: escapeHtml(data.folio),
    businessName: escapeHtml(data.businessName || 'Mi Negocio'),
    clientName: escapeHtml(data.clientName || 'Cliente'),
    date: escapeHtml(data.date),
    paymentMethod: escapeHtml(data.paymentMethod || '—'),
    notes: escapeHtml(data.notes || ''),
    items: data.items.map((it) => ({
      description: escapeHtml(it.description),
      quantity: it.quantity,
      price: it.price,
      subtotal: it.subtotal,
    })),
  };
  const voided = data.status === 'anulada';
  const rows = safe.items.map((it) => `
    <div class="item"><span>${it.quantity}x ${it.description}</span><span>${money(it.subtotal)}</span></div>
  `).join('');

  const ticketHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Factura ${safe.folio}</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 13px; font-weight: 700; color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; line-height: 1.1; width: 58mm; margin: 0; margin-left: 5px; padding: 2px; }
        .header { text-align: center; margin-bottom: 8px; }
        .header h1 { font-size: 17px; margin: 0; }
        .folio { font-size: 15px; margin-top: 4px; }
        .voided { font-size: 16px; border: 2px solid #000; padding: 4px; margin: 8px 0; text-align: center; }
        .divider { border-top: 1px dashed #000; margin: 8px 0; }
        .item { display: flex; justify-content: space-between; }
        .total { font-weight: bold; font-size: 16px; }
        .footer { text-align: center; margin-top: 8px; font-weight: 400; font-size: 11px; }
        @media print { body { margin: 0; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${safe.businessName}</h1>
        <div class="folio">COMPROBANTE ${safe.folio}</div>
      </div>
      ${voided ? '<div class="voided">ANULADA</div>' : ''}
      <div>Fecha: ${safe.date}</div>
      <div>Cliente: ${safe.clientName}</div>
      <div>Pago: ${safe.paymentMethod}</div>
      <div class="divider"></div>
      ${rows}
      <div class="divider"></div>
      <div class="item"><span>Subtotal:</span><span>${money(data.subtotal)}</span></div>
      ${data.discount > 0 ? `<div class="item"><span>Descuento:</span><span>-${money(data.discount)}</span></div>` : ''}
      ${data.taxAmount > 0 ? `<div class="item"><span>Impuesto (${data.taxRate}%):</span><span>${money(data.taxAmount)}</span></div>` : ''}
      <div class="item total"><span>TOTAL:</span><span>${money(data.total)}</span></div>
      ${safe.notes ? `<div class="divider"></div><div class="footer">${safe.notes}</div>` : ''}
    </body>
    </html>
  `;

  const a5Html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Factura ${safe.folio}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; color: #000; max-width: 148mm; margin: 10mm auto; }
        h1 { font-size: 20px; margin: 0; }
        .meta { margin: 12px 0; line-height: 1.6; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
        th { background: #eee; }
        td.num, th.num { text-align: right; }
        .totals { width: 60%; margin-left: auto; }
        .voided { font-size: 18px; font-weight: bold; border: 3px solid #000; padding: 6px; text-align: center; margin: 12px 0; }
        @media print { body { margin: 0 auto; } }
      </style>
    </head>
    <body>
      <h1>${safe.businessName}</h1>
      <div><strong>COMPROBANTE ${safe.folio}</strong>${voided ? ' — ANULADA' : ''}</div>
      ${voided ? '<div class="voided">ANULADA</div>' : ''}
      <div class="meta">
        <div><strong>Fecha:</strong> ${safe.date}</div>
        <div><strong>Cliente:</strong> ${safe.clientName}</div>
        <div><strong>Pago:</strong> ${safe.paymentMethod}</div>
      </div>
      <table>
        <thead><tr><th>Cant.</th><th>Descripción</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead>
        <tbody>
          ${safe.items.map((it) => `<tr><td>${it.quantity}</td><td>${it.description}</td><td class="num">${money(it.price)}</td><td class="num">${money(it.subtotal)}</td></tr>`).join('')}
        </tbody>
      </table>
      <table class="totals">
        <tr><td>Subtotal</td><td class="num">${money(data.subtotal)}</td></tr>
        ${data.discount > 0 ? `<tr><td>Descuento</td><td class="num">-${money(data.discount)}</td></tr>` : ''}
        ${data.taxAmount > 0 ? `<tr><td>Impuesto (${data.taxRate}%)</td><td class="num">${money(data.taxAmount)}</td></tr>` : ''}
        <tr><td><strong>TOTAL</strong></td><td class="num"><strong>${money(data.total)}</strong></td></tr>
      </table>
      ${safe.notes ? `<div class="meta">Notas: ${safe.notes}</div>` : ''}
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(format === 'a5' ? a5Html : ticketHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function printTicket(ticketData: TicketData) {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }) + ' ' + date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return '$' + amount.toFixed(2);
  };

  const safe = {
    businessName: escapeHtml(ticketData.businessName || 'Mi Negocio'),
    employeeName: escapeHtml(ticketData.employeeName || 'Dueño'),
    ticketMessage: escapeHtml(ticketData.ticketMessage || '¡Gracias por su visita!'),
    items: ticketData.items.map(item => ({
      quantity: item.quantity,
      name: escapeHtml(item.name),
      subtotal: item.subtotal,
    })),
  };

  const ticketHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Ticket - ${safe.businessName}</title>
      <style>
        body {
          font-family: 'Courier New', monospace;
          font-size: 13px;
          font-weight: 700;
          color: #000 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          text-rendering: optimizeLegibility;
          line-height: 1.0;
          width: 58mm;
          margin: 0;
          margin-left: 5px;
          padding: 2px;
        }
        .header {
          text-align: center;
          margin-bottom: 10px;
          color: #000 !important;
        }
.header h1 {
          font-size: 18px;
          margin: 0;
        }
        .divider {
          border-top: 1px dashed #000;
          margin: 10px 0;
          color: #000 !important;
        }
        .item {
          display: flex;
          justify-content: space-between;
          color: #000 !important;
        }
.total {
          font-weight: bold;
          font-size: 16px;
        }
        .footer {
          text-align: center;
          margin-top: 10px;
          color: #000 !important;
        }
        .footer p {
          color: #000 !important;
        }
        @media print {
          body { margin: 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${safe.businessName}</h1>
        <div class="divider"></div>
      </div>
      
      <div>${formatDate(ticketData.date)}</div>
      <div>Cajero: ${safe.employeeName}</div>
      <div class="divider"></div>
      
      ${safe.items.map(item => `
        <div class="item">
          <span>${item.quantity}x ${item.name}</span>
          <span>${formatCurrency(item.subtotal)}</span>
        </div>
      `).join('')}
      
      <div class="divider"></div>
      
      <div class="item total">
        <span>TOTAL:</span>
        <span>${formatCurrency(ticketData.total)}</span>
      </div>
      
      <div class="divider"></div>
      
      <div class="footer">
        <p>${safe.ticketMessage}</p>
        <div class="divider"></div>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(ticketHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}
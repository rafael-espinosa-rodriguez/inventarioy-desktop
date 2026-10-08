import React, { useRef } from 'react';
import { Printer, X, Building2, Calendar, User } from 'lucide-react';
import { Button } from '../../components/ui/button';

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
}

export default function TicketView({ ticketData, onClose, isPreticket = false }: TicketViewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    printTicket(ticketData);
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
          <Button variant="outline" onClick={onClose} className="flex-1 print-hide">
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
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
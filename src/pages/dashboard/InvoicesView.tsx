import { useState, useEffect, Fragment } from 'react';
import { ReceiptText, Search, Printer, Download, X, Ban, ShoppingCart, FileSpreadsheet } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { useDatabaseStore, folioLabel, type Invoice } from '../../store/dbStore';
import { useAuthStore } from '../../store/authStore';
import { exportToExcel } from '../../lib/utils';
import { printInvoice } from './TicketView';

const currentYear = () => new Date().getFullYear();
const currentMonth = () => String(new Date().getMonth() + 1).padStart(2, '0');

export default function InvoicesView() {
  const user = useAuthStore((s) => s.user);
  const invoices = useDatabaseStore((s) => s.invoices);
  const sales = useDatabaseStore((s) => s.sales);
  const fetchInvoices = useDatabaseStore((s) => s.fetchInvoices);
  const fetchInvoiceItems = useDatabaseStore((s) => s.fetchInvoiceItems);
  const createInvoiceFromSale = useDatabaseStore((s) => s.createInvoiceFromSale);
  const voidInvoice = useDatabaseStore((s) => s.voidInvoice);
  const invoiceReport = useDatabaseStore((s) => s.invoiceReport);

  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState(currentMonth());
  const [status, setStatus] = useState('todas');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showFromSale, setShowFromSale] = useState(false);
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Desde venta
  const [fromSaleId, setFromSaleId] = useState('');
  const [fromSaleClient, setFromSaleClient] = useState('Cliente');

  const load = async () => {
    setLoading(true);
    try {
      await fetchInvoices({ year, month, status: status === 'todas' ? undefined : status, q: q.trim() || undefined });
    } catch (e: any) {
      toast.error(e?.message || 'No se pudieron cargar las facturas');
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFromSale = async () => {
    if (busy || !fromSaleId) return;
    setBusy(true);
    try {
      const res = await createInvoiceFromSale(fromSaleId, fromSaleClient.trim() || 'Cliente');
      if (!res.success || !res.invoice) {
        toast.error(res.error || 'No se pudo facturar la venta');
      } else {
        toast.success(`Factura ${folioLabel(res.invoice)} creada`);
        setShowFromSale(false);
        setFromSaleId('');
        await load();
      }
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo facturar la venta');
    }
    setBusy(false);
  };

  const handleVoid = async () => {
    if (busy || !voidTarget || !voidReason.trim()) return;
    setBusy(true);
    try {
      const res = await voidInvoice(voidTarget.id, voidReason.trim());
      if (!res.success) {
        toast.error(res.error || 'No se pudo anular la factura');
      } else {
        toast.success(`Factura ${folioLabel(voidTarget)} anulada`);
        setVoidTarget(null);
        setVoidReason('');
        await load();
      }
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo anular la factura');
    }
    setBusy(false);
  };

  const handlePrint = async (inv: Invoice, format: 'thermal' | 'a5') => {
    try {
      let items = inv.items;
      if (!items) items = await fetchInvoiceItems(inv.id);
      printInvoice({
        folio: folioLabel(inv),
        businessName: user?.businessName || 'Mi Negocio',
        clientName: inv.client_name,
        date: inv.date,
        items: (items || []).map((it) => ({
          description: it.description,
          quantity: it.quantity,
          price: it.price,
          subtotal: it.subtotal,
        })),
        subtotal: inv.subtotal,
        discount: inv.discount,
        taxRate: inv.tax_rate,
        taxAmount: inv.tax_amount,
        total: inv.total,
        paymentMethod: inv.payment_method,
        status: inv.status,
        notes: inv.notes,
      }, format);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo imprimir');
    }
  };

  const handleReport = async () => {
    try {
      const rep = await invoiceReport(year, month);
      if (!rep?.rows?.length) {
        toast.error('Sin facturas emitidas en ese mes');
        return;
      }
      exportToExcel(
        [
          { header: 'Folio', key: '__folio' },
          { header: 'Fecha', key: 'date' },
          { header: 'Cliente', key: 'client_name' },
          { header: 'Subtotal', key: 'subtotal' },
          { header: 'Descuento', key: 'discount' },
          { header: 'Impuesto', key: 'tax_amount' },
          { header: 'Total', key: 'total' },
          { header: 'Efectivo', key: 'efectivo' },
          { header: 'Transferencia', key: 'transferencia' },
          { header: 'USD', key: 'usd' },
          { header: 'EUR', key: 'eur' },
        ],
        rep.rows.map((r: any) => ({ ...r, __folio: `CR-${r.folio_year}-${String(r.folio_seq).padStart(6, '0')}` })),
        `facturas-${year}-${month}`
      );
      toast.success(`Reporte ${year}-${month}: ${rep.count} facturas, total $${rep.total.toFixed(2)}`);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo generar el reporte');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-text">
          <ReceiptText className="h-5 w-5 text-primary" />
          Facturación
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowFromSale(true)} className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Desde venta
          </Button>
        </div>
      </div>

      {/* Filtros + reporte */}
      <div className="rounded-xl border border-border/50 bg-surface/80 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div>
            <Label className="text-xs">Año</Label>
            <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Mes</Label>
            <Input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="MM" maxLength={2} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-bg px-2 text-sm text-text">
              <option value="todas">Todas</option>
              <option value="emitida">Emitidas</option>
              <option value="anulada">Anuladas</option>
            </select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Buscar (cliente o folio)</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-text-secondary" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(); }} placeholder="Cliente o número…" className="h-9 pl-8" />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? 'Cargando…' : 'Filtrar'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleReport} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Reporte ONAT del mes (Excel)
          </Button>
        </div>
      </div>

      {/* Listado */}
      <div className="overflow-x-auto rounded-xl border border-border/50 bg-surface/80">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border/50 text-xs text-text-secondary">
              <th className="px-3 py-2">Folio</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <Fragment key={inv.id}>
                <tr className="border-b border-border/30 hover:bg-surface-hover/50">
                  <td className="px-3 py-2 font-mono text-primary">{folioLabel(inv)}</td>
                  <td className="px-3 py-2 text-text-secondary">{inv.date}</td>
                  <td className="px-3 py-2 text-text">{inv.client_name}</td>
                  <td className="px-3 py-2 text-right font-mono text-text">${inv.total.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${inv.status === 'anulada' ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success'}`}>
                      {inv.status === 'anulada' ? 'Anulada' : 'Emitida'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" title="Ver líneas" onClick={async () => {
                        if (expandedId === inv.id) { setExpandedId(null); return; }
                        try { await fetchInvoiceItems(inv.id); } catch { /* toast ya mostrado */ }
                        setExpandedId(inv.id);
                      }}>
                        Ver
                      </Button>
                      <Button variant="ghost" size="sm" title="Imprimir térmico" onClick={() => handlePrint(inv, 'thermal')}>
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Imprimir A5" onClick={() => handlePrint(inv, 'a5')}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {inv.status === 'emitida' && (
                        <Button variant="ghost" size="sm" title="Anular" onClick={() => { setVoidTarget(inv); setVoidReason(''); }}>
                          <Ban className="h-4 w-4 text-danger" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedId === inv.id && (
                  <tr key={`${inv.id}-detail`} className="bg-bg/40">
                    <td colSpan={6} className="px-4 py-2 text-xs text-text-secondary">
                      {(inv.items || []).map((it) => (
                        <div key={it.id} className="flex justify-between py-0.5">
                          <span>{it.quantity}x {it.description}</span>
                          <span className="font-mono">${it.subtotal.toFixed(2)}</span>
                        </div>
                      ))}
                      {(!inv.items || inv.items.length === 0) && <span>Sin líneas cargadas.</span>}
                      <div className="mt-1 flex justify-between border-t border-border/30 pt-1 text-text">
                        <span>Subtotal ${inv.subtotal.toFixed(2)}{inv.discount > 0 ? ` · Desc. $${inv.discount.toFixed(2)}` : ''}{inv.tax_amount > 0 ? ` · Imp. $${inv.tax_amount.toFixed(2)}` : ''}</span>
                        <span>Pago: {inv.payment_method || '—'}{inv.sale_id ? ' · de venta' : ' · manual'}</span>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {invoices.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-text-secondary">
                  Sin facturas. Crea una manual o desde una venta.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: desde venta */}
      {showFromSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && setShowFromSale(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text">Facturar venta</h3>
              <button onClick={() => setShowFromSale(false)} className="text-text-secondary hover:text-text"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Venta (recientes primero)</Label>
                <select value={fromSaleId} onChange={(e) => setFromSaleId(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-bg px-2 text-sm text-text">
                  <option value="">Seleccionar…</option>
                  {sales.slice(0, 100).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.date} · ${Number(s.total_amount || 0).toFixed(2)} · {s.sale_type || 'SALON'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Cliente</Label>
                <Input value={fromSaleClient} onChange={(e) => setFromSaleClient(e.target.value)} className="h-9" />
              </div>
              <Button onClick={handleFromSale} disabled={busy || !fromSaleId} className="w-full">
                {busy ? 'Facturando…' : 'Crear comprobante'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Anular con motivo */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { if (!busy) { setVoidTarget(null); setVoidReason(''); } }}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-semibold text-text">Anular {folioLabel(voidTarget)}</h3>
            <p className="mb-4 text-sm text-text-secondary">
              Quedará marcada como anulada (no se borra) y se registrará en auditoría.
            </p>
            <Label className="text-xs">Motivo de anulación *</Label>
            <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Ej: error de importe" className="mt-1 h-9" autoFocus />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setVoidTarget(null); setVoidReason(''); }} disabled={busy}>
                Cancelar
              </Button>
              <Button onClick={handleVoid} disabled={busy || !voidReason.trim()} className="gap-2 bg-danger text-white hover:bg-danger/90">
                <Ban className="h-4 w-4" />
                {busy ? 'Anulando…' : 'Anular factura'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

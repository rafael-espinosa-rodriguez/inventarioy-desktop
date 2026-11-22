import { useEffect, useMemo } from 'react';
import { ChefHat, Clock, CheckCircle2, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useDatabaseStore } from '../../store/dbStore';
import { Button } from '../../components/ui/button';

const COLUMNS: { key: 'pending' | 'preparing' | 'ready'; label: string; color: string }[] = [
  { key: 'pending', label: 'Pendientes', color: 'text-warning' },
  { key: 'preparing', label: 'Preparando', color: 'text-primary' },
  { key: 'ready', label: 'Listas', color: 'text-success' },
];

export default function KitchenView() {
  const { tables, kitchenOrders, kitchenOrderItems, fetchKitchenData, setKitchenStatus } = useDatabaseStore();

  useEffect(() => {
    fetchKitchenData().catch(() => {});
    const timer = setInterval(() => { fetchKitchenData().catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  }, []);

  const tableName = (id: string) => tables.find(t => t.id === id)?.name || 'Mesa';
  const tableZone = (id: string) => tables.find(t => t.id === id)?.zone || '';

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, typeof kitchenOrderItems>();
    for (const item of kitchenOrderItems) {
      const arr = map.get(item.order_id) || [];
      arr.push(item);
      map.set(item.order_id, arr);
    }
    return map;
  }, [kitchenOrderItems]);

  const advance = async (orderId: string, status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled') => {
    const res = await setKitchenStatus(orderId, status);
    if (!res.success) toast.error(res.error || 'No se pudo actualizar la comanda');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text flex items-center gap-2">
          <ChefHat className="h-6 w-6 text-primary" />
          Cocina
        </h1>
        <p className="text-sm text-text-secondary">Comandas en tiempo real (se actualiza cada 5 segundos).</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map(column => {
          const orders = kitchenOrders.filter(o => o.status === column.key);
          return (
            <div key={column.key} className="rounded-xl border border-border bg-surface p-4">
              <h2 className={`mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide ${column.color}`}>
                <Clock className="h-4 w-4" />
                {column.label} ({orders.length})
              </h2>
              <div className="space-y-3">
                {orders.length === 0 && (
                  <p className="text-xs text-text-secondary">Sin comandas.</p>
                )}
                {orders.map(order => {
                  const items = itemsByOrder.get(order.id) || [];
                  return (
                    <div key={order.id} className="rounded-lg border border-border bg-bg p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-text">{tableName(order.table_id)}</p>
                          <p className="text-[11px] text-text-secondary">
                            {tableZone(order.table_id) && `${tableZone(order.table_id)} · `}
                            {new Date(order.opened_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                          #{order.id.slice(0, 4)}
                        </span>
                      </div>
                      <ul className="space-y-1 text-xs text-text">
                        {items.map(item => (
                          <li key={item.id} className="flex justify-between gap-2">
                            <span>{item.quantity}x {item.name}</span>
                          </li>
                        ))}
                      </ul>
                      {order.notes && <p className="mt-2 text-[11px] italic text-text-secondary">{order.notes}</p>}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {column.key === 'pending' && (
                          <Button size="sm" onClick={() => advance(order.id, 'preparing')}>Iniciar</Button>
                        )}
                        {column.key === 'preparing' && (
                          <Button size="sm" onClick={() => advance(order.id, 'ready')}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            Listo
                          </Button>
                        )}
                        {column.key === 'ready' && (
                          <Button size="sm" onClick={() => advance(order.id, 'delivered')}>
                            <Truck className="mr-1 h-3.5 w-3.5" />
                            Entregado
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => advance(order.id, 'cancelled')}>
                          <XCircle className="h-3.5 w-3.5 text-danger" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

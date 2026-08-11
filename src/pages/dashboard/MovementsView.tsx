import React, { useState, useMemo, useEffect } from 'react';
import { useDatabaseStore } from '../../store/dbStore';
import { Search, Filter, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Calendar, ChevronLeft, ChevronRight, TrendingDown, Settings2, Printer, X, Loader2, History } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { exportToExcel } from '../../lib/utils';
import { formatNumber } from '../../lib/formatNumber';
import { useStaggerEnter } from '../../lib/animations/useStaggerEnter';
import { usePersistentFilters } from '../../lib/hooks/usePersistentFilters';
import EmptyState from '../../components/EmptyState';

export default function MovementsView() {
  const { movements, products, fetchMore, currentWarehouseId } = useDatabaseStore();
  const { filters, setFilters, resetFilters } = usePersistentFilters<{
    searchTerm: string;
    typeFilter: string;
    startDate: string;
    endDate: string;
    currentPage: number;
  }>('movements', { searchTerm: '', typeFilter: 'ALL', startDate: '', endDate: '', currentPage: 1 });
  const { searchTerm, typeFilter, startDate, endDate, currentPage } = filters;
  const setSearchTerm = (v: string) => setFilters({ searchTerm: v });
  const setTypeFilter = (v: string) => setFilters({ typeFilter: v });
  const setStartDate = (v: string) => setFilters({ startDate: v });
  const setEndDate = (v: string) => setFilters({ endDate: v });
  const setCurrentPage = (v: number | ((p: number) => number)) => setFilters(prev => ({ ...prev, currentPage: typeof v === 'function' ? v(prev.currentPage) : v }));
  const itemsPerPage = 15;

  const getProductName = (id: string) => products.find(p => p.id === id)?.name || 'Producto Eliminado';

  const filteredMovements = useMemo(() => {
    // Paso 1: Filtrar movimientos
    const filtered = movements.filter(m => {
      const isSaleMovement = m.reason?.startsWith('Venta #') || m.reason === 'Venta de producto/ingrediente';
      if (isSaleMovement) return false;

      const isInventoryMovement = m.type === 'ENTRADA' || m.type === 'SALIDA' || m.type === 'MERMA' || m.type === 'AJUSTE';
      const matchesSearch = getProductName(m.product_id).toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesType = true;
      if (typeFilter === 'ALL') {
        matchesType = true;
      } else if (typeFilter === 'CONSUMO_DIRECTO') {
        matchesType = m.is_consumo_directo === true;
      } else if (typeFilter === 'GASTO_VARIABLE') {
        matchesType = m.is_gasto_variable === true;
      } else {
        matchesType = m.type === typeFilter;
      }
      
      let matchesDate = true;
      if (startDate) {
        matchesDate = matchesDate && new Date(m.date) >= new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && new Date(m.date) <= end;
      }

      let matchesWarehouse = true;
      if (currentWarehouseId) {
        matchesWarehouse = m.warehouse_id === currentWarehouseId || m.warehouse_id === null || m.warehouse_id === undefined;
      }
      
      return isInventoryMovement && matchesSearch && matchesType && matchesDate && matchesWarehouse;
    });

    // Paso 2: Calcular balance por producto anclando al stock REAL actual del producto
    // (incluye el efecto de ventas, consumos y gastos, aunque esas filas no se muestren).
    const sorted = [...filtered].sort((a, b) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    });

    // Stock actual por producto como fuente de verdad del balance
    const stockByProduct: Record<string, number> = {};
    for (const p of products) {
      stockByProduct[p.id] = Number(p.quantity) || 0;
    }

    // Recorrer TODOS los movimientos cargados del más reciente al más antiguo:
    // el balance de una fila es el stock justo después de ese movimiento.
    const allDesc = [...movements].sort((a, b) => {
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    const runningStock: Record<string, number> = {};
    const balanceByMovementId: Record<string, number> = {};
    for (const m of allDesc) {
      const key = m.product_id;
      if (!(key in runningStock)) {
        runningStock[key] = stockByProduct[key] ?? 0;
      }
      balanceByMovementId[m.id] = Math.max(0, runningStock[key]);
      const delta = m.type === 'ENTRADA' || m.type === 'AJUSTE' ? Number(m.quantity) : -Number(m.quantity);
      runningStock[key] -= delta;
    }

    const withBalance = sorted.map(m => ({ ...m, balance: balanceByMovementId[m.id] ?? 0 }));

    // Paso 3: Revertir para mostrar más reciente primero
    return withBalance.reverse();
  }, [movements, searchTerm, typeFilter, startDate, endDate, products, currentWarehouseId]);

  useEffect(() => {
    setCurrentPage(1);
    setShowLoadMore(true);
  }, [searchTerm, typeFilter, startDate, endDate]);

  // Al montar, cargar más movimientos automáticamente para mostrar un mejor vistazo inicial
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      for (let i = 0; i < 3; i++) {
        if (cancelled) return;
        try { await fetchMore(50); } catch { break; }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [fetchMore]);

  const [loadingMore, setLoadingMore] = useState(false);
  const [showLoadMore, setShowLoadMore] = useState(true);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const previousCount = useDatabaseStore.getState().movements.length;
    await fetchMore(50);
    setLoadingMore(false);
    if (useDatabaseStore.getState().movements.length === previousCount) {
      setShowLoadMore(false);
    }
  };

  const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedMovements = filteredMovements.slice(startIndex, endIndex);

  const movementsTbodyRef = useStaggerEnter<HTMLTableSectionElement>([paginatedMovements.length, currentPage]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Movimientos (Kárdex)</h1>
          <p className="text-sm text-text-secondary">
            Visualización cronológica completa de entradas, salidas y mermas
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const columns = [
              { header: 'Fecha', key: 'date' },
              { header: 'Tipo', key: 'type' },
              { header: 'Producto', key: 'product_name' },
              { header: 'Cantidad', key: 'quantity', format: (v: number) => v?.toFixed(3).replace('.', ',') || '0' },
              { header: 'Unidad', key: 'unit' },
              { header: 'Costo', key: 'cost', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
              { header: 'Razón', key: 'reason' },
            ];
            const data = filteredMovements.map(m => ({
              ...m,
              date: new Date(m.date).toLocaleString('es-ES'),
              product_name: getProductName(m.product_id),
              quantity: Number(m.quantity),
              cost: Number(m.cost) || 0,
            }));
            exportToExcel(columns, data, `movimientos_${new Date().toISOString().split('T')[0]}`);
          }}
          className="gap-2"
        >
          <Printer className="h-4 w-4" />
          Exportar
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input
              placeholder="Buscar por nombre de producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <div className="flex items-center gap-1 sm:gap-2 bg-bg border border-border rounded-xl px-1 sm:px-2">
              <Calendar className="h-4 w-4 text-text-secondary" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 bg-transparent text-sm text-text focus:outline-none"
              />
              <span className="text-text-secondary">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 bg-transparent text-sm text-text focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-text-secondary shrink-0" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-10 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ALL">Todos los tipos</option>
                <option value="ENTRADA">Entradas</option>
                <option value="SALIDA">Salidas</option>
                <option value="MERMA">Mermas</option>
                <option value="AJUSTE">Ajustes de Inventario</option>
                <option value="CONSUMO_DIRECTO">Consumo Directo</option>
                <option value="GASTO_VARIABLE">Gasto Variable</option>
              </select>
            </div>

            {(searchTerm || typeFilter !== 'ALL' || startDate || endDate) && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-secondary hover:text-text hover:border-primary transition-colors"
                title="Limpiar filtros"
              >
                <X className="h-3 w-3" /> Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-text [&_tr]:divide-x [&_tr]:divide-border/50">
            <thead className="border-b border-border bg-bg/50 text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium whitespace-nowrap md:whitespace-normal">Fecha</th>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium text-right">Cantidad</th>
                <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Costo Unitario</th>
                <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Importe</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Motivo</th>
              </tr>
            </thead>
            <tbody ref={movementsTbodyRef} className="divide-y divide-border">
              {paginatedMovements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8">
                    <EmptyState icon={History} title="No hay movimientos" description={movements.length === 0 ? 'Los movimientos aparecerán cuando realices entradas o salidas de inventario.' : 'Ningún movimiento coincide con los filtros aplicados.'} />
                  </td>
                </tr>
              ) : (
                paginatedMovements.map((movement) => {
                  const isEntrada = movement.type === 'ENTRADA';
                  const isSalida = movement.type === 'SALIDA';
                  const isAjuste = movement.type === 'AJUSTE';
                  const isConsumoDirecto = movement.is_consumo_directo === true;
                  const isGastoVariable = movement.is_gasto_variable === true;
                  
                  return (
                    <tr key={movement.id} className="transition-colors hover:bg-surface-hover">
                      <td className="px-4 py-3 text-text-secondary">
                        {new Date(movement.date).toLocaleString('es-ES', { 
                          year: 'numeric', 
                          month: '2-digit', 
                          day: '2-digit', 
                          hour: '2-digit', 
                          minute: '2-digit',
                          hour12: false 
                        })}
                      </td>
                      <td className="px-4 py-3 font-medium">{getProductName(movement.product_id)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                          isEntrada ? 'bg-success/10 text-success' :
                          isConsumoDirecto ? 'bg-amber-500/10 text-amber-600' :
                          isGastoVariable ? 'bg-purple-500/10 text-purple-600' :
                          isAjuste ? 'bg-blue-500/10 text-blue-600' :
                          isSalida ? 'bg-primary/10 text-primary' :
                          'bg-danger/10 text-danger'
                        }`}>
                          {isEntrada ? <ArrowDownToLine className="h-3 w-3" /> : 
                           isConsumoDirecto ? <ArrowUpFromLine className="h-3 w-3" /> :
                           isGastoVariable ? <TrendingDown className="h-3 w-3" /> :
                           isAjuste ? <Settings2 className="h-3 w-3" /> :
                           isSalida ? <ArrowUpFromLine className="h-3 w-3" /> : 
                           <AlertTriangle className="h-3 w-3" />}
                          {isConsumoDirecto ? 'CONSUMO DIRECTO' : 
                           isGastoVariable ? 'GASTO VARIABLE' : 
                           isAjuste ? 'AJUSTE' :
                           movement.type}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-medium ${
                        isEntrada || (isAjuste && Number(movement.quantity) > 0) ? 'text-success' : 'text-danger'
                      }`}>
                        {isEntrada || (isAjuste && Number(movement.quantity) > 0) ? '+' : '-'}{formatNumber(Math.abs(Number(movement.quantity)), 4)} {movement.unit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-text-secondary hidden md:table-cell">
                        ${movement.cost.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-text hidden md:table-cell">
                        ${(Math.abs(movement.quantity) * movement.cost).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-text">
                        {movement.balance} {movement.unit}
                      </td>
                      <td className="px-4 py-3 text-text-secondary truncate max-w-[200px] hidden md:table-cell" title={isConsumoDirecto && movement.note ? movement.note : movement.reason || '-'}>
                        {isConsumoDirecto && movement.note ? movement.note : movement.reason || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between py-4 px-4 border-t border-border">
              <div className="text-sm text-text-secondary">
                Mostrando {startIndex + 1}-{Math.min(endIndex, filteredMovements.length)} de {filteredMovements.length} movimientos
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-text-secondary px-2">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {showLoadMore && (
            <div className="flex justify-center py-4 border-t border-border">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Cargando...
                  </>
                ) : (
                  <>Cargar 50 más ({useDatabaseStore.getState().movements.length} cargados)</>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

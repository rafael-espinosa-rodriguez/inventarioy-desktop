import React, { useMemo } from 'react';
import { useDatabaseStore, type Movement } from '../../store/dbStore';
import { TrendingUp, DollarSign, Package, AlertTriangle, ArrowUpRight, ArrowDownRight, Activity, Download, Search, Calendar, RotateCcw, X } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { exportToExcel, isActive } from '../../lib/utils';
import { formatNumber, formatQuantity } from '../../lib/formatNumber';
import { useStaggerEnter } from '../../lib/animations/useStaggerEnter';
import { useCountUp } from '../../lib/animations/useCountUp';
import { usePersistentFilters } from '../../lib/hooks/usePersistentFilters';

function parseSaleItems(items: any): any[] {
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try {
      return JSON.parse(items);
    } catch {
      return [];
    }
  }
  return [];
}

export default function AnalysisView() {
  const { products, sales, movements, isLoading, currentWarehouseId } = useDatabaseStore();
  
  // Verificar si los datos aún están cargando para evitar errores
  const isDataLoaded = !isLoading && Array.isArray(products);
  
  const activeProducts = useMemo(() => 
    isDataLoaded ? products.filter(isActive) : [],
    [isDataLoaded, products]
  );
  
  // Variables seguras para evitar errores cuando los datos no están cargados
  const safeSales = useMemo(() => Array.isArray(sales) ? sales : [], [sales]);
  const safeMovements = useMemo(() => Array.isArray(movements) ? movements : [], [movements]);
  const cashSales = useMemo(() => safeSales.filter(s => !s.is_account_house), [safeSales]);

  const { filters, setFilters, resetFilters } = usePersistentFilters<{
    auditProduct: string;
    auditDateFrom: string;
    auditDateTo: string;
    turnoverDateFrom: string;
    turnoverDateTo: string;
  }>('analysis', { auditProduct: '', auditDateFrom: '', auditDateTo: '', turnoverDateFrom: '', turnoverDateTo: '' });
  const { auditProduct, auditDateFrom, auditDateTo, turnoverDateFrom, turnoverDateTo } = filters;
  const setAuditProduct = (v: string) => setFilters({ auditProduct: v });
  const setAuditDateFrom = (v: string) => setFilters({ auditDateFrom: v });
  const setAuditDateTo = (v: string) => setFilters({ auditDateTo: v });
  const setTurnoverDateFrom = (v: string) => setFilters({ turnoverDateFrom: v });
  const setTurnoverDateTo = (v: string) => setFilters({ turnoverDateTo: v });

  const today = new Date();
  const setTurnoverHoy = () => {
    const d = today.toISOString().split('T')[0];
    setTurnoverDateFrom(d);
    setTurnoverDateTo(d);
  };
  const setTurnoverAyer = () => {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    const y = d.toISOString().split('T')[0];
    setTurnoverDateFrom(y);
    setTurnoverDateTo(y);
  };
  const setTurnoverUltimos30 = () => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    setTurnoverDateFrom(d.toISOString().split('T')[0]);
    setTurnoverDateTo(today.toISOString().split('T')[0]);
  };
  const setTurnoverEsteMes = () => {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setTurnoverDateFrom(firstDay.toISOString().split('T')[0]);
    setTurnoverDateTo(today.toISOString().split('T')[0]);
  };
  const setTurnoverEsteAno = () => {
    const firstDay = new Date(today.getFullYear(), 0, 1);
    setTurnoverDateFrom(firstDay.toISOString().split('T')[0]);
    setTurnoverDateTo(today.toISOString().split('T')[0]);
  };
  const setHoy = () => {
    const d = today.toISOString().split('T')[0];
    setAuditDateFrom(d);
    setAuditDateTo(d);
  };
  const setAyer = () => {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    const y = d.toISOString().split('T')[0];
    setAuditDateFrom(y);
    setAuditDateTo(y);
  };
  const setUltimos15 = () => {
    const d = new Date(today);
    d.setDate(d.getDate() - 15);
    setAuditDateFrom(d.toISOString().split('T')[0]);
    setAuditDateTo(today.toISOString().split('T')[0]);
  };

  const auditData = useMemo(() => {
    if (!auditProduct || !auditDateFrom || !auditDateTo) return null;
    const product = products.find(p => p.id === auditProduct);
    if (!product) return null;

    const fromDate = new Date(auditDateFrom + 'T00:00:00');
    const toDate = new Date(auditDateTo + 'T23:59:59');

    // Cómo afecta cada movimiento al stock real (mismo criterio que dbStore.fetchAll):
    // ENTRADA/AJUSTE siempre suman; SALIDA/MERMA restan solo si tienen warehouse_id,
    // porque las ventas/consumos desde tránsito (sin warehouse_id) no descontaron el almacén.
    const isSale = (m: Movement) => m.reason?.startsWith('Venta #') || m.reason === 'Venta de producto/ingrediente';
    const isConsumption = (m: Movement) => m.type === 'SALIDA' && (m.is_consumo_directo === true || m.is_gasto_variable === true);
    const delta = (m: Movement) => {
      if (m.type === 'ENTRADA' || m.type === 'AJUSTE') return Number(m.quantity);
      if (m.type === 'SALIDA' || m.type === 'MERMA') return (m as any).warehouse_id ? -Number(m.quantity) : 0;
      return 0;
    };

    // Stock real del período: anclar al stock ACTUAL del producto y restar el efecto
    // de todos los movimientos posteriores al inicio del rango (solo los que tocan el almacén).
    const movementsAfterStart = movements.filter(m => m.product_id === auditProduct && new Date(m.date) > fromDate);
    const stockInicial = Number(product.quantity) - movementsAfterStart.reduce((sum, m) => sum + delta(m), 0);

    const filteredMovements = movements.filter(m => {
      const mDate = new Date(m.date);
      return m.product_id === auditProduct && mDate >= fromDate && mDate <= toDate;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const entradas = filteredMovements
      .filter(m => m.type === 'ENTRADA')
      .reduce((sum, m) => sum + Number(m.quantity), 0);

    const salidas = filteredMovements
      .filter(m => m.type === 'SALIDA' && !isSale(m) && !isConsumption(m) && (m as any).warehouse_id)
      .reduce((sum, m) => sum + Number(m.quantity), 0);

    const ventas = filteredMovements
      .filter(isSale)
      .reduce((sum, m) => sum + Number(m.quantity), 0);

    const consumo = filteredMovements
      .filter(isConsumption)
      .reduce((sum, m) => sum + Number(m.quantity), 0);

    const merma = filteredMovements
      .filter(m => m.type === 'MERMA')
      .reduce((sum, m) => sum + Number(m.quantity), 0);

    const ajustes = filteredMovements
      .filter(m => m.type === 'AJUSTE')
      .reduce((sum, m) => sum + Number(m.quantity), 0);

    // Reconciliación con el inventario real: stock inicial + lo que entra/sale del almacén
    // en el rango (las ventas/consumos desde tránsito no descontaron quantity).
    const stockFinal = stockInicial + entradas - salidas - merma + ajustes;

    // Balance de cada movimiento (stock justo después de él), anclado al stock actual,
    // para la columna "Saldo" de la tabla (mismo recorrido inverso que el Kárdex).
    const balanceByMovementId: Record<string, number> = {};
    const runningStock: Record<string, number> = {};
    const allDesc = [...movements].sort((a, b) => {
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
    for (const m of allDesc) {
      if (m.product_id !== auditProduct) continue;
      if (!(m.product_id in runningStock)) {
        runningStock[m.product_id] = Number(product.quantity);
      }
      balanceByMovementId[m.id] = Math.max(0, runningStock[m.product_id]);
      runningStock[m.product_id] -= delta(m);
    }

    return {
      product,
      entradas,
      salidas,
      ventas,
      consumo,
      merma,
      ajustes,
      stockInicial,
      stockFinal,
      balanceByMovementId,
      movements: filteredMovements,
    };
  }, [auditProduct, auditDateFrom, auditDateTo, movements, products]);

  const handleExportAudit = () => {
    if (!auditData) return;
    const columns = [
      { header: 'Fecha', key: 'date' },
      { header: 'Tipo', key: 'type' },
      { header: 'Cantidad', key: 'quantity' },
      { header: 'Saldo', key: 'balance' },
      { header: 'Razón', key: 'reason' },
    ];
    
    const data = auditData.movements.map(m => ({
      ...m,
      date: new Date(m.date).toLocaleDateString('es-CO'),
      quantity: m.type === 'ENTRADA' ? `+${Number(m.quantity).toFixed(3).replace('.', ',')}` : `-${Number(m.quantity).toFixed(3).replace('.', ',')}`,
      balance: formatNumber(auditData.balanceByMovementId[m.id] ?? 0, 4),
      reason: m.reason || '-',
    }));
    
    exportToExcel(columns, data, `auditoria_${auditData.product.name}_${auditDateFrom}_${auditDateTo}`);
  };

  const totalInventoryValue = useMemo(() => {
    return activeProducts.reduce((sum, p) => sum + (Math.max(0, p.quantity) * p.cost) + (Math.max(0, p.in_transit || 0) * p.cost), 0);
  }, [activeProducts]);

  const totalSalesRevenue = useMemo(() => {
    return cashSales.reduce((sum, s) => sum + (s?.total_amount || 0), 0);
  }, [cashSales]);

  const totalCostOfGoodsSold = useMemo(() => {
    return cashSales.reduce((sum, s) => {
      const items = parseSaleItems(s?.items);
      return sum + items.reduce((itemSum: number, item: any) => itemSum + ((item?.quantity || 0) * (item?.unit_cost || 0)), 0);
    }, 0);
  }, [cashSales]);

  const grossProfit = totalSalesRevenue - totalCostOfGoodsSold;
  const grossMargin = totalSalesRevenue > 0 ? (grossProfit / totalSalesRevenue) * 100 : 0;

  const turnoverData = useMemo(() => {
    if (!turnoverDateFrom || !turnoverDateTo || activeProducts.length === 0) return [];
    
    const fromDate = new Date(turnoverDateFrom + 'T00:00:00');
    const toDate = new Date(turnoverDateTo + 'T23:59:59');
    const daysInPeriod = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Pre-agregar ventas por producto: O(S*I) una sola vez
    const directSalesByProduct = new Map<string, number>();
    const recipeIngredientSalesByProduct = new Map<string, number>();

    safeSales.forEach(s => {
      const sDate = new Date(s.date || s.created_at);
      if (sDate < fromDate || sDate > toDate) return;
      const items = parseSaleItems(s.items);
      items.forEach((item: any) => {
        if (!item.is_recipe) {
          const prev = directSalesByProduct.get(item.product_id) || 0;
          directSalesByProduct.set(item.product_id, prev + (item.quantity || 0));
        }
        if (item.recipe_snapshot?.ingredients) {
          item.recipe_snapshot.ingredients.forEach((ing: any) => {
            const prev = recipeIngredientSalesByProduct.get(ing.product_id) || 0;
            recipeIngredientSalesByProduct.set(ing.product_id, prev + (ing.quantity || 0));
          });
        }
      });
    });

    // Pre-agregar movimientos de consumo/salida por producto: O(M) una sola vez
    const consumoByProduct = new Map<string, number>();
    const salidasByProduct = new Map<string, number>();

    safeMovements.forEach(m => {
      const mDate = new Date(m.date);
      if (mDate < fromDate || mDate > toDate) return;
      if ((m.type as string) === 'CONSUMO_DIRECTO') {
        const prev = consumoByProduct.get(m.product_id) || 0;
        consumoByProduct.set(m.product_id, prev + Number(m.quantity));
      }
      if (m.type === 'SALIDA' && !m.reason?.startsWith('Venta #') && m.reason !== 'Venta de producto/ingrediente') {
        const prev = salidasByProduct.get(m.product_id) || 0;
        salidasByProduct.set(m.product_id, prev + Number(m.quantity));
      }
    });
    
    return activeProducts.map(product => {
      const ventasDirectas = directSalesByProduct.get(product.id) || 0;
      const ventasEnRecetas = recipeIngredientSalesByProduct.get(product.id) || 0;
      const consumoDirecto = consumoByProduct.get(product.id) || 0;
      const salidasTransito = salidasByProduct.get(product.id) || 0;
      
      // Total consumo/salida real
      const totalOutput = ventasDirectas + ventasEnRecetas + consumoDirecto + salidasTransito;
      const currentStock = Number(product.quantity);
      const dailySalesRate = totalOutput > 0 ? totalOutput / daysInPeriod : 0;
      const daysCoverage = dailySalesRate > 0 ? currentStock / dailySalesRate : Infinity;
      const turnoverRate = currentStock > 0 ? totalOutput / currentStock : 0;
      const annualTurnover = daysInPeriod >= 30 ? turnoverRate * (365 / daysInPeriod) : null;
      const cogs = totalOutput * Number(product.cost);
      const suggestedRop = Math.round(dailySalesRate * 7);
      
      let classification: string;
      let classificationColor: string;
      if (!isFinite(daysCoverage) || daysCoverage > 15) {
        classification = 'Exceso';
        classificationColor = 'success';
      } else if (daysCoverage <= 3) {
        classification = 'Crítico';
        classificationColor = 'danger';
      } else {
        classification = 'Normal';
        classificationColor = 'warning';
      }
      
      return {
        product,
        ventasDirectas,
        ventasEnRecetas,
        consumoDirecto,
        totalOutput,
        cogs,
        currentStock,
        dailySalesRate,
        daysCoverage: isFinite(daysCoverage) ? daysCoverage : 999,
        turnoverRate,
        annualTurnover,
        suggestedRop,
        classification,
        classificationColor,
      };
    })
    .filter(d => d.totalOutput > 0 || d.currentStock > 0)
    .sort((a, b) => a.daysCoverage - b.daysCoverage);
  }, [activeProducts, safeSales, safeMovements, turnoverDateFrom, turnoverDateTo]);

  const criticalProductsCount = turnoverData.filter(d => d.classification === 'Crítico').length;

  const analysisStatsRef = useStaggerEnter([totalInventoryValue]);
  const inventoryCountRef = useCountUp(totalInventoryValue, 0.8, 2);
  const revenueCountRef = useCountUp(totalSalesRevenue, 0.8, 2);
  const profitCountRef = useCountUp(grossProfit, 0.8, 2);
  const alertsCountRef = useCountUp(criticalProductsCount, 0.8, 0);
  const auditTbodyRef = useStaggerEnter<HTMLTableSectionElement>([auditData?.movements?.length ?? 0]);
  const turnoverTbodyRef = useStaggerEnter<HTMLTableSectionElement>([turnoverData.length]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Análisis y Rentabilidad</h1>
        <p className="text-sm text-text-secondary">
          Métricas clave del negocio, rotación de inventario y auditoría
        </p>
      </div>

      <div ref={analysisStatsRef} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_-5px_rgba(255,193,7,0.15)]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-secondary">Valor del Inventario</p>
            <div className="rounded-lg bg-primary/10 p-2 text-primary drop-shadow-[0_0_8px_rgba(205,164,52,0.5)]">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold text-text font-mono">$<span ref={inventoryCountRef}>0.00</span></p>
          <p className="mt-1 text-xs text-text-secondary">Capital inmovilizado (incl. tránsito)</p>
        </div>

        <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm transition-all duration-300 hover:border-success/30 hover:shadow-[0_0_20px_-5px_rgba(34,197,94,0.15)]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-secondary">Ingresos por Ventas</p>
            <div className="rounded-lg bg-success/10 p-2 text-success drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold text-text font-mono">$<span ref={revenueCountRef}>0.00</span></p>
          <p className="mt-1 text-xs text-text-secondary">Histórico total</p>
        </div>

        <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_-5px_rgba(205,164,52,0.15)]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-secondary">Ganancia Bruta</p>
            <div className="rounded-lg bg-primary/10 p-2 text-primary drop-shadow-[0_0_8px_rgba(205,164,52,0.5)]">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold text-text font-mono">$<span ref={profitCountRef}>0.00</span></p>
          <div className="mt-1 flex items-center gap-1 text-xs">
            <span className={grossProfit >= 0 ? 'text-success flex items-center' : 'text-danger flex items-center'}>
              {grossProfit >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {grossMargin.toFixed(1)}% margen
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm transition-all duration-300 hover:border-danger/30 hover:shadow-[0_0_20px_-5px_rgba(239,68,68,0.15)]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-secondary">Alertas de Stock</p>
            <div className="rounded-lg bg-danger/10 p-2 text-danger drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold text-text"><span ref={alertsCountRef}>0</span></p>
          <p className="mt-1 text-xs text-text-secondary">Productos críticos (≤3 días)</p>
        </div>
      </div>

      {/* AUDITORÍA DE INVENTARIO */}
      <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_-5px_rgba(205,164,52,0.15)]">
        <div className="mb-6 flex items-center gap-3 border-b border-border/50 pb-4">
          <div className="rounded-lg bg-primary/10 p-2 text-primary drop-shadow-[0_0_8px_rgba(205,164,52,0.5)]">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text">Auditoría de Inventario</h2>
            <p className="text-xs text-text-secondary">Selecciona un producto y rango de fechas para ver el movimiento detallado</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <div className="lg:col-span-2">
            <label className="text-xs font-medium text-text-secondary block mb-1">Producto</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary pointer-events-none" />
              <select
                className="w-full rounded-md border border-border bg-bg pl-9 pr-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                value={auditProduct}
                onChange={e => setAuditProduct(e.target.value)}
              >
                <option value="">-- Seleccionar producto --</option>
                {activeProducts.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Desde</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary pointer-events-none" />
              <Input
                type="date"
                value={auditDateFrom}
                onChange={e => setAuditDateFrom(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Hasta</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary pointer-events-none" />
              <Input
                type="date"
                value={auditDateTo}
                onChange={e => setAuditDateTo(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-3 flex-wrap">
          <Button size="sm" variant="outline" onClick={setHoy}>Hoy</Button>
          <Button size="sm" variant="outline" onClick={setAyer}>Ayer</Button>
          <Button size="sm" variant="outline" onClick={setUltimos15}>Últimos 15 días</Button>
          {(auditProduct || auditDateFrom || auditDateTo) && (
            <Button size="sm" variant="ghost" onClick={resetFilters} className="gap-1.5 text-xs">
              <X className="h-3 w-3" /> Limpiar
            </Button>
          )}
        </div>

        {!auditData && auditProduct && (
          <p className="mt-4 text-sm text-text-secondary text-center py-4">
            Selecciona un rango de fechas para ver la auditoría.
          </p>
        )}

        {auditData && (
          <>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div className="rounded-lg bg-bg/50 border border-border/30 p-3 text-center">
                <p className="text-xs text-text-secondary">Stock Inicial</p>
                <p className="font-mono font-bold text-text mt-1">{formatQuantity(auditData.stockInicial, auditData.product.unit)}</p>
              </div>
              <div className="rounded-lg bg-success/10 border border-success/30 p-3 text-center">
                <p className="text-xs text-success">Entradas</p>
                <p className="font-mono font-bold text-success mt-1">+{formatQuantity(auditData.entradas, auditData.product.unit)}</p>
              </div>
              <div className="rounded-lg bg-danger/10 border border-danger/30 p-3 text-center">
                <p className="text-xs text-danger">Salidas</p>
                <p className="font-mono font-bold text-danger mt-1">-{formatQuantity(auditData.salidas, auditData.product.unit)}</p>
              </div>
              {auditData.ventas > 0 && (
                <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 text-center">
                  <p className="text-xs text-primary">Ventas</p>
                  <p className="font-mono font-bold text-primary mt-1">-{formatQuantity(auditData.ventas, auditData.product.unit)}</p>
                </div>
              )}
              {auditData.consumo > 0 && (
                <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-center">
                  <p className="text-xs text-warning">Consumo / Gasto</p>
                  <p className="font-mono font-bold text-warning mt-1">-{formatQuantity(auditData.consumo, auditData.product.unit)}</p>
                </div>
              )}
              {auditData.merma > 0 && (
                <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-center">
                  <p className="text-xs text-warning">Merma</p>
                  <p className="font-mono font-bold text-warning mt-1">-{formatQuantity(auditData.merma, auditData.product.unit)}</p>
                </div>
              )}
              {auditData.ajustes !== 0 && (
                <div className="rounded-lg bg-bg/50 border border-border/30 p-3 text-center">
                  <p className="text-xs text-text-secondary">Ajustes</p>
                  <p className="font-mono font-bold text-text mt-1">{auditData.ajustes > 0 ? `+${formatQuantity(auditData.ajustes, auditData.product.unit)}` : formatQuantity(auditData.ajustes, auditData.product.unit)}</p>
                </div>
              )}
              <div className={`rounded-lg border p-3 text-center ${auditData.stockFinal >= 0 ? 'bg-primary/10 border-primary/30' : 'bg-danger/10 border-danger/30'}`}>
                <p className="text-xs text-text-secondary">Stock Final</p>
                <p className={`font-mono font-bold mt-1 ${auditData.stockFinal >= 0 ? 'text-primary' : 'text-danger'}`}>
                  {formatQuantity(auditData.stockFinal, auditData.product.unit)}
                </p>
              </div>
            </div>

            {auditData.movements.length === 0 && (
              <p className="mt-4 text-sm text-text-secondary text-center py-4">
                No hay movimientos en este período para este producto.
              </p>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm text-text [&_tr]:divide-x [&_tr]:divide-border/50">
                <thead className="border-b border-border bg-bg/50 text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium text-right">Cantidad</th>
                    <th className="px-4 py-3 font-medium text-right">Saldo</th>
                    <th className="px-4 py-3 font-medium">Razón</th>
                  </tr>
                </thead>
                <tbody ref={auditTbodyRef} className="divide-y divide-border">
                  {auditData.movements.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">
                        Sin movimientos en este período.
                      </td>
                    </tr>
                  ) : (
                    auditData.movements.map(m => (
                      <tr key={m.id} className="transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-3">{new Date(m.date).toLocaleDateString('es-CO', {
                          year: 'numeric', month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit'
                        })}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            m.type === 'ENTRADA' ? 'bg-success/20 text-success' :
                            m.type === 'SALIDA' ? 'bg-danger/20 text-danger' :
                            'bg-warning/20 text-warning'
                          }`}>{m.type}</span>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-medium ${
                          m.type === 'ENTRADA' ? 'text-success' : 'text-danger'
                        }`}>
                          {m.type === 'ENTRADA' ? '+' : '-'}{formatNumber(Number(m.quantity), 4)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-text-secondary">
                          {formatNumber(auditData.balanceByMovementId[m.id] ?? 0, 4)}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{m.reason || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <Button size="sm" variant="outline" className="gap-2" onClick={handleExportAudit}>
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_-5px_rgba(205,164,52,0.15)]">
        <div className="mb-6 flex items-center gap-3 border-b border-border/50 pb-4">
          <div className="rounded-lg bg-primary/10 p-2 text-primary drop-shadow-[0_0_8px_rgba(205,164,52,0.5)]">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text">Rotación de Inventario</h2>
            <p className="text-xs text-text-secondary">Análisis de velocidad de venta y cobertura de stock</p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs font-medium text-text-secondary block mb-1">Desde</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary pointer-events-none" />
              <Input
                type="date"
                value={turnoverDateFrom}
                onChange={e => setTurnoverDateFrom(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs font-medium text-text-secondary block mb-1">Hasta</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary pointer-events-none" />
              <Input
                type="date"
                value={turnoverDateTo}
                onChange={e => setTurnoverDateTo(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex gap-1 flex-wrap">
            <Button size="sm" variant="outline" onClick={setTurnoverHoy}>Hoy</Button>
            <Button size="sm" variant="outline" onClick={setTurnoverAyer}>Ayer</Button>
            <Button size="sm" variant="outline" onClick={setTurnoverUltimos30}>30D</Button>
            <Button size="sm" variant="outline" onClick={setTurnoverEsteMes}>Mes</Button>
            <Button size="sm" variant="outline" onClick={setTurnoverEsteAno}>Año</Button>
          </div>
        </div>

        {(!turnoverDateFrom || !turnoverDateTo) && (
          <p className="text-sm text-text-secondary text-center py-8">
            Selecciona un rango de fechas para ver el análisis de rotación.
          </p>
        )}

        {turnoverDateFrom && turnoverDateTo && (
          <>
            <div className="mb-4 flex gap-4 text-xs">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger"></span> Crítico: ≤3 días</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning"></span> Normal: 4-15 días</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success"></span> Exceso: &gt;15 días</span>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[50vh] sm:max-h-[400px]">
              <table className="w-full text-left text-sm text-text [&_tr]:divide-x [&_tr]:divide-border/50">
                <thead className="sticky top-0 z-10 border-b border-border bg-bg/95 text-xs uppercase text-text-secondary shadow-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">
                      <div>Producto</div>
                      <div className="text-[10px] normal-case font-normal text-text-secondary/70">Nombre y categoría</div>
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      <div>Consumido</div>
                      <div className="text-[10px] normal-case font-normal text-text-secondary/70">Ventas + Recetas + Consumo</div>
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      <div>Stock</div>
                      <div className="text-[10px] normal-case font-normal text-text-secondary/70">Cantidad actual</div>
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      <div>Cobertura</div>
                      <div className="text-[10px] normal-case font-normal text-text-secondary/70">Días que durará el stock</div>
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      <div>Rot. Anual</div>
                      <div className="text-[10px] normal-case font-normal text-text-secondary/70">Veces que renueva/año</div>
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      <div>ROP Sug.</div>
                      <div className="text-[10px] normal-case font-normal text-text-secondary/70">Punto de reorden ×7 días</div>
                    </th>
                    <th className="px-4 py-3 font-medium">
                      <div>Estado</div>
                      <div className="text-[10px] normal-case font-normal text-text-secondary/70">Crítico/Normal/Exceso</div>
                    </th>
                  </tr>
                </thead>
                <tbody ref={turnoverTbodyRef} className="divide-y divide-border">
                  {turnoverData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-text-secondary">
                        No hay datos de ventas en el período seleccionado.
                      </td>
                    </tr>
                  ) : (
                    turnoverData.map((item) => (
                      <tr key={item.product.id} className={`transition-colors hover:bg-surface-hover ${
                        item.classification === 'Crítico' ? 'bg-danger/5' : 
                        item.classification === 'Exceso' ? 'bg-success/5' : ''
                      }`}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.product.name}</div>
                          <div className="text-xs text-text-secondary">{item.product.category}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono" title={`Ventas Directas: ${formatQuantity(item.ventasDirectas, item.product.unit)} | Recetas: ${formatQuantity(item.ventasEnRecetas, item.product.unit)} | Consumo Directo: ${formatQuantity(item.consumoDirecto, item.product.unit)} | Salidas Tránsito: ${formatQuantity(item.totalOutput - item.ventasDirectas - item.ventasEnRecetas - item.consumoDirecto, item.product.unit)}`}>{formatQuantity(item.totalOutput, item.product.unit)}</td>
                        <td className="px-4 py-3 text-right font-mono">{formatQuantity(item.currentStock, item.product.unit)} {item.product.unit}</td>
                        <td className={`px-4 py-3 text-right font-mono font-medium ${
                          item.classification === 'Crítico' ? 'text-danger' :
                          item.classification === 'Exceso' ? 'text-success' : 'text-warning'
                        }`}>
                          {item.daysCoverage > 999 ? '∞' : item.daysCoverage.toFixed(1)} días
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{item.annualTurnover !== null ? `${item.annualTurnover.toFixed(1)}x` : '—'}</td>
                        <td className="px-4 py-3 text-right font-mono">{item.suggestedRop}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            item.classificationColor === 'danger' ? 'bg-danger/20 text-danger' :
                            item.classificationColor === 'success' ? 'bg-success/20 text-success' :
                            'bg-warning/20 text-warning'
                          }`}>
                            {item.classification}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {criticalProductsCount > 0 && (
              <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-4">
                <div className="flex items-center gap-2 text-danger font-medium text-sm mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  Productos críticos requieren atención inmediata
                </div>
                <p className="text-xs text-text-secondary">
                  {criticalProductsCount} producto(s) con cobertura ≤3 días. Considera reabastecerlos pronto.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

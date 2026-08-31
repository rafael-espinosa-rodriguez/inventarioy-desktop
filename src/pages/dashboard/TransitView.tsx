import React, { useState, useMemo, useEffect } from 'react';
import { useDatabaseStore } from '../../store/dbStore';
import { useAuthStore } from '../../store/authStore';
import { Package, Search, Plus, Check, Loader2, AlertCircle, ArrowRight, ArrowLeft, Box, ChevronLeft, ChevronRight, TrendingDown, RefreshCw, Clock, AlertTriangle, RotateCcw, X, ChevronDown } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { NumberInput } from '../../components/ui/NumberInput';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
  convertUnit,
  getCompatibleUnits,
  getLastUsedUnit,
  saveLastUsedUnit,
  normalizeUnit,
  UnitAbbrev,
  UNIT_LABELS,
} from '../../lib/unitConversion';
import { validateNumber } from '../../lib/utils';
import { formatQuantity } from '../../lib/formatNumber';
import { useStaggerEnter } from '../../lib/animations/useStaggerEnter';
import { useCountUp } from '../../lib/animations/useCountUp';
import { usePersistentFilters } from '../../lib/hooks/usePersistentFilters';
import TransitActionModal from '../../components/TransitActionModal';

export default function TransitView() {
  const { transitItems, products, cancelTransit, registerWasteFromTransit, registerManualConsumption, logAction, currentWarehouseId } = useDatabaseStore();
  const { filters, setFilters, resetFilters } = usePersistentFilters<{ searchTerm: string; currentPage: number }>(
    'transit',
    { searchTerm: '', currentPage: 1 }
  );
  const { searchTerm, currentPage } = filters;
  const setSearchTerm = (v: string) => setFilters({ searchTerm: v });
  const setCurrentPage = (v: number | ((p: number) => number)) => setFilters(prev => ({ ...prev, currentPage: typeof v === 'function' ? v(prev.currentPage) : v }));
  const [cancelModal, setCancelModal] = useState<{
    item: any;
    quantity: number;
    reason: string;
    unit: UnitAbbrev;
  } | null>(null);
  const [wasteModal, setWasteModal] = useState<{
    item: any;
    quantity: number;
    reason: string;
    unit: UnitAbbrev;
  } | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isWasting, setIsWasting] = useState(false);
  const [consumptionModal, setConsumptionModal] = useState<{
    item: any;
    quantity: number;
    unit: UnitAbbrev;
    note: string;
  } | null>(null);
  const [isConsuming, setIsConsuming] = useState(false);

  const getProduct = (id: string) => products.find(p => p.id === id);

  const handleCancel = async () => {
    if (!cancelModal || !cancelModal.reason.trim()) {
      toast.error('Ingresa un motivo para la devolución');
      return;
    }
    
    const quantityValidation = validateNumber(String(cancelModal.quantity), { required: true, min: 0.0001, fieldName: 'Cantidad' });
    if (!quantityValidation.isValid) {
      toast.error(quantityValidation.error);
      return;
    }
    
    const product = getProduct(cancelModal.item.product_id);
    if (!product) {
      toast.error('Producto no encontrado');
      return;
    }
    
    const baseUnit = product ? normalizeUnit(product.unit) : 'u';
    const quantityInBase = convertUnit(cancelModal.quantity, cancelModal.unit, baseUnit);
    
    if (quantityInBase > cancelModal.item.remaining) {
      toast.error(`La cantidad excede el disponible (${cancelModal.item.remaining} ${baseUnit})`);
      return;
    }
    
    setIsCancelling(true);
    const result = await cancelTransit(cancelModal.item.id, quantityInBase, cancelModal.reason);
    setIsCancelling(false);
    if (result.success) {
      toast.success('Producto devuelto al stock exitosamente');
      if (navigator.onLine) {
        try {
          await useDatabaseStore.getState().logAction('transit', 'DEVOLUCION', {
            product_name: cancelModal.item.product_name,
            quantity: quantityInBase,
            reason: cancelModal.reason
          });
        } catch (logErr) {
          if (import.meta.env.DEV) console.warn('[logAction] Error (offline?):', logErr);
        }
      }
      setCancelModal(null);
    } else {
      toast.error(result.error || 'Error al devolver el producto');
    }
  };

const handleWaste = async () => {
    if (!wasteModal || !wasteModal.reason.trim()) {
      toast.error('Ingresa un motivo para la merma');
      return;
    }
    
    const quantityValidation = validateNumber(String(wasteModal.quantity), { required: true, min: 0.0001, fieldName: 'Cantidad' });
    if (!quantityValidation.isValid) {
      toast.error(quantityValidation.error);
      return;
    }
    
    const product = getProduct(wasteModal.item.product_id);
    if (!product) {
      toast.error('Producto no encontrado');
      return;
    }
    
    const baseUnit = product ? normalizeUnit(product.unit) : 'u';
    const quantityInBase = convertUnit(wasteModal.quantity, wasteModal.unit, baseUnit);
    
    if (quantityInBase > wasteModal.item.remaining) {
      toast.error(`La cantidad excede el disponible (${wasteModal.item.remaining} ${baseUnit})`);
      return;
    }
    
    setIsWasting(true);
    const result = await registerWasteFromTransit(wasteModal.item.id, quantityInBase, wasteModal.reason);
    setIsWasting(false);
    if (result.success) {
      toast.success('Merma registrada exitosamente');
      if (navigator.onLine) {
        try {
          await useDatabaseStore.getState().logAction('transit', 'WASTE', {
            product_name: wasteModal.item.product_name,
            quantity: quantityInBase,
            reason: wasteModal.reason
          });
        } catch (logErr) {
          if (import.meta.env.DEV) console.warn('[logAction] Error (offline?):', logErr);
        }
      }
      setWasteModal(null);
    } else {
      toast.error(result.error || 'Error al registrar la merma');
    }
  };

  const handleConsumption = async () => {
    if (!consumptionModal) {
      return;
    }
    
    const quantityValidation = validateNumber(String(consumptionModal.quantity), { required: true, min: 0.0001, fieldName: 'Cantidad' });
    if (!quantityValidation.isValid) {
      toast.error(quantityValidation.error);
      return;
    }
    
    const product = getProduct(consumptionModal.item.product_id);
    if (product?.is_consumo_directo && !consumptionModal.note.trim()) {
      toast.error('La nota es obligatoria para productos de Consumo Directo');
      return;
    }
    
    setIsConsuming(true);
    const result = await registerManualConsumption(consumptionModal.item.id, consumptionModal.quantity, consumptionModal.note);
    setIsConsuming(false);
    if (result.success) {
      toast.success('Consumo registrado exitosamente');
      if (navigator.onLine) {
        try {
          await useDatabaseStore.getState().logAction('transit', 'CONSUMO_MANUAL', {
            product_name: consumptionModal.item.product_name,
            quantity: consumptionModal.quantity,
          });
        } catch (logErr) {
          if (import.meta.env.DEV) console.warn('[logAction] Error (offline?):', logErr);
        }
      }
      setConsumptionModal(null);
    } else {
      toast.error(result.error || 'Error al registrar el consumo');
    }
  };

  const filteredTransit = transitItems.filter(t => {
    const product = getProduct(t.product_id);
    if (!product) return false;
    return product.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const groupedByProduct = filteredTransit.reduce((acc, item) => {
    const product = getProduct(item.product_id);
    if (!product) return acc;
    if (!acc[item.product_id]) {
      acc[item.product_id] = {
        product,
        items: [],
        totalQuantity: 0,
        totalConsumed: 0,
        totalRemaining: 0,
        oldestDate: item.sent_date,
      };
    }
    acc[item.product_id].items.push(item);
    acc[item.product_id].totalQuantity += item.quantity;
    acc[item.product_id].totalConsumed += item.consumed;
    acc[item.product_id].totalRemaining += item.remaining;
    if (new Date(item.sent_date) < new Date(acc[item.product_id].oldestDate)) {
      acc[item.product_id].oldestDate = item.sent_date;
    }
    return acc;
  }, {} as Record<string, { product: any; items: any[]; totalQuantity: number; totalConsumed: number; totalRemaining: number; oldestDate: string }>);

  const groupedArray = Object.values(groupedByProduct).sort(
    (a, b) => new Date(b.oldestDate).getTime() - new Date(a.oldestDate).getTime()
  );

  const itemsPerPage = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.ceil(groupedArray.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedGroups = groupedArray.slice(startIndex, endIndex);

  const totalInTransit = transitItems.reduce((sum, t) => sum + t.remaining, 0);
  const totalSent = transitItems.reduce((sum, t) => sum + t.quantity, 0);
  const totalConsumed = transitItems.reduce((sum, t) => sum + t.consumed, 0);
  const pendingProducts = Object.keys(groupedByProduct).length;

  const transitStatsRef = useStaggerEnter([totalInTransit]);
  const inTransitCountRef = useCountUp(totalInTransit, 0.8, 3);
  const consumedCountRef = useCountUp(totalConsumed, 0.8, 3);
  const sentCountRef = useCountUp(totalSent, 0.8, 3);
  const productsCountRef = useCountUp(pendingProducts, 0.8, 0);

  const getAntiquityColor = (sentDate: string) => {
    const days = (Date.now() - new Date(sentDate).getTime()) / (1000 * 60 * 60 * 24);
    if (days < 1) return { bg: 'bg-success/10', text: 'text-success', label: 'Hoy' };
    if (days < 3) return { bg: 'bg-warning/10', text: 'text-warning', label: `${Math.floor(days)} dia(s)` };
    return { bg: 'bg-danger/10', text: 'text-danger', label: `${Math.floor(days)} dia(s)` };
  };

  const getProgressColor = (consumed: number, total: number) => {
    const pct = total > 0 ? consumed / total : 0;
    if (pct >= 0.9) return 'bg-success';
    if (pct >= 0.5) return 'bg-primary';
    return 'bg-warning';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Tránsito de Productos</h1>
        <p className="text-sm text-text-secondary">
          Productos enviados a producción que aún no han sido consumidos en ventas
        </p>
      </div>

      <div ref={transitStatsRef} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text"><span ref={inTransitCountRef}>0.000</span></p>
              <p className="text-xs text-text-secondary">En Transito</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <TrendingDown className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text"><span ref={consumedCountRef}>0.000</span></p>
              <p className="text-xs text-text-secondary">Consumido</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <RefreshCw className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text"><span ref={sentCountRef}>0.000</span></p>
              <p className="text-xs text-text-secondary">Total Enviado</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-danger/10">
              <Clock className="h-5 w-5 text-danger" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text"><span ref={productsCountRef}>0</span></p>
              <p className="text-xs text-text-secondary">Productos</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <label htmlFor="transit-search" className="sr-only">Buscar por producto</label>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input
              id="transit-search"
              placeholder="Buscar por producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <span className="text-sm text-text-secondary">
            {groupedArray.length} producto{groupedArray.length !== 1 ? 's' : ''} en transito
          </span>
          {(searchTerm || currentPage > 1) && (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-secondary hover:text-text hover:border-primary transition-colors"
              title="Limpiar filtros"
            >
              <X className="h-3 w-3" /> Limpiar
            </button>
          )}
        </div>

        {groupedArray.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-hover">
              <Package className="h-8 w-8 text-text-secondary" />
            </div>
            <p className="text-lg font-medium text-text">No hay productos en tránsito</p>
            <p className="mt-1 text-sm text-text-secondary">
              Los productos apareceran aqui cuando realices una salida de inventario hacia produccion.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groupedArray.map((group) => {
              const pct = group.totalQuantity > 0 ? (group.totalConsumed / group.totalQuantity) * 100 : 0;
              const antiquity = getAntiquityColor(group.oldestDate);

              return (
                <div
                  key={group.product.id}
                  className="rounded-xl border border-border bg-bg p-4 transition-colors hover:border-primary/30"
                >
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-text truncate">{group.product.name}</h3>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${antiquity.bg} ${antiquity.text}`}>
                          <Clock className="h-3 w-3" />
                          {antiquity.label}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary">
                        {group.items.length} lote{group.items.length !== 1 ? 's' : ''} · Enviado: {new Date(group.oldestDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-primary">{formatQuantity(group.totalRemaining, group.product.unit)} <span className="text-xs font-normal">{group.product.unit}</span></p>
                      <p className="text-xs text-text-secondary">Restante</p>
                    </div>
                  </div>

                  <div className="mb-2">
                    <div className="mb-1 flex justify-between text-xs text-text-secondary">
                      <span>Consumo: {formatQuantity(group.totalConsumed, group.product.unit)} / {formatQuantity(group.totalQuantity, group.product.unit)} {group.product.unit}</span>
                      <span>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-hover">
                      <div
                        className={`h-full rounded-full transition-all ${getProgressColor(group.totalConsumed, group.totalQuantity)}`}
                        style={{ width: `${Math.max(pct, 5)}%` }}
                      />
                    </div>
                  </div>

                  {group.items.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-text-secondary hover:text-primary">
                        Ver detalle de {group.items.length} lote{group.items.length !== 1 ? 's' : ''}
                      </summary>
                      <div className="mt-2 space-y-2 rounded-lg bg-surface p-3">
                        {group.items.map((item) => {
                          const itemPct = item.quantity > 0 ? (item.consumed / item.quantity) * 100 : 0;
                          const itemAntiquity = getAntiquityColor(item.sent_date);
                          const baseUnit = group.product.unit;
                          return (
                            <div key={item.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${itemAntiquity.bg} ${itemAntiquity.text}`}>
                                  <Clock className="h-2.5 w-2.5" />
                                  {new Date(item.sent_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                </span>
                                <span className="text-text-secondary truncate">{item.reason || 'En produccion'}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 flex-wrap">
                                <div className="w-20 h-1.5 overflow-hidden rounded-full bg-surface-hover">
                                  <div
                                    className={`h-full rounded-full ${getProgressColor(item.consumed, item.quantity)}`}
                                    style={{ width: `${Math.max(itemPct, 5)}%` }}
                                  />
                                </div>
                                <div className="flex items-center gap-2 font-mono text-xs">
                                  <span title="Consumido: cantidad ya utilizada del lote" className="inline-flex items-center gap-1 rounded-md bg-success/10 px-1.5 py-0.5">
                                    <span className="text-text-secondary">C</span>
                                    <span className="text-success font-semibold">{formatQuantity(item.consumed, baseUnit)}</span>
                                  </span>
                                  <span className="text-text-secondary">/</span>
                                  <span title="Enviado: cantidad total despachada al lote" className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5">
                                    <span className="text-text-secondary">E</span>
                                    <span className="text-primary font-semibold">{formatQuantity(item.quantity, baseUnit)}</span>
                                  </span>
                                  <span className="text-text-secondary">/</span>
                                  <span title="Restante: cantidad aún disponible para consumir o devolver" className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-1.5 py-0.5">
                                    <span className="text-text-secondary">R</span>
                                    <span className="text-warning font-semibold">{formatQuantity(item.remaining, baseUnit)}</span>
                                  </span>
                                  <span className="text-text-secondary ml-1">{baseUnit}</span>
                                </div>
                                {item.remaining > 0 && (
                                  <div className="flex items-center gap-1">
                                    {getProduct(item.product_id)?.is_consumo_directo && (
                                      <button
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const product = getProduct(item.product_id);
                                          const baseUnit = product ? normalizeUnit(product.unit) : 'u';
                                          const compatibleUnits = getCompatibleUnits(baseUnit);
                                          const savedUnit = getLastUsedUnit(item.product_id);
                                          const defaultUnit = savedUnit && compatibleUnits.includes(savedUnit) ? savedUnit : baseUnit;
                                          setConsumptionModal({ item, quantity: item.remaining, unit: defaultUnit, note: '' });
                                        }}
                                        className="flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-success hover:bg-success/10 transition-colors shrink-0"
                                        title="Registrar consumo manual"
                                      >
                                        <TrendingDown className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    {getProduct(item.product_id)?.is_gasto_variable && (
                                      <button
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const product = getProduct(item.product_id);
                                          const baseUnit = product ? normalizeUnit(product.unit) : 'u';
                                          const compatibleUnits = getCompatibleUnits(baseUnit);
                                          const savedUnit = getLastUsedUnit(item.product_id);
                                          const defaultUnit = savedUnit && compatibleUnits.includes(savedUnit) ? savedUnit : baseUnit;
                                          setConsumptionModal({ item, quantity: item.remaining, unit: defaultUnit, note: '' });
                                        }}
                                        className="flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-purple-600 hover:bg-purple-500/10 transition-colors shrink-0"
                                        title="Registrar gasto variable"
                                      >
                                        <TrendingDown className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const product = getProduct(item.product_id);
                                        const baseUnit = product ? normalizeUnit(product.unit) : 'u';
                                        const compatibleUnits = getCompatibleUnits(baseUnit);
                                        const savedUnit = getLastUsedUnit(item.product_id);
                                        const defaultUnit = savedUnit && compatibleUnits.includes(savedUnit) ? savedUnit : baseUnit;
                                        setWasteModal({ item, quantity: item.remaining, reason: '', unit: defaultUnit });
                                      }}
                                      className="flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-warning hover:bg-warning/10 transition-colors shrink-0"
                                      title="Registrar merma"
                                    >
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const product = getProduct(item.product_id);
                                        const baseUnit = product ? normalizeUnit(product.unit) : 'u';
                                        const compatibleUnits = getCompatibleUnits(baseUnit);
                                        const savedUnit = getLastUsedUnit(item.product_id);
                                        const defaultUnit = savedUnit && compatibleUnits.includes(savedUnit) ? savedUnit : baseUnit;
                                        setCancelModal({ item, quantity: item.remaining, reason: '', unit: defaultUnit });
                                      }}
                                      className="flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                                      title="Devolver cantidad al stock"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}

          {totalPages > 1 && (
            <div className="flex items-center justify-between py-4 px-4 border-t border-border mt-4">
              <div className="text-sm text-text-secondary">
                Mostrando {startIndex + 1}-{Math.min(endIndex, groupedArray.length)} de {groupedArray.length} productos
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
          </div>
          )}
      </div>

      {cancelModal && getProduct(cancelModal.item.product_id) && (
        <TransitActionModal
          type="cancel"
          item={cancelModal.item}
          productName={getProduct(cancelModal.item.product_id)?.name || ''}
          productUnit={getProduct(cancelModal.item.product_id)?.unit || 'u'}
          quantity={cancelModal.quantity}
          unit={cancelModal.unit}
          reason={cancelModal.reason}
          isProcessing={isCancelling}
          icon={<RotateCcw className="h-5 w-5 text-danger" />}
          title="Devolver al Stock"
          iconBgColor="bg-danger/10"
          onQuantityChange={(v) => setCancelModal(prev => prev ? { ...prev, quantity: v } : prev)}
          onUnitChange={(u) => setCancelModal(prev => prev ? { ...prev, unit: u } : prev)}
          onReasonChange={(r) => setCancelModal(prev => prev ? { ...prev, reason: r } : prev)}
          onConfirm={handleCancel}
          onCancel={() => setCancelModal(null)}
          confirmLabel="Devolver"
          reasonPlaceholder="Ej: Producto en mal estado, cancelación de producción..."
        />
      )}

      {wasteModal && getProduct(wasteModal.item.product_id) && (
        <TransitActionModal
          type="waste"
          item={wasteModal.item}
          productName={getProduct(wasteModal.item.product_id)?.name || ''}
          productUnit={getProduct(wasteModal.item.product_id)?.unit || 'u'}
          quantity={wasteModal.quantity}
          unit={wasteModal.unit}
          reason={wasteModal.reason}
          isProcessing={isWasting}
          icon={<AlertTriangle className="h-5 w-5 text-warning" />}
          title="Registrar Merma"
          iconBgColor="bg-warning/10"
          onQuantityChange={(v) => setWasteModal(prev => prev ? { ...prev, quantity: v } : prev)}
          onUnitChange={(u) => setWasteModal(prev => prev ? { ...prev, unit: u } : prev)}
          onReasonChange={(r) => setWasteModal(prev => prev ? { ...prev, reason: r } : prev)}
          onConfirm={handleWaste}
          onCancel={() => setWasteModal(null)}
          confirmLabel="Registrar Merma"
          reasonPlaceholder="Ej: Producto vencido, derrame..."
        />
      )}

      {consumptionModal && getProduct(consumptionModal.item.product_id) && (
        <TransitActionModal
          type="consumption"
          item={consumptionModal.item}
          productName={getProduct(consumptionModal.item.product_id)?.name || ''}
          productUnit={getProduct(consumptionModal.item.product_id)?.unit || 'u'}
          quantity={consumptionModal.quantity}
          unit={consumptionModal.unit}
          reason={consumptionModal.note}
          isProcessing={isConsuming}
          icon={<TrendingDown className="h-5 w-5 text-success" />}
          title="Consumo Manual"
          iconBgColor="bg-success/10"
          onQuantityChange={(v) => setConsumptionModal(prev => prev ? { ...prev, quantity: v } : prev)}
          onUnitChange={(u) => setConsumptionModal(prev => prev ? { ...prev, unit: u } : prev)}
          onReasonChange={(r) => setConsumptionModal(prev => prev ? { ...prev, note: r } : prev)}
          onConfirm={handleConsumption}
          onCancel={() => setConsumptionModal(null)}
          confirmLabel="Registrar Consumo"
          reasonPlaceholder="Ej: Consumo directo para preparación..."
          reasonRequired={false}
        />
      )}
    </div>
  );
}

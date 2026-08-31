import { useState, useMemo, useRef } from 'react';
import { Search, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Trash2, Filter, Pencil, X, Settings2, Scale, Printer, ChevronLeft, ChevronRight, Package } from 'lucide-react';
import { useDatabaseStore } from '../../store/dbStore';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { validateNumber, exportToExcel, isActive } from '../../lib/utils';
import { normalizeUnit, getCompatibleUnits, convertUnit, type UnitAbbrev } from '../../lib/unitConversion';
import { formatNumber } from '../../lib/formatNumber';
import { useStaggerEnter } from '../../lib/animations/useStaggerEnter';
import { usePersistentFilters } from '../../lib/hooks/usePersistentFilters';
import EmptyState from '../../components/EmptyState';
import SortIcon from '../../components/ui/SortIcon';
import { TableSkeleton } from '../../components/Skeleton';

export default function StockView() {
  // Helper to get stock per warehouse
  /**
   * Calcula el stock disponible para un producto en un almacén específico.
   *
   * FÓRMULA (matemáticamente correcta, NO cambiar):
   *   physicalStock = product_warehouse.quantity
   *
   * INTERPRETACIÓN:
   *   - "Disponible" = stock que NUNCA salió del almacén (suma de entradas netas en almacén)
   *   - "En Tránsito" = stock que ya salió del almacén
   *   - Suma(Disponible + Tránsito) = total registrado (suma de todas las entradas)
   *
   * EJEMPLO:
   *   Si entradas = 60 + 30 = 90, y hay SALIDA de 12 sin venta:
   *     - Disponible = 78 (90 - 12 que salieron)
   *     - Tránsito = 12 (las que salieron)
   *     - Suma = 90 (total registrado) ✅
   *   Si luego se vende esas 12 desde tránsito:
   *     - Disponible = 78 (no cambia, la salida original ya lo había descontado)
   *     - Tránsito = 0
   *     - Suma = 78 (90 entradas - 12 vendidas)
   *
   * NOTA: Este modelo representa el stock histórico registrado. La venta
   *       desde tránsito NO decrementa el almacén porque la salida original
   *       ya lo hizo.
   */
  const getStockForWarehouse = (productId: string) => {
    if (!currentWarehouseId || productWarehouse.length === 0) {
      return null;
    }
    const pw = productWarehouse.find(p => p.product_id === productId && p.warehouse_id === currentWarehouseId);
    const computedInTransit = transitItems
      .filter(t => t.product_id === productId && t.warehouse_id === currentWarehouseId)
      .reduce((sum, t) => sum + t.remaining, 0);
    return pw ? { quantity: pw.quantity, in_transit: computedInTransit } : null;
  };

  const { filters, setFilters, resetFilters } = usePersistentFilters<{
    searchTerm: string;
    categoryFilter: string;
    statusFilter: string;
    typeFilter: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    currentPage: number;
  }>('stock', { searchTerm: '', categoryFilter: 'ALL', statusFilter: 'ALL', typeFilter: 'ALL', sortBy: 'name', sortOrder: 'asc', currentPage: 1 });
  const { searchTerm, categoryFilter, statusFilter, typeFilter, sortBy, sortOrder, currentPage } = filters;
  const setSearchTerm = (v: string) => setFilters({ searchTerm: v });
  const setCategoryFilter = (v: string) => setFilters({ categoryFilter: v });
  const setStatusFilter = (v: string) => setFilters({ statusFilter: v });
  const setTypeFilter = (v: string) => setFilters({ typeFilter: v });
  const setSortBy = (v: string) => setFilters({ sortBy: v });
  const setSortOrder = (v: 'asc' | 'desc') => setFilters({ sortOrder: v });
  const setCurrentPage = (v: number | ((p: number) => number)) => setFilters(prev => ({ ...prev, currentPage: typeof v === 'function' ? v(prev.currentPage) : v }));
  const [productToDelete, setProductToDelete] = useState<{id: string, name: string} | null>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editParams, setEditParams] = useState({
    rop: 0,
    price: 0,
  });
  const [ropAutoDetail, setRopAutoDetail] = useState<{dailyAvg: number; suggested: number} | null>(null);
  
  const [adjustmentModal, setAdjustmentModal] = useState<{
    product: any;
    physicalStock: number;
    unit: string;
    date: string;
  } | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  const products = useDatabaseStore((state) => state.products);
  const isLoading = useDatabaseStore((state) => state.isLoading);
  const movements = useDatabaseStore((state) => state.movements);
  const transitItems = useDatabaseStore((state) => state.transitItems);
  const deleteProduct = useDatabaseStore((state) => state.deleteProduct);
  const updateProduct = useDatabaseStore((state) => state.updateProduct);
  const accessPins = useDatabaseStore((state) => state.accessPins);
  const verifiedRole = useDatabaseStore((state) => state.verifiedRole);
  const logAction = useDatabaseStore((state) => state.logAction);
  const currentWarehouseId = useDatabaseStore((state) => state.currentWarehouseId);
  const warehouses = useDatabaseStore((state) => state.warehouses);
  const productWarehouse = useDatabaseStore((state) => state.productWarehouse);
  const currentWarehouse = warehouses.find(w => w.id === currentWarehouseId);

  const canEdit = (): boolean => {
    if (!accessPins || accessPins.length === 0) return true;

    const activePin = accessPins.find(p => p.is_active);
    const sessionRole = verifiedRole;

    return (activePin && ['owner', 'economist'].includes(activePin.role)) ||
           (!!sessionRole && ['owner', 'economist'].includes(sessionRole));
  };

  const activeProducts = useMemo(() => {
    return products.filter(isActive);
  }, [products]);

  const lastMovementDates = useMemo(() => {
    const dates: Record<string, string> = {};
    movements.forEach(m => {
      if (!dates[m.product_id] || new Date(m.date) > new Date(dates[m.product_id])) {
        dates[m.product_id] = m.date;
      }
    });
    return dates;
  }, [movements]);

  const categories = useMemo(() => {
    const cats = new Set(activeProducts.map(p => p.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [activeProducts]);

  const autoCalculatedRop = (productId: string, currentStock: number): number => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentUsage = movements
      .filter(m => m.product_id === productId && (m.type === 'SALIDA' || (m.type as string) === 'CONSUMO') && !m.reason?.startsWith('Venta #') && m.reason !== 'Venta de producto/ingrediente' && new Date(m.date) >= thirtyDaysAgo)
      .reduce((sum, m) => sum + Number(m.quantity), 0);
    
    const dailyAvg = recentUsage / 30;
    return dailyAvg > 0 ? Math.round(dailyAvg * 7) : 0;
  };

  const filteredProducts = useMemo(() => {
    const filtered = activeProducts.filter((product) => {
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (product.category || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = categoryFilter === 'ALL' || product.category === categoryFilter;
      
      let matchesStatus = true;
      const warehouseStock = getStockForWarehouse(product.id);
      const quantity = warehouseStock ? warehouseStock.quantity : Number(product.quantity);
      const inTransit = warehouseStock ? warehouseStock.in_transit : Number(product.in_transit || 0);
      const physicalStock = quantity;
      const effectiveRop = product.rop > 0 ? product.rop : autoCalculatedRop(product.id, physicalStock);
      
      if (statusFilter === 'LOW_STOCK') {
        matchesStatus = physicalStock <= effectiveRop && physicalStock > 0;
      } else if (statusFilter === 'OUT_OF_STOCK') {
        matchesStatus = physicalStock <= 0;
      } else if (statusFilter === 'OPTIMAL') {
        matchesStatus = physicalStock > effectiveRop;
      } else if (statusFilter === 'WITH_STOCK') {
        matchesStatus = physicalStock >= 1;
      }

      const matchesType = typeFilter === 'ALL' ||
        (typeFilter === 'CONSUMO_DIRECTO' && product.is_consumo_directo) ||
        (typeFilter === 'GASTO_VARIABLE' && product.is_gasto_variable) ||
        (typeFilter === 'INDIVIDUAL' && product.is_individual) ||
        (typeFilter === 'INGREDIENTE' && !product.is_consumo_directo && !product.is_gasto_variable && !product.is_individual);

      return matchesSearch && matchesCategory && matchesStatus && matchesType;
    });

    // Sorting logic
    return filtered.sort((a, b) => {
      let valA: any;
      let valB: any;

      const stockA = getStockForWarehouse(a.id);
      const stockB = getStockForWarehouse(b.id);
      const physA = stockA ? stockA.quantity : Number(a.quantity);
      const physB = stockB ? stockB.quantity : Number(b.quantity);

      switch (sortBy) {
        case 'name':
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          break;
        case 'available':
          valA = physA;
          valB = physB;
          break;
        case 'in_transit':
          valA = Number(a.in_transit) || 0;
          valB = Number(b.in_transit) || 0;
          break;
        case 'cost':
          valA = Number(a.cost) || 0;
          valB = Number(b.cost) || 0;
          break;
        case 'total':
          valA = physA * Number(a.cost);
          valB = physB * Number(b.cost);
          break;
        case 'date':
          valA = lastMovementDates[a.id] ? new Date(lastMovementDates[a.id]).getTime() : 0;
          valB = lastMovementDates[b.id] ? new Date(lastMovementDates[b.id]).getTime() : 0;
          break;
        default:
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [activeProducts, movements, searchTerm, categoryFilter, statusFilter, typeFilter, sortBy, sortOrder, lastMovementDates]);

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const scrollTable = (direction: 'left' | 'right') => {
    const container = tableContainerRef.current || document.getElementById('stock-table-container');
    if (container) {
      const scrollAmount = container.clientWidth * 0.5;
      container.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  const confirmDelete = async () => {
    if (productToDelete) {
      try {
        await deleteProduct(productToDelete.id);
        await logAction('stock', 'ELIMINAR', {
          product_id: productToDelete.id,
          product_name: productToDelete.name,
        });
        toast.success('Producto eliminado exitosamente');
      } catch (err) {
        toast.error((err as Error).message || 'Error al eliminar el producto');
      }
      setProductToDelete(null);
    }
  };

  const openEditModal = (product: any) => {
    setEditingProduct(product);
    setEditParams({
      rop: Number(product.rop) || 0,
      price: Number(product.price) || 0,
    });
    setRopAutoDetail(null);
  };

  const closeEditModal = () => {
    setEditingProduct(null);
    setEditParams({ rop: 0, price: 0 });
    setRopAutoDetail(null);
  };

  const calculateRopAuto = (productId: string) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentMovements = movements.filter(m => {
      return m.product_id === productId && 
             (m.type === 'SALIDA' || (m.type as string) === 'CONSUMO') &&
             new Date(m.date) >= thirtyDaysAgo;
    });
    
    const totalConsumed = recentMovements.reduce((sum, m) => sum + (Number(m.quantity) || 0), 0);
    const dailyAverage = totalConsumed / 30;
    const suggestedRop = Math.round(dailyAverage * 7);
    
    return {
      dailyAvg: Math.round(dailyAverage * 100) / 100,
      suggested: suggestedRop,
      totalTransactions: recentMovements.length
    };
  };

  const handleSaveParams = async () => {
    if (!editingProduct) return;
    
    const ropValidation = validateNumber(String(editParams.rop), { min: 0, fieldName: 'ROP' });
    if (!ropValidation.isValid) {
      toast.error(ropValidation.error);
      return;
    }

    if (editingProduct.is_individual) {
      const priceValidation = validateNumber(String(editParams.price), { required: true, min: 0.01, fieldName: 'Precio' });
      if (!priceValidation.isValid) {
        toast.error(priceValidation.error);
        return;
      }
    }

    const updates: any = {
      rop: Math.max(0, editParams.rop),
    };

    if (editingProduct.is_individual) {
      updates.price = Math.max(0.01, editParams.price);
    }

    try {
      await updateProduct(editingProduct.id, updates);
      await logAction('stock', 'EDITAR_PARAMETROS', {
        product_id: editingProduct.id,
        product_name: editingProduct.name,
        changes: {
          rop: editParams.rop,
          price: editingProduct.is_individual ? editParams.price : null,
        },
      });
      toast.success('Parámetros actualizados exitosamente');
      closeEditModal();
    } catch (err) {
      toast.error((err as Error).message || 'Error al actualizar los parámetros');
    }
  };

  const hasConfiguredParams = (product: any) => {
    return Number(product.rop) > 0;
  };

  const totalInventoryValue = useMemo(() => {
    return filteredProducts.reduce((total, product) => {
      const warehouseStock = getStockForWarehouse(product.id);
      const inTransit = warehouseStock ? warehouseStock.in_transit : Number(product.in_transit || 0);
      const quantity = warehouseStock ? warehouseStock.quantity : Number(product.quantity);
      const availableStock = quantity;
      return total + (Math.max(0, availableStock) * Number(product.cost));
    }, 0);
  }, [filteredProducts, productWarehouse, currentWarehouseId]);

  const totalTransitValue = useMemo(() => {
    return filteredProducts.reduce((total, product) => {
      const warehouseStock = getStockForWarehouse(product.id);
      const inTransit = warehouseStock ? warehouseStock.in_transit : Number(product.in_transit || 0);
      return total + (Math.max(0, inTransit) * Number(product.cost));
    }, 0);
  }, [filteredProducts, productWarehouse, currentWarehouseId]);

  const stockTbodyRef = useStaggerEnter<HTMLTableSectionElement>([filteredProducts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">
            Almacén {currentWarehouse ? `- ${currentWarehouse.name}` : ''}
          </h1>
          <p className="text-sm text-text-secondary">
            Vista rápida del inventario en tiempo real
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right" title="Suma del stock en almacén (quantity × cost)">
            <p className="text-xs text-text-secondary uppercase tracking-wider">Valor Almacén</p>
            <p className="text-xl font-bold text-primary font-mono">${formatNumber(totalInventoryValue, 2)}</p>
          </div>
          <div className="text-right" title="Suma del stock en tránsito (in_transit × cost)">
            <p className="text-xs text-text-secondary uppercase tracking-wider">Valor Tránsito</p>
            <p className="text-xl font-bold text-warning font-mono">${formatNumber(totalTransitValue, 2)}</p>
          </div>
          <div className="h-8 w-px bg-border/50 hidden sm:block"></div>
          <div className="flex items-center gap-2">
            <Link to="/dashboard/inventory">
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowDownToLine className="h-4 w-4" />
                Entrada
              </Button>
            </Link>
            <Link to="/dashboard/inventory">
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowUpFromLine className="h-4 w-4" />
                Salida
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const columns = [
                  { header: 'Producto', key: 'name' },
                  { header: 'Categoría', key: 'category' },
                  { header: 'Tipo', key: 'type' },
                  { header: 'Disponible', key: 'available', format: (v: number) => formatNumber(v, 2) || '0' },
                  { header: 'En Tránsito', key: 'in_transit', format: (v: number) => formatNumber(v, 2) || '0' },
                  { header: 'Costo Unit.', key: 'cost', format: (v: number) => formatNumber(v, 2) || '0' },
                  { header: 'Total', key: 'total', format: (v: number) => formatNumber(v, 2) || '0' },
                  { header: 'Unidad', key: 'unit' },
                  { header: 'ROP', key: 'rop', format: (v: number) => v?.toString() || '0' },
                ];
                const data = filteredProducts.map(p => {
                  const warehouseStock = getStockForWarehouse(p.id);
                  const quantity = warehouseStock ? warehouseStock.quantity : Number(p.quantity);
                  const inTransit = warehouseStock ? warehouseStock.in_transit : Number(p.in_transit || 0);
                  const physicalStock = quantity;
                  return {
                    ...p,
                    type: p.is_consumo_directo ? 'Consumo Directo' : p.is_gasto_variable ? 'Gasto Variable' : p.is_individual ? 'Venta Rápida' : 'Ingrediente',
                    available: physicalStock,
                    in_transit: inTransit,
                    cost: Number(p.cost) || 0,
                    total: physicalStock * Number(p.cost),
                  };
                });
                exportToExcel(columns, data, `inventario_${new Date().toISOString().split('T')[0]}`);
              }}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              Exportar
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-4 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_-5px_rgba(255,193,7,0.15)]">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-52">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input
              placeholder="Buscar por nombre o categoría..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <div className="flex flex-1 gap-2 sm:max-w-2xl">
            <div className="relative flex-1">
              <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <select
                className="h-10 w-full appearance-none rounded-xl border border-border bg-bg pl-9 pr-4 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="ALL">Todas las categorías</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            
            <select
              className="h-10 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Todos los estados</option>
              <option value="OPTIMAL">Óptimo</option>
              <option value="LOW_STOCK">Stock Bajo</option>
              <option value="OUT_OF_STOCK">Sin Stock</option>
              <option value="WITH_STOCK">Con stock disponible</option>
            </select>

            <select
              className="h-10 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="ALL">Todos los tipos</option>
              <option value="CONSUMO_DIRECTO">Consumo Directo</option>
              <option value="GASTO_VARIABLE">Gasto Variable</option>
              <option value="INDIVIDUAL">Venta Rápida</option>
              <option value="INGREDIENTE">Ingrediente</option>
            </select>
          </div>

          {(searchTerm || categoryFilter !== 'ALL' || statusFilter !== 'ALL' || typeFilter !== 'ALL') && (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-secondary hover:text-text hover:border-primary transition-colors"
              title="Limpiar filtros"
            >
              <X className="h-3 w-3" /> Limpiar
            </button>
          )}
        </div>

        <div className="relative">
          <div className="absolute top-0 left-0 right-0 h-2 bg-border/30 rounded-t overflow-x-auto cursor-grab active:cursor-grabbing scrollbar-thin" 
               id="top-scrollbar"
               onScroll={(e) => {
                 const container = document.getElementById('stock-table-container');
                 if (container) container.scrollLeft = e.currentTarget.scrollLeft;
               }}>
            <div className="w-[150%] h-full" />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button 
            onClick={() => scrollTable('left')}
            aria-label="Desplazar tabla a la izquierda"
            className="flex-shrink-0 p-2 hover:bg-surface-hover rounded text-text-secondary hover:text-text transition-colors"
            title="Desplazar a la izquierda"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          
          <div className="flex-1 overflow-x-auto table-scroll-hint" id="stock-table-container" role="region" aria-label="Tabla de inventario"
               ref={tableContainerRef}
               onScroll={(e) => {
                 const topScroll = document.getElementById('top-scrollbar');
                 if (topScroll) topScroll.scrollLeft = e.currentTarget.scrollLeft;
               }}>
            <table className="w-full text-left text-sm text-text [&_tr]:divide-x [&_tr]:divide-border/50">
            <thead className="border-b border-border/50 bg-bg/50 text-xs uppercase text-text-secondary sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 font-medium min-w-[120px] cursor-pointer hover:text-text" onClick={() => toggleSort('name')} aria-sort={sortBy === 'name' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <div className="flex items-center">Producto <SortIcon sortBy={sortBy} sortOrder={sortOrder} field="name" /></div>
                </th>
                <th className="px-3 py-3 font-medium min-w-[100px] hidden md:table-cell">Categoría</th>
                <th className="px-3 py-3 font-medium min-w-[90px]">Tipo</th>
                <th className="px-3 py-3 font-medium text-right min-w-[80px] cursor-pointer hover:text-text" onClick={() => toggleSort('available')}>
                  <div className="flex items-center justify-end">Disponible <SortIcon sortBy={sortBy} sortOrder={sortOrder} field="available" /></div>
                </th>
                <th className="px-3 py-3 font-medium text-right min-w-[80px] cursor-pointer hover:text-text" onClick={() => toggleSort('in_transit')}>
                  <div className="flex items-center justify-end">En Tránsito <SortIcon sortBy={sortBy} sortOrder={sortOrder} field="in_transit" /></div>
                </th>
                <th className="px-3 py-3 font-medium text-right min-w-[90px] cursor-pointer hover:text-text hidden md:table-cell" onClick={() => toggleSort('cost')}>
                  <div className="flex items-center justify-end">Costo Unit. <SortIcon sortBy={sortBy} sortOrder={sortOrder} field="cost" /></div>
                </th>
                <th className="px-3 py-3 font-medium text-right min-w-[90px] cursor-pointer hover:text-text hidden md:table-cell" onClick={() => toggleSort('total')}>
                  <div className="flex items-center justify-end">Total <SortIcon sortBy={sortBy} sortOrder={sortOrder} field="total" /></div>
                </th>
                <th className="px-3 py-3 font-medium min-w-[80px]">Unidad</th>
                <th className="px-3 py-3 font-medium min-w-[80px] hidden md:table-cell">Parámetros</th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:text-text hidden md:table-cell" onClick={() => toggleSort('date')}>
                  <div className="flex items-center">Fecha Última Actualización <SortIcon sortBy={sortBy} sortOrder={sortOrder} field="date" /></div>
                </th>
                <th className="px-4 py-3 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody ref={stockTbodyRef} className="divide-y divide-border">
              {filteredProducts.length === 0 ? (
                isLoading ? (
                  <tr>
                    <td colSpan={13} className="px-4 py-8">
                      <TableSkeleton rows={5} cols={13} />
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={13} className="px-4 py-8">
                      <EmptyState icon={Package} title="No hay productos" description={products.length === 0 ? 'Agregue su primer producto desde la sección Inventario.' : 'Ningún producto coincide con los filtros aplicados.'} />
                    </td>
                  </tr>
                )
              ) : (
                filteredProducts.map((product) => {
                  const warehouseStock = getStockForWarehouse(product.id);
                  const quantity = warehouseStock ? warehouseStock.quantity : Number(product.quantity);
                  const inTransit = warehouseStock ? warehouseStock.in_transit : Number(product.in_transit || 0);
                  const physicalStock = quantity;
                  const isOutOfStock = physicalStock <= 0;
                  const effectiveRop = product.rop > 0 ? product.rop : autoCalculatedRop(product.id, physicalStock);
                  const isLowStock = physicalStock <= effectiveRop && !isOutOfStock;
                  const lastUpdate = lastMovementDates[product.id];
                  const isConfigured = hasConfiguredParams(product);
                  
                  return (
                    <tr
                      key={product.id}
                      className={`transition-colors hover:bg-surface-hover ${
                        isOutOfStock ? 'bg-danger/10' : isLowStock ? 'bg-warning/5' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {product.name}
                          {isConfigured && (
                            <span title="Parámetros configurados">
                              <Settings2 className="h-4 w-4 text-primary drop-shadow-[0_0_4px_rgba(205,164,52,0.8)]" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary hidden md:table-cell">{product.category}</td>
                      <td className="px-4 py-3">
                        {product.is_consumo_directo ? (
                          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600">
                            Consumo Directo
                          </span>
                        ) : product.is_gasto_variable ? (
                          <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2 py-1 text-xs font-medium text-purple-600">
                            Gasto Variable
                          </span>
                        ) : product.is_individual ? (
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                            Venta Rápida
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-surface-hover px-2 py-1 text-xs font-medium text-text-secondary">
                            Ingrediente
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${isLowStock ? 'text-red-600 font-bold' : ''}`} title={`Stock que NUNCA salió del almacén. Disponible + Tránsito = total registrado (suma de entradas). Ejemplo: 60+30=90 entradas, 12 en tránsito → Disponible=78, Tránsito=12, Suma=90.`}>
                        {formatNumber(physicalStock, 4)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {inTransit > 0 ? (
                          <span className="text-warning" title="Stock que ya salió del almacén. La venta desde tránsito descuenta aquí pero NO descuenta el Disponible (la SALIDA original ya lo hizo).">{formatNumber(inTransit, 4)}</span>
                        ) : (
                          <span className="text-text-secondary">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono hidden md:table-cell">
                        ${formatNumber(Number(product.cost), 2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-primary hidden md:table-cell">
                        ${formatNumber(physicalStock * Number(product.cost), 2)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {product.unit}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {isConfigured ? (
                          <div className="flex flex-wrap gap-1 text-xs">
                            <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-primary" title="ROP">
                              ROP: {product.rop}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-text-secondary">Sin configurar</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary hidden md:table-cell">
                        {lastUpdate ? new Date(lastUpdate).toLocaleString('es-ES', { 
                          year: 'numeric', 
                          month: '2-digit', 
                          day: '2-digit', 
                          hour: '2-digit', 
                          minute: '2-digit',
                          hour12: false 
                        }) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit() && (
                            <button
                              onClick={() => openEditModal(product)}
                              className="rounded-lg p-2 text-text-secondary hover:bg-primary/10 hover:text-primary transition-colors"
                              title="Editar parámetros (ROP)"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              const baseUnit = normalizeUnit(product.unit);
                              const compatibleUnits = getCompatibleUnits(baseUnit);
                              const warehouseStock = getStockForWarehouse(product.id);
                              const adjustedProduct = warehouseStock
                                ? { ...product, quantity: warehouseStock.quantity, in_transit: warehouseStock.in_transit }
                                : product;
                              setAdjustmentModal({
                                product: adjustedProduct,
                                physicalStock: 0,
                                unit: compatibleUnits.includes(product.unit as UnitAbbrev) ? product.unit : baseUnit,
                                date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19),
                              });
                            }}
                            className="rounded-lg p-2 text-text-secondary hover:bg-success/10 hover:text-success transition-colors"
                            title="Ajuste de inventario"
                          >
                            <Scale className="h-4 w-4" />
                          </button>
                          {canEdit() && (
                            <button
                              onClick={() => setProductToDelete({ id: product.id, name: product.name })}
                              className="rounded-lg p-2 text-text-secondary hover:bg-danger/10 hover:text-danger transition-colors"
                              title="Eliminar producto"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
          
          <button 
            onClick={() => scrollTable('right')}
            className="flex-shrink-0 p-2 hover:bg-surface-hover rounded text-text-secondary hover:text-text transition-colors"
            title="Desplazar a la derecha"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm modal-backdrop">
          <div className="w-full max-w-md rounded-2xl border border-border/50 bg-surface p-6 shadow-2xl">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-4 rounded-full bg-danger/10 p-4 text-danger">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-text">¿Eliminar producto?</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Está a punto de eliminar <span className="font-bold text-text">"{productToDelete.name}"</span>. 
                El producto se ocultará del inventario actual y del punto de venta, pero se mantendrá en el historial para no afectar sus reportes pasados.
              </p>
            </div>

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setProductToDelete(null)}
              >
                Cancelar
              </Button>
              <Button 
                className="flex-1 bg-danger text-white hover:bg-danger/90"
                onClick={confirmDelete}
              >
                Sí, eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm modal-backdrop">
          <div className="w-full max-w-md rounded-2xl border border-border/50 bg-surface p-6 shadow-2xl max-h-[80dvh] flex flex-col">
            <div className="mb-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Settings2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-text">Editar Parámetros</h2>
                  <p className="text-sm text-text-secondary">{editingProduct.name}</p>
                </div>
              </div>
              <button
                onClick={closeEditModal}
                className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto max-h-[50dvh] pr-2">
              <div className="space-y-2">
                <Label htmlFor="edit_rop">ROP (Punto de Reorden)</Label>
                <div className="flex gap-2">
                  <Input
                    id="edit_rop"
                    type="number"
                    min="0"
                    step="1"
                    className="flex-1"
                    value={editParams.rop}
                    onChange={(e) => {
                      setEditParams({...editParams, rop: Number(e.target.value)});
                      setRopAutoDetail(null);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!editingProduct) return;
                      const result = calculateRopAuto(editingProduct.id);
                      if (result.totalTransactions > 0) {
                        setEditParams({...editParams, rop: result.suggested});
                        setRopAutoDetail({
                          dailyAvg: result.dailyAvg,
                          suggested: result.suggested
                        });
                        toast.success(`ROP sugerido: ${result.suggested} (basado en ${result.dailyAvg} uds/día)`);
                      } else {
                        toast.error('No hay datos de consumo en los últimos 30 días');
                      }
                    }}
                    title="Calcular ROP automáticamente desde ventas"
                  >
                    Auto
                  </Button>
                </div>
                {ropAutoDetail ? (
                  <p className="text-xs text-success">
                    ✓ Basado en {ropAutoDetail.dailyAvg} uds/día → sugerencia: {ropAutoDetail.suggested}
                  </p>
                ) : (
                  <p className="text-xs text-text-secondary">Stock mínimo que activa la alerta de reposición</p>
                )}
              </div>

              {editingProduct.is_individual && (
                <div className="space-y-2">
                  <Label htmlFor="edit_price">Precio de Venta Unitario ($)</Label>
                  <Input
                    id="edit_price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editParams.price}
                    onChange={(e) => setEditParams({...editParams, price: Number(e.target.value)})}
                  />
                  <p className="text-xs text-text-secondary">Precio por unidad (ej: $350 por cerveza)</p>
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3 shrink-0">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={closeEditModal}
              >
                Cancelar
              </Button>
              <Button 
                className="flex-1"
                onClick={handleSaveParams}
              >
                Guardar Cambios
              </Button>
            </div>
          </div>
        </div>
      )}

      {adjustmentModal && (() => {
        const baseUnit = normalizeUnit(adjustmentModal.product.unit);
        const compatibleUnits = getCompatibleUnits(baseUnit);
        const difference = adjustmentModal.physicalStock - Number(adjustmentModal.product.quantity);
        
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm modal-backdrop">
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                    <Scale className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-text">Ajuste de Inventario</h2>
                    <p className="text-xs text-text-secondary">{adjustmentModal.product.name}</p>
                  </div>
                </div>
                <button onClick={() => setAdjustmentModal(null)} className="rounded-full p-2 text-text-secondary hover:bg-surface-hover hover:text-text transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl bg-bg/50 border border-border p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Stock Sistema:</span>
                    <span className="font-mono font-medium text-text">{formatNumber(Number(adjustmentModal.product.quantity), 4)} {adjustmentModal.product.unit}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Stock Físico:</span>
                    <span className={`font-mono font-bold ${difference >= 0 ? 'text-success' : 'text-danger'}`}>
                      {formatNumber(adjustmentModal.physicalStock, 4)} {adjustmentModal.unit}
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-sm border-t border-border pt-2">
                    <span className="text-text-secondary">Diferencia:</span>
                    <span className={`font-mono font-bold ${difference >= 0 ? 'text-success' : 'text-danger'}`}>
                      {difference >= 0 ? '+' : ''}{formatNumber(difference, 4)} {adjustmentModal.unit}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="physical_stock">Stock Físico *</Label>
                    <Input
                      id="physical_stock"
                      type="number"
                      min="0"
                      step="0.01"
                      value={adjustmentModal.physicalStock}
                      onChange={(e) => setAdjustmentModal({...adjustmentModal, physicalStock: Number(e.target.value)})}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="adjust_unit">Unidad</Label>
                    <select
                      id="adjust_unit"
                      className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      value={adjustmentModal.unit}
                      onChange={(e) => setAdjustmentModal({...adjustmentModal, unit: e.target.value})}
                    >
                      {compatibleUnits.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adjust_date">Fecha</Label>
                  <Input
                    id="adjust_date"
                    type="datetime-local"
                    value={adjustmentModal.date.slice(0, 16)}
                    onChange={(e) => { const val = e.target.value; setAdjustmentModal({...adjustmentModal, date: val.length <= 16 ? val + ':00' : val}); }}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Razón y Motivo</Label>
                  <div className="h-10 rounded-lg border border-border bg-bg/50 px-3 py-2 text-sm text-text-secondary">
                    Ajuste de inventario
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setAdjustmentModal(null)}
                  disabled={isAdjusting}
                >
                  Cancelar
                </Button>
                <Button 
                  className="flex-1 gap-2"
                  onClick={async () => {
                    if (adjustmentModal.physicalStock < 0) {
                      toast.error('El stock físico no puede ser negativo');
                      return;
                    }
                    
                    setIsAdjusting(true);
                      try {
                        const product = adjustmentModal.product;
                        const physicalStockInBase = convertUnit(adjustmentModal.physicalStock, adjustmentModal.unit as any, normalizeUnit(product.unit));
                        
                        const { addMovement, logAction } = useDatabaseStore.getState();
                        
                        await addMovement({
                            product_id: product.id,
                            type: 'AJUSTE' as any,
                            quantity: physicalStockInBase - Number(product.quantity),
                            unit: normalizeUnit(product.unit),
                            cost: product.cost,
                            reason: 'Ajuste de inventario',
                            status: 'NORMAL',
                            date: new Date(adjustmentModal.date).toISOString(),
                            warehouse_id: currentWarehouseId || undefined,
                          });
                          
                          await logAction('stock', 'AJUSTE', {
                            product_id: product.id,
                            product_name: product.name,
                            old_quantity: product.quantity,
                            new_quantity: physicalStockInBase,
                          });
                      
                      toast.success('Stock actualizado correctamente');
                      setAdjustmentModal(null);
                    } catch (err: any) {
                      toast.error(err.message || 'Error al realizar el ajuste');
                    } finally {
                      setIsAdjusting(false);
                    }
                  }}
                  disabled={isAdjusting || adjustmentModal.physicalStock < 0}
                >
                  {isAdjusting ? 'Guardando...' : 'Guardar Ajuste'}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

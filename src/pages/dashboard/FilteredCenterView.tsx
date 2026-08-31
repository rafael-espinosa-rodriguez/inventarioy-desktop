import React, { useState, useMemo } from 'react';
import { useDatabaseStore } from '../../store/dbStore';
import { Filter, Search, ArrowUpDown, AlertTriangle, CheckCircle2, Settings2, Printer } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { calculateMargin, exportToExcel, isActive } from '../../lib/utils';
import SortIcon from '../../components/ui/SortIcon';

export default function FilteredCenterView() {
  const { products, productWarehouse, currentWarehouseId } = useDatabaseStore();
  
  const activeProducts = products.filter(isActive);

  const getDisponible = (productId: string): number => {
    if (!currentWarehouseId || productWarehouse.length === 0) return Number(products.find(p => p.id === productId)?.quantity || 0);
    const pw = productWarehouse.find(p => p.product_id === productId && p.warehouse_id === currentWarehouseId);
    return pw ? Number(pw.quantity) : Number(products.find(p => p.id === productId)?.quantity || 0);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [stockFilter, setStockFilter] = useState('ALL'); // ALL, LOW, NORMAL, OVER
  const [typeFilter, setTypeFilter] = useState('ALL'); // ALL, INDIVIDUAL, CONSUMO_DIRECTO, GASTO_VARIABLE, INGREDIENTE
  const [sortBy, setSortBy] = useState('name'); // name, price, stock, value
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set(activeProducts.map(p => p.category));
    return Array.from(cats).sort();
  }, [activeProducts]);

  // Apply filters and sorting
  const filteredAndSortedProducts = useMemo(() => {
    let result = [...activeProducts];

    // 1. Search Filter
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(lowerSearch) || 
        (p.category || '').toLowerCase().includes(lowerSearch) ||
        p.description?.toLowerCase().includes(lowerSearch)
      );
    }

    // 2. Category Filter
    if (categoryFilter !== 'ALL') {
      result = result.filter(p => p.category === categoryFilter);
    }

    // 3. Type Filter (Individual, Consumo Directo, Gasto Variable, Ingrediente)
    if (typeFilter !== 'ALL') {
      result = result.filter(p => {
        if (typeFilter === 'INDIVIDUAL') return p.is_individual === true && !p.is_consumo_directo && !p.is_gasto_variable;
        if (typeFilter === 'CONSUMO_DIRECTO') return p.is_consumo_directo === true;
        if (typeFilter === 'GASTO_VARIABLE') return p.is_gasto_variable === true;
        if (typeFilter === 'INGREDIENTE') return !p.is_individual && !p.is_consumo_directo && !p.is_gasto_variable;
        return true;
      });
    }

    // 4. Stock Status Filter
    if (stockFilter !== 'ALL') {
      result = result.filter(p => {
        const physicalStock = getDisponible(p.id);
        const rop = Number(p.rop) || 0;
        
        // Si ROP no está configurado (0), exclude from LOW/OVER/NORMAL filters
        if (rop === 0) return stockFilter === 'ALL';
        
        if (stockFilter === 'LOW') return physicalStock <= rop;
        if (stockFilter === 'NORMAL') return physicalStock > rop && physicalStock <= rop * 2;
        if (stockFilter === 'OVER') return physicalStock > rop * 2;
        return true;
      });
    }

    // 5. Sorting
    result.sort((a, b) => {
      let valA: any = a.name;
      let valB: any = b.name;

      if (sortBy === 'price') {
        valA = a.price;
        valB = b.price;
      } else if (sortBy === 'stock') {
        valA = getDisponible(a.id);
        valB = getDisponible(b.id);
      } else if (sortBy === 'value') {
        const physA = getDisponible(a.id);
        const physB = getDisponible(b.id);
        valA = physA * Number(a.cost);
        valB = physB * Number(b.cost);
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [activeProducts, searchTerm, categoryFilter, typeFilter, stockFilter, sortBy, sortOrder, productWarehouse, currentWarehouseId]);

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-text">Centro Filtrado</h1>
          <p className="text-sm text-text-secondary">
            Búsqueda avanzada y filtros combinados para su inventario
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const columns = [
              { header: 'Producto', key: 'name' },
              { header: 'Categoría', key: 'category' },
{ header: 'Stock', key: 'stock', format: (v: number) => v?.toFixed(3).replace('.', ',') || '0' },
              { header: 'Precio', key: 'price', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
              { header: 'Margen %', key: 'margin', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
              { header: 'Valor Total', key: 'totalValue', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
            ];
            const data = filteredAndSortedProducts.map(p => {
              const physicalStock = getDisponible(p.id);
              const margin = p.is_individual && p.price && p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
              const state = (Number(p.rop) || 0) === 0 ? 'Sin configurar' : (physicalStock <= p.rop ? 'Bajo' : (physicalStock > p.rop * 2 ? 'Exceso' : 'Normal'));
              return {
                ...p,
                stock: physicalStock,
                state: state,
                price: p.is_individual ? (Number(p.price) || 0) : 0,
                margin: margin,
                totalValue: physicalStock * Number(p.cost),
              };
            });
            exportToExcel(columns, data, `inventario_filtrado_${new Date().toISOString().split('T')[0]}`);
          }}
          className="gap-2"
        >
          <Printer className="h-4 w-4" />
          Exportar
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1.5">
            <Label className="text-xs text-text-secondary">Búsqueda General</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                placeholder="Nombre, categoría..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-text-secondary">Categoría</Label>
            <select 
              className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary h-10"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">Todas las categorías</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-text-secondary">Estado de Stock</Label>
            <select 
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary h-10"
              value={stockFilter}
              onChange={e => setStockFilter(e.target.value)}
            >
              <option value="ALL">Todos los estados</option>
              <option value="LOW">Stock Bajo (Crítico)</option>
              <option value="NORMAL">Stock Normal</option>
              <option value="OVER">Sobre-stock</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-text-secondary">Tipo de Producto</Label>
            <select 
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary h-10"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
            >
              <option value="ALL">Todos los tipos</option>
              <option value="INDIVIDUAL">Venta Rápida</option>
              <option value="CONSUMO_DIRECTO">Consumo Directo</option>
              <option value="GASTO_VARIABLE">Gasto Variable</option>
              <option value="INGREDIENTE">Ingrediente</option>
            </select>
          </div>

          <div className="space-y-1.5 flex flex-col justify-end">
            <div className="flex items-center gap-2 h-10 px-3 rounded-md bg-bg border border-border text-sm text-text-secondary">
              <Filter className="h-4 w-4" />
              <span>{filteredAndSortedProducts.length} resultados</span>
            </div>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto table-scroll-hint">
          <table className="w-full text-left text-sm text-text [&_tr]:divide-x [&_tr]:divide-border/50">
            <thead className="border-b border-border bg-bg/50 text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-surface-hover transition-colors" onClick={() => toggleSort('name')}>
                  <div className="flex items-center">Producto <SortIcon sortBy={sortBy} sortOrder={sortOrder} field="name" /></div>
                </th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-surface-hover transition-colors" onClick={() => toggleSort('stock')}>
                  <div className="flex items-center">Almacén <SortIcon sortBy={sortBy} sortOrder={sortOrder} field="stock" /></div>
                </th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-surface-hover transition-colors" onClick={() => toggleSort('price')}>
                  <div className="flex items-center">Precio <SortIcon sortBy={sortBy} sortOrder={sortOrder} field="price" /></div>
                </th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Margen %</th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-surface-hover transition-colors hidden md:table-cell" onClick={() => toggleSort('value')}>
                  <div className="flex items-center">Valor Total <SortIcon sortBy={sortBy} sortOrder={sortOrder} field="value" /></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAndSortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-text-secondary">
                    <div className="flex flex-col items-center justify-center">
                      <Filter className="h-8 w-8 mb-2 opacity-20" />
                      <p>No se encontraron productos con estos filtros.</p>
                      <button 
                        onClick={() => {
                          setSearchTerm('');
                          setCategoryFilter('ALL');
                          setStockFilter('ALL');
                        }}
                        className="mt-4 px-4 py-2 text-primary hover:underline"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAndSortedProducts.map((product) => {
                  const physicalStock = getDisponible(product.id);
                  const isLow = (Number(product.rop) || 0) > 0 && physicalStock <= product.rop;
                  const isOver = (Number(product.rop) || 0) > 0 && physicalStock > product.rop * 2;
                  const noRopConfigured = (Number(product.rop) || 0) === 0;
                  const totalValue = physicalStock * product.cost;

                  return (
                    <tr key={product.id} className="transition-colors hover:bg-surface-hover">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium text-text">{product.name}</p>
                            {product.description && (
                              <p className="text-xs text-text-secondary truncate max-w-[200px]">{product.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary border border-border">
                          {product.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {physicalStock} <span className="text-xs text-text-secondary">{product.unit}</span>
                      </td>
                      <td className="px-4 py-3">
                        {noRopConfigured ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-text-secondary/10 px-2 py-1 text-xs font-medium text-text-secondary">
                            <Settings2 className="h-3 w-3" /> Sin configurar
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-1 text-xs font-medium text-danger">
                            <AlertTriangle className="h-3 w-3" /> Bajo
                          </span>
                        ) : isOver ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                            <ArrowUpDown className="h-3 w-3" /> Exceso
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success">
                            <CheckCircle2 className="h-3 w-3" /> Normal
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-text-secondary">
                        {product.is_individual ? `$${product.price.toFixed(2)}` : <span className="text-text-secondary">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono hidden md:table-cell">
                        {product.is_individual && product.price && product.price > 0 ? (
                          <span className={calculateMargin(Number(product.cost), Number(product.price)) < 30 ? 'text-warning' : 'text-success'}>
                            {calculateMargin(Number(product.cost), Number(product.price)).toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-text hidden md:table-cell">
                        ${totalValue.toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

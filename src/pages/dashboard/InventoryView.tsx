import React, { useState, useMemo, useEffect } from 'react';
import { useDatabaseStore } from '../../store/dbStore';
import { useAuthStore } from '../../store/authStore';
import { Input } from '../../components/ui/input';
import { NumberInput } from '../../components/ui/NumberInput';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { PackagePlus, ArrowRightLeft, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { validateNumber, normalizeStr, isActive } from '../../lib/utils';
import { useRealTimeClock } from '../../lib/hooks/useRealTimeClock';

const DEFAULT_CATEGORIES = [
  "Bebidas y Refrescos",
  "Lácteos y Quesos",
  "Carnes y Embutidos",
  "Pescados y Mariscos",
  "Frutas y Verduras",
  "Panadería y Dulces",
  "Enlatados y Conservas",
  "Galletas y Snacks",
  "Granos y Cereales",
  "Condimentos y Salsas",
  "Limpieza y Hogar",
  "Otros"
];

export default function InventoryView() {
  const { user } = useAuthStore();
  const { products, addProduct, addMovement, logAction, currentWarehouseId, productWarehouse, updateProductWarehouseQuantity, transitItems, movements } = useDatabaseStore();
  
  const activeProducts = products.filter(isActive);

  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState('');

  const existingCategories = Array.from(
    new Set(
      activeProducts
        .map(p => p.category)
        .filter(Boolean)
        .map(c => normalizeStr(c))
    )
  );
  const allCategories = Array.from(
    new Set([
      ...DEFAULT_CATEGORIES.map(c => normalizeStr(c)),
      ...existingCategories
    ])
  ).sort().map(c => c.charAt(0).toUpperCase() + c.slice(1));

  const [newProduct, setNewProduct] = useState({
    name: '',
    category: '',
    unit: 'u',
    quantity: 0,
    price: 0,
    cost: 0,
    rop: 0,
    eoq: 0,
    expiration_date: '',
    description: '',
    is_individual: false,
    is_consumo_directo: false,
    is_gasto_variable: false,
    lead_time: 0,
    order_cost: 0,
    holding_cost: 0,
  });

  const [movement, setMovement] = useState({
    type: 'ENTRADA' as 'ENTRADA' | 'SALIDA' | 'MERMA',
    product_id: '',
    quantity: 0,
    unit: 'u' as UnitAbbrev,
    displayUnit: 'u' as UnitAbbrev,
    date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19),
    cost: 0,
    reason: '',
    note: '',
    status: 'NORMAL' as 'NORMAL' | 'ANOMALIA' | 'JUSTIFICADO',
    warehouse_id: currentWarehouseId || '',
  });
  const movementClock = useRealTimeClock(movement.date);
  const [isSubmittingMovement, setIsSubmittingMovement] = useState(false);
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);

  // Sincronizar warehouse_id del formulario con el almacén global seleccionado
  useEffect(() => {
    if (currentWarehouseId) {
      setMovement(prev => ({ ...prev, warehouse_id: currentWarehouseId }));
    }
  }, [currentWarehouseId]);

  // Sincronizar el reloj en tiempo real con el state del movimiento
  useEffect(() => {
    if (movementClock.value !== movement.date && !movementClock.isManuallyEdited) {
      setMovement(prev => ({ ...prev, date: movementClock.value }));
    }
  }, [movementClock.value, movementClock.isManuallyEdited]);

  const handleAddProduct = async (e: React.FormEvent) => {
    if (isSubmittingProduct) return; // Evitar múltiples clics
    setIsSubmittingProduct(true);
    e.preventDefault();
    if (!user) return;
    
    const costValidation = validateNumber(String(newProduct.cost), { required: true, min: 0.01, fieldName: 'Costo unitario' });
    if (!costValidation.isValid) {
      toast.error(costValidation.error);
      setIsSubmittingProduct(false);
      return;
    }
    
    if (newProduct.is_individual) {
      const priceValidation = validateNumber(String(newProduct.price), { required: true, min: 0.01, fieldName: 'Precio de venta' });
      if (!priceValidation.isValid) {
        toast.error(priceValidation.error);
        setIsSubmittingProduct(false);
        return;
      }
    }
    
    try {
      await addProduct({
        ...newProduct,
        is_active: true,
      });
      
      await useDatabaseStore.getState().logAction('inventory', 'CREAR', {
        product_name: newProduct.name,
        category: newProduct.category,
        quantity: newProduct.quantity,
        unit: newProduct.unit
      });
      
      setNewProduct({
        name: '', category: '', unit: 'u', quantity: 0, price: 0, cost: 0,
        rop: 0, eoq: 0, expiration_date: '', description: '', is_individual: false,
        is_consumo_directo: false, is_gasto_variable: false,
        lead_time: 0, order_cost: 0, holding_cost: 0,
      });
      setIsCustomCategory(false);
      toast.success('Producto agregado exitosamente');
    } catch (error: any) {
      if (error.message?.includes("ya existe")) {
        toast.warning(error.message);
      } else {
        toast.error(error.message || 'Error al agregar producto');
      }
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  const convertToUTC = (dateStr: string) => {
    return new Date(dateStr).toISOString();
  };

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingMovement) return; // Evitar múltiples clics
    
    if (!user) return;
    if (!movement.product_id) {
      toast.error('Debe seleccionar un producto');
      return;
    }

    const quantityValidation = validateNumber(String(movement.quantity), { required: true, min: 0.0001, fieldName: 'Cantidad' });
    if (!quantityValidation.isValid) {
      toast.error(quantityValidation.error);
      return;
    }

    // Validar nota obligatoria para CONSUMO_DIRECTO
    if ((movement.type as string) === 'CONSUMO_DIRECTO' && !movement.note.trim()) {
      toast.error('La nota es obligatoria para Consumo Directo');
      return;
    }

    const product = products.find(p => p.id === movement.product_id);
    if (!product) {
      toast.error('Producto no encontrado');
      return;
    }

    const baseUnit = normalizeUnit(product.unit);
    const quantityInBase = convertUnit(movement.quantity, movement.displayUnit, baseUnit);
    
    if (quantityInBase <= 0) {
      toast.error('La cantidad debe ser mayor a 0');
      return;
    }
    
    // SALIDA y MERMA requieren validación de stock (usar product_warehouse.quantity como source of truth)
    if (movement.type === 'SALIDA' || movement.type === 'MERMA') {
      const pw = productWarehouse.find(
        pw => pw.product_id === movement.product_id && pw.warehouse_id === movement.warehouse_id
      );
      const availableStock = pw ? Number(pw.quantity) : Number(product.quantity);
      if (quantityInBase > availableStock) {
        toast.error(`La cantidad excede el stock disponible (${availableStock} ${baseUnit})`);
        return;
      }
    }

    // Detectar movimiento retroactivo: comparar fecha del formulario con último movimiento del mismo producto
    const newDateMs = new Date(movement.date).getTime();
    const lastMovementForProduct = movements
      .filter(m => m.product_id === movement.product_id)
      .reduce<typeof movements[number] | null>((latest, m) => {
        if (!latest) return m;
        const latestMs = new Date(latest.date).getTime();
        const mMs = new Date(m.date).getTime();
        return mMs > latestMs ? m : latest;
      }, null);

    if (lastMovementForProduct && newDateMs < new Date(lastMovementForProduct.date).getTime()) {
      const proceed = await new Promise<boolean>((resolve) => {
        toast.warning(
          'Está registrando un movimiento con hora anterior al último registrado. ¿Continuar?',
          {
            duration: 15000,
            action: {
              label: 'Continuar',
              onClick: () => resolve(true),
            },
            cancel: {
              label: 'Cancelar',
              onClick: () => resolve(false),
            },
            onDismiss: () => resolve(false),
            onAutoClose: () => resolve(false),
          }
        );
      });
      if (!proceed) return;
    }

    await submitMovement(product, baseUnit, quantityInBase);
  };

  const submitMovement = async (product: typeof products[number], baseUnit: string, quantityInBase: number) => {
    setIsSubmittingMovement(true);
    try {
      const isConsumoDirecto = product.is_consumo_directo === true;
      const isAnomaly = movement.type === 'SALIDA' && quantityInBase > (Number(product.quantity) * 0.5);

      const movementCost = movement.type === 'ENTRADA' 
        ? Number(movement.cost) 
        : Number(product.cost);

      const movementData = {
        product_id: movement.product_id,
        type: movement.type,
        quantity: quantityInBase,
        unit: baseUnit,
        cost: movementCost,
        reason: movement.reason || undefined,
        note: isConsumoDirecto ? (movement.note ?? undefined) : undefined,
        status: isAnomaly ? 'ANOMALIA' : 'NORMAL',
        date: convertToUTC(movement.date),
        warehouse_id: movement.warehouse_id || currentWarehouseId || undefined,
      };

      await addMovement(movementData);
      
      await useDatabaseStore.getState().logAction('movements', movement.type, {
        product_name: product.name,
        quantity: movement.quantity,
        unit: movement.displayUnit,
        reason: movement.reason || undefined,
        note: movement.note || undefined
      });
      
      saveLastUsedUnit(movement.product_id, movement.displayUnit);

      setMovement({
        type: 'ENTRADA',
        product_id: '',
        quantity: 0,
        unit: 'u',
        displayUnit: 'u',
        date: movementClock.value,
        cost: 0,
        reason: '',
        note: '',
        status: 'NORMAL',
        warehouse_id: currentWarehouseId || '',
      });
      movementClock.reset();
      toast.success('Movimiento registrado exitosamente');
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error al registrar movimiento:', error);
      toast.error(error.message || 'Error al registrar movimiento');
    } finally {
      setIsSubmittingMovement(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Gestión de Inventario</h1>
          <p className="text-sm text-text-secondary">
            Alta de productos y registro de movimientos
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_-5px_rgba(255,193,7,0.15)]">
          <div className="mb-6 flex items-center gap-3 border-b border-border/50 pb-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary drop-shadow-[0_0_8px_rgba(205,164,52,0.5)]">
              <PackagePlus className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold text-text">Alta de Producto</h2>
          </div>

          <form onSubmit={handleAddProduct} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre del Producto *</Label>
                <Input id="name" required value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={!isCustomCategory ? "category" : "custom_category"}>Categoría *</Label>
                {!isCustomCategory ? (
                  <select
                    id="category"
                    required
                    className="flex h-10 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    value={newProduct.category}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomCategory(true);
                        setNewProduct({ ...newProduct, category: '' });
                      } else {
                        setNewProduct({ ...newProduct, category: e.target.value });
                      }
                    }}
                  >
                    <option value="" disabled>Seleccione una categoría...</option>
                    {allCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="custom">+ Agregar nueva categoría...</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <Input 
                      id="custom_category" 
                      required 
                      placeholder="Nueva categoría"
                      value={newProduct.category} 
                      onChange={e => setNewProduct({...newProduct, category: e.target.value})} 
                      autoFocus
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        setIsCustomCategory(false);
                        setNewProduct({ ...newProduct, category: '' });
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="quantity">Cantidad Inicial *</Label>
                <NumberInput id="quantity" min={0} step="0.01" required value={newProduct.quantity} onValueChange={v => setNewProduct({...newProduct, quantity: v})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unidad *</Label>
                <select 
                  id="unit" 
                  className="flex h-10 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={newProduct.unit}
                  onChange={e => setNewProduct({...newProduct, unit: e.target.value})}
                >
                  {Object.entries(UNIT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

              <div className="space-y-2">
                <Label htmlFor="cost">Costo Unitario *</Label>
                  <NumberInput
                    id="cost"
                    min={0.01}
                    step="0.01"
                    required
                    value={newProduct.cost}
                    onValueChange={v => setNewProduct({...newProduct, cost: v})}
                  />
              </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción (Opcional)</Label>
              <textarea 
                id="description" 
                rows={2}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={newProduct.description}
                onChange={e => setNewProduct({...newProduct, description: e.target.value})}
              />
            </div>

            <div className="space-y-4 pt-2 border-t border-border/50">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="is_individual" 
                  className="h-4 w-4 rounded border-border bg-bg text-primary focus:ring-primary"
                  checked={newProduct.is_individual}
                  onChange={e => setNewProduct({...newProduct, is_individual: e.target.checked})}
                />
                <Label htmlFor="is_individual" className="cursor-pointer">Se vende individualmente</Label>
              </div>
              <p className="text-xs text-text-secondary pl-6">Ej: Bebidas, postres, platos (se asigna un precio de venta por unidad)</p>
              
              {newProduct.is_individual && (
                <div className="space-y-2 sm:w-1/2">
                  <Label htmlFor="price">Precio de Venta *</Label>
                  <NumberInput id="price" min={0.01} step="0.01" required value={newProduct.price} onValueChange={v => setNewProduct({...newProduct, price: v})} />
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="is_consumo_directo" 
                  className="h-4 w-4 rounded border-border bg-bg text-primary focus:ring-primary"
                  checked={newProduct.is_consumo_directo}
                  onChange={e => setNewProduct({...newProduct, is_consumo_directo: e.target.checked})}
                />
                <Label htmlFor="is_consumo_directo" className="cursor-pointer">Producto de consumo directo</Label>
              </div>
              <p className="text-xs text-text-secondary pl-6">Ej: Sal, orégano, especias (se registra al final del día por peso)</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="is_gasto_variable" 
                  className="h-4 w-4 rounded border-border bg-bg text-primary focus:ring-primary"
                  checked={newProduct.is_gasto_variable}
                  onChange={e => setNewProduct({...newProduct, is_gasto_variable: e.target.checked})}
                />
                <Label htmlFor="is_gasto_variable" className="cursor-pointer">Gasto variable</Label>
              </div>
              <p className="text-xs text-text-secondary pl-6">Ej: Servilletas, carbón, gasolina (se registra el gasto manualmente desde Tránsito)</p>
            </div>

            

            <Button type="submit" className="mt-6 px-8" disabled={isSubmittingProduct}>
              {isSubmittingProduct ? 'Agregando...' : 'Agregar Producto'}
            </Button>
          </form>
        </div>

        <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_-5px_rgba(205,164,52,0.15)]">
          <div className="mb-6 flex items-center gap-3 border-b border-border/50 pb-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary drop-shadow-[0_0_8px_rgba(205,164,52,0.5)]">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold text-text">Registrar Movimiento</h2>
          </div>

          <form onSubmit={handleAddMovement} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mov_type">Tipo de Movimiento *</Label>
              <select 
                id="mov_type" 
                className="flex h-10 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={movement.type}
                onChange={e => setMovement({...movement, type: e.target.value as any})}
              >
                <option value="ENTRADA">Entrada (Aumenta Stock)</option>
                <option value="SALIDA">Salida (Hacia Tránsito/Cocina)</option>
                <option value="MERMA">Merma (Pérdida/Desperdicio)</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mov_product">Producto *</Label>
              <select 
                id="mov_product" 
                required
                className="flex h-10 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={movement.product_id}
                onChange={e => {
                  const prod = products.find(p => p.id === e.target.value);
                  if (!prod) return;
                  
                  const baseUnit = normalizeUnit(prod.unit);
                  const compatibleUnits = getCompatibleUnits(baseUnit);
                  const savedUnit = getLastUsedUnit(prod.id);
                  const defaultUnit = savedUnit && compatibleUnits.includes(savedUnit) ? savedUnit : baseUnit;
                  
                  setMovement(prev => ({
                    ...prev, 
                    product_id: e.target.value,
                    unit: baseUnit,
                    displayUnit: defaultUnit,
                    cost: Number(prod.cost),
                  }));
                }}
              >
                <option value="">Seleccione un producto...</option>
                {activeProducts
                  .map(p => {
                    const activeWarehouseId = movement.warehouse_id || currentWarehouseId;
                    const warehouseStock = activeWarehouseId 
                      ? productWarehouse.find(pw => pw.product_id === p.id && pw.warehouse_id === activeWarehouseId)
                      : null;
                    
                    const availableStock = warehouseStock 
                      ? Number(warehouseStock.quantity)
                      : Number(p.quantity);
                    
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} (Stock: {availableStock} {p.unit})
                        {!warehouseStock && currentWarehouseId && ' [Sin datos en almacén]'}
                      </option>
                    );
                  })}
              </select>
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mov_qty">Cantidad *</Label>
                <NumberInput
                  id="mov_qty"
                  min={0.0001}
                  step="any"
                  required
                  value={movement.quantity}
                  onValueChange={v => setMovement({...movement, quantity: v})}
                  placeholder="Ej: 5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mov_unit">Unidad</Label>
                <select
                  id="mov_unit"
                  value={movement.displayUnit}
                  onChange={e => {
                    const newUnit = e.target.value as UnitAbbrev;
                    const convertedQty = convertUnit(movement.quantity, movement.displayUnit, newUnit);
                    setMovement({...movement, displayUnit: newUnit, quantity: convertedQty});
                  }}
                  disabled={getCompatibleUnits(movement.unit).length <= 1}
                  className="h-10 w-full rounded-lg border border-border bg-bg px-2 py-2 text-sm text-text disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {getCompatibleUnits(movement.unit).map((u) => (
                    <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mov_date">Fecha *</Label>
                <Input
                  id="mov_date"
                  type="datetime-local"
                  required
                  value={movementClock.value.slice(0, 16)}
                  onChange={(e) => {
                    const val = e.target.value;
                    movementClock.onChange(val.length <= 16 ? val + ':00' : val);
                    setMovement({...movement, date: val.length <= 16 ? val + ':00' : val});
                  }}
                />
              </div>
            </div>

            {movement.type === 'ENTRADA' && (
              <div className="space-y-2">
                <Label htmlFor="mov_cost">Costo Unitario *</Label>
                <NumberInput id="mov_cost" min={0} step="0.01" required value={movement.cost} onValueChange={v => setMovement({...movement, cost: v})} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="mov_reason">Razón / Motivo (Opcional)</Label>
              <textarea 
                id="mov_reason" 
                rows={3}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={movement.reason}
                onChange={e => setMovement({...movement, reason: e.target.value})}
                placeholder={movement.type === 'MERMA' ? 'Ej: Producto caducado, daño en almacén...' : 'Ej: Compra a proveedor, ajuste de inventario...'}
              />
            </div>

            

            <Button 
              type="submit" 
              className="mt-6 px-8 gap-2"
              variant={movement.type === 'MERMA' ? 'destructive' : 'default'}
              disabled={isSubmittingMovement}
            >
              {isSubmittingMovement && <RefreshCw className="h-4 w-4 animate-spin" />}
              {isSubmittingMovement 
                ? 'Registrando...' 
                : movement.type === 'ENTRADA' 
                  ? 'Registrar Entrada' 
                  : movement.type === 'SALIDA' 
                    ? 'Registrar Salida' 
                    : 'Registrar Merma'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

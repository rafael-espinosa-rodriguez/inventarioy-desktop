import React, { useState, useEffect } from 'react';
import { useDatabaseStore } from '../../store/dbStore';
import { useAuthStore } from '../../store/authStore';
import { Plus, Minus, Trash2, ShoppingCart, CreditCard, Search, X, DollarSign, User, PlusCircle, Users, Loader2, Printer, AlertCircle, ChevronDown, Info } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { NumberInput } from '../../components/ui/NumberInput';
import { toast } from 'sonner';
import { validateNumber, getNumberFromString, exportToExcel, isActive } from '../../lib/utils';
import { isDateClosed } from '../../lib/dateUtils';
import { localDb } from '../../lib/db/localClient';
import { convertUnit, getCompatibleUnits, getUnitType, normalizeUnit, UNIT_LABELS, type UnitAbbrev } from '../../lib/unitConversion';
import { formatNumber } from '../../lib/formatNumber';
import TicketView from './TicketView';

type PaymentField = 'efectivo' | 'transferencia' | 'usd' | 'eur';
type PaymentValues = Record<PaymentField, number>;

function calculateFieldMax(
  field: PaymentField,
  values: PaymentValues,
  totalCUP: number,
  usdRate: number,
  eurRate: number,
  cupTransferEnabled: boolean,
  usdEnabled: boolean,
  eurEnabled: boolean
): number {
  if (totalCUP <= 0) return 0;
  const othersCUP =
    (Number(field !== 'efectivo' ? values.efectivo : 0) || 0) +
    (Number(field !== 'transferencia' && cupTransferEnabled ? values.transferencia : 0) || 0) +
    (Number(field !== 'usd' && usdEnabled ? values.usd : 0) || 0) * (usdRate || 0) +
    (Number(field !== 'eur' && eurEnabled ? values.eur : 0) || 0) * (eurRate || 0);
  const remainingCUP = Math.max(0, totalCUP - othersCUP);
  const rate =
    field === 'efectivo' ? 1 :
    field === 'transferencia' ? (cupTransferEnabled ? 1 : 0) :
    field === 'usd' ? (usdEnabled ? usdRate : 0) :
    (eurEnabled ? eurRate : 0);
  if (rate <= 0) return 0;
  return Math.round((remainingCUP / rate) * 1e6) / 1e6;
}

function showPaymentClampWarning(raw: number, clamped: number) {
  if (raw - clamped > 0.000001) {
    toast.warning(`Máximo permitido: $${formatNumber(clamped, 6)}`, { duration: 2000 });
  }
}

function getUnitStep(unit: string | undefined, isRecipe?: boolean): number {
  if (isRecipe) return 1;
  if (!unit) return 1;
  const u = unit.trim().toLowerCase();
  if (u === 'u' || u === 'und' || u === 'unidad' || u === 'unidades' || u === 'pz' || u === 'pza' || u === 'pzas' || u === 'pieza' || u === 'piezas') {
    return 1;
  }
  return 0.01;
}

function getUnitMin(unit: string | undefined, isRecipe?: boolean): number {
  return getUnitStep(unit, isRecipe) === 1 ? 1 : 0.001;
}

export default function SalesView() {
  const { user } = useAuthStore();
  const { products, recipes, employees, sales, dailyClosings, pendingAccounts, transitItems, addSale, createDailyClosing, getDailyClosings, createPendingAccount, addItemsToPendingAccount, chargePendingAccount, getPendingAccounts, togglePendingAccountType, updatePendingAccountItems, logAction, forceRefreshData } = useDatabaseStore();
  
  const activeProducts = products.filter(isActive);

  const today = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
  const [closingDate, setClosingDate] = useState(today);
  const [doubleShiftEnabled, setDoubleShiftEnabled] = useState(false);
  const [shiftCutoffHour, setShiftCutoffHour] = useState(15);
  // "now" fuerza re-render periódico para que el turno actual cambie solo al
  // cruzar la hora de corte (sin que el cajero haga nada).
  const [now, setNow] = useState(() => new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [saleType, setSaleType] = useState<'SALON' | 'DOMICILIO' | 'BAR' | 'VENTA_RAPIDA'>('SALON');
  const [employeeId, setEmployeeId] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lastEmployeeId') || '';
    }
    return '';
  });
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  const [ticketData, setTicketData] = useState<any>(null);
  // Id de la última venta registrada (spec 003: botón Facturar en el ticket).
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [isAccountHouse, setIsAccountHouse] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [selectedPendingAccount, setSelectedPendingAccount] = useState<string>('');
  const [showNewPendingModal, setShowNewPendingModal] = useState(false);
  const [newPendingName, setNewPendingName] = useState('');
  const [showSaleDetails, setShowSaleDetails] = useState(false);

  const [salePaymentMethod, setSalePaymentMethod] = useState({
    efectivo: 0,
    transferencia: 0,
    usd: 0,
    eur: 0,
  });
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentWarning, setPaymentWarning] = useState<string | null>(null);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [pendingSectionCollapsed, setPendingSectionCollapsed] = useState(false);
  const [editingItemAccountId, setEditingItemAccountId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [editItemQuantity, setEditItemQuantity] = useState<number>(1);

  // Doble turno (opcional): cargar configuración del servidor.
  useEffect(() => {
    (async () => {
      try {
        const res = await localDb.settings.get('');
        const all = res?.data || {};
        setDoubleShiftEnabled(!!all.double_shift_enabled);
        setShiftCutoffHour(typeof all.shift_cutoff_hour === 'number' ? all.shift_cutoff_hour : 15);
      } catch { /* usa los valores por defecto */ }
    })();
  }, []);

  // Tick de reloj: recalcula el turno actual cuando el tiempo cruza la hora de corte.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const [rawInputValues, setRawInputValues] = useState<Record<string, string>>({});

  const toggleAccountExpansion = (accountId: string) => {
    setExpandedAccounts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(accountId)) {
        newSet.delete(accountId);
      } else {
        newSet.add(accountId);
      }
      return newSet;
    });
  };

  const expandAllAccounts = () => {
    setExpandedAccounts(new Set(pendingAccounts.map(a => a.id)));
  };

  const collapseAllAccounts = () => {
    setExpandedAccounts(new Set());
  };

  const handleEditItem = (accountId: string, item: any) => {
    setEditingItemAccountId(accountId);
    setEditingItem(item);
    setEditItemQuantity(item.quantity);
    setShowEditItemModal(true);
  };

  const handleSaveEditItem = async () => {
    if (!editingItemAccountId || !editingItem) return;

    const account = pendingAccounts.find(a => a.id === editingItemAccountId);
    if (!account) return;

    const currentItems = account.items || [];
    const newItems = currentItems.map(i => {
      if (i.product_id === editingItem.product_id && i.added_at === editingItem.added_at) {
        return {
          ...i,
          quantity: editItemQuantity,
          subtotal: editItemQuantity * (i.unit_price)
        };
      }
      return i;
    });

    const result = await updatePendingAccountItems(editingItemAccountId, newItems);
    if (result.success) {
      toast.success('Cantidad actualizada');
    } else {
      toast.error(result.error || 'Error al actualizar');
    }
    setShowEditItemModal(false);
    setEditingItem(null);
    setEditingItemAccountId(null);
  };

  const handleDeleteItem = async (accountId: string, itemToDelete: any) => {
    const account = pendingAccounts.find(a => a.id === accountId);
    if (!account) return;

    const currentItems = account.items || [];
    const newItems = currentItems.filter(i => 
      !(i.product_id === itemToDelete.product_id && i.added_at === itemToDelete.added_at)
    );

    const result = await updatePendingAccountItems(accountId, newItems);
    if (result.success) {
      toast.success('Producto eliminado');
    } else {
      toast.error(result.error || 'Error al eliminar');
    }
  };

  useEffect(() => {
    getPendingAccounts();
  }, []);

  const handleEmployeeChange = (id: string) => {
    setEmployeeId(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('lastEmployeeId', id);
    }
  };

  const [closingNotes, setClosingNotes] = useState('');
  const [closingAmount, setClosingAmount] = useState(0);
  const [closingSales, setClosingSales] = useState<any[]>([]);
  const [closingLoading, setClosingLoading] = useState(false);
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const [isProcessingCharge, setIsProcessingCharge] = useState(false);
  const [isCreatingPending, setIsCreatingPending] = useState(false);
  const [showPreticket, setShowPreticket] = useState(false);
  const [preticketData, setPreticketData] = useState<any>(null);
  const [currencyBreakdown, setCurrencyBreakdown] = useState({
    cupEfectivo: 0,
    cupTransfer: 0,
    usd: 0,
    eur: 0,
  });
  const [showChargeMixModal, setShowChargeMixModal] = useState(false);
  const [selectedAccountForCharge, setSelectedAccountForCharge] = useState<any>(null);
  const [chargeBreakdown, setChargeBreakdown] = useState({
    efectivo: 0,
    transferencia: 0,
    usd: 0,
    eur: 0,
  });
  const [cancelJustification, setCancelJustification] = useState('');
  const [showCancelJustModal, setShowCancelJustModal] = useState(false);
  const [selectedAccountForCancel, setSelectedAccountForCancel] = useState<any>(null);
  const [showClosingWarning, setShowClosingWarning] = useState(false);
  const [closingWarningData, setClosingWarningData] = useState<{breakdown: number; expected: number} | null>(null);
  const [infoRecipe, setInfoRecipe] = useState<any>(null);
  const [pendingCancelAccount, setPendingCancelAccount] = useState<any>(null);

  // Función helper para operaciones seguras que siempre limpian el estado
  const safeExecute = async (
    operation: () => Promise<any>,
    setLoading: (val: boolean) => void,
    onSuccess?: () => void,
    successMessage?: string
  ) => {
    // La prevención de múltiples clics ya está en cada botón individual
    setLoading(true);
    try {
      const result = await operation();
      if (result?.success) {
        if (successMessage) toast.success(successMessage);
        onSuccess?.();
      } else {
        toast.error(result?.error || 'Error en la operación');
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error en operación:', error);
                    toast.error('Error de conexión. Intente de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // Turno actual (reloj): cambia solo al cruzar la hora de corte (tick de 30 s).
  const currentShift: '1' | '2' = doubleShiftEnabled ? (now.getHours() < shiftCutoffHour ? '1' : '2') : '1';

  // Turno objetivo (Opción B): el más antiguo sin cerrar que tenga ventas en la fecha.
  // Automático: cubre el caso de un turno olvidado (ej. cerrar el Turno 1 después de las 15:00).
  const targetShift: '1' | '2' = (() => {
    if (!doubleShiftEnabled) return '1';
    for (const sh of ['1', '2'] as const) {
      const closed = isDateClosed(dailyClosings, closingDate, sh);
      const hasSales = sales.some(s => {
        const sd = new Date(s.date).toISOString().split('T')[0];
        return sd === closingDate && !s.is_account_house && (s.shift || '1') === sh;
      });
      if (!closed && hasSales) return sh;
    }
    return currentShift;
  })();

  const todaySales = sales.filter(s => {
    const saleDate = new Date(s.date).toISOString().split('T')[0];
    if (saleDate !== closingDate) return false;
    if (s.is_account_house) return false;
    if (doubleShiftEnabled && (s.shift || '1') !== targetShift) return false;
    return true;
  });

  const todayQuickSales = todaySales.filter(s => s.sale_type === 'VENTA_RAPIDA').length;
  const nextQuickSaleNumber = todayQuickSales + 1;

  const todayTotal = todaySales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
  const todayDiscounts = todaySales.reduce((sum, s) => sum + (Number(s.discount) || 0), 0);
  const todayRefunds = 0;

  // Para VENDER se evalúa el turno actual; para el cierre, el turno objetivo.
  const isSellingBlocked = doubleShiftEnabled
    ? isDateClosed(dailyClosings, closingDate, currentShift)
    : isDateClosed(dailyClosings, closingDate);
  const isTargetClosed = doubleShiftEnabled
    ? isDateClosed(dailyClosings, closingDate, targetShift)
    : isDateClosed(dailyClosings, closingDate);

  const handleExportSales = () => {
    const columns = [
      { header: 'Fecha', key: 'date' },
      { header: 'Tipo', key: 'sale_type' },
{ header: 'Subtotal', key: 'subtotal', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
            { header: 'Descuento', key: 'discount', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
            { header: 'Total', key: 'total_amount', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
      { header: 'Método', key: 'payment_method' },
      { header: 'Empleado', key: 'employee_name' },
    ];
    
    const data = sales.map(s => ({
      ...s,
      date: new Date(s.date).toLocaleString('es-ES'),
      subtotal: Number(s.subtotal) || 0,
      total_amount: Number(s.total_amount) || 0,
      discount: Number(s.discount) || 0,
    }));
    
    exportToExcel(columns, data, `ventas_${new Date().toISOString().split('T')[0]}`);
  };

  const openClosingModal = () => {
    const items = todaySales.map(s => ({
      id: s.id,
      total: Number(s.total_amount) || 0,
      discount: Number(s.discount) || 0,
      saleType: s.sale_type,
      date: s.created_at
    }));
    
    // Calcular desglose de monedas desde las ventas del día
    let cupEfectivo = 0;
    let cupTransfer = 0;
    let usd = 0;
    let eur = 0;
    
    todaySales.forEach(sale => {
      // Usar campos numéricos si existen, sino usar fallback con parsing
      if (sale.efectivo !== undefined && sale.efectivo !== null) {
        cupEfectivo += Number(sale.efectivo) || 0;
      } else {
        // Fallback: parsear desde payment_method (ventas históricas)
        const parsed = parsePaymentMethodLegacy(sale.payment_method);
        cupEfectivo += parsed.efectivo;
      }
      
      if (sale.transferencia !== undefined && sale.transferencia !== null) {
        cupTransfer += Number(sale.transferencia) || 0;
      } else {
        const parsed = parsePaymentMethodLegacy(sale.payment_method);
        cupTransfer += parsed.transferencia;
      }
      
      if (sale.usd !== undefined && sale.usd !== null) {
        usd += Number(sale.usd) || 0;
      } else {
        const parsed = parsePaymentMethodLegacy(sale.payment_method);
        usd += parsed.usd;
      }
      
      if (sale.eur !== undefined && sale.eur !== null) {
        eur += Number(sale.eur) || 0;
      } else {
        const parsed = parsePaymentMethodLegacy(sale.payment_method);
        eur += parsed.eur;
      }
    });
    
    setCurrencyBreakdown({
      cupEfectivo,
      cupTransfer,
      usd,
      eur
    });
    
    setClosingSales(items);
    setClosingAmount(todayTotal - todayDiscounts);
    setClosingNotes('');
    setShowClosingModal(true);
  };
  
  // Función helper para parsear payment_method legacy (ventas históricas)
  const parsePaymentMethodLegacy = (paymentMethod: string | null | undefined) => {
    const result = { efectivo: 0, transferencia: 0, usd: 0, eur: 0 };
    if (!paymentMethod) return result;
    
    // Parsear efectivo
    const efectivoMatch = paymentMethod.match(/Efectivo:\s*([\d.]+)/);
    if (efectivoMatch) result.efectivo = parseFloat(efectivoMatch[1]) || 0;
    
    // Parsear transferencia
    const transferMatch = paymentMethod.match(/Transfer:\s*([\d.]+)/);
    if (transferMatch) result.transferencia = parseFloat(transferMatch[1]) || 0;
    
    // Parsear USD
    const usdMatch = paymentMethod.match(/USD:\s*([\d.]+)/);
    if (usdMatch) result.usd = parseFloat(usdMatch[1]) || 0;
    
    // Parsear EUR
    const eurMatch = paymentMethod.match(/EUR:\s*([\d.]+)/);
    if (eurMatch) result.eur = parseFloat(eurMatch[1]) || 0;
    
    return result;
  };

  const confirmClosing = async (skipValidation = false) => {
    if (!user) return { success: false, error: 'No autenticado' };
    
    if (todaySales.length === 0) {
      toast.error('No hay ventas en la fecha seleccionada');
      return { success: false, error: 'No hay ventas en la fecha seleccionada' };
    }

    // Validar que el desglose cuadre con el total (solo si no se saltó la validación)
    if (!skipValidation) {
      const usdConverted = user?.usdEnabled ? currencyBreakdown.usd * (user?.usdRate || 0) : 0;
      const eurConverted = user?.eurEnabled ? currencyBreakdown.eur * (user?.eurRate || 0) : 0;
      const totalBreakdown = currencyBreakdown.cupEfectivo + currencyBreakdown.cupTransfer + usdConverted + eurConverted;
      const expectedTotal = todayTotal - todayDiscounts;
      
      if (Math.abs(totalBreakdown - expectedTotal) > 1) {
        setClosingWarningData({
          breakdown: totalBreakdown,
          expected: expectedTotal
        });
        setShowClosingWarning(true);
        return { success: false, error: 'El desglose no cuadra con el total' };
      }
    }
    
    setClosingLoading(true);
    try {
      const selectedEmployee = employees.find(e => e.id === employeeId);
      const result = await createDailyClosing({
        user_id: user.id,
        closing_date: closingDate,
        shift: targetShift,
        total_sales: todayTotal,
        total_discounts: todayDiscounts,
        total_refunds: todayRefunds,
        closing_amount: closingAmount,
        notes: closingNotes,
        created_by: employeeId || user.id,
        created_by_name: selectedEmployee ? selectedEmployee.name : user.name,
        cup_efectivo: currencyBreakdown.cupEfectivo,
        cup_transfer: currencyBreakdown.cupTransfer,
        usd: currencyBreakdown.usd,
        eur: currencyBreakdown.eur,
        sales_count: todaySales.length,
      });
      if (result.success) {
        await logAction('closings', 'CREAR', {
          closing_date: closingDate,
          total_sales: todayTotal,
          total_discounts: todayDiscounts,
          total_refunds: todayRefunds,
          closing_amount: closingAmount,
          created_by_name: selectedEmployee ? selectedEmployee.name : user.name,
        });
        toast.success(doubleShiftEnabled ? `Cierre de ${closingDate} · Turno ${targetShift} registrado` : `Cierre de caja del ${closingDate} registrado`);
        setShowClosingModal(false);
        getDailyClosings().catch(() => {});
        return { success: true };
      } else {
        toast.error(result.error || 'Error al registrar cierre');
        return { success: false, error: result.error || 'Error al registrar cierre' };
      }
    } catch (err) {
      toast.error((err as Error).message);
      return { success: false, error: (err as Error).message };
    } finally {
      setClosingLoading(false);
    }
  };
  
  const [cart, setCart] = useState<{
    product_id: string;
    name: string;
    quantity: number;
    price: number;
    cost: number;
    unit: string;
    displayUnit?: string;
    is_recipe?: boolean;
    recipe_snapshot?: {
      name: string;
      ingredients: {
        product_id: string;
        quantity: number;
        cost: number;
      }[];
    };
  }[]>([]);

  // Combine products and recipes for the catalog
  const catalogItems = [
    ...activeProducts.filter(p => p.is_individual).map(p => ({ ...p, is_recipe: false })),
    ...recipes.map(r => {
      // Calculate cost of recipe
      const cost = r.ingredients.reduce((sum, ing) => {
        const product = products.find(p => p.id === ing.product_id);
        return sum + ((product?.cost || 0) * ing.quantity);
      }, 0);

      // Calculate available portions based on transit ingredients
      const transitMap = new Map<string, number>();
      for (const t of transitItems) {
        transitMap.set(t.product_id, (transitMap.get(t.product_id) || 0) + t.remaining);
      }

      const portionsPerIngredient = r.ingredients.map(ing => {
        const available = transitMap.get(ing.product_id) || 0;
        const product = products.find(p => p.id === ing.product_id);
        return {
          productId: ing.product_id,
          productName: product?.name || 'Producto Eliminado',
          needed: ing.quantity,
          unit: ing.unit || product?.unit || '',
          available,
          maxPortions: Math.floor(available / ing.quantity),
        };
      });

      const availablePortions = Math.min(...portionsPerIngredient.map(p => p.maxPortions));
      const missingIngredients = portionsPerIngredient.filter(p => p.maxPortions === 0);

      return {
        id: r.id,
        name: r.name,
        category: 'Recetas',
        price: r.selling_price,
        cost,
        unit: 'porción',
        quantity: 999, // Recipes don't have direct stock, it depends on ingredients
        availablePortions,
        missingIngredients: missingIngredients.length > 0 ? missingIngredients : undefined,
        is_recipe: true,
        recipe_snapshot: {
          name: r.name,
          ingredients: r.ingredients.map(ing => {
            const product = products.find(p => p.id === ing.product_id);
            return {
              product_id: ing.product_id,
              quantity: ing.quantity,
              cost: product?.cost || 0
            };
          })
        }
      };
    })
  ];

  const filteredProducts = catalogItems.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const addToCart = (item: any) => {
    setCart(current => {
      const existing = current.find(c => c.product_id === item.id);
      const step = getUnitStep(item.unit, item.is_recipe);
      if (existing) {
        return current.map(c => 
          c.product_id === item.id 
            ? { ...c, quantity: c.quantity + step }
            : c
        );
      }
      setRawInputValues(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return [...current, {
        product_id: item.id,
        name: item.name,
        quantity: step,
        price: item.price,
        cost: item.cost,
        unit: item.unit,
        displayUnit: normalizeUnit(item.unit) || item.unit,
        is_recipe: item.is_recipe,
        recipe_snapshot: item.recipe_snapshot
      }];
    });
  };

  const updateQuantity = (product_id: string, delta: number) => {
    setCart(current => current.map(item => {
      if (item.product_id === product_id) {
        const unitStep = getUnitStep(item.unit, item.is_recipe);
        const minQty = getUnitMin(item.unit, item.is_recipe);
        const effectiveDelta = Math.abs(delta) === 1 ? Math.sign(delta) * unitStep : delta;
        const newQty = Math.max(minQty, item.quantity + effectiveDelta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (product_id: string) => {
    setCart(current => current.filter(item => item.product_id !== product_id));
    setRawInputValues(prev => {
      const next = { ...prev };
      delete next[product_id];
      return next;
    });
  };

  const getMaxQuantity = (item: typeof cart[0]): number => {
    if (item.is_recipe) return 9999;
    const product = products.find(p => p.id === item.product_id);
    if (!product) return 1;
    const inTransit = Number(product.in_transit || 0);
    const quantity = Number(product.quantity || 0);
    return Math.max(0.0001, inTransit > 0 ? inTransit : quantity);
  };

  const handleQuantityChange = (product_id: string, value: string) => {
    setRawInputValues(prev => ({ ...prev, [product_id]: value }));
  };

  const handleQuantityBlur = (product_id: string, value: string) => {
    setRawInputValues(prev => {
      const next = { ...prev };
      delete next[product_id];
      return next;
    });
    const item = cart.find(c => c.product_id === product_id);
    if (!item) return;
    const step = getUnitStep(item.unit, item.is_recipe);
    const numRaw = parseFloat(value.replace(',', '.'));
    const num = item.displayUnit && normalizeUnit(item.displayUnit) !== normalizeUnit(item.unit)
      ? convertUnit(numRaw, normalizeUnit(item.displayUnit), normalizeUnit(item.unit))
      : numRaw;
    if (value === '' || isNaN(numRaw) || numRaw <= 0) {
      setCart(current => current.map(c =>
        c.product_id === product_id ? { ...c, quantity: step } : c
      ));
      return;
    }
    const clamped = item.is_recipe ? Math.round(num) : num;
    const maxQty = getMaxQuantity(item);
    const finalQty = clamped > maxQty ? maxQty : clamped;
    if (clamped !== num || finalQty !== num || numRaw !== num) {
      if (clamped !== num && item.is_recipe) toast.warning('Las recetas se venden en unidades enteras');
      else if (finalQty !== num) toast.warning(`Stock máximo disponible: ${maxQty}`);
      setCart(current => current.map(c =>
        c.product_id === product_id ? { ...c, quantity: Math.max(step, finalQty) } : c
      ));
      return;
    }
    setCart(current => current.map(c =>
      c.product_id === product_id ? { ...c, quantity: finalQty } : c
    ));
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const total = Math.max(0, subtotal - Math.min(discount, subtotal));

  const handleCheckout = () => {
    if (!user) return;
    if (cart.length === 0) {
      toast.error('El carrito está vacío');
      return;
    }
    
    if (deliveryFee > 0) {
      const deliveryValidation = validateNumber(String(deliveryFee), { min: 0, fieldName: 'Costo de delivery' });
      if (!deliveryValidation.isValid) {
        toast.error(deliveryValidation.error);
        return;
      }
    }
    
    if (discount > 0) {
      const discountValidation = validateNumber(String(discount), { min: 0, max: subtotal, fieldName: 'Descuento' });
      if (!discountValidation.isValid) {
        toast.error(discountValidation.error);
        return;
      }
    }
    
    setIsProcessingSale(false);
    setShowPreview(true);
  };

  const confirmSale = async () => {
    if (!user) return;
    if (isProcessingSale) return;
    setIsProcessingSale(true);

    // Validar método de pago si no es cuenta casa
    if (!isAccountHouse) {
      const roundedTotal = Math.round(total * 1e6) / 1e6;
      const usdConverted = user?.usdEnabled ? salePaymentMethod.usd * (user?.usdRate || 0) : 0;
      const eurConverted = user?.eurEnabled ? salePaymentMethod.eur * (user?.eurRate || 0) : 0;
      const totalPaid = Math.round((salePaymentMethod.efectivo + (user?.cupTransferEnabled ? salePaymentMethod.transferencia : 0) + usdConverted + eurConverted) * 1e6) / 1e6;
      
      if (totalPaid < roundedTotal) {
        const missingAmount = Math.round((roundedTotal - totalPaid) * 1e6) / 1e6;
        if (totalPaid === 0) {
          setPaymentError('Debe especificar el desglose de pago para procesar la venta');
        } else {
          setPaymentError(`Falta por pagar: $${formatNumber(missingAmount, 6)} CUP`);
        }
        setPaymentWarning(null);
        setIsProcessingSale(false);
        return;
      }
      
      // Detectar sobrepago
      if (totalPaid > roundedTotal) {
        const overpaidAmount = Math.round((totalPaid - roundedTotal) * 1e6) / 1e6;
        setPaymentWarning(`Sobrepago: $${formatNumber(overpaidAmount, 6)} CUP de vuelto`);
      } else {
        setPaymentWarning(null);
      }
    } else {
      setPaymentWarning(null);
    }

    const saleNotes = saleType === 'VENTA_RAPIDA' 
      ? `Venta rápida ${nextQuickSaleNumber}${notes ? ' - ' + notes : ''}`
      : notes;

    // Construir método de pago convertido a CUP
    const usdConverted = user?.usdEnabled ? salePaymentMethod.usd * (user?.usdRate || 0) : 0;
    const eurConverted = user?.eurEnabled ? salePaymentMethod.eur * (user?.eurRate || 0) : 0;
    const paymentMethod = isAccountHouse 
      ? 'Cuenta Casa' 
      : `Efectivo: ${salePaymentMethod.efectivo}${user?.cupTransferEnabled ? `, Transfer: ${salePaymentMethod.transferencia}` : ''}${usdConverted > 0 ? `, USD: ${usdConverted}` : ''}${eurConverted > 0 ? `, EUR: ${eurConverted}` : ''}`;

    const timeoutId = setTimeout(() => {
      setIsProcessingSale(false);
      setShowPreview(false);
      setPaymentError(null);
      setPaymentWarning(null);
      setSalePaymentMethod({ efectivo: 0, transferencia: 0, usd: 0, eur: 0 });
      toast.error('Tiempo de espera agotado. Intente de nuevo.');
    }, 15000);

    try {
      const result = await addSale({
        employee_id: employeeId || user.id,
        items: cart.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.cost,
          selling_price: item.price,
          subtotal: item.price * item.quantity,
          is_recipe: item.is_recipe,
          recipe_snapshot: item.recipe_snapshot
        })),
        total_amount: total,
        date: closingDate,
        sale_type: saleType,
        is_account_house: isAccountHouse,
        notes: saleNotes,
        discount,
        payment_method: paymentMethod,
        efectivo: isAccountHouse ? 0 : (Number(salePaymentMethod.efectivo) || 0),
        transferencia: isAccountHouse ? 0 : (user?.cupTransferEnabled ? (Number(salePaymentMethod.transferencia) || 0) : 0),
        usd: isAccountHouse ? 0 : (user?.usdEnabled ? (Number(salePaymentMethod.usd) || 0) : 0),
        eur: isAccountHouse ? 0 : (user?.eurEnabled ? (Number(salePaymentMethod.eur) || 0) : 0),
      });

      if (!result.success) {
        setShowPreview(false);
        setPaymentError(null);
        setPaymentWarning(null);
        setLastSaleId(null);
        toast.error(result.error || 'No se pudo completar la venta');
        return;
      }
      setLastSaleId(result.saleId || null);

      // Capturar items del cart antes de limpiar
      const cartItems = cart.map(item => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        subtotal: item.price * item.quantity
      }));

      // Limpiar estados de venta exitosa
      setCart([]);
      setDiscount(0);
      setNotes('');
      setShowPreview(false);
      setPaymentError(null);
      setPaymentWarning(null);
      setSalePaymentMethod({ efectivo: 0, transferencia: 0, usd: 0, eur: 0 });
      
      toast.success('Venta registrada exitosamente');

      // Intentamos registrar la acción pero no bloqueamos laUI
      try {
        const selectedEmployee = employees.find(e => e.id === employeeId);
        await useDatabaseStore.getState().logAction('sales', 'VENTA', {
          total: total,
          items_count: cartItems.length,
          sale_type: saleType,
          sale_name: saleType === 'VENTA_RAPIDA' ? `Venta rápida ${nextQuickSaleNumber}` : null,
          employee: selectedEmployee?.name || user?.name || 'Dueño',
          is_account_house: isAccountHouse
        });
      } catch (logError) {
        if (import.meta.env.DEV) console.warn('Error logging action:', logError);
      }

      // Generar ticket si está habilitado
      if (user?.generateTicket) {
        const selectedEmployee = employees.find(e => e.id === employeeId);
        const empName = selectedEmployee ? selectedEmployee.name : (user.name || 'Dueño');
        const saleLabel = saleType === 'VENTA_RAPIDA' ? `Venta rápida ${nextQuickSaleNumber}` : (saleType === 'SALON' ? 'Salón' : saleType === 'DOMICILIO' ? 'Domicilio' : saleType === 'BAR' ? 'Bar' : 'Venta');
        
        setPreticketData({
          items: cartItems,
          total: isAccountHouse ? 0 : total,
          employeeName: empName,
          businessName: user.businessName || 'Mi Negocio',
          saleLabel: saleLabel,
          isPreticket: true,
          employeeRole: selectedEmployee ? selectedEmployee.role : (user.name ? 'Dueño' : ''),
          date: new Date(closingDate + 'T' + new Date().toTimeString().slice(0,8))
        });
        setShowPreticket(true);

        setTicketData({
          items: cartItems,
          total: isAccountHouse ? 0 : total,
          employeeName: empName,
          businessName: user.businessName || 'Mi Negocio',
          ticketMessage: user.ticketMessage || '¡Gracias por su visita!',
          saleType: saleType,
          isAccountHouse: isAccountHouse,
          deliveryFee: deliveryFee,
          employeeRole: selectedEmployee ? selectedEmployee.role : (user.name ? 'Dueño' : ''),
          date: new Date(closingDate + 'T' + new Date().toTimeString().slice(0,8))
        });
setShowTicket(true);
      }
    } catch (err) {
      setShowPreview(false);
      setPaymentError(null);
      setPaymentWarning(null);
      toast.error((err as Error).message || 'Error al registrar la venta');
    } finally {
      setIsProcessingSale(false);
      setShowPreview(false);
      setPaymentError(null);
      setPaymentWarning(null);
      setSalePaymentMethod({ efectivo: 0, transferencia: 0, usd: 0, eur: 0 });
      clearTimeout(timeoutId);
    }
  };

  const selectedEmployee = employees.find(e => e.id === employeeId);
  const sellerName = selectedEmployee ? selectedEmployee.name : '(Yo)';

  return (
    <>
    <div className="flex h-[calc(100dvh-8rem)] flex-col gap-6 lg:flex-row">
      {/* Panel Izquierdo - Catálogo de Productos */}
      <div className="flex flex-1 flex-col rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_-5px_rgba(255,193,7,0.15)]">
        <div className="border-b border-border/50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-text">Punto de Venta</h2>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={closingDate}
                onChange={e => setClosingDate(e.target.value)}
                className="w-auto h-8 text-sm font-mono"
              />
              {doubleShiftEnabled && (
                <span
                  className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium whitespace-nowrap"
                  title="El turno cambia solo según la hora de corte"
                >
                  Turno actual: {currentShift}
                </span>
              )}
              {isSellingBlocked && (
                <span className="text-xs px-2 py-1 rounded-full bg-success/20 text-success font-medium">Cerrado</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-text-secondary">Ventas del día</p>
              <p className="font-mono font-bold text-primary">${todayTotal.toFixed(2)}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportSales}
              className="gap-2"
              title="Exportar ventas a Excel"
            >
              <Printer className="h-4 w-4" />
              Exportar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openClosingModal}
              disabled={todaySales.length === 0 || isTargetClosed}
              className="gap-2"
            >
              <DollarSign className="h-4 w-4" />
              {doubleShiftEnabled
                ? (todaySales.length === 0 ? 'Sin ventas' : isTargetClosed ? 'Día Cerrado' : `Cerrar Turno ${targetShift}`)
                : (isTargetClosed ? 'Día Cerrado' : todaySales.length === 0 ? 'Sin ventas' : 'Cierre de Caja')}
            </Button>
          </div>
        </div>
        <div className="relative flex items-center px-4 pt-3">
          <Search className="absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <Input
            placeholder="Buscar producto para vender..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex-shrink-0 h-px bg-border/50 mx-4 mt-3" />
        
        {pendingAccounts && pendingAccounts.length > 0 && (
          <div className={`p-4 pb-2 ${pendingSectionCollapsed ? 'py-2' : ''}`}>
            {pendingSectionCollapsed ? (
              <div 
                className="flex items-center justify-between cursor-pointer hover:bg-warning/10 rounded p-2 -mx-2"
                onClick={() => setPendingSectionCollapsed(false)}
              >
                <h3 className="text-sm font-semibold text-warning flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Clientes Pendientes ({pendingAccounts.length})
                </h3>
                <span className="text-xs text-warning font-medium">▼ Expandir</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-warning flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Clientes Pendientes ({pendingAccounts.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={expandAllAccounts}
                      className="text-xs px-2 py-1 bg-warning/20 text-warning hover:bg-warning/30 rounded font-medium"
                    >
                      Expandir Todos
                    </button>
                    <button
                      onClick={collapseAllAccounts}
                      className="text-xs px-2 py-1 bg-warning/20 text-warning hover:bg-warning/30 rounded font-medium"
                    >
                      Contraer Todos
                    </button>
                    <button
                      onClick={() => setPendingSectionCollapsed(true)}
                      className="text-xs px-2 py-1 bg-warning/20 text-warning hover:bg-warning/30 rounded font-medium"
                      title="Contraer sección"
                    >
                      ▲
                    </button>
                  </div>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
              {pendingAccounts.map(account => {
                const accountItems = account.items || [];
                const isExpanded = expandedAccounts.has(account.id);
                return (
                  <div key={account.id} className={`p-3 rounded-lg border ${account.is_account_house ? 'bg-danger/10 border-danger/30' : 'bg-warning/5 border-warning/20'}`}>
                    <div 
                      className="flex items-center justify-between mb-2 cursor-pointer"
                      onClick={() => toggleAccountExpansion(account.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-secondary">
                          {isExpanded ? '▼' : '▶'}
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-text text-sm">{account.client_name}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            account.sale_type === 'DOMICILIO' ? 'bg-blue-100 text-blue-700' : 
                            account.sale_type === 'BAR' ? 'bg-purple-100 text-purple-700' :
                            account.sale_type === 'VENTA_RAPIDA' ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {account.sale_type === 'SALON' ? 'SALÓN' : 
                             account.sale_type === 'DOMICILIO' ? 'A DOMICILIO' : 
                             account.sale_type === 'BAR' ? 'BAR' : 
                             account.sale_type === 'VENTA_RAPIDA' ? 'VENTA RÁPIDA' : 'SALÓN'}
                          </span>
                          {account.is_account_house && (
                            <span className="text-xs px-1.5 py-0.5 bg-danger/20 text-danger rounded font-medium">CUENTA CASA</span>
                          )}
                        </div>
                        <p className="text-xs text-text-secondary">
                          {account.created_at_local ? new Date(account.created_at_local).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : new Date(new Date(account.created_at).getTime() + 3600000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - {accountItems.length} productos - ${(account.total_amount || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await togglePendingAccountType(account.id);
                            if (result.success) {
                              toast.success(account.is_account_house ? 'Cambiado a venta normal' : 'Cambiado a Cuenta Casa');
                            } else {
                              toast.error(result.error || 'Error al cambiar tipo de cuenta');
                            }
                          }}
                          className={`text-xs px-2 py-1.5 rounded text-xs font-medium ${account.is_account_house ? 'bg-danger/10 text-danger border border-danger/30' : 'bg-warning/10 text-warning border border-warning/30'}`}
                          title={account.is_account_house ? 'Cambiar a venta normal' : 'Cambiar a Cuenta Casa'}
                        >
                          CC
                        </button>
                        <Button
                          size="default"
                          className="text-xs bg-success hover:bg-success/80"
                          onClick={() => {
                            setSelectedAccountForCharge(account);
                            setChargeBreakdown({ efectivo: 0, transferencia: 0, usd: 0, eur: 0 });
                            setShowChargeMixModal(true);
                          }}
                        >
                          Cobrar
                        </Button>
                        <Button
                          size="default"
                          variant="ghost"
                          className="text-xs text-danger hover:text-danger"
                          onClick={() => {
                            setSelectedAccountForCancel(account);
                            setCancelJustification('');
                            setShowCancelJustModal(true);
                          }}
                        >
                          X
                        </Button>
                        </div>
                    </div>
                    {isExpanded && accountItems.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/30 max-h-40 sm:max-h-56 overflow-y-auto">
                        <p className="text-xs font-medium text-text-secondary mb-1">Productos:</p>
                        <div className="space-y-1">
                          {accountItems.map((item, index) => (
                            <div key={`${item.product_id}-${index}`} className="flex items-center justify-between text-xs pl-2 group">
                              <span className="text-text">{item.product_name}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleEditItem(account.id, item)}
                                  className="text-primary hover:text-primary/70 font-medium"
                                  title="Editar cantidad"
                                >
                                  x{item.quantity}
                                </button>
                                <span className="text-text-secondary">
                                  ${(item.unit_price * item.quantity).toFixed(2)}
                                </span>
                                <button
                                  onClick={() => handleDeleteItem(account.id, item)}
                                  className="text-danger hover:text-danger/70 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Eliminar producto"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
              </>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-bg/50 p-3 sm:p-4 text-center transition-all duration-300 hover:border-primary/50 hover:bg-primary/10 hover:shadow-[0_0_15px_-3px_rgba(205,164,52,0.2)] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface"
              >
                <div className="mb-2 rounded-full bg-surface-hover p-3 text-text-secondary transition-colors group-hover:text-primary group-hover:bg-primary/20">
                  <ShoppingCart className="h-6 w-6" />
                </div>
                <h3 className="font-medium text-text line-clamp-2 text-sm">{product.name}</h3>
                <p className="mt-1 font-mono text-sm font-bold text-primary drop-shadow-[0_0_8px_rgba(205,164,52,0.3)]">
                  ${product.price.toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  {product.is_recipe ? (
                    <span className="flex items-center justify-center gap-1">
                      {((product as any).availablePortions > 0) ? (
                        `Rinde: ${(product as any).availablePortions} platos`
                      ) : (
                        <>
                          Agotado
                          <Info
                            size={14}
                            className="cursor-pointer text-amber-500 hover:text-amber-400 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInfoRecipe(product);
                            }}
                          />
                        </>
                      )}
                    </span>
                  ) : `En Tránsito: ${(product as { in_transit?: number }).in_transit || 0} ${product.unit}`}
                </p>
              </button>
            ))}
            {filteredProducts.length === 0 && (
              <div className="col-span-full py-12 text-center text-text-secondary">
                No se encontraron productos.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panel Derecho - Carrito y Cobro */}
      <div className="flex w-full flex-col rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm shadow-sm lg:w-[480px] transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_-5px_rgba(205,164,52,0.15)]">
        <div className="border-b border-border/50 p-4">
          <h2 className="text-lg font-semibold text-text flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary drop-shadow-[0_0_8px_rgba(205,164,52,0.5)]" />
            Carrito Actual
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-0 animate-scrollbar-pulse">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-text-secondary">
              <ShoppingCart className="mb-4 h-12 w-12 opacity-20" />
              <p>El carrito está vacío</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map(item => {
                const baseUnit = normalizeUnit(item.unit);
                const displayUnit = normalizeUnit(item.displayUnit || item.unit);
                const unitType = getUnitType(baseUnit);
                const compatibleUnits = unitType ? getCompatibleUnits(baseUnit).filter(u => u !== 'u' && u !== 'sac' && u !== 'lat') : [];
                const displayQuant = baseUnit !== displayUnit && getUnitType(displayUnit)
                  ? convertUnit(item.quantity, baseUnit, displayUnit)
                  : item.quantity;
                return (
                <div key={item.product_id} className="rounded-lg border border-border bg-bg p-2 sm:p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium text-text text-sm leading-tight flex-1 text-center" title={item.name}>{item.name}</h4>
                    <button 
                      onClick={() => removeFromCart(item.product_id)}
                      className="text-text-secondary hover:text-danger transition-colors p-1 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-xs text-primary shrink-0">${item.price.toFixed(2)}</p>
                    
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => {
                          setRawInputValues(prev => {
                            const next = { ...prev };
                            delete next[item.product_id];
                            return next;
                          });
                          updateQuantity(item.product_id, -1);
                        }}
                        className="rounded-md bg-surface-hover p-1.5 text-text hover:bg-border transition-colors"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={rawInputValues[item.product_id] ?? displayQuant}
                        onChange={(e) => handleQuantityChange(item.product_id, e.target.value)}
                        onBlur={(e) => handleQuantityBlur(item.product_id, e.target.value)}
                        className="w-14 text-center font-mono text-sm border border-border rounded px-1 py-0.5 bg-bg text-text focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button 
                        onClick={() => {
                          setRawInputValues(prev => {
                            const next = { ...prev };
                            delete next[item.product_id];
                            return next;
                          });
                          updateQuantity(item.product_id, 1);
                        }}
                        className="rounded-md bg-surface-hover p-1.5 text-text hover:bg-border transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      
                      {compatibleUnits.length > 1 && (
                        <select
                          value={displayUnit}
                          onChange={(e) => {
                            const newUnit = normalizeUnit(e.target.value);
                            setRawInputValues(prev => {
                              const next = { ...prev };
                              delete next[item.product_id];
                              return next;
                            });
                            setCart(current => current.map(c =>
                              c.product_id === item.product_id ? { ...c, displayUnit: newUnit } : c
                            ));
                          }}
                          className="text-xs rounded border border-border bg-bg px-1 py-1 text-text-secondary hover:border-primary/50 focus:outline-none focus:border-primary"
                        >
                          {compatibleUnits.map(u => (
                            <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    
                    <div className="text-right font-mono font-medium text-sm shrink-0">
                      ${(item.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                </div>
              );})}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-bg/50">
          <button
            type="button"
            onClick={() => setShowSaleDetails(!showSaleDetails)}
            className={`w-full flex items-center justify-between px-4 py-3 transition-all duration-300 ${
              showSaleDetails 
                ? 'bg-bg/80' 
                : 'bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 animate-[glow_2s_ease-in-out_infinite] hover:from-primary/10 hover:via-primary/15 hover:to-primary/10'
            }`}
          >
            <span className="text-sm font-medium text-text-secondary">
              {showSaleDetails ? 'Detalles de Venta' : 'Total'}
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-primary">${total.toFixed(2)}</span>
              <ChevronDown className={`h-4 w-4 text-primary transition-transform duration-300 ${showSaleDetails ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {showSaleDetails && (
            <div className="max-h-[280px] overflow-y-auto p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label htmlFor="saleType" className="text-xs font-medium text-text-secondary block mb-1">Tipo de Venta</label>
                <select 
                  id="saleType"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={saleType}
                  onChange={e => setSaleType(e.target.value as 'SALON' | 'DOMICILIO' | 'BAR' | 'VENTA_RAPIDA')}
                >
                  <option value="SALON">Salón</option>
                  <option value="DOMICILIO">Domicilio</option>
                  <option value="BAR">Bar</option>
                  <option value="VENTA_RAPIDA">Venta Rápida</option>
                </select>
              </div>
              <div>
                <label htmlFor="seller" className="text-xs font-medium text-text-secondary block mb-1">Vendedor</label>
                <select
                  id="seller" 
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={employeeId}
                  onChange={e => handleEmployeeChange(e.target.value)}
                >
                  <option value="">{user ? `Dueño: ${user.name}` : '(Yo)'}</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.role}: {emp.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {saleType === 'DOMICILIO' && (
              <div className="mt-3 p-3 rounded-lg bg-bg/50 border border-border/50">
                <label className="text-xs font-medium text-text-secondary block mb-1">
                  Costo Domicilio (para el motorista)
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="w-full h-9 font-mono"
                  value={deliveryFee || ''}
                  onChange={e => setDeliveryFee(Number(e.target.value))}
                  placeholder="0.00"
                />
              </div>
            )}

            <div className="flex items-center gap-2 mt-3">
              <input
                type="checkbox"
                id="accountHouse"
                checked={isAccountHouse}
                disabled={selectedPendingAccount ? (pendingAccounts.find(a => a.id === selectedPendingAccount)?.items || []).length > 0 : false}
                onChange={e => setIsAccountHouse(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <label htmlFor="accountHouse" className={`text-sm ${selectedPendingAccount ? ((pendingAccounts.find(a => a.id === selectedPendingAccount)?.items || []).length > 0 ? 'text-text-secondary' : 'text-text') : 'text-text'}`}>
                Cuenta Casa
                {selectedPendingAccount && (pendingAccounts.find(a => a.id === selectedPendingAccount)?.items || []).length > 0 && (
                  <span className="text-xs ml-1 text-warning">(usar botón CC)</span>
                )}
              </label>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Subtotal</span>
              <span className="font-mono">${subtotal.toFixed(2)}</span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Descuento ($)</span>
              <Input 
                type="number" 
                min={0} 
                step="0.01" 
                className="w-24 h-8 text-right font-mono" 
                value={discount || ''} 
                onChange={e => setDiscount(Math.min(Number(e.target.value), subtotal))}
              />
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-lg font-bold text-text">Total</span>
              <span className="text-2xl font-mono font-bold text-primary">${total.toFixed(2)}</span>
            </div>
            </div>
          )}

          <div className="p-4">
            <Button 
              className="w-full h-12 text-base gap-2" 
              onClick={handleCheckout}
              disabled={cart.length === 0 || isSellingBlocked || isProcessingSale}
            >
              {isProcessingSale ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CreditCard className="h-5 w-5" />
              )}
              {isProcessingSale ? 'Procesando...' : isSellingBlocked ? 'Día Cerrado' : 'Agregar Venta'}
            </Button>
          </div>
        </div>
      </div>

      {/* Checkout Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm modal-backdrop">
          <div className="w-full max-w-md max-h-[95vh] md:max-h-[85vh] overflow-y-auto overscroll-contain rounded-2xl border border-border/50 bg-surface p-3 md:p-6 shadow-2xl">
            <div className="mb-4 md:mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-text">Resumen de Venta</h2>
              <button
                onClick={() => {
                  setShowPreview(false);
                  setPaymentError(null);
                  setPaymentWarning(null);
                  setSalePaymentMethod({ efectivo: 0, transferencia: 0, usd: 0, eur: 0 });
                }}
                className="rounded-full p-2 text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 md:mb-6 space-y-2 md:space-y-3">
              {cart.map(item => (
                <div key={item.product_id} className="flex justify-between text-sm border-b border-border/50 pb-2">
                  <div className="flex gap-2 text-text">
                    <span className="font-mono text-primary">{item.quantity}x</span>
                    <span>{item.name}</span>
                  </div>
                  <span className="font-mono text-text-secondary">${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2 md:space-y-3 rounded-xl bg-bg/50 p-3 md:p-4 mb-4 md:mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Subtotal:</span>
                <span className="font-mono text-text">${subtotal.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-danger">
                  <span>Descuento:</span>
                  <span className="font-mono">-${discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-border/50 pt-2">
                <span className="text-text-secondary">Costo Total:</span>
                <span className="font-mono text-text-secondary">
                  ${cart.reduce((sum, item) => sum + (item.cost * item.quantity), 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-success">Ganancia:</span>
                <span className="font-mono text-success">
                  {isAccountHouse ? '$0.00' : `$${(total - cart.reduce((sum, item) => sum + (item.cost * item.quantity), 0)).toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Margen de Ganancia:</span>
                <span className="font-mono text-text-secondary">
                  {isAccountHouse ? '0%' : (total > 0 ? (((total - cart.reduce((sum, item) => sum + (item.cost * item.quantity), 0)) / total) * 100).toFixed(1) : 0) + '%'}
                </span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t border-border/50 pt-2">
                <span className="text-text">Total a Cobrar:</span>
                <span className="font-mono text-primary">
                  {isAccountHouse ? '$0.00' : `$${total.toFixed(2)}`}
                </span>
              </div>
            </div>

            {!isAccountHouse && (
            <div className="mb-3 md:mb-4 p-3 md:p-4 rounded-xl bg-bg/50 border border-border/30">
              <h4 className="text-sm font-semibold text-text mb-2 md:mb-3 flex items-center gap-2">
                Método de Pago <span className="text-danger">*</span>
              </h4>
              <p className="text-xs text-text-secondary mb-2 md:mb-3">Especifique el desglose del pago realizado por el cliente</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
                <div>
                  <label className="text-xs text-text-secondary block mb-1">Efectivo (CUP)</label>
                  <NumberInput
                    min={0}
                    max={calculateFieldMax('efectivo', salePaymentMethod, total, user?.usdRate || 0, user?.eurRate || 0, !!user?.cupTransferEnabled, !!user?.usdEnabled, !!user?.eurEnabled)}
                    className="font-mono"
                    value={salePaymentMethod.efectivo || 0}
                    onValueChange={v => {
                      setSalePaymentMethod(prev => ({...prev, efectivo: v}));
                      setPaymentError(null);
                      setPaymentWarning(null);
                    }}
                    onClamp={showPaymentClampWarning}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                  />
                </div>
                {user?.cupTransferEnabled && (
                <div>
                  <label className="text-xs text-text-secondary block mb-1">Transferencia (CUP)</label>
                  <NumberInput
                    min={0}
                    max={calculateFieldMax('transferencia', salePaymentMethod, total, user?.usdRate || 0, user?.eurRate || 0, !!user?.cupTransferEnabled, !!user?.usdEnabled, !!user?.eurEnabled)}
                    className="font-mono"
                    value={salePaymentMethod.transferencia || 0}
                    onValueChange={v => {
                      setSalePaymentMethod(prev => ({...prev, transferencia: v}));
                      setPaymentError(null);
                      setPaymentWarning(null);
                    }}
                    onClamp={showPaymentClampWarning}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                  />
                </div>
                )}
                {user?.usdEnabled && (
                <div>
                  <label className="text-xs text-text-secondary block mb-1">USD (1 USD = {user.usdRate} CUP)</label>
                  <NumberInput
                    min={0}
                    max={calculateFieldMax('usd', salePaymentMethod, total, user?.usdRate || 0, user?.eurRate || 0, !!user?.cupTransferEnabled, !!user?.usdEnabled, !!user?.eurEnabled)}
                    className="font-mono"
                    value={salePaymentMethod.usd || 0}
                    onValueChange={v => {
                      setSalePaymentMethod(prev => ({...prev, usd: v}));
                      setPaymentError(null);
                      setPaymentWarning(null);
                    }}
                    onClamp={showPaymentClampWarning}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                  />
                </div>
                )}
                {user?.eurEnabled && (
                <div>
                  <label className="text-xs text-text-secondary block mb-1">EUR (1 EUR = {user.eurRate} CUP)</label>
                  <NumberInput
                    min={0}
                    max={calculateFieldMax('eur', salePaymentMethod, total, user?.usdRate || 0, user?.eurRate || 0, !!user?.cupTransferEnabled, !!user?.usdEnabled, !!user?.eurEnabled)}
                    className="font-mono"
                    value={salePaymentMethod.eur || 0}
                    onValueChange={v => {
                      setSalePaymentMethod(prev => ({...prev, eur: v}));
                      setPaymentError(null);
                      setPaymentWarning(null);
                    }}
                    onClamp={showPaymentClampWarning}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                  />
                </div>
                )}
              </div>
              {paymentError && (
                <div className="mt-3 p-3 rounded-lg bg-danger/10 border border-danger/30">
                  <p className="text-sm text-danger font-medium">{paymentError}</p>
                </div>
              )}
              {paymentWarning && (
                <div className="mt-3 p-3 rounded-lg bg-warning/10 border border-warning/30">
                  <p className="text-sm text-warning font-medium">{paymentWarning}</p>
                </div>
              )}
              <div className="mt-3 pt-2 border-t border-border/30 flex justify-between text-sm">
                <span className="text-text-secondary">Total registrado:</span>
                <span className="font-mono text-text">
                  ${formatNumber((Number(user?.usdEnabled ? salePaymentMethod.usd : 0) || 0) * (Number(user?.usdRate) || 0) + (Number(user?.eurEnabled ? salePaymentMethod.eur : 0) || 0) * (Number(user?.eurRate) || 0) + (Number(salePaymentMethod.efectivo) || 0) + (Number(user?.cupTransferEnabled ? salePaymentMethod.transferencia : 0) || 0), 6)}
                </span>
              </div>
            </div>
            )}

            <div className="mb-4 md:mb-6 text-sm text-text-secondary bg-surface-hover p-3 rounded-lg">
              <p><span className="font-medium text-text">Vendedor:</span> {sellerName}</p>
              <p><span className="font-medium text-text">Tipo:</span> {saleType === 'SALON' ? 'En Salón' : saleType === 'DOMICILIO' ? 'A Domicilio' : saleType === 'BAR' ? 'Bar' : saleType === 'VENTA_RAPIDA' ? 'Venta Rápida' : 'Venta'}</p>
            </div>

            <div className="mb-3 md:mb-4 p-3 bg-surface-hover rounded-lg">
              <div className="flex items-center justify-between mb-1 md:mb-2">
                <label className="text-sm font-medium text-text">Cliente:</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-primary hover:text-primary/80"
                  onClick={() => setShowNewPendingModal(true)}
                >
                  <PlusCircle className="h-3 w-3 mr-1" />
                  Nueva Cuenta
                </Button>
              </div>
              <select
                value={selectedPendingAccount}
                onChange={e => setSelectedPendingAccount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-bg text-text text-sm"
              >
                <option value="">Venta directa (sin cuenta)</option>
                {pendingAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.client_name} (${(account.total_amount || 0).toFixed(2)})
                  </option>
                ))}
              </select>
              <p className="text-xs text-text-secondary mt-1">
                Seleccione una cuenta pendiente para cobrarla, o «Venta directa» para vender sin cuenta.
              </p>
            </div>

            {selectedPendingAccount && (() => {
              const selectedAccount = pendingAccounts.find(a => a.id === selectedPendingAccount);
              const accountItems = selectedAccount ? selectedAccount.items : [];
              return selectedAccount && accountItems.length > 0 ? (
                <div className="mb-3 md:mb-4 p-3 bg-surface-hover rounded-lg border border-border/30">
                  <p className="text-sm font-medium text-text mb-2">
                    Pedidos de {selectedAccount.client_name}:
                  </p>
                  <div className="space-y-2 max-h-40 sm:max-h-56 overflow-y-auto">
                    {accountItems.map((item: any, index: number) => (
                      <div key={`${item.product_id}-${index}`} className="flex justify-between text-sm">
                        <span className="text-text">{item.quantity}x {item.product_name}</span>
                        <span className="font-mono text-text-secondary">${item.subtotal.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-bold text-text mt-2 pt-2 border-t border-border/50">
                    <span>Total:</span>
                    <span className="font-mono text-primary">${selectedAccount.total_amount.toFixed(2)}</span>
                  </div>
                </div>
              ) : null;
            })()}

            {pendingAccounts && pendingAccounts.length > 0 && (
              <div className="mb-3 md:mb-4 p-3 bg-warning/10 rounded-lg border border-warning/30">
                <p className="text-xs font-medium text-warning mb-2">Cuentas Pendientes</p>
                <div className="space-y-2 max-h-32 sm:max-h-48 overflow-y-auto">
                  {pendingAccounts.map(account => {
                    const accountItems = account.items || [];
                    return (
                      <div key={account.id} className="flex items-center justify-between text-xs p-2 bg-surface rounded">
                        <div className="flex-1">
                          <p className="font-medium text-text">{account.client_name}</p>
                          <p className="text-text-secondary">
{accountItems.length} productos - ${(account.total_amount || 0).toFixed(2)}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            className="h-6 text-xs bg-success hover:bg-success/80"
                            onClick={() => {
                              const selectedEmp = employees.find(e => e.id === employeeId);
                              setSelectedAccountForCharge({
                                ...account,
                                employeeId: employeeId || user?.id || '',
                                employeeName: selectedEmp ? selectedEmp.name : (user?.name || 'Vendedor')
                              });
                              setChargeBreakdown({ efectivo: 0, transferencia: 0, usd: 0, eur: 0 });
                              setShowChargeMixModal(true);
                            }}
                          >
                            Cobrar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs text-danger border-danger hover:bg-danger/10"
                            onClick={() => {
                              setPendingCancelAccount(account);
                            }}
                          >
                            X
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowPreview(false);
                  setPaymentError(null);
                  setPaymentWarning(null);
                  setSalePaymentMethod({ efectivo: 0, transferencia: 0, usd: 0, eur: 0 });
                }}
              >
                Cancelar
              </Button>
              {selectedPendingAccount ? (
                <Button
                  className="flex-1 gap-2"
                  onClick={async () => {
                    if (cart.length === 0) {
                      toast.error('Agregue productos al carrito');
                      return;
                    }
                    const items = cart.map(item => ({
                      product_id: item.product_id,
                      product_name: item.name,
                      quantity: item.quantity,
                      unit_price: item.price,
                      subtotal: item.price * item.quantity,
                      is_recipe: item.is_recipe || false,
                      recipe_snapshot: item.recipe_snapshot || undefined,
                    }));
                    const accountExists = pendingAccounts.some(a => a.id === selectedPendingAccount);
                    if (!accountExists) {
                      toast.error('La cuenta ya no está disponible. Seleccione o cree una nueva.');
                      setSelectedPendingAccount('');
                      return;
                    }
                    const result = await addItemsToPendingAccount(selectedPendingAccount, items, isAccountHouse, saleType);
                    if (result.success) {
                      const cartItems = cart.map(item => ({
                        name: item.name,
                        quantity: item.quantity,
                        unitPrice: item.price,
                        subtotal: item.price * item.quantity
                      }));
                      const totalItems = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
                      
                      setCart([]);
                      setShowPreview(false);
                      setPaymentError(null);
                      setPaymentWarning(null);
                      setSalePaymentMethod({ efectivo: 0, transferencia: 0, usd: 0, eur: 0 });
                      toast.success('Productos agregados a la cuenta');

                      if (user?.generateTicket && cartItems.length > 0) {
                        const selectedEmployee = employees.find(e => e.id === employeeId);
                        const empName = selectedEmployee ? selectedEmployee.name : (user.name || 'Vendedor');
                        setPreticketData({
                          items: cartItems,
                          total: totalItems,
                          employeeName: empName,
                          businessName: user.businessName || 'Mi Negocio',
                          saleLabel: 'Cuenta Pendiente',
                          isPreticket: true,
                          isPendingAccount: true,
                          employeeRole: selectedEmployee ? selectedEmployee.role : (user.name ? 'Dueño' : ''),
                          date: new Date(closingDate + 'T' + new Date().toTimeString().slice(0,8))
                        });
                        setShowPreticket(true);
                      }
                    } else {
                      toast.error(result.error || 'Error al agregar productos');
                    }
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Agregar a Cuenta
                </Button>
              ) : (
                <Button
                  className="flex-1 gap-2"
                  onClick={confirmSale}
                >
                  <CreditCard className="h-4 w-4" />
                  Confirmar Venta
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Popover de ingredientes faltantes para recetas agotadas */}
      {infoRecipe && infoRecipe.missingIngredients && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setInfoRecipe(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-text">Falta para "{infoRecipe.name}"</h3>
              <button onClick={() => setInfoRecipe(null)} className="text-text-secondary hover:text-text transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="space-y-3">
              {infoRecipe.missingIngredients.map((mi: any) => (
                <li key={mi.productId} className="flex items-start gap-2 text-sm border-b border-border/30 pb-2 last:border-0 last:pb-0">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-text">{mi.productName}</span>
                    <span className="text-text-secondary"> — 0 {mi.unit} en tránsito</span>
                    <br />
                    <span className="text-xs text-text-secondary">Requiere {mi.needed} {mi.unit} por plato</span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-text-secondary text-center">
              Registre un "Movimiento de Salida" para estos productos y aparecerán en "Tránsito".
            </p>
          </div>
        </div>
      )}

      {/* Cierre de Caja Modal */}
      {showClosingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm modal-backdrop">
          <div className="w-full max-w-md max-h-[95vh] md:max-h-[85vh] overflow-y-auto overscroll-contain rounded-2xl border border-border/50 bg-surface p-3 md:p-6 shadow-2xl">
            <div className="mb-4 md:mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-text">Cierre de Caja</h2>
                <p className="text-sm text-text-secondary">{closingDate}{doubleShiftEnabled ? ` · Turno ${targetShift}` : ''}</p>
              </div>
              <button
                onClick={() => setShowClosingModal(false)}
                className="rounded-full p-2 text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 md:space-y-3 rounded-xl bg-bg/50 p-3 md:p-4 mb-4 md:mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Ventas registradas:</span>
                <span className="font-mono text-text">{closingSales.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Total Ventas:</span>
                <span className="font-mono text-text">${todayTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-danger">
                <span>Descuentos:</span>
                <span className="font-mono">-${todayDiscounts.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-text-secondary">
                <span>Devoluciones:</span>
                <span className="font-mono">$${todayRefunds.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t border-border/50 pt-2">
                <span className="text-text">Total en Caja:</span>
                <span className="font-mono text-primary">${closingAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-semibold text-text mb-3">Desgloce por Moneda</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-secondary block mb-1">CUP Efectivo</label>
                  <Input
                    type="number"
                    min={0}
                    className="font-mono"
                    value={currencyBreakdown.cupEfectivo || ''}
                    onChange={e => setCurrencyBreakdown({...currencyBreakdown, cupEfectivo: Number(e.target.value)})}
                    placeholder="0.00"
                  />
                </div>
                {user?.cupTransferEnabled && (
                <div>
                  <label className="text-xs text-text-secondary block mb-1">CUP Transferencia</label>
                  <Input
                    type="number"
                    min={0}
                    className="font-mono"
                    value={currencyBreakdown.cupTransfer || ''}
                    onChange={e => setCurrencyBreakdown({...currencyBreakdown, cupTransfer: Number(e.target.value)})}
                    placeholder="0.00"
                  />
                </div>
                )}
                {user?.usdEnabled && (
                <div>
                  <label className="text-xs text-text-secondary block mb-1">USD</label>
                  <Input
                    type="number"
                    min={0}
                    className="font-mono"
                    value={currencyBreakdown.usd || ''}
                    onChange={e => setCurrencyBreakdown({...currencyBreakdown, usd: Number(e.target.value)})}
                    placeholder="0.00"
                  />
                </div>
                )}
                {user?.eurEnabled && (
                <div>
                  <label className="text-xs text-text-secondary block mb-1">EUR</label>
                  <Input
                    type="number"
                    min={0}
                    className="font-mono"
                    value={currencyBreakdown.eur || ''}
                    onChange={e => setCurrencyBreakdown({...currencyBreakdown, eur: Number(e.target.value)})}
                    placeholder="0.00"
                  />
                </div>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs font-medium text-text-secondary block mb-1">Notas (opcional)</label>
              <textarea
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none resize-none"
                rows={2}
                value={closingNotes}
                onChange={e => setClosingNotes(e.target.value)}
                placeholder="Observaciones del cierre..."
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowClosingModal(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => {
                  if (closingLoading) return;
                  safeExecute(
                    () => confirmClosing(false),
                    setClosingLoading,
                    () => {
                      setShowClosingModal(false);
                      getDailyClosings().catch(() => {});
                    },
                    `Cierre de caja del ${closingDate} registrado`
                  );
                }}
                disabled={closingLoading}
              >
                <DollarSign className="h-4 w-4" />
                {closingLoading ? 'Registrando...' : 'Confirmar Cierre'}
              </Button>
            </div>
          </div>
</div>
        )}
      
      {showTicket && ticketData && (
        <TicketView
          ticketData={ticketData}
          onClose={() => { setShowTicket(false); setLastSaleId(null); }}
          saleId={lastSaleId}
        />
      )}

      {showPreticket && preticketData && (
        <TicketView
          ticketData={preticketData}
          onClose={() => setShowPreticket(false)}
          isPreticket={true}
        />
      )}

      {showNewPendingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm modal-backdrop">
          <div className="w-full max-w-md max-h-[95vh] md:max-h-[85vh] overflow-y-auto overscroll-contain rounded-2xl border border-border/50 bg-surface p-3 md:p-6 shadow-2xl">
            <div className="mb-4 md:mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-text">Nueva Cuenta Pendiente</h2>
                <p className="text-sm text-text-secondary">Ingrese el nombre del cliente</p>
              </div>
              <button
                onClick={() => { setShowNewPendingModal(false); setNewPendingName(''); }}
                className="rounded-full p-2 text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 md:mb-6">
              <label className="text-sm font-medium text-text mb-2 block">Nombre del Cliente</label>
              <Input
                value={newPendingName}
                onChange={e => setNewPendingName(e.target.value)}
                placeholder="Ej: Mesa 3, Juan Pérez, Cliente mostrador..."
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setShowNewPendingModal(false); setNewPendingName(''); }}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 gap-2"
                disabled={isCreatingPending}
                onClick={async () => {
                  if (!newPendingName.trim()) {
                    toast.error('Ingrese un nombre para el cliente');
                    return;
                  }
                  if (isCreatingPending) return;
                  
                  setIsCreatingPending(true);
                  try {
                    const result = await createPendingAccount(newPendingName.trim());
                    if (result.success) {
                      if (result.accountId) {
                        setSelectedPendingAccount(result.accountId);
                      }
                      setShowNewPendingModal(false);
                      setNewPendingName('');
                      toast.success('Cuenta creada');
                    } else {
                      toast.error(result.error || 'Error al crear cuenta');
                    }
                  } catch (error: any) {
                    if (import.meta.env.DEV) console.error('Error:', error);
      toast.error('Error de conexión. Intente de nuevo.');
                  } finally {
                    setIsCreatingPending(false);
                  }
                }}
              >
                {isCreatingPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isCreatingPending ? 'Creando...' : 'Crear Cuenta'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cobro Mixto */}
      {showChargeMixModal && selectedAccountForCharge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm modal-backdrop">
          <div className="w-full max-w-md rounded-2xl border border-border/50 bg-surface p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-text">Cobrar Cuenta</h2>
                <p className="text-sm text-text-secondary">{selectedAccountForCharge.client_name}</p>
              </div>
              <button
                onClick={() => {
                  setShowChargeMixModal(false);
                  setSelectedAccountForCharge(null);
                  setChargeBreakdown({ efectivo: 0, transferencia: 0, usd: 0, eur: 0 });
                  setIsProcessingCharge(false);
                }}
                className="rounded-full p-2 text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 p-4 rounded-xl bg-bg/50">
              <div className="flex justify-between text-lg font-bold">
                <span className="text-text">Total a cobrar:</span>
                <span className="font-mono text-primary">${(selectedAccountForCharge.total_amount || 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm text-text-secondary block mb-1">Efectivo (CUP)</label>
                <NumberInput
                  min={0}
                  max={calculateFieldMax('efectivo', chargeBreakdown, selectedAccountForCharge.total_amount || 0, user?.usdRate || 0, user?.eurRate || 0, !!user?.cupTransferEnabled, !!user?.usdEnabled, !!user?.eurEnabled)}
                  className="font-mono"
                  value={chargeBreakdown.efectivo || 0}
                  onValueChange={v => setChargeBreakdown(prev => ({...prev, efectivo: v}))}
                  onClamp={showPaymentClampWarning}
                  placeholder="0.00"
                />
              </div>
              {user?.cupTransferEnabled && (
              <div>
                <label className="text-sm text-text-secondary block mb-1">Transferencia (CUP)</label>
                <NumberInput
                  min={0}
                  max={calculateFieldMax('transferencia', chargeBreakdown, selectedAccountForCharge.total_amount || 0, user?.usdRate || 0, user?.eurRate || 0, !!user?.cupTransferEnabled, !!user?.usdEnabled, !!user?.eurEnabled)}
                  className="font-mono"
                  value={chargeBreakdown.transferencia || 0}
                  onValueChange={v => setChargeBreakdown(prev => ({...prev, transferencia: v}))}
                  onClamp={showPaymentClampWarning}
                  placeholder="0.00"
                />
              </div>
              )}
              {user?.usdEnabled && (
              <div>
                <label className="text-sm text-text-secondary block mb-1">USD (1 USD = {user.usdRate} CUP)</label>
                <NumberInput
                  min={0}
                  max={calculateFieldMax('usd', chargeBreakdown, selectedAccountForCharge.total_amount || 0, user?.usdRate || 0, user?.eurRate || 0, !!user?.cupTransferEnabled, !!user?.usdEnabled, !!user?.eurEnabled)}
                  className="font-mono"
                  value={chargeBreakdown.usd || 0}
                  onValueChange={v => setChargeBreakdown(prev => ({...prev, usd: v}))}
                  onClamp={showPaymentClampWarning}
                  placeholder="0.00"
                />
              </div>
              )}
              {user?.eurEnabled && (
              <div>
                <label className="text-sm text-text-secondary block mb-1">EUR (1 EUR = {user.eurRate} CUP)</label>
                <NumberInput
                  min={0}
                  max={calculateFieldMax('eur', chargeBreakdown, selectedAccountForCharge.total_amount || 0, user?.usdRate || 0, user?.eurRate || 0, !!user?.cupTransferEnabled, !!user?.usdEnabled, !!user?.eurEnabled)}
                  className="font-mono"
                  value={chargeBreakdown.eur || 0}
                  onValueChange={v => setChargeBreakdown(prev => ({...prev, eur: v}))}
                  onClamp={showPaymentClampWarning}
                  placeholder="0.00"
                />
              </div>
              )}
              <div className="pt-2 border-t border-border">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Total registrado:</span>
                  <span className="font-mono text-text">${formatNumber((Number(user?.usdEnabled ? chargeBreakdown.usd : 0) || 0) * (Number(user?.usdRate) || 0) + (Number(user?.eurEnabled ? chargeBreakdown.eur : 0) || 0) * (Number(user?.eurRate) || 0) + (Number(chargeBreakdown.efectivo) || 0) + (Number(user?.cupTransferEnabled ? chargeBreakdown.transferencia : 0) || 0), 6)}</span>
                </div>
                {(() => {
                  const totalPaid = Math.round(((Number(user?.usdEnabled ? chargeBreakdown.usd : 0) || 0) * (Number(user?.usdRate) || 0)
                    + (Number(user?.eurEnabled ? chargeBreakdown.eur : 0) || 0) * (Number(user?.eurRate) || 0)
                    + (Number(chargeBreakdown.efectivo) || 0)
                    + (Number(user?.cupTransferEnabled ? chargeBreakdown.transferencia : 0) || 0)) * 1e6) / 1e6;
                  const accountTotal = Math.round((selectedAccountForCharge?.total_amount || 0) * 1e6) / 1e6;
                  const excedente = Math.round((totalPaid - accountTotal) * 1e6) / 1e6;
                  if (excedente > 0.000001) {
                    return (
                      <p className="text-xs text-warning mt-2 flex items-start gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>Excedente de <span className="font-mono font-semibold">${formatNumber(excedente, 6)}</span>: se registrará como cambio/devuelta, no como venta.</span>
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowChargeMixModal(false);
                  setSelectedAccountForCharge(null);
                  setChargeBreakdown({ efectivo: 0, transferencia: 0, usd: 0, eur: 0 });
                  setIsProcessingCharge(false);
                }}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={async () => {
                  if (isProcessingCharge) return;
                  setIsProcessingCharge(true);
                  
                  try {
                    const totalPaid = Math.round((chargeBreakdown.efectivo + 
                      (user?.cupTransferEnabled ? chargeBreakdown.transferencia : 0) + 
                      (user?.usdEnabled ? chargeBreakdown.usd * (user?.usdRate || 0) : 0) +
                      (user?.eurEnabled ? chargeBreakdown.eur * (user?.eurRate || 0) : 0)) * 1e6) / 1e6;
                    const accountTotal = Math.round((selectedAccountForCharge.total_amount || 0) * 1e6) / 1e6;
                    if (totalPaid < accountTotal) {
                      toast.error('El total pagado es menor al total de la cuenta');
                      setIsProcessingCharge(false);
                      return;
                    }
                    const selectedEmp = employees.find(e => e.id === employeeId);
                    const paymentMethodStr = `Efectivo: ${chargeBreakdown.efectivo}${user?.cupTransferEnabled ? `, Transfer: ${chargeBreakdown.transferencia}` : ''}${user?.usdEnabled ? `, USD: ${chargeBreakdown.usd}` : ''}${user?.eurEnabled ? `, EUR: ${chargeBreakdown.eur}` : ''}`;
                    const result = await chargePendingAccount(
                      selectedAccountForCharge.id,
                      employeeId || user?.id || '',
                      selectedEmp ? selectedEmp.name : (user?.name || 'Vendedor'),
                      closingDate,
                      paymentMethodStr,
                      chargeBreakdown.efectivo || 0,
                      chargeBreakdown.transferencia || 0,
                      chargeBreakdown.usd || 0,
                      chargeBreakdown.eur || 0
                    );
                    if (result.success) {
                      try {
                        toast.success('Cuenta cobrada');
                        const isAccHouse = selectedAccountForCharge.is_account_house;
                        if (navigator.onLine) {
                          try {
                            await useDatabaseStore.getState().logAction('sales', 'COBRO', {
                              client_name: selectedAccountForCharge.client_name,
                              total: accountTotal,
                              payment_method: paymentMethodStr,
                              is_account_house: isAccHouse
                            });
                          } catch (logErr) {
                            if (import.meta.env.DEV) console.warn('[logAction] Error (offline?):', logErr);
                          }
                        }
                        setTicketData({
                          items: (selectedAccountForCharge.items || []).map((item: any) => ({
                            name: item.product_name,
                            quantity: item.quantity,
                            unitPrice: item.unit_price,
                            subtotal: item.subtotal
                          })),
                          total: isAccHouse ? 0 : accountTotal,
                          employeeName: selectedEmp ? selectedEmp.name : (user?.name || 'Vendedor'),
                          businessName: user?.businessName || 'Mi Negocio',
                          ticketMessage: user?.ticketMessage || '¡Gracias por su visita!',
                          saleType: selectedAccountForCharge.sale_type || 'SALON',
                          isAccountHouse: isAccHouse,
                          paymentBreakdown: chargeBreakdown,
                          employeeRole: selectedEmp ? selectedEmp.role : (user?.name ? 'Dueño' : ''),
                          date: new Date(closingDate + 'T' + new Date().toTimeString().slice(0,8))
                        });
                        setShowTicket(true);
                        setSelectedAccountForCharge(null);
                        setSelectedPendingAccount('');
                        setChargeBreakdown({ efectivo: 0, transferencia: 0, usd: 0, eur: 0 });
                      } catch (successErr) {
                        if (import.meta.env.DEV) console.error('[SalesView] Error en flujo success:', successErr);
                        setSelectedAccountForCharge(null);
                        setSelectedPendingAccount('');
                        setChargeBreakdown({ efectivo: 0, transferencia: 0, usd: 0, eur: 0 });
                      } finally {
                        setShowChargeMixModal(false);
                        setIsProcessingCharge(false);
                      }
                    } else {
                      toast.error(result.error || 'Error al cobrar');
                      setIsProcessingCharge(false);
                    }
                  } catch (err) {
                    if (import.meta.env.DEV) console.error('[SalesView] Error en cobro:', err);
                    toast.error('Error al procesar el cobro');
                    setIsProcessingCharge(false);
                  }
                }}
              >
                {isProcessingCharge ? 'Cobrando...' : 'Confirmar Cobro'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Justificación para Cancelar */}
      {showCancelJustModal && selectedAccountForCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm modal-backdrop">
          <div className="w-full max-w-md rounded-2xl border border-border/50 bg-surface p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-text">Cancelar Cuenta</h2>
                <p className="text-sm text-text-secondary">{selectedAccountForCancel.client_name}</p>
              </div>
              <button
                onClick={() => setShowCancelJustModal(false)}
                className="rounded-full p-2 text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 p-4 rounded-xl bg-danger/10 border border-danger/30">
              <p className="text-sm text-danger">
                La cuenta será cancelada y no se descontará del inventario.
              </p>
            </div>

            <div className="mb-6">
              <label className="text-sm font-medium text-text mb-2 block">Motivo de cancelación *</label>
              <textarea
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none resize-none"
                rows={3}
                value={cancelJustification}
                onChange={e => setCancelJustification(e.target.value)}
                placeholder="Ej: Cliente no pagó, Deuda condonada, Cliente se fue del país..."
                required
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowCancelJustModal(false)}
              >
                Volver
              </Button>
              <Button
                className="flex-1 gap-2 bg-danger hover:bg-danger/80"
                disabled={!cancelJustification.trim()}
                onClick={async () => {
                  const result = await useDatabaseStore.getState().deletePendingAccount(selectedAccountForCancel.id);
                  if (result.success) {
                    if (navigator.onLine) {
                      try {
                        await useDatabaseStore.getState().logAction('sales', 'CANCELAR_CUENTA', {
                          client_name: selectedAccountForCancel.client_name,
                          total: selectedAccountForCancel.total_amount || 0,
                          justification: cancelJustification
                        });
                      } catch (logErr) {
                        if (import.meta.env.DEV) console.warn('[logAction] Error (offline?):', logErr);
                      }
                    }
                    toast.success('Cuenta cancelada');
                    setShowCancelJustModal(false);
                  } else {
                    toast.error(result.error || 'Error');
                  }
                }}
              >
                Cancelar Cuenta
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Advertencia de Cierre - Diseño Profesional */}
      {showClosingWarning && closingWarningData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm modal-backdrop">
          <div className="w-full max-w-md rounded-2xl border border-warning/50 bg-surface p-6 shadow-2xl">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/20">
                <span className="text-2xl">⚠️</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-text">Desgloce No Cuadra</h2>
                <p className="text-sm text-text-secondary">Diferencia en el cierre de caja</p>
              </div>
            </div>

            <div className="mb-6 rounded-xl bg-bg/50 p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-text-secondary">Total en desglose:</span>
                <span className="font-mono font-medium text-text">${closingWarningData.breakdown.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Total de ventas:</span>
                <span className="font-mono font-medium text-text">${closingWarningData.expected.toFixed(2)}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="text-text font-medium">Diferencia:</span>
                <span className="font-mono font-bold text-danger">${Math.abs(closingWarningData.breakdown - closingWarningData.expected).toFixed(2)} CUP</span>
              </div>
            </div>

            <p className="text-sm text-text-secondary mb-6 text-center">
              El total del desglose no coincide con las ventas del día. ¿Desea continuar de todos modos?
            </p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowClosingWarning(false);
                  setClosingWarningData(null);
                }}
              >
                Corregir
              </Button>
              <Button
                className="flex-1 gap-2 bg-warning hover:bg-warning/80 text-black"
                onClick={() => {
                  setShowClosingWarning(false);
                  setClosingWarningData(null);
                  confirmClosing(true); // Skip validation since el usuario ya aceptó la advertencia
                }}
              >
                Continuar Así
              </Button>
            </div>
          </div>
        </div>
      )}
    {showEditItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm modal-backdrop">
          <div className="w-full max-w-sm mx-4 bg-surface rounded-xl shadow-2xl border border-border/50 p-6">
            <h3 className="text-lg font-semibold text-text mb-4">Editar Producto</h3>
            <p className="text-sm text-text-secondary mb-4">
              {editingItem?.name || editingItem?.product_name}
            </p>
              <div className="space-y-4">
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const editingItemProduct = editingItem?.product_id ? products.find(p => p.id === editingItem.product_id) : undefined;
                    const editingItemUnit = editingItemProduct?.unit;
                    const step = getUnitStep(editingItemUnit, editingItemProduct?.is_recipe);
                    setEditItemQuantity(Math.max(0.001, editItemQuantity - step));
                  }}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min="0.001"
                  value={editItemQuantity}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setEditItemQuantity(isNaN(val) || val <= 0 ? 0.001 : val);
                  }}
                  className="w-20 text-center text-lg"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const editingItemProduct = editingItem?.product_id ? products.find(p => p.id === editingItem.product_id) : undefined;
                    const editingItemUnit = editingItemProduct?.unit;
                    const step = getUnitStep(editingItemUnit, editingItemProduct?.is_recipe);
                    setEditItemQuantity(editItemQuantity + step);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-center text-sm text-text-secondary">
                Total: ${((editingItem?.price || editingItem?.unit_price || 0) * editItemQuantity).toFixed(2)}
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowEditItemModal(false);
                  setEditingItem(null);
                  setEditingItemAccountId(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handleSaveEditItem}
              >
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>

    <ConfirmDialog
      isOpen={!!pendingCancelAccount}
      onClose={() => setPendingCancelAccount(null)}
      title="Cancelar cuenta"
      description="¿Cancelar esta cuenta? No se descontará inventario."
      confirmLabel="Cancelar cuenta"
      onConfirm={async () => {
        const account = pendingCancelAccount;
        setPendingCancelAccount(null);
        if (!account) return;
        const result = await useDatabaseStore.getState().deletePendingAccount(account.id);
        if (result.success) {
          if (selectedPendingAccount === account.id) {
            setSelectedPendingAccount('');
          }
          toast.success('Cuenta cancelada');
        } else {
          toast.error(result.error || 'Error al cancelar');
        }
      }}
    />
  </>
  );
}

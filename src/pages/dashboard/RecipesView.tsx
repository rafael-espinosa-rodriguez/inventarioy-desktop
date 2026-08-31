import React, { useState, useMemo } from 'react';
import { useDatabaseStore } from '../../store/dbStore';
import { useAuthStore } from '../../store/authStore';
import { ChefHat, Plus, Minus, Trash2, Search, UtensilsCrossed, AlertCircle, Pencil, X, Check, Printer, Repeat, AlertTriangle } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { NumberInput } from '../../components/ui/NumberInput';
import { toast } from 'sonner';
import { validateNumber, exportToExcel, isActive } from '../../lib/utils';
import {
  convertUnit,
  getCompatibleUnits,
  getLastUsedUnit,
  saveLastUsedUnit,
  normalizeUnit,
  UnitAbbrev,
  UNIT_LABELS,
} from '../../lib/unitConversion';
import { usePersistentFilters } from '../../lib/hooks/usePersistentFilters';
import EmptyState from '../../components/EmptyState';

export default function RecipesView() {
  const { user } = useAuthStore();
  const { products, recipes, addRecipe, deleteRecipe, updateRecipe, logAction, accessPins } = useDatabaseStore();

  const canEdit = (): boolean => {
    if (!accessPins || accessPins.length === 0) return true;
    const activePin = accessPins.find(p => p.is_active);
    return !!activePin && ['owner', 'economist'].includes(activePin.role);
  };
  
  const activeProducts = products.filter(isActive);

  const { filters, setFilters, resetFilters } = usePersistentFilters<{ searchTerm: string }>('recipes', { searchTerm: '' });
  const { searchTerm } = filters;
  const setSearchTerm = (v: string) => setFilters({ searchTerm: v });
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState(0);
  const [recipeToDelete, setRecipeToDelete] = useState<{id: string, name: string} | null>(null);
  const [isSubmittingRecipe, setIsSubmittingRecipe] = useState(false);

  // Recipe Form State
  const [recipeName, setRecipeName] = useState('');
  const [selling_price, setSellingPrice] = useState(0);
  const [ingredients, setIngredients] = useState<{
    product_id: string;
    quantity: number;
    unit: string;
    displayUnit: string;
  }[]>([]);

  // Calculate total cost of the recipe based on ingredients
  const totalCost = useMemo(() => {
    return ingredients.reduce((sum, ing) => {
      const product = products.find(p => p.id === ing.product_id);
      if (!product) return sum;
      const baseUnit = normalizeUnit(product.unit);
      const quantityInBase = convertUnit(ing.quantity, ing.displayUnit as UnitAbbrev, baseUnit);
      return sum + (product.cost * quantityInBase);
    }, 0);
  }, [ingredients, products]);

  const profitMargin = selling_price > 0 ? ((selling_price - totalCost) / selling_price) * 100 : 0;

  const startEditPrice = (recipe: any) => {
    setEditingRecipeId(recipe.id);
    setEditingPrice(Number(recipe.selling_price));
  };

  const cancelEditPrice = () => {
    setEditingRecipeId(null);
    setEditingPrice(0);
  };

  const confirmDeleteRecipe = async () => {
    if (recipeToDelete) {
      try {
        await deleteRecipe(recipeToDelete.id);
        await logAction('recipes', 'ELIMINAR', {
          recipe_name: recipeToDelete.name,
          recipe_id: recipeToDelete.id
        });
        toast.success('Receta eliminada exitosamente');
      } catch (err) {
        toast.error((err as Error).message || 'Error al eliminar la receta');
      }
      setRecipeToDelete(null);
    }
  };

  // Swap ingredient state
  const [swappingRecipe, setSwappingRecipe] = useState<{ recipeId: string; productId: string } | null>(null);
  const [swapProductId, setSwapProductId] = useState('');
  const [swapQuantity, setSwapQuantity] = useState(1);

  const handleSwapIngredient = async (recipe: any) => {
    if (!swapProductId) { toast.error('Selecciona un nuevo ingrediente'); return; }
    if (swapQuantity <= 0) { toast.error('La cantidad debe ser mayor a 0'); return; }
    const newProduct = products.find(p => p.id === swapProductId);
    if (!newProduct) return;
    const oldIngredient = recipe.ingredients.find((ing: any) => ing.product_id === swappingRecipe?.productId);
    if (!oldIngredient) return;
    const newIngredients = recipe.ingredients.map((ing: any) =>
      ing.product_id === swappingRecipe?.productId
        ? { product_id: swapProductId, quantity: swapQuantity, unit: newProduct.unit }
        : ing
    );
    try {
      await updateRecipe(recipe.id, { ingredients: newIngredients });
      const oldProduct = products.find(p => p.id === oldIngredient.product_id);
      await useDatabaseStore.getState().logAction('recipes', 'ACTUALIZAR', {
        recipe_name: recipe.name,
        ingrediente_anterior: oldProduct?.name || 'Desconocido',
        ingrediente_nuevo: newProduct.name,
      });
      toast.success(`Ingrediente cambiado a ${newProduct.name}`);
      setSwappingRecipe(null);
      setSwapProductId('');
      setSwapQuantity(1);
    } catch (err: any) {
      toast.error(err?.message || 'Error al cambiar ingrediente');
    }
  };

  const saveEditPrice = async (recipeId: string) => {
    if (!editingPrice || editingPrice < 0.01) {
      toast.error('El precio debe ser mayor a $0');
      return;
    }
    try {
      await updateRecipe(recipeId, { selling_price: editingPrice });
      await useDatabaseStore.getState().logAction('recipes', 'MODIFICAR', {
        recipe_id: recipeId,
        new_price: editingPrice
      });
      toast.success('Precio actualizado');
      cancelEditPrice();
    } catch (err) {
      toast.error((err as Error).message || 'Error al actualizar');
    }
  };

  const handleAddIngredient = (productId: string) => {
    if (!productId) return;
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const baseUnit = normalizeUnit(product.unit);
    const compatibleUnits = getCompatibleUnits(baseUnit);
    const savedUnit = getLastUsedUnit(productId);
    const defaultUnit = savedUnit && compatibleUnits.includes(savedUnit) ? savedUnit : baseUnit;

    setIngredients(current => {
      if (current.some(ing => ing.product_id === productId)) return current;
      return [...current, {
        product_id: productId,
        quantity: 0,
        unit: baseUnit,
        displayUnit: defaultUnit
      }];
    });
  };

  const updateIngredientQuantity = (productId: string, quantity: number) => {
    setIngredients(current => current.map(ing =>
      ing.product_id === productId ? { ...ing, quantity: Math.max(0, quantity) } : ing
    ));
  };

  const removeIngredient = (productId: string) => {
    setIngredients(current => current.filter(ing => ing.product_id !== productId));
  };

  const handleCreateRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (isSubmittingRecipe) return;
    if (ingredients.length === 0) {
      toast.error('La receta debe tener al menos un ingrediente.');
      return;
    }

    const invalidIngredient = ingredients.find(i => i.quantity <= 0);
    if (invalidIngredient) {
      const product = products.find(p => p.id === invalidIngredient.product_id);
      toast.error(`La cantidad de "${product?.name || 'un ingrediente'}" debe ser mayor a 0.`);
      return;
    }

    const priceValidation = validateNumber(String(selling_price), { required: true, min: 0.01, fieldName: 'Precio de venta' });
    if (!priceValidation.isValid) {
      toast.error(priceValidation.error);
      return;
    }

    try {
      setIsSubmittingRecipe(true);
      const convertedIngredients = ingredients.map(ing => {
        const product = products.find(p => p.id === ing.product_id);
        const baseUnit = product ? normalizeUnit(product.unit) : 'u';
        const quantityInBase = convertUnit(ing.quantity, ing.displayUnit as UnitAbbrev, baseUnit);
        
        saveLastUsedUnit(ing.product_id, ing.displayUnit as UnitAbbrev);
        
        return {
          product_id: ing.product_id,
          quantity: quantityInBase,
          unit: baseUnit
        };
      });

      await addRecipe({
        name: recipeName,
        selling_price,
        ingredients: convertedIngredients
      });
      await useDatabaseStore.getState().logAction('recipes', 'CREAR', {
        recipe_name: recipeName,
        selling_price,
        ingredients_count: convertedIngredients.length
      });
      setRecipeName('');
      setSellingPrice(0);
      setIngredients([]);
      toast.success('Receta creada exitosamente');
    } catch (err) {
      toast.error((err as Error).message || 'Error al crear la receta');
    } finally {
      setIsSubmittingRecipe(false);
    }
  };

  const filteredRecipes = recipes.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-text">Recetas y Escandallos</h1>
          <p className="text-sm text-text-secondary">
            Crea platillos compuestos para descontar de tránsito automáticamente
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const columns = [
              { header: 'Nombre', key: 'name' },
              { header: 'Costo Total', key: 'total_cost', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
              { header: 'Precio Venta', key: 'selling_price', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
              { header: 'Margen %', key: 'margin', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
              { header: 'Ingredientes', key: 'ingredients' },
            ];
            const data = recipes.map(r => {
              const totalCost = r.ingredients?.reduce((sum: number, ing: any) => {
                return sum + (Number(ing.quantity) * Number(ing.unit_cost) || 0);
              }, 0) || 0;
              const margin = r.selling_price > 0 ? ((r.selling_price - totalCost) / r.selling_price) * 100 : 0;
              return {
                ...r,
                total_cost: totalCost,
                margin: margin,
                ingredients: r.ingredients?.length || 0,
              };
            });
            exportToExcel(columns, data, `recetas_${new Date().toISOString().split('T')[0]}`);
          }}
          className="gap-2"
        >
          <Printer className="h-4 w-4" />
          Exportar
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Panel Izquierdo - Creador de Recetas */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm h-fit">
          <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <ChefHat className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold text-text">Nueva Receta</h2>
          </div>

          <form onSubmit={handleCreateRecipe} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="recipeName">Nombre del Platillo *</Label>
                <Input 
                  id="recipeName" 
                  required 
                  placeholder="Ej: Hamburguesa Clásica"
                  value={recipeName} 
                  onChange={e => setRecipeName(e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sellingPrice">Precio de Venta ($) *</Label>
                <NumberInput
                  id="sellingPrice"
                  min={0.01}
                  step="0.01"
                  required
                  value={selling_price}
                  onValueChange={(v) => setSellingPrice(v)}
                />
                </div>
              </div>

              <div className="space-y-4 rounded-lg border border-border bg-bg/50 p-4">
                <div className="flex items-center justify-between">
                  <Label>Ingredientes</Label>
                </div>
                
                <select 
                  className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  onChange={e => {
                    handleAddIngredient(e.target.value);
                    e.target.value = ''; // Reset select after adding
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>+ Agregar ingrediente...</option>
                  {activeProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                  ))}
                </select>

                {ingredients.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {ingredients.map(ing => {
                      const product = products.find(p => p.id === ing.product_id);
                      if (!product) return null;
                      
                      const baseUnit = normalizeUnit(product.unit);
                      const compatibleUnits = getCompatibleUnits(baseUnit);
                      const quantityInBase = convertUnit(ing.quantity, ing.displayUnit as UnitAbbrev, baseUnit);
                      
                      return (
                        <div key={ing.product_id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md bg-surface p-2 border border-border">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text truncate">{product.name}</p>
                            <p className="text-xs text-text-secondary">Costo: ${(product.cost * quantityInBase).toFixed(2)}</p>
                          </div>
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <NumberInput
                              min={0}
                              step="any"
                              className="h-8 w-full sm:w-20 text-right text-sm"
                              value={ing.quantity}
                              onValueChange={(v) => updateIngredientQuantity(ing.product_id, v)}
                            />
                            <select
                              value={ing.displayUnit}
                              onChange={e => {
                                const newUnit = e.target.value as UnitAbbrev;
                                const convertedQty = convertUnit(ing.quantity, ing.displayUnit as UnitAbbrev, newUnit);
                                setIngredients(current => current.map(i => 
                                  i.product_id === ing.product_id 
                                    ? { ...i, displayUnit: newUnit, quantity: convertedQty }
                                    : i
                                ));
                              }}
                              disabled={compatibleUnits.length <= 1}
                              className="h-8 rounded border border-border bg-bg px-1 text-xs text-text disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {compatibleUnits.map((u) => (
                                <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                              ))}
                            </select>
                            <button 
                              type="button"
                              onClick={() => removeIngredient(ing.product_id)}
                              className="text-text-secondary hover:text-danger p-2"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Resumen de Costos */}
              <div className="rounded-lg bg-primary/5 p-4 border border-primary/20">
                <h3 className="text-sm font-medium text-primary mb-3">Resumen Financiero</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Costo Total (Ingredientes):</span>
                    <span className="font-mono font-medium">${totalCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Precio de Venta:</span>
                    <span className="font-mono font-medium">${selling_price.toFixed(2)}</span>
                  </div>
                <div className="flex justify-between border-t border-primary/20 pt-2 mt-2">
                  <span className="text-text-secondary">Margen de Ganancia:</span>
                  <span className={`font-mono font-bold ${profitMargin < 30 ? 'text-danger' : 'text-success'}`}>
                    {profitMargin.toFixed(1)}%
                  </span>
                </div>
                {profitMargin < 30 && selling_price > 0 && (
                  <p className="text-xs text-danger flex items-center gap-1 mt-2">
                    <AlertCircle className="h-3 w-3" />
                    El margen es menor al 30% recomendado para gastronomía.
                  </p>
                )}
              </div>
            </div>

            <Button type="submit" className="px-8" disabled={isSubmittingRecipe}>
              {isSubmittingRecipe ? 'Guardando...' : 'Guardar Receta'}
            </Button>
          </form>
        </div>

        {/* Panel Derecho - Lista de Recetas */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold text-text">Recetario</h2>
          </div>

          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                placeholder="Buscar receta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            {searchTerm && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-secondary hover:text-text hover:border-primary transition-colors"
                title="Limpiar filtros"
              >
                <X className="h-3 w-3" /> Limpiar
              </button>
            )}
          </div>

          <div className="space-y-4">
            {filteredRecipes.length === 0 ? (
              <EmptyState icon={UtensilsCrossed} title="No hay recetas" description={recipes.length === 0 ? 'Cree su primera receta combinando productos del inventario.' : 'Ninguna receta coincide con la búsqueda.'} />
            ) : (
              filteredRecipes.map(recipe => {
                // Calculate cost for display
                const cost = recipe.ingredients.reduce((sum, ing) => {
                  const product = products.find(p => p.id === ing.product_id);
                  return sum + ((product?.cost || 0) * ing.quantity);
                }, 0);
                const margin = recipe.selling_price > 0 ? ((recipe.selling_price - cost) / recipe.selling_price) * 100 : 0;

                return (
                  <div key={recipe.id} className="relative rounded-xl border border-border bg-bg p-4 transition-colors hover:border-primary/50">
                    <button 
                      onClick={() => setRecipeToDelete({ id: recipe.id, name: recipe.name })}
                      className="absolute right-4 top-4 text-text-secondary hover:text-danger transition-colors"
                      title="Eliminar receta"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    
                    <h3 className="font-semibold text-text text-lg pr-8">{recipe.name}</h3>
                    
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                      <div className="rounded-md bg-surface p-2 text-center">
                        <p className="text-xs text-text-secondary">Costo</p>
                        <p className="font-mono font-medium">${cost.toFixed(2)}</p>
                      </div>
                      <div className="rounded-md bg-surface p-2 text-center">
                        {editingRecipeId === recipe.id ? (
                          <div className="flex items-center gap-1">
                            <NumberInput
                              min={0.01}
                              step="0.01"
                              value={editingPrice}
                              onValueChange={(v) => setEditingPrice(v)}
                              className="h-8 w-20 sm:w-16 text-center font-mono text-primary text-sm"
                            />
                            <button onClick={() => saveEditPrice(recipe.id)} className="text-success hover:text-green-400">
                              <Check className="h-4 w-4" />
                            </button>
                            <button onClick={cancelEditPrice} className="text-text-secondary hover:text-text">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : canEdit() ? (
                          <button 
                            onClick={() => startEditPrice(recipe)}
                            className="w-full hover:bg-primary/20 rounded-md p-1 transition-colors"
                            title="Clic para editar precio de venta"
                          >
                            <div className="flex items-center justify-center gap-1">
                              <Pencil className="h-3 w-3 text-text-secondary" />
                              <p className="text-xs text-text-secondary">Venta</p>
                            </div>
                            <p className="font-mono font-medium text-primary">${recipe.selling_price.toFixed(2)}</p>
                          </button>
                        ) : (
                          <div className="w-full rounded-md p-1">
                            <p className="text-xs text-text-secondary">Venta</p>
                            <p className="font-mono font-medium text-primary">${recipe.selling_price.toFixed(2)}</p>
                          </div>
                        )}
                      </div>
                      <div className="rounded-md bg-surface p-2 text-center">
                        <p className="text-xs text-text-secondary">Margen de Ganancia</p>
                        <p className={`font-mono font-medium ${margin < 30 ? 'text-danger' : 'text-success'}`}>
                          {margin.toFixed(0)}%
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-border pt-3">
                      <p className="text-xs font-medium text-text-secondary mb-2">Ingredientes ({recipe.ingredients.length}):</p>
                      <div className="flex flex-wrap gap-2">
                        {recipe.ingredients.map(ing => {
                          const product = products.find(p => p.id === ing.product_id);
                          const isSwapping = swappingRecipe?.recipeId === recipe.id && swappingRecipe?.productId === ing.product_id;
                          return (
                            <div key={ing.product_id} className="inline-flex flex-col gap-1">
                              <span className="inline-flex items-center rounded-full bg-surface-hover px-2.5 py-0.5 text-xs text-text-secondary gap-1">
                                {ing.quantity} {ing.unit} {product?.name || 'Producto Eliminado'}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isSwapping) {
                                      setSwappingRecipe(null);
                                      setSwapProductId('');
                                      setSwapQuantity(1);
                                    } else {
                                      setSwappingRecipe({ recipeId: recipe.id, productId: ing.product_id });
                                      setSwapProductId('');
                                      setSwapQuantity(ing.quantity);
                                    }
                                  }}
                                  className="ml-0.5 text-text-secondary hover:text-primary transition-colors"
                                  title={isSwapping ? 'Cancelar' : 'Cambiar ingrediente'}
                                >
                                  <Repeat size={12} />
                                </button>
                              </span>
                              {isSwapping && (
                                <div className="flex items-center gap-1 flex-wrap pl-1">
                                  <select
                                    value={swapProductId}
                                    onChange={(e) => setSwapProductId(e.target.value)}
                                    className="text-xs rounded bg-surface border border-border px-1 py-0.5 text-text w-28"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="">Producto...</option>
                                    {activeProducts.filter(p => p.id !== ing.product_id).map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                  </select>
                                  <NumberInput
                                    value={swapQuantity}
                                    onValueChange={(v) => setSwapQuantity(v)}
                                    className="w-16 h-6 text-xs"
                                    onClick={(e: any) => e.stopPropagation()}
                                  />
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleSwapIngredient(recipe); }}
                                    className="text-success hover:text-green-400 p-0.5"
                                    title="Confirmar cambio"
                                  >
                                    <Check size={12} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSwappingRecipe(null);
                                      setSwapProductId('');
                                      setSwapQuantity(1);
                                    }}
                                    className="text-text-secondary hover:text-text p-0.5"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      {recipeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm modal-backdrop">
          <div className="w-full max-w-md rounded-2xl border border-border/50 bg-surface p-6 shadow-2xl">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-4 rounded-full bg-danger/10 p-4 text-danger">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-text">¿Eliminar receta?</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Está a punto de eliminar <span className="font-bold text-text">"{recipeToDelete.name}"</span>.
                Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setRecipeToDelete(null)}
              >
                Cancelar
              </Button>
              <Button 
                className="flex-1 bg-danger text-white hover:bg-danger/90"
                onClick={confirmDeleteRecipe}
              >
                Sí, eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

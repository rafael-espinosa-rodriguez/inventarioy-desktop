import { getPendingSyncItems, removeSyncItem, updateSyncItemStatus, addToSyncQueue, getSyncQueueCount, getFailedSyncItems, cleanSyncLog } from './dexieDb';
import type { SyncQueueItem } from './dexieDb';
import { useDatabaseStore } from '../store/dbStore';
import { localDb as supabase } from './db/localClient';
import { toast } from 'sonner';

type SyncEvent = 'start' | 'progress' | 'complete' | 'error' | 'idle' | 'synced' | 'duplicate';

type SyncListener = (event: SyncEvent, data?: any) => void;

class SyncEngine {
  private processing = false;
  private active = true;
  private listeners: Set<SyncListener> = new Set();
  private totalItems = 0;
  private processedItems = 0;

  stop() {
    this.active = false;
    this.processing = false;
  }

  start() {
    this.active = true;
  }

  onEvent(listener: SyncListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: SyncEvent, data?: any) {
    this.listeners.forEach(fn => fn(event, data));
  }

  isProcessing() {
    return this.processing;
  }

  async processQueue() {
    if (this.processing || !this.active) return;
    this.processing = true;

    try {
      if (import.meta.env.DEV) console.log(`[Sync] processQueue iniciado — online: ${navigator.onLine}`);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const user = (await import('../store/authStore')).useAuthStore.getState().user;
        if (!user) {
          return;
        }
        if (navigator.onLine) {
          const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
          if (refreshErr || !refreshed?.session) {
            console.warn('[Sync] no se pudo refrescar la sesión:', refreshErr);
            return;
          }
        } else {
          return;
        }
      }

      const items = await getPendingSyncItems();
      if (items.length === 0) {
        this.emit('idle');
        return;
      }

      this.totalItems = items.length;
      this.processedItems = 0;
      this.emit('start', { total: this.totalItems });

      if (this.totalItems > 20) {
        toast.info(`Sincronizando ${this.totalItems} cambios pendientes...`, { id: 'sync-progress' });
      }

      const BATCH_SIZE = 20;
      for (let batchStart = 0; batchStart < items.length; batchStart += BATCH_SIZE) {
        const batch = items.slice(batchStart, batchStart + BATCH_SIZE);
        for (const item of batch) {
          const success = await this.processItem(item);
          if (success) {
            await removeSyncItem(item.id!);
            this.processedItems++;
            this.emit('progress', {
              processed: this.processedItems,
              total: this.totalItems,
              current: item.operation,
            });
          } else {
            await updateSyncItemStatus(item.id!, 'failed', 'Error al sincronizar');
            this.processedItems++;
            this.emit('error', {
              processed: this.processedItems,
              total: this.totalItems,
              current: item.operation,
              error: 'Error al sincronizar',
            });
          }
        }
        if (batchStart + BATCH_SIZE < items.length) {
          if (this.totalItems > 20) {
            toast.info(`Sincronizando ${this.processedItems}/${this.totalItems}...`, { id: 'sync-progress' });
          }
          await new Promise(r => setTimeout(r, 200));
        }
      }

      const syncedCount = this.processedItems;
      const store = useDatabaseStore.getState();
      store.refreshSyncQueueCount();
      try {
        if (navigator.onLine) await store.fetchAll();
      } catch { }
      const remaining = await getSyncQueueCount();
      if (remaining === 0 && syncedCount > 0) {
        this.emit('synced', { count: syncedCount, total: this.totalItems });
      }
      if (remaining > 0) {
        setTimeout(() => this.processQueue(), 0);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError' && error?.message?.includes('Lock broken')) {
        console.warn('[Sync] Lock broken por multi-pestaña, se reintentará automáticamente');
      } else {
        console.error('[Sync] Error en processQueue:', error);
        this.emit('error', { error });
      }
    } finally {
      this.emit('complete');
      this.processing = false;
    }

    if (navigator.onLine) {
      setTimeout(() => this.retryFailed(), 1000);
    }
    cleanSyncLog().catch(() => {});
  }

  private async processItem(item: SyncQueueItem): Promise<boolean> {
    const store = useDatabaseStore.getState();
    const user = (await import('../store/authStore')).useAuthStore.getState().user;
    if (!user) return false;

    const maxRetries = 5;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await updateSyncItemStatus(item.id!, 'syncing');

        switch (item.operation) {
          case 'addMovement': {
            const { product_name, ...cleanPayload } = item.payload;
            const { error } = await supabase.from('movements').insert(cleanPayload);
            if (error) throw error;

            if (item.payload.type === 'SALIDA') {
              const { error: te } = await supabase.from('transit_items').insert({
                user_id: item.payload.user_id,
                product_id: item.payload.product_id,
                quantity: Number(item.payload.quantity),
                consumed: 0,
                remaining: Number(item.payload.quantity),
                reason: item.payload.reason || 'Enviado a cocina/preparacion',
                sent_date: item.payload.date || new Date().toISOString(),
                warehouse_id: item.payload.warehouse_id || null,
              });
              if (te) throw te;
            }

            if (item.payload.warehouse_id) {
              const { data: existingPW } = await supabase
                .from('product_warehouse')
                .select('id, quantity')
                .eq('product_id', item.payload.product_id)
                .eq('warehouse_id', item.payload.warehouse_id)
                .maybeSingle();

              const qty = Number(item.payload.quantity);
              if (existingPW) {
                let newQty = Number(existingPW.quantity);
                if (item.payload.type === 'ENTRADA') newQty += qty;
                else if (item.payload.type === 'SALIDA') newQty = Math.max(0, newQty - qty);
                else if (item.payload.type === 'MERMA') newQty = Math.max(0, newQty - qty);
                else if (item.payload.type === 'AJUSTE') newQty = Math.max(0, newQty + qty);
                await supabase.from('product_warehouse').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', existingPW.id);

                // Costo promedio ponderado en ENTRADA con warehouse
                if (item.payload.type === 'ENTRADA') {
                  const { data: prod } = await supabase.from('products')
                    .select('cost')
                    .eq('id', item.payload.product_id)
                    .single();
                  if (prod) {
                    const unitCost = Number(item.payload.cost) || Number(prod.cost);
                    const currentTotalValue = Number(existingPW.quantity) * Number(prod.cost);
                    const newTotalValue = qty * unitCost;
                    const totalQty = Number(existingPW.quantity) + qty;
                    if (totalQty > 0) {
                      const newCost = (currentTotalValue + newTotalValue) / totalQty;
                      await supabase.from('products').update({ cost: newCost, updated_at: new Date().toISOString() }).eq('id', item.payload.product_id);
                    }
                  }
                }
              } else if (item.payload.type === 'ENTRADA') {
                await supabase.from('product_warehouse').insert({ product_id: item.payload.product_id, warehouse_id: item.payload.warehouse_id, quantity: qty, in_transit: 0 });
                // Costo promedio ponderado (primera vez en este warehouse, currentQty = 0)
                const { data: prod } = await supabase.from('products')
                  .select('cost')
                  .eq('id', item.payload.product_id)
                  .single();
                if (prod) {
                  const unitCost = Number(item.payload.cost) || Number(prod.cost);
                  await supabase.from('products').update({ cost: unitCost, updated_at: new Date().toISOString() }).eq('id', item.payload.product_id);
                }
              }
            } else {
              const { data: product } = await supabase.from('products')
                .select('quantity, in_transit')
                .eq('id', item.payload.product_id)
                .single();
              if (product) {
                const qty = Number(item.payload.quantity);
                let newQuantity = Number(product.quantity);
                let newInTransit = Number(product.in_transit || 0);
                if (item.payload.type === 'ENTRADA') newQuantity += qty;
                else if (item.payload.type === 'SALIDA') newInTransit += qty;
                else if (item.payload.type === 'MERMA') newQuantity = Math.max(0, newQuantity - qty);
                else if (item.payload.type === 'AJUSTE') newQuantity = Math.max(0, newQuantity + qty);

                const updates: any = { quantity: Math.max(0, newQuantity), updated_at: new Date().toISOString() };
                if (item.payload.type === 'SALIDA') updates.in_transit = newInTransit;
                const { error: pe } = await supabase.from('products').update(updates).eq('id', item.payload.product_id);
                if (pe) throw pe;
              }
            }
            await store.logAction('movements', item.payload.type, { product_id: item.payload.product_id, quantity: item.payload.quantity }).catch(() => {});
            break;
          }
          case 'updateProduct': {
            const { id, updates } = item.payload;
            const { error } = await supabase.from('products').update(updates).eq('id', id);
            if (error) throw error;
            await store.logAction('inventory', 'MODIFICAR', { id, ...updates }).catch(() => {});
            break;
          }
          case 'addProduct': {
            const { error } = await supabase.from('products').insert(item.payload.product);
            if (error) throw error;
            if (item.payload.movement) {
              const { error: mvErr } = await supabase.from('movements').insert(item.payload.movement);
              if (mvErr) throw mvErr;
            }
            if (item.payload.productWarehouse?.length) {
              for (const pw of item.payload.productWarehouse) {
                const { error: pwErr } = await supabase.from('product_warehouse').upsert(
                  { product_id: pw.product_id, warehouse_id: pw.warehouse_id, quantity: pw.quantity, in_transit: 0 },
                  { onConflict: 'product_id,warehouse_id' }
                );
                if (pwErr) throw pwErr;
              }
            }
            await store.logAction('inventory', 'CREAR', { name: item.payload.product.name }).catch(() => {});
            break;
          }
          case 'addEmployee': {
            const { id: _empId, ...empData } = item.payload.employee;
            const { error: ee } = await supabase.from('employees').insert(empData);
            if (ee) throw ee;
            break;
          }
          case 'logAction': {
            const { module, action, details, role, roleLabel } = item.payload;
            const { error } = await supabase.from('action_logs').insert({
              user_id: user.id,
              role: role,
              pin_role_label: roleLabel,
              module,
              action,
              details,
              created_at: new Date().toISOString(),
            });
            if (error) throw error;
            break;
          }
          case 'addRecipe': {
            const { recipe, ingredients } = item.payload;
            const { data: newRecipe, error: re } = await supabase.from('recipes').insert(recipe).select().single();
            if (re) throw re;
            if (ingredients?.length) {
              const ingredientsWithRealId = ingredients.map((ing: any) => ({
                ...ing,
                recipe_id: newRecipe.id,
              }));
              const { error: ie } = await supabase.from('recipe_ingredients').insert(ingredientsWithRealId);
              if (ie) throw ie;
            }
            await store.logAction('recipes', 'CREAR', { name: item.payload.recipe.name }).catch(() => {});
            break;
          }
          case 'addSale': {
            const { sale: saleData, sale_items: saleItems } = item.payload;
            const { id: _tempId, ...saleInsert } = saleData;

            const { data: existingSale } = await supabase
              .from('sales').select('id').eq('id', _tempId).maybeSingle();

            let saleId: string;
            if (existingSale) {
              saleId = existingSale.id;
            } else {
              const { data: newSale, error: se } = await supabase.from('sales').insert({ ...saleInsert, id: _tempId }).select('id').single();
              if (se) throw se;
              saleId = newSale.id;
            }

            if (saleItems?.length) {
              const { data: existingItems } = await supabase
                .from('sale_items').select('id').eq('sale_id', saleId).limit(1);
              if (!existingItems?.length) {
                const itemsWithRealId = saleItems.map((si: any) => {
                  const { product_name, ...cleanSi } = si;
                  return { ...cleanSi, sale_id: saleId };
                });
                const { error: sie } = await supabase.from('sale_items').insert(itemsWithRealId);
                if (sie) throw sie;
              }
            }
            const consumptionItems = item.payload.itemsToConsume || [];
            for (const ci of consumptionItems) {
              const { data: transitRows } = await supabase
                .from('transit_items')
                .select('id, remaining, consumed')
                .eq('product_id', ci.productId)
                .gt('remaining', 0)
                .order('sent_date', { ascending: true });
              if (!transitRows) continue;
              let remainingQty = ci.qtyNeeded;
              let consumedSoFar = 0;
              for (const row of transitRows) {
                if (remainingQty <= 0) break;
                const toConsume = Math.min(row.remaining, remainingQty);
                const nr = row.remaining - toConsume;
                const nc = (row.consumed || 0) + toConsume;
                remainingQty -= toConsume;
                consumedSoFar += toConsume;
                const { error: te } = await supabase.from('transit_items').update({ remaining: nr, consumed: nc }).eq('id', row.id);
                if (te) throw te;
              }
              const { data: updatedTransit } = await supabase
                .from('transit_items')
                .select('remaining')
                .eq('product_id', ci.productId)
                .gt('remaining', 0);
              const newInTransit = (updatedTransit || []).reduce((s: number, t: any) => s + Number(t.remaining || 0), 0);
              const { data: prod } = await supabase.from('products').select('in_transit').eq('id', ci.productId).single();
              if (prod) {
                await supabase.from('products').update({ 
                  in_transit: newInTransit 
                }).eq('id', ci.productId);
              }
              const { error: me } = await supabase.from('movements').insert({
                user_id: saleInsert.user_id, product_id: ci.productId, type: 'SALIDA', quantity: ci.qtyNeeded, date: new Date().toISOString(),
                reason: `Venta #${saleId.slice(0, 8)}`, status: 'NORMAL',
              });
              if (me) throw me;
            }
            const itemsCount = item.payload.items?.length || (item.payload.sale?.items?.length) || 1;
            await store.logAction('sales', 'CREAR', { items: itemsCount, type: item.payload.saleType || item.payload.sale_type || 'venta' }).catch(() => {});
            break;
          }
          case 'cancelTransit': {
            const { transitItemId, quantity, reason, userId, productId } = item.payload;
            const { data: ti } = await supabase.from('transit_items').select('remaining, warehouse_id').eq('id', transitItemId).single();
            const newRemaining = ti ? Math.max(0, ti.remaining - quantity) : 0;
            const { error: ue } = await supabase.from('transit_items').update({ remaining: newRemaining }).eq('id', transitItemId);
            if (ue) throw ue;
            const { data: prod } = await supabase.from('products').select('in_transit, quantity').eq('id', productId).single();
            const newInTransit = prod ? Math.max(0, Number(prod.in_transit || 0) - quantity) : 0;
            const newQuantity = prod ? Number(prod.quantity || 0) + quantity : quantity;
            const { error: pe } = await supabase.from('products').update({ in_transit: newInTransit, quantity: newQuantity }).eq('id', productId);
            if (pe) throw pe;
            if (ti?.warehouse_id) {
              const { data: existingPW } = await supabase
                .from('product_warehouse')
                .select('id, quantity')
                .eq('product_id', productId)
                .eq('warehouse_id', ti.warehouse_id)
                .maybeSingle();
              if (existingPW) {
                await supabase.from('product_warehouse').update({ quantity: Number(existingPW.quantity) + quantity, updated_at: new Date().toISOString() }).eq('id', existingPW.id);
              }
            }
            const { error: me2 } = await supabase.from('movements').insert({
              user_id: userId, product_id: productId, type: 'ENTRADA', quantity, date: new Date().toISOString(), reason: `Devolución de tránsito: ${reason}`, status: 'NORMAL',
            });
            if (me2) throw me2;
            await store.logAction('transit', 'CANCELAR_TRANSITO', { transitItemId: item.payload.transitItemId, productId: item.payload.productId, quantity: item.payload.quantity }).catch(() => {});
            break;
          }
          case 'registerWasteFromTransit': {
            const { transitItemId, quantity, reason, userId, productId } = item.payload;
            const { data: ti } = await supabase.from('transit_items').select('remaining').eq('id', transitItemId).single();
            const newRemaining = ti ? Math.max(0, ti.remaining - quantity) : 0;
            const { error: ue } = await supabase.from('transit_items').update({ remaining: newRemaining }).eq('id', transitItemId);
            if (ue) throw ue;
            const { data: prod } = await supabase.from('products').select('in_transit').eq('id', productId).single();
            const newInTransit = prod ? Math.max(0, Number(prod.in_transit || 0) - quantity) : 0;
            const { error: pe } = await supabase.from('products').update({ in_transit: newInTransit }).eq('id', productId);
            if (pe) throw pe;
            const { error: me3 } = await supabase.from('movements').insert({
              user_id: userId, product_id: productId, type: 'MERMA', quantity, date: new Date().toISOString(), reason: `Merma en tránsito: ${reason}`, status: 'NORMAL',
            });
            if (me3) throw me3;
            await store.logAction('transit', 'MERMA_TRANSITO', { transitItemId: item.payload.transitItemId, productId: item.payload.productId, quantity: item.payload.quantity }).catch(() => {});
            break;
          }
          case 'registerManualConsumption': {
            const { transitItemId, quantity, note, userId, productId } = item.payload;
            const { data: ti } = await supabase.from('transit_items').select('remaining, consumed').eq('id', transitItemId).single();
            const newRemaining = ti ? Math.max(0, ti.remaining - quantity) : 0;
            const newConsumed = ti ? (ti.consumed || 0) + quantity : quantity;
            const { error: ue } = await supabase.from('transit_items').update({ remaining: newRemaining, consumed: newConsumed }).eq('id', transitItemId);
            if (ue) throw ue;
            const { data: prod } = await supabase.from('products').select('in_transit').eq('id', productId).single();
            const newInTransit = prod ? Math.max(0, Number(prod.in_transit || 0) - quantity) : 0;
            const { error: pe } = await supabase.from('products').update({ in_transit: newInTransit }).eq('id', productId);
            if (pe) throw pe;
            const isGastoVariable = false;
            const { error: me4 } = await supabase.from('movements').insert({
              user_id: userId, product_id: productId, type: 'SALIDA', quantity, date: new Date().toISOString(), reason: note ? `Consumo manual desde tránsito: ${note}` : 'Consumo manual desde tránsito', is_consumo_directo: !isGastoVariable, status: 'NORMAL',
            });
            if (me4) throw me4;
            await store.logAction('transit', 'CONSUMO_MANUAL', { transitItemId: item.payload.transitItemId, productId: item.payload.productId, quantity: item.payload.quantity }).catch(() => {});
            break;
          }
          case 'createPendingAccount': {
            const { error } = await supabase.from('pending_accounts').insert(item.payload);
            if (error) throw error;
            await store.logAction('accounts', 'CREAR', { customer: item.payload.customer_name || item.payload.client_name || '' }).catch(() => {});
            break;
          }
          case 'createDailyClosing': {
            const closingDate = item.payload.closing_date || item.payload.date;
            if (closingDate) {
              const dateStr = new Date(closingDate).toISOString().split('T')[0];
              const { data: existing } = await supabase
                .from('daily_closings')
                .select('id')
                .eq('user_id', item.payload.user_id)
                .eq('closing_date', dateStr)
                .maybeSingle();
              if (existing) break;
            }
            const { error } = await supabase.from('daily_closings').insert(item.payload);
            if (error) {
              if (error.code === '23505') break;
              throw error;
            }
            await store.logAction('closing', 'CREAR', { date: item.payload.closing_date || item.payload.date }).catch(() => {});
            break;
          }
          case 'deleteProduct': {
            const { error } = await supabase.from('products')
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq('id', item.payload.id);
            if (error) throw error;
            const prodName = item.payload.name || store.products.find(p => p.id === item.payload.id)?.name || 'Producto';
            await store.logAction('inventory', 'ELIMINAR', { name: prodName }).catch(() => {});
            break;
          }
          case 'updateRecipe': {
            const { id, updates } = item.payload;
            const { error: re } = await supabase.from('recipes')
              .update({ name: updates.name, selling_price: updates.selling_price })
              .eq('id', id);
            if (re) throw re;
            if (updates.ingredients !== undefined) {
              await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
              if (updates.ingredients.length > 0) {
                const ingredients = updates.ingredients.map((ing: any) => ({
                  recipe_id: id, product_id: ing.product_id, quantity: ing.quantity, unit: ing.unit,
                }));
                const { error: ie } = await supabase.from('recipe_ingredients').insert(ingredients);
                if (ie) throw ie;
              }
            }
            await store.logAction('recipes', 'ACTUALIZAR', { name: item.payload.updates.name || store.recipes.find(r => r.id === id)?.name || 'Receta' }).catch(() => {});
            break;
          }
          case 'deleteRecipe': {
            await supabase.from('recipe_ingredients').delete().eq('recipe_id', item.payload.id);
            const { error } = await supabase.from('recipes').delete().eq('id', item.payload.id);
            if (error) throw error;
            const recipeName = item.payload.name || store.recipes.find(r => r.id === item.payload.id)?.name || 'Receta';
            await store.logAction('recipes', 'ELIMINAR', { name: recipeName }).catch(() => {});
            break;
          }
          case 'deletePendingAccount': {
            for (const tr of (item.payload.transitRestores || [])) {
              const { data: ti } = await supabase.from('transit_items').select('remaining').eq('id', tr.transitItemId).single();
              const newRemaining = ti ? ti.remaining + tr.quantity : tr.quantity;
              await supabase.from('transit_items').update({ remaining: newRemaining }).eq('id', tr.transitItemId);
            }
            const { error } = await supabase.from('pending_accounts')
              .update({ status: 'cancelled', updated_at: new Date().toISOString() })
              .eq('id', item.payload.accountId);
            if (error) throw error;
            const customerName = item.payload.customer_name || store.pendingAccounts.find(a => a.id === item.payload.accountId)?.client_name || 'Cuenta';
            await store.logAction('accounts', 'ELIMINAR', { customer: customerName }).catch(() => {});
            break;
          }
          case 'markPendingAccountPaid': {
            const { error } = await supabase.from('pending_accounts')
              .update({ status: 'paid', updated_at: new Date().toISOString() })
              .eq('id', item.payload.accountId);
            if (error) throw error;
            const paidCustomer = store.pendingAccounts.find(a => a.id === item.payload.accountId)?.client_name || 'Cuenta';
            await store.logAction('accounts', 'MARCAR_PAGADO', { customer: paidCustomer }).catch(() => {});
            break;
          }
          case 'addItemsToPendingAccount': {
            const { accountId, items, isAccountHouse, saleType } = item.payload;
            const { data: account } = await supabase.from('pending_accounts').select('items').eq('id', accountId).single();
            const existingItems = (account?.items as any[]) || [];
            const newItems = items.map((i: any) => ({ ...i, added_at: new Date().toISOString() }));
            const allItems = [...existingItems, ...newItems];
            const newTotal = isAccountHouse ? 0 : allItems.reduce((sum: number, i: any) => sum + (i.subtotal || 0), 0);
            const { error } = await supabase.from('pending_accounts')
              .update({ items: allItems, total_amount: newTotal, is_account_house: isAccountHouse, sale_type: saleType, updated_at: new Date().toISOString() })
              .eq('id', accountId);
            if (error) throw error;
            await store.logAction('accounts', 'AGREGAR_ITEMS', { accountId, count: items.length }).catch(() => {});
            break;
          }
          case 'updatePendingAccountItems': {
            const { accountId, items } = item.payload;
            const newTotal = items.reduce((sum: number, i: any) => sum + (i.subtotal || 0), 0);
            const { error } = await supabase.from('pending_accounts')
              .update({ items, total_amount: newTotal, updated_at: new Date().toISOString() })
              .eq('id', accountId);
            if (error) throw error;
            await store.logAction('accounts', 'ACTUALIZAR_ITEMS', { accountId, count: items.length }).catch(() => {});
            break;
          }
          case 'togglePendingAccountType': {
            const { accountId, is_account_house } = item.payload;
            const { data: account } = await supabase.from('pending_accounts').select('items').eq('id', accountId).single();
            const accountItems = (account?.items as any[]) || [];
            const newTotal = is_account_house ? 0 : accountItems.reduce((sum: number, i: any) => sum + (i.subtotal || 0), 0);
            const { error } = await supabase.from('pending_accounts')
              .update({ is_account_house, total_amount: newTotal, updated_at: new Date().toISOString() })
              .eq('id', accountId);
            if (error) throw error;
            await store.logAction('accounts', 'TOGGLE_TIPO', { accountId, is_account_house }).catch(() => {});
            break;
          }
          case 'justifyMovement': {
            const { id, justification } = item.payload;
            const { error } = await supabase.from('movements')
              .update({ status: 'JUSTIFICADO', justification, justification_date: new Date().toISOString() })
              .eq('id', id);
            if (error) throw error;
            await store.logAction('movements', 'JUSTIFICAR', { id, justification }).catch(() => {});
            break;
          }
          case 'updatePendingAccount': {
            const { accountId, updates } = item.payload;
            const { error } = await supabase.from('pending_accounts')
              .update({ ...updates, updated_at: new Date().toISOString() })
              .eq('id', accountId);
            if (error) throw error;
            const updatedCustomer = updates.customer_name || store.pendingAccounts.find(a => a.id === accountId)?.client_name || 'Cuenta';
            await store.logAction('accounts', 'ACTUALIZAR', { customer: updatedCustomer }).catch(() => {});
            break;
          }
          case 'updateAccessPinAttempts': {
            const { pinId, failed_attempts, blocked_until } = item.payload;
            const updateData: Record<string, any> = {};
            if (failed_attempts !== undefined) updateData.failed_attempts = failed_attempts;
            if (blocked_until !== undefined) updateData.blocked_until = blocked_until;
            if (Object.keys(updateData).length === 0) break;
            const { error } = await supabase.from('access_pins').update(updateData).eq('id', pinId);
            if (error) throw error;
            break;
          }
          default:
            console.warn(`Sync: operacion desconocida ${item.operation}`);
            return false;
        }
        return true;
      } catch (err: any) {
        if (err?.code === '42501') {
          console.error(`Sync: error no retryable (${err.code}) en ${item.operation}`, err);
          return false;
        }
        if (err?.code === '23505') {
          console.warn(`Sync: duplicado ignorado (${err.code}) en ${item.operation}`, err);
          await removeSyncItem(item.id!);
          this.emit('duplicate', { operation: item.operation, payload: item.payload });
          return true;
        }
        const isOffline = !navigator.onLine
          || err?.message?.includes('Failed to fetch')
          || err?.message?.includes('NetworkError')
          || err?.message?.includes('timeout');

        const isLockBroken = err?.name === 'AbortError' && err?.message?.includes('Lock broken');
        const isRetryable = isOffline || isLockBroken;

        if (!isRetryable) {
          console.error(`Sync: error fatal no-reintentable en ${item.operation}:`, err?.message || err);
          return false;
        }

        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        if (attempt >= maxRetries) {
          console.error(`Sync abandonado (${item.id}) tras ${maxRetries + 1} intentos:`, err);
          await updateSyncItemStatus(item.id!, 'abandoned', `Falló tras ${maxRetries + 1} intentos: ${err?.message || err}`);
          const store = useDatabaseStore.getState();
          store.refreshSyncQueueCount();
          return false;
        }
      }
    }
    return false;
  }

  async enqueueAndProcess(item: Omit<SyncQueueItem, 'id' | 'created_at' | 'status' | 'retries'>) {
    await addToSyncQueue(item);
    if (navigator.onLine) {
      this.processQueue();
    }
  }

  async processPending() {
    const count = await getSyncQueueCount();
    if (count > 0 && navigator.onLine) {
      await this.processQueue();
    }
  }

  async retryFailed() {
    const failedItems = await getFailedSyncItems();
    const retryable = failedItems.filter(f => f.status !== 'abandoned');
    if (retryable.length === 0) return;
    for (const item of retryable) {
      await updateSyncItemStatus(item.id!, 'pending', undefined);
    }
    if (import.meta.env.DEV) console.log(`[Sync] Reintentando ${retryable.length} items fallados`);
    this.processQueue();
  }

  async compensateFailedSync() {
    const failedItems = await getFailedSyncItems();
    const dbStore = useDatabaseStore.getState();
    const results: { id: number; operation: string; recovered: boolean; error?: string }[] = [];

    for (const item of failedItems) {
      try {
        if (item.operation === 'addSale') {
          const { sale } = item.payload;
          if (sale?.id) {
            const { data: existing } = await supabase.from('sales').select('id').eq('id', sale.id).maybeSingle();
            if (!existing) {
              const success = await this.processItem(item);
              results.push({ id: item.id!, operation: item.operation, recovered: success });
            } else {
              await removeSyncItem(item.id!);
              results.push({ id: item.id!, operation: item.operation, recovered: true });
            }
          }
        } else {
          const success = await this.processItem(item);
          results.push({ id: item.id!, operation: item.operation, recovered: success });
        }
      } catch (err: any) {
        results.push({ id: item.id!, operation: item.operation, recovered: false, error: err.message });
      }
    }

    const recovered = results.filter(r => r.recovered).length;
    const failed = results.filter(r => !r.recovered).length;
    await dbStore.logAction('sync', 'COMPENSAR', { total: results.length, recovered, failed }).catch(() => {});
    return { total: results.length, recovered, failed, details: results };
  }
}

export const syncEngine = new SyncEngine();

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncEngine.processQueue();
    setTimeout(() => syncEngine.processQueue(), 3000);
  });
  setInterval(() => syncEngine.processQueue(), 30000);
}

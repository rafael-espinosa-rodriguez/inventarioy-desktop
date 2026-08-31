import { useState } from 'react';
import { Plus, Trash2, Edit, KeyRound, Loader2, Check, ShieldCheck } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useDatabaseStore, getRoleModules, getRoleLabel, type AccessPin } from '../store/dbStore';
import { toast } from 'sonner';
import type { Role } from '../store/dbStore';

const ALL_MODULES: { key: string; label: string }[] = [
  { key: 'sales', label: 'Ventas' },
  { key: 'inventory', label: 'Inventario' },
  { key: 'movements', label: 'Movimientos' },
  { key: 'transit', label: 'Tránsito' },
  { key: 'recipes', label: 'Recetas' },
  { key: 'consumption', label: 'Consumo' },
  { key: 'closings', label: 'Cierres' },
  { key: 'charts', label: 'Gráficos' },
  { key: 'analysis', label: 'Análisis' },
  { key: 'filtered', label: 'Centro Filtrado' },
  { key: 'hr', label: 'RR.HH.' },
  { key: 'settings', label: 'Configuración' },
];

const ALL_MODULE_KEYS = ALL_MODULES.map(m => m.key);

export default function AccessPinsConfig() {
  const {
    accessPins,
    roles,
    employees,
    saveAccessPin,
    toggleAccessPin,
    deleteAccessPin,
    deleteRole,
  } = useDatabaseStore();

  const [showPinModal, setShowPinModal] = useState(false);
  const [editingPin, setEditingPin] = useState<AccessPin | null>(null);
  const [employeeMode, setEmployeeMode] = useState<'existing' | 'other'>('existing');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [otherName, setOtherName] = useState('');
  const [pinValue, setPinValue] = useState('');
  const [roleMode, setRoleMode] = useState<'new' | 'existing'>('new');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pinToDelete, setPinToDelete] = useState<AccessPin | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [isDeletingRole, setIsDeletingRole] = useState(false);

  const roleLabel = (roleId: string): string => {
    const r = roles.find(x => x.id === roleId);
    if (r?.name) return r.name;
    return getRoleLabel(roleId);
  };

  const roleModulesOf = (roleId: string): string[] => {
    const r = roles.find(x => x.id === roleId);
    if (r && Array.isArray(r.modules) && r.modules.length) return r.modules.map(String);
    return getRoleModules(roleId);
  };

  const isOwnerMode = (editingPin?.role === 'owner') || (!editingPin && false);
  const effectiveModules = selectedRoleId === 'owner' ? ALL_MODULE_KEYS : selectedModules;

  // Opciones de rol: roles existentes (sin Dueño) + Dueño solo si se edita el dueño.
  const roleOptions = roles.filter(r => r.id !== 'owner');
  const showOwnerOption = !!editingPin && editingPin.role === 'owner';

  const resetModal = () => {
    setEditingPin(null);
    setEmployeeMode('existing');
    setSelectedEmployeeId(employees[0]?.id || '');
    setOtherName('');
    setPinValue('');
    setRoleMode('new');
    setSelectedRoleId('');
    setNewRoleName('');
    setSelectedModules([]);
    setShowPin(false);
  };

  const openCreateModal = () => {
    resetModal();
    setShowPinModal(true);
  };

  const openEditModal = (pin: AccessPin) => {
    setEditingPin(pin);
    const isOwner = pin.role === 'owner';
    const emp = employees.find(e => e.name === pin.pin_name);
    setEmployeeMode(emp ? 'existing' : 'other');
    setSelectedEmployeeId(emp?.id || '');
    setOtherName(emp ? '' : pin.pin_name || '');
    setPinValue('');
    setShowPin(false);
    if (isOwner) {
      setRoleMode('existing');
      setSelectedRoleId('owner');
      setNewRoleName('');
      setSelectedModules(ALL_MODULE_KEYS);
    } else {
      const roleExists = roles.some(r => r.id === pin.role);
      if (roleExists) {
        setRoleMode('existing');
        setSelectedRoleId(pin.role);
        setSelectedModules(roleModulesOf(pin.role));
      } else {
        setRoleMode('new');
        setSelectedRoleId('');
        setNewRoleName(roleLabel(pin.role));
        setSelectedModules(roleModulesOf(pin.role));
      }
    }
    setShowPinModal(true);
  };

  const toggleModule = (key: string) => {
    if (selectedRoleId === 'owner') return;
    setSelectedModules(prev => prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]);
  };

  const handleSave = async () => {
    const name = employeeMode === 'existing'
      ? (employees.find(e => e.id === selectedEmployeeId)?.name || '')
      : otherName.trim();
    if (!name) {
      toast.error('Ingrese el nombre del empleado o selecciónelo de la lista');
      return;
    }
    if (!/^\d{4}$/.test(pinValue)) {
      toast.error('El PIN debe tener exactamente 4 dígitos');
      return;
    }
    if (roleMode === 'new') {
      if (!newRoleName.trim()) {
        toast.error('Ingrese el nombre del rol');
        return;
      }
      if (effectiveModules.length === 0) {
        toast.error('Seleccione al menos un módulo');
        return;
      }
    }
    setIsSaving(true);
    const result = await saveAccessPin({
      roleId: roleMode === 'existing' ? selectedRoleId : undefined,
      roleName: roleMode === 'new' ? newRoleName.trim() : undefined,
      modules: effectiveModules,
      pin: pinValue,
      name,
      pinId: editingPin?.id,
    });
    setIsSaving(false);
    if (result.success) {
      toast.success(editingPin ? 'PIN actualizado' : 'PIN creado');
      setShowPinModal(false);
    } else {
      toast.error(result.error || 'Error al guardar');
    }
  };

  const confirmDelete = async () => {
    if (!pinToDelete) return;
    const result = await deleteAccessPin(pinToDelete.id);
    if (result.success) {
      toast.success('PIN eliminado');
    } else {
      toast.error(result.error || 'Error al eliminar');
    }
    setPinToDelete(null);
  };

  const confirmDeleteRole = async () => {
    if (!roleToDelete) return;
    setIsDeletingRole(true);
    const result = await deleteRole(roleToDelete.id);
    setIsDeletingRole(false);
    if (result.success) {
      toast.success('Rol eliminado');
    } else {
      toast.error(result.error || 'Error al eliminar el rol');
    }
    setRoleToDelete(null);
  };

  const roleSummary = accessPins.reduce<Record<string, number>>((acc, p) => {
    acc[p.role] = (acc[p.role] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-text">
            <KeyRound className="h-5 w-5 text-primary" />
            Pines de Acceso
          </h3>
          <p className="text-sm text-text-secondary">
            Roles personalizables. Cada rol agrupa los módulos a los que tendrá acceso el empleado.
          </p>
        </div>
        <Button onClick={openCreateModal} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Agregar Nuevo PIN
        </Button>
      </div>

      {/* Resumen de roles */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map(r => {
          const pinsCount = roleSummary[r.id] || 0;
          return (
            <div key={r.id} data-testid="role-card" className="rounded-lg border border-border bg-bg/50 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-text">{r.name}</span>
                <div className="flex items-center gap-1">
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-secondary">
                    {pinsCount} PIN{pinsCount === 1 ? '' : 's'}
                  </span>
                  {r.id !== 'owner' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:text-danger"
                      disabled={pinsCount > 0}
                      title={pinsCount > 0
                        ? 'No se puede eliminar un rol que tiene PINs. Elimine primero sus PINs.'
                        : 'Eliminar rol'}
                      aria-label={pinsCount > 0 ? `Eliminar rol ${r.name} (tiene PINs)` : `Eliminar rol ${r.name}`}
                      onClick={() => setRoleToDelete(r)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {Array.isArray(r.modules) ? r.modules.length : 0} módulo(s)
              </p>
            </div>
          );
        })}
      </div>

      {/* Lista de PINs */}
      <div className="space-y-2">
        {accessPins.length === 0 && (
          <p className="text-sm text-text-secondary">No hay pines configurados todavía.</p>
        )}
        {accessPins.map(pin => (
          <div
            key={pin.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-text">{pin.pin_name}</p>
              <p className="text-xs text-text-secondary">
                Rol: {roleLabel(pin.role)} · {roleModulesOf(pin.role).length} módulo(s)
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={pin.is_active ? 'default' : 'outline'}
                onClick={() => toggleAccessPin(pin.id, !pin.is_active)}
                title={pin.is_active ? 'Desactivar PIN' : 'Activar PIN'}
              >
                {pin.is_active ? 'Activo' : 'Inactivo'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openEditModal(pin)} aria-label={`Editar PIN ${pin.pin_name}`}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPinToDelete(pin)} className="text-danger hover:text-danger" aria-label={`Eliminar PIN ${pin.pin_name}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de creación/edición */}
      <Modal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        title={editingPin ? 'Editar PIN' : 'Agregar Nuevo PIN'}
        size="lg"
      >
        <div className="space-y-5">
          {/* Empleado */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Empleado</label>
            {isOwnerMode ? (
              <Input value="Dueño/a (este negocio)" disabled className="bg-bg" />
            ) : (
              <>
                <div className="flex gap-2">
                  <select
                    value={employeeMode}
                    onChange={e => setEmployeeMode(e.target.value as 'existing' | 'other')}
                    className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="existing">Empleado de RR.HH.</option>
                    <option value="other">Otro (escribir nombre)</option>
                  </select>
                </div>
                {employeeMode === 'existing' ? (
                  <select
                    value={selectedEmployeeId}
                    onChange={e => setSelectedEmployeeId(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Seleccione un empleado…</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    className="mt-2"
                    placeholder="Nombre del empleado"
                    value={otherName}
                    onChange={e => setOtherName(e.target.value)}
                  />
                )}
              </>
            )}
          </div>

          {/* PIN */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              PIN (4 dígitos)
            </label>
            <div className="relative">
              <Input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={24}
                placeholder="0000"
                value={pinValue}
                onChange={e => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 24))}
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text"
              >
                {showPin ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          {/* Rol */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Rol</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setRoleMode('new'); setSelectedModules([]); }}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  roleMode === 'new'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-text-secondary hover:border-primary/50'
                }`}
              >
                <Plus className="mr-1 inline h-4 w-4" />
                Crear nuevo rol
              </button>
              {roleOptions.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setRoleMode('existing'); setSelectedRoleId(r.id); setSelectedModules(roleModulesOf(r.id)); }}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    roleMode === 'existing' && selectedRoleId === r.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-secondary hover:border-primary/50'
                  }`}
                >
                  {r.name}
                </button>
              ))}
              {showOwnerOption && (
                <button
                  type="button"
                  onClick={() => { setRoleMode('existing'); setSelectedRoleId('owner'); setSelectedModules(ALL_MODULE_KEYS); }}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    roleMode === 'existing' && selectedRoleId === 'owner'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-secondary hover:border-primary/50'
                  }`}
                >
                  <ShieldCheck className="mr-1 inline h-4 w-4" />
                  Dueño/a
                </button>
              )}
            </div>

            {roleMode === 'new' && (
              <Input
                className="mt-2"
                placeholder="Nombre del nuevo rol (ej. Cajero Turno Noche)"
                value={newRoleName}
                onChange={e => setNewRoleName(e.target.value)}
              />
            )}
            {roleMode === 'existing' && selectedRoleId !== 'owner' && (
              <p className="mt-2 text-xs text-text-secondary">
                Al guardar, los módulos se aplican a <strong>todos</strong> los PINs que usan este rol.
              </p>
            )}
          </div>

          {/* Módulos */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Módulos del rol
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALL_MODULES.map(m => {
                const checked = effectiveModules.includes(m.key);
                const disabled = selectedRoleId === 'owner' || m.key === 'settings';
                return (
                  <button
                    key={m.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleModule(m.key)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      checked
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-text-secondary hover:border-primary/50'
                    } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                      checked ? 'border-primary bg-primary text-black' : 'border-border'
                    }`}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    {m.label}
                  </button>
                );
              })}
            </div>
            {selectedRoleId === 'owner' && (
              <p className="mt-2 text-xs text-text-secondary">
                El Dueño/a siempre tiene acceso a todos los módulos.
              </p>
            )}
            {selectedRoleId !== 'owner' && (
              <p className="mt-2 text-xs text-text-secondary">
                El módulo Configuración está reservado para el Dueño/a.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowPinModal(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingPin ? 'Guardar cambios' : 'Crear PIN'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!pinToDelete}
        onClose={() => setPinToDelete(null)}
        title="Eliminar PIN"
        description={pinToDelete ? `¿Eliminar el PIN de "${pinToDelete.pin_name}" (${roleLabel(pinToDelete.role)})? Esta acción no se puede deshacer.` : undefined}
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        isOpen={!!roleToDelete}
        onClose={() => setRoleToDelete(null)}
        title="Eliminar rol"
        description={roleToDelete ? `¿Eliminar el rol "${roleToDelete.name}"? Esta acción no se puede deshacer.` : undefined}
        confirmLabel="Eliminar"
        onConfirm={confirmDeleteRole}
        isLoading={isDeletingRole}
      />
    </div>
  );
}

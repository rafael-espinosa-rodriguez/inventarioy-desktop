import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useDatabaseStore } from '../../store/dbStore';
import { Settings, Save, User, Shield, Printer, MessageSquare, DollarSign, QrCode, Copy, ExternalLink, Download, Sparkles, Lock, ShoppingCart, WifiOff, KeyRound, X, Crown } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { localDb } from '../../lib/db/localClient';
import { toast } from 'sonner';
import { validateNumber, getNumberFromString, esVitalicia } from '../../lib/utils';
import { Switch } from '../../components/ui/switch';
import AccessPinsConfig from '../../components/AccessPinsConfig';
import QRCode from 'react-qr-code';
import { useOfflineAction } from '../../hooks/useOfflineDisabled';
import OfflineLimitBanner from '../../components/OfflineLimitBanner';

export default function SettingsView() {
  const { user, fetchUser, activateLicense } = useAuthStore();
  const { disabled: isOffline, message: offlineMessage } = useOfflineAction('guardar configuración del perfil');
  
  const [formData, setFormData] = useState({
    name: user?.name || '',
    businessName: user?.businessName || '',
    generateTicket: user?.generateTicket ?? false,
    ticketMessage: user?.ticketMessage || '¡Gracias por su visita!',
    phone: user?.phone || '',
    address: user?.address || '',
    businessHours: user?.businessHours || '',
    businessCode: user?.businessCode || '',
  });
  const [currencySettings, setCurrencySettings] = useState({
    usdEnabled: user?.usdEnabled ?? false,
    usdRate: user?.usdRate ?? 320,
    eurEnabled: user?.eurEnabled ?? false,
    eurRate: user?.eurRate ?? 350,
    cupEnabled: true,
    cupTransferEnabled: user?.cupTransferEnabled ?? false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [menuUrl, setMenuUrl] = useState('');

  useEffect(() => {
    if (user) {
      setCurrencySettings({
        usdEnabled: user.usdEnabled ?? false,
        usdRate: user.usdRate ?? 320,
        eurEnabled: user.eurEnabled ?? false,
        eurRate: user.eurRate ?? 350,
        cupEnabled: true,
        cupTransferEnabled: user.cupTransferEnabled ?? false,
      });
      setFormData({
        name: user.name || '',
        businessName: user.businessName || '',
        generateTicket: user.generateTicket ?? false,
        ticketMessage: user.ticketMessage || '¡Gracias por su visita!',
        phone: user.phone || '',
        address: user.address || '',
        businessHours: user.businessHours || '',
        businessCode: user.businessCode || '',
      });
    }
  }, [user]);

  useEffect(() => {
    const buildMenuUrl = async () => {
      if (!user?.id) {
        setMenuUrl('');
        return;
      }
      try {
        const res = await localDb.meta();
        const ips: string[] = Array.isArray(res?.data?.ips) ? res.data.ips : [];
        const lan = ips.find((ip) => ip && !ip.startsWith('127.') && !ip.startsWith('0.') && ip !== '::1');
        if (lan) {
          setMenuUrl(`http://${lan}:${window.location.port}/menu?b=${user.id}`);
          return;
        }
      } catch { /* usa el fallback */ }
      setMenuUrl(`${window.location.origin}/menu?b=${user.id}`);
    };
    buildMenuUrl();
  }, [user?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) {
      return;
    }
    
    if (!user) return;
    if (!formData.name.trim()) {
      toast.error('El nombre no puede estar vacío');
      return;
    }
    if (formData.businessName && formData.businessName.trim().length > 100) {
      toast.error('El nombre del negocio es demasiado largo (máx. 100 caracteres)');
      return;
    }

    const hasFormChanges = formData.name !== user.name || 
      formData.businessName !== user.businessName ||
      formData.generateTicket !== user.generateTicket ||
      formData.ticketMessage !== user.ticketMessage ||
      formData.phone !== (user.phone || '') ||
      formData.address !== (user.address || '') ||
      formData.businessHours !== (user.businessHours || '') ||
      formData.businessCode !== (user.businessCode || '');

    const hasCurrencyChanges = 
      currencySettings.usdEnabled !== (user.usdEnabled ?? false) ||
      currencySettings.usdRate !== (user.usdRate ?? 320) ||
      currencySettings.eurEnabled !== (user.eurEnabled ?? false) ||
      currencySettings.eurRate !== (user.eurRate ?? 350) ||
      currencySettings.cupTransferEnabled !== (user.cupTransferEnabled ?? false);

    if (!hasFormChanges && !hasCurrencyChanges) {
      toast.info('No hay cambios que guardar');
      return;
    }

    if (currencySettings.usdEnabled) {
      const usdValidation = validateNumber(String(currencySettings.usdRate), { required: true, min: 1, fieldName: 'Tasa USD' });
      if (!usdValidation.isValid) {
        toast.error(usdValidation.error);
        setIsSaving(false);
        setIsSubmitting(false);
        return;
      }
    }
    
    if (currencySettings.eurEnabled) {
      const eurValidation = validateNumber(String(currencySettings.eurRate), { required: true, min: 1, fieldName: 'Tasa EUR' });
      if (!eurValidation.isValid) {
        toast.error(eurValidation.error);
        setIsSaving(false);
        setIsSubmitting(false);
        return;
      }
    }
    
    setIsSaving(true);
    setIsSubmitting(true);
    
    try {
      // Versión desktop local: los datos de perfil viven en user_session.
      const updateData: any = {
        name: formData.name,
        businessName: formData.businessName,
        ticketMessage: formData.ticketMessage,
        phone: formData.phone,
        address: formData.address,
        businessHours: formData.businessHours,
        business_code: formData.businessCode.toLowerCase().trim(),
        usdEnabled: currencySettings.usdEnabled ? 1 : 0,
        usdRate: currencySettings.usdRate,
        eurEnabled: currencySettings.eurEnabled ? 1 : 0,
        eurRate: currencySettings.eurRate,
        cupTransferEnabled: currencySettings.cupTransferEnabled ? 1 : 0,
      };

    const { error } = await localDb
      .from('user_session')
      .update(updateData)
      .eq('id', user.id);

      if (error) {
        let errorMessage = 'Error al guardar la configuración';
        if (error.message.includes('row-level security')) {
          errorMessage = 'No tiene permisos para modificar estos datos';
        } else if (error.message.includes('duplicate')) {
          errorMessage = 'Ya existe un registro con estos datos';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = 'Error de conexión con el servidor local';
        }
        if (import.meta.env.DEV) console.error('Error guardado:', errorMessage, error);
        toast.error(errorMessage);
        setIsSaving(false);
        setIsSubmitting(false);
      } else {
        try {
          await fetchUser();
        } catch (fetchError) {
          if (import.meta.env.DEV) console.warn('No se pudo recargar el usuario:', fetchError);
        }
        
        try {
          await useDatabaseStore.getState().logAction('settings', 'CONFIG', {
            changes: Object.keys(formData).filter(k => formData[k as keyof typeof formData] !== (user as any)?.[k]).join(', ')
          });
        } catch (logError) {
          if (import.meta.env.DEV) console.warn('No se pudo registrar la acción:', logError);
        }
        
        toast.success('Configuración guardada exitosamente');
        setIsSaving(false);
        setIsSubmitting(false);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Excepción en guardado:', err);
      toast.error('Error inesperado al guardar');
      setIsSaving(false);
      setIsSubmitting(false);
    }
  };

  const handleLicenseActivate = async () => {
    if (!licenseKey.trim()) {
      toast.error('Ingrese la clave de activación');
      return;
    }
    setActivating(true);
    const res = await activateLicense(licenseKey);
    setActivating(false);
    if (res.success) {
      toast.success('Licencia activada correctamente');
      setLicenseKey('');
      setShowLicenseModal(false);
      await fetchUser();
    } else {
      toast.error(res.error || 'Clave de activación inválida');
    }
  };

  return (
    <>
      <div className="space-y-6 max-w-7xl">
        <OfflineLimitBanner moduleName="Configuración" />
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-text">Configuración</h1>
          <p className="text-sm text-text-secondary">
            Administre su cuenta, preferencias y sistema
          </p>
        </div>

        {/* ============================================
            SECCIÓN 1: CUENTA Y PERFIL
            Grid de 2 columnas
            ============================================ */}
        <div className="grid gap-6 md:grid-cols-2">
          
          {/* 1.1 Estado de la Cuenta y Licencia */}
          <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_-5px_rgba(255,193,7,0.15)]">
            <h2 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Estado de la Cuenta
            </h2>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-text-secondary">Rol</span>
                <span className="font-medium text-text capitalize">{user?.role === 'owner' ? 'Dueño' : user?.role}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-text-secondary">Licencia</span>
                <div className="inline-flex items-center rounded-full border border-primary/50 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {user?.license?.status === 'active'
                    ? 'Activa'
                    : user?.license?.status === 'trialing'
                      ? 'Prueba Gratis'
                      : 'Vencida'}
                </div>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-text-secondary">Código de negocio</span>
                <span className="font-mono font-medium tracking-widest text-primary">{user?.businessCode || '—'}</span>
              </div>
              {user?.license?.status === 'active' && user?.license?.validUntil && (
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-text-secondary">Válida hasta</span>
                  {esVitalicia(user.license.validUntil) ? (
                    <Badge variant="vitalicia">
                      <Crown className="h-3 w-3 text-primary" />
                      <span className="vitalicia-text">Licencia vitalicia</span>
                    </Badge>
                  ) : (
                    <span className="font-medium text-text">
                      {new Date(user.license.validUntil).toLocaleDateString('es-ES')} ({user.license.daysRemaining} días)
                    </span>
                  )}
                </div>
              )}
              {user?.license?.status === 'trialing' && (
                <>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-text-secondary">Fin de prueba</span>
                    <span className="font-medium text-text">
                      {user.license.trialEndsAt
                        ? `${new Date(user.license.trialEndsAt).toLocaleDateString('es-ES')} (${user.license.daysRemaining} días)`
                        : '—'}
                    </span>
                  </div>
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-text-secondary">
                    Al vencer la prueba necesita activar su licencia. Coordine el pago mensual de{' '}
                    <strong>5,000 CUP</strong> con el vendedor (+53 54523884) y active con su clave.
                  </div>
                </>
              )}
              {user?.license?.status === 'expired' && (
                <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-text-secondary">
                  Su licencia está vencida: la app está en modo solo-lectura. Coordine el pago mensual con el
                  vendedor (+53 54523884) para recibir su clave de activación.
                </div>
              )}
              <button
                onClick={() => setShowLicenseModal(true)}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary/10 border border-primary/30 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <KeyRound className="h-4 w-4" />
                Activar / renovar licencia
              </button>
              {user?.license?.isDeveloper && (
                <Link
                  to="/dashboard/license"
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-border/50 bg-surface-hover/50 px-3 py-2 text-sm font-medium text-text transition-colors hover:border-primary/30 hover:text-primary"
                >
                  <KeyRound className="h-4 w-4" />
                  Gestión avanzada de licencia
                </Link>
              )}
            </div>
          </div>

          {/* 1.2 Perfil del Usuario */}
          <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_-5px_rgba(255,193,7,0.15)]">
            <h2 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Perfil del Usuario
            </h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs">Nombre</Label>
                  <Input 
                    id="name" 
                    value={formData.name}
                    onChange={e => setFormData(prev => ({...prev, name: e.target.value}))}
                    maxLength={100}
                    className="h-9"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="businessName" className="text-xs">Negocio</Label>
                <Input 
                  id="businessName" 
                  value={formData.businessName}
                  onChange={e => setFormData(prev => ({...prev, businessName: e.target.value}))}
                  maxLength={100}
                  className="h-9"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="phone" className="text-xs">Teléfono</Label>
                  <Input 
                    id="phone" 
                    value={formData.phone}
                    onChange={e => setFormData(prev => ({...prev, phone: e.target.value}))}
                    placeholder="+53..."
                    maxLength={20}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="businessHours" className="text-xs">Horario</Label>
                  <Input 
                    id="businessHours" 
                    value={formData.businessHours}
                    onChange={e => setFormData(prev => ({...prev, businessHours: e.target.value}))}
                    placeholder="Lun-Vie: 9am-6pm"
                    maxLength={100}
                    className="h-9"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="address" className="text-xs">Dirección</Label>
                <Input 
                  id="address" 
                  value={formData.address}
                  onChange={e => setFormData(prev => ({...prev, address: e.target.value}))}
                  placeholder="Calle 123, Ciudad"
                  maxLength={200}
                  className="h-9"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="businessCode" className="text-xs">Código de Acceso</Label>
                <Input 
                  id="businessCode" 
                  value={formData.businessCode}
                  onChange={e => setFormData(prev => ({...prev, businessCode: e.target.value.toLowerCase().trim()}))}
                  placeholder="micafe"
                  maxLength={30}
                  className="h-9"
                />
                <p className="text-xs text-text-secondary">Para empleados con PIN</p>
              </div>

              <div className="pt-2">
                <Button type="submit" size="sm" className="gap-2" disabled={isOffline || isSaving || isSubmitting} title={isOffline ? offlineMessage : undefined}>
                  <Save className="h-3 w-3" />
                  {isSaving ? 'Guardando...' : 'Guardar'}
                  {isOffline && <WifiOff className="h-3 w-3 ml-1 opacity-60" />}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* ============================================
            SECCIÓN 2: VENTAS Y PUNTO DE VENTA
            Card completo con sub-secciones
            ============================================ */}
        <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_-5px_rgba(255,193,7,0.15)]">
          <h2 className="text-lg font-semibold text-text mb-6 flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Ventas y Punto de Venta
          </h2>
          
          <div className="grid gap-6 lg:grid-cols-3">
            {/* 2.1 Ticket */}
            <div className="space-y-4">
              <h3 className="font-medium text-text flex items-center gap-2">
                <Printer className="h-4 w-4 text-text-secondary" />
                Ticket
              </h3>
              <div className="flex items-center justify-between p-3 bg-bg/50 rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-sm">Generar ticket</Label>
                  <p className="text-xs text-text-secondary">Después de cada venta</p>
                </div>
                <Switch
                  checked={formData.generateTicket}
                  onCheckedChange={(checked) => setFormData(prev => ({...prev, generateTicket: checked}))}
                />
              </div>
              {formData.generateTicket && (
                <div className="space-y-1">
                  <Label className="text-xs">Mensaje del ticket</Label>
                  <Input 
                    value={formData.ticketMessage}
                    onChange={e => setFormData(prev => ({...prev, ticketMessage: e.target.value}))}
                    maxLength={100}
                    className="h-10 sm:h-8"
                  />
                </div>
              )}
            </div>

            {/* 2.2 Monedas */}
            <div className="space-y-4">
              <h3 className="font-medium text-text flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-text-secondary" />
                Monedas
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-bg/50 rounded-lg">
                  <Label className="text-sm">USD</Label>
                  <Switch
                    checked={currencySettings.usdEnabled}
                    onCheckedChange={(checked) => setCurrencySettings(prev => ({...prev, usdEnabled: checked}))}
                  />
                </div>
                {currencySettings.usdEnabled && (
                  <Input 
                    type="number"
                    min="1"
                    value={currencySettings.usdRate}
                    onChange={e => setCurrencySettings(prev => ({...prev, usdRate: Number(e.target.value)}))}
                    className="h-10 sm:h-8 text-sm"
                    placeholder="Tasa USD→CUP"
                  />
                )}
                <div className="flex items-center justify-between p-2 bg-bg/50 rounded-lg">
                  <Label className="text-sm">EUR</Label>
                  <Switch
                    checked={currencySettings.eurEnabled}
                    onCheckedChange={(checked) => setCurrencySettings(prev => ({...prev, eurEnabled: checked}))}
                  />
                </div>
                {currencySettings.eurEnabled && (
                  <Input 
                    type="number"
                    min="1"
                    value={currencySettings.eurRate}
                    onChange={e => setCurrencySettings(prev => ({...prev, eurRate: Number(e.target.value)}))}
                    className="h-10 sm:h-8 text-sm"
                    placeholder="Tasa EUR→CUP"
                  />
                )}
                <div className="flex items-center justify-between p-2 bg-bg/50 rounded-lg">
                  <Label className="text-sm">CUP Transferencia</Label>
                  <Switch
                    checked={currencySettings.cupTransferEnabled}
                    onCheckedChange={(checked) => setCurrencySettings(prev => ({...prev, cupTransferEnabled: checked}))}
                  />
                </div>
              </div>
            </div>

            {/* 2.3 Menú Digital */}
            <div className="space-y-4">
              <h3 className="font-medium text-text flex items-center gap-2">
                <QrCode className="h-4 w-4 text-text-secondary" />
                Menú Digital
              </h3>
              <div className="bg-bg/50 rounded-lg p-3 space-y-3">
                {user?.id && (
                  <>
                    <div className="flex justify-center">
                      <div id="qr-code" className="bg-white p-2 rounded-lg max-w-full overflow-hidden">
                        <QRCode
                          value={menuUrl}
                          size={Math.min(120, window.innerWidth - 100)}
                          level="H"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={menuUrl}
                        className="h-7 text-xs font-mono"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => {
                          if (user?.id) {
                            navigator.clipboard.writeText(menuUrl);
                            toast.success('Copiado');
                          }
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7"
                      onClick={() => {
                        const svg = document.querySelector('#qr-code svg') as SVGElement;
                        if (svg) {
                          const svgData = new XMLSerializer().serializeToString(svg);
                          const canvas = document.createElement('canvas');
                          const ctx = canvas.getContext('2d');
                          const img = new Image();
                          const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                          const url = URL.createObjectURL(svgBlob);
                          img.onload = () => {
                            canvas.width = 200;
                            canvas.height = 200;
                            ctx?.drawImage(img, 0, 0, 200, 200);
                            const link = document.createElement('a');
                            link.href = canvas.toDataURL('image/png');
                            link.download = 'menu-qr.png';
                            link.click();
                            toast.success('QR descargado');
                          };
                          img.src = url;
                        }
                      }}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Descargar
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ============================================
            SECCIÓN 4: CONTROL DE ACCESO
            Card completo
            ============================================ */}
        <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_-5px_rgba(255,193,7,0.15)]">
          <h2 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Control de Acceso
          </h2>
          <AccessPinsConfig />
        </div>

        </div>

        {/* ============================================
            MODAL: ACTIVAR / RENOVAR LICENCIA
            ============================================ */}
        {showLicenseModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => !activating && setShowLicenseModal(false)}>
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
                    <KeyRound className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-text">Activar / renovar licencia</h3>
                    <p className="text-sm text-text-secondary">Ingrese su clave de activación</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowLicenseModal(false)}
                  disabled={activating}
                  className="text-text-secondary hover:text-text transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-4 rounded-lg border border-border/50 bg-bg/40 p-3 text-sm text-text-secondary">
                <p className="font-medium text-text">Código de negocio</p>
                <p className="mt-1 text-xl font-bold tracking-widest text-primary">{user?.businessCode || '—'}</p>
                <p className="mt-1 text-xs">
                  Coordine el pago mensual de <strong>5,000 CUP</strong> con el vendedor (+53 54523884) y
                  envíe este código para recibir su clave.
                </p>
              </div>

              <label className="mb-1 block text-sm font-medium text-text">Clave de activación</label>
              <input
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleLicenseActivate();
                  }
                }}
                placeholder="XXXXX XXXXX XXXXX XXXXX"
                autoFocus
                className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 placeholder:text-text-secondary/60"
              />

              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowLicenseModal(false)}
                  disabled={activating}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:text-text transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleLicenseActivate}
                  disabled={activating}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-bg transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <KeyRound className="h-4 w-4" />
                  {activating ? 'Activando...' : 'Activar'}
                </button>
              </div>
            </div>
          </div>
        )}

      </>
    );
  }

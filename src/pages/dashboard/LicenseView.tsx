import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { KeyRound, Copy, Check, RefreshCw, Clock, Shield, Lock, AlertTriangle, Crown } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/Badge';
import { toast } from 'sonner';
import { cn, esVitalicia } from '../../lib/utils';

const MONTH_OPTIONS = [1, 3, 6, 12];
const VITALICIA_DATE = '2900-12-31';

export default function LicenseView() {
  const { user, generateLicense, simulateLicense } = useAuthStore();

  const [genCode, setGenCode] = useState(user?.businessCode || '');
  const [genMonths, setGenMonths] = useState(1);
  const [genUntil, setGenUntil] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [generatedValidUntil, setGeneratedValidUntil] = useState('');
  const [generating, setGenerating] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!user?.license?.isDeveloper) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-text">Gestión avanzada de licencia</h1>
          <p className="text-sm text-text-secondary">Herramienta de desarrollador</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-surface/80 p-8 text-center">
          <Lock className="mx-auto h-10 w-10 text-text-secondary mb-3" />
          <h2 className="text-lg font-semibold text-text">Herramienta no disponible</h2>
          <p className="text-sm text-text-secondary mt-2 max-w-md mx-auto">
            Esta herramienta solo está disponible en la máquina del vendedor (donde existe la clave privada).
          </p>
        </div>
      </div>
    );
  }

  const handleGenerate = async () => {
    const code = genCode.trim().toUpperCase();
    if (!code) {
      toast.error('Ingresá el código de negocio');
      return;
    }
    setGenerating(true);
    try {
      const res = await generateLicense(code, genMonths, genUntil.trim() || undefined);
      if (!res.success) {
        toast.error(res.error || 'No se pudo generar la clave');
        return;
      }
      setGeneratedKey(res.key || '');
      setGeneratedValidUntil(res.validUntil || '');
      toast.success('Clave generada correctamente');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedKey) return;
    try {
      await navigator.clipboard.writeText(generatedKey.replace(/\s/g, ''));
      setCopied(true);
      toast.success('Clave copiada al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No se pudo copiar la clave');
    }
  };

  const runSimulate = async (action: string, opts?: { code?: string; months?: number; until?: string }) => {
    setSimulating(true);
    try {
      const res = await simulateLicense(action, opts);
      if (!res.success) {
        toast.error(res.error || 'No se pudo simular');
        return;
      }
      if (res.key) {
        setGeneratedKey(res.key);
        setGeneratedValidUntil('');
      }
      toast.success('Estado simulado correctamente');
    } finally {
      setSimulating(false);
    }
  };

  const confirmSimulate = (action: string, label: string, opts?: { code?: string; months?: number; until?: string }) => {
    if (!window.confirm(`¿Simular "${label}"? Esta acción modifica el estado de licencia de esta instalación.`)) return;
    runSimulate(action, opts);
  };

  const statusLabel =
    user?.license?.status === 'active'
      ? 'Activa'
      : user?.license?.status === 'trialing'
        ? 'Prueba Gratis'
        : 'Vencida';

  const maxClockRaw = user?.license?.maxSeenTime ?? null;
  const maxClockInFuture =
    !!maxClockRaw && Number.isFinite(new Date(maxClockRaw).getTime()) && new Date(maxClockRaw).getTime() > Date.now();
  const maxClockLabel = maxClockRaw
    ? new Date(maxClockRaw).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">Gestión avanzada de licencia</h1>
        <p className="text-sm text-text-secondary">
          Herramienta de desarrollador: generar claves y simular estados de licencia
        </p>
      </div>

      {/* Estado actual */}
      <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Estado actual
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-text-secondary">Licencia</span>
            <span
              className={cn(
                'inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                user?.license?.status === 'active' && 'border-primary/50 bg-primary/10 text-primary',
                user?.license?.status === 'trialing' && 'border-warning/50 bg-warning/10 text-warning',
                user?.license?.status === 'expired' && 'border-danger/50 bg-danger/10 text-danger'
              )}
            >
              {statusLabel}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-text-secondary">Código de negocio</span>
            <span className="font-mono tracking-widest text-primary">{user?.businessCode || '—'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-text-secondary">Válida hasta</span>
            <span className="font-medium text-text">
              {user?.license?.validUntil
                ? esVitalicia(user.license.validUntil)
                  ? 'Vitalicia'
                  : new Date(user.license.validUntil).toLocaleDateString('es-ES')
                : '—'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-text-secondary">Reloj máx. detectado</span>
            <span
              title={maxClockRaw ?? undefined}
              className={cn(
                'font-medium text-sm',
                maxClockInFuture ? 'text-warning' : 'text-text-secondary'
              )}
            >
              {maxClockInFuture && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
              {maxClockLabel}
              {maxClockInFuture && <span className="text-xs"> (reloj futuro)</span>}
            </span>
          </div>
        </div>
      </div>

      {/* Generar clave */}
      <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          Generar clave de activación
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="gen-code">Código de negocio</Label>
            <Input
              id="gen-code"
              value={genCode}
              onChange={(e) => setGenCode(e.target.value.toUpperCase())}
              placeholder="Ej: ABC123"
              className="font-mono uppercase"
            />
          </div>
          <div className="space-y-2">
            <Label>Duración</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {MONTH_OPTIONS.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setGenMonths(m);
                    setGenUntil('');
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    genMonths === m && !genUntil
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border bg-transparent text-text-secondary hover:bg-surface-hover'
                  )}
                >
                  {m} {m === 1 ? 'mes' : 'meses'}
                </button>
              ))}
              <button
                onClick={() => {
                  setGenMonths(0);
                  setGenUntil(VITALICIA_DATE);
                }}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  genUntil === VITALICIA_DATE
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border bg-transparent text-text-secondary hover:bg-surface-hover'
                )}
              >
                Vitalicia
              </button>
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="gen-until">Vencimiento exacto (opcional, reemplaza la duración)</Label>
            <Input
              id="gen-until"
              type="date"
              value={genUntil}
              onChange={(e) => setGenUntil(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4 mr-2" />
            )}
            {generating ? 'Generando…' : 'Generar clave'}
          </Button>
        </div>

        {generatedKey && (
          <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <span className="text-sm font-medium text-text">Clave generada</span>
              {generatedValidUntil && (
                <span className="text-xs text-text-secondary">
                  {esVitalicia(generatedValidUntil) ? (
                    <Badge variant="vitalicia">
                      <Crown className="h-3 w-3 text-primary" />
                      <span className="vitalicia-text">Licencia vitalicia</span>
                    </Badge>
                  ) : (
                    `Válida hasta ${new Date(generatedValidUntil).toLocaleDateString('es-ES')}`
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg border border-border bg-bg/60 px-3 py-2 text-sm text-text font-mono">
                {generatedKey}
              </code>
              <Button variant="secondary" size="sm" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copiada' : 'Copiar'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Simular estados */}
      <div className="rounded-xl border border-border/50 bg-surface/80 backdrop-blur-sm p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text mb-1 flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Simular estados de licencia
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          Replica <code className="font-mono text-xs">scripts/simular-licencia.mjs</code>. Cada acción
          refresca el estado mostrado en toda la app.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Button variant="secondary" disabled={simulating} onClick={() => runSimulate('trial')}>
            Reiniciar prueba (7 días)
          </Button>
          <Button
            variant="secondary"
            disabled={simulating}
            onClick={() => confirmSimulate('expired', 'forzar vencida')}
          >
            <AlertTriangle className="h-4 w-4 mr-2 text-danger" />
            Forzar vencida
          </Button>
          <Button
            variant="secondary"
            disabled={simulating}
            onClick={() =>
              confirmSimulate('activate', 'activar licencia', {
                code: genCode.trim() || user?.businessCode,
                months: genMonths,
                until: genUntil.trim() || undefined,
              })
            }
          >
            <KeyRound className="h-4 w-4 mr-2" />
            Activar (genera y aplica clave)
          </Button>
          <Button
            variant="secondary"
            disabled={simulating}
            onClick={() => confirmSimulate('rollback', 'retroceso de reloj')}
          >
            Simular retroceso de reloj
          </Button>
          <Button
            variant="secondary"
            disabled={simulating}
            onClick={() => confirmSimulate('clear-rollback', 'limpiar marcador de reloj')}
          >
            Limpiar marcador de reloj
          </Button>
        </div>
      </div>
    </div>
  );
}

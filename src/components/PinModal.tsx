import { useState, useEffect } from 'react';
import { X, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useDatabaseStore } from '../store/dbStore';
import { useModalAnimation } from '../lib/animations/useModalAnimation';
import { useFocusTrap } from '../lib/hooks/useFocusTrap';

interface PinModalProps {
  isOpen: boolean;
  moduleName: string;
  onSuccess: () => void;
  onCancel: () => void;
  isInitialVerification?: boolean;
}

export default function PinModal({ isOpen, moduleName, onSuccess, onCancel, isInitialVerification }: PinModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const { verifyPinForModule, verifyPinSimple } = useDatabaseStore();
  const { backdropRef, cardRef } = useModalAnimation(isOpen);
  useFocusTrap(isOpen, cardRef);

  useEffect(() => {
    if (blocked && remainingTime > 0) {
      const timer = setTimeout(() => setRemainingTime(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else if (blocked && remainingTime === 0) {
      setBlocked(false);
      setError('');
    }
  }, [blocked, remainingTime]);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setShowPin(false);
      const inputElement = document.getElementById('pin-input-field');
      if (inputElement) {
        (inputElement as HTMLInputElement).value = '';
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerify = async () => {
    if (pin.length < 4) {
      setError('El PIN debe tener al menos 4 dígitos');
      return;
    }

    setIsVerifying(true);
    let result;
    if (isInitialVerification) {
      result = await verifyPinSimple(pin);
    } else {
      result = await verifyPinForModule(moduleName, pin);
    }
    setIsVerifying(false);
    
    if (result.success) {
      onSuccess();
    } else if (result.blocked) {
      setBlocked(true);
      setRemainingTime(result.remainingTime || 300);
      setError(result.error || 'PIN bloqueado. Intente más tarde.');
    } else {
      setError(result.error || 'PIN incorrecto');
      setPin('');
      useDatabaseStore.getState().fetchAll();
    }
  };

  const handleNumberClick = (num: string) => {
    if (pin.length < 24) {
      setError('');
      setPin(pin + num);
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError('');
  };

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm modal-backdrop">
      <div ref={cardRef} role="dialog" aria-modal="true" aria-label={isInitialVerification ? 'Identificación por PIN' : 'Verificar PIN'} className="w-full max-w-sm rounded-2xl border border-border/50 bg-surface p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/20 p-2">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text">
                {isInitialVerification ? 'Identificación' : 'Verificar PIN'}
              </h2>
              <p className="text-xs text-text-secondary">
                {isInitialVerification 
                  ? 'Ingresa su PIN para poder usar el sistema' 
                  : 'Ingrese su PIN para acceder'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            aria-label="Cerrar"
            className="rounded-full p-2 text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6">
          <div className="relative mb-4">
            <Input
              type="text"
              name="pin-field-no-autofill"
              value={pin}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 24);
                setPin(value);
                setError('');
              }}
              placeholder="0000"
              aria-label="Ingrese su PIN de al menos 4 dígitos"
              className="h-12 text-center text-2xl font-mono tracking-[0.5em] pr-12"
              style={{
                WebkitTextSecurity: showPin ? 'none' : 'disc',
                MozAppearance: 'textfield'
              } as React.CSSProperties}
              disabled={blocked || isVerifying}
              maxLength={24}
              autoComplete="new-password"
              inputMode="numeric"
              id="pin-input-field"
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text"
              disabled={blocked || isVerifying}
            >
              {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          
          {isVerifying && (
            <p className="text-center text-sm text-text-secondary mb-2" aria-live="polite">Verificando PIN...</p>
          )}
          
          {!isVerifying && error && (
            <p className="text-center text-sm text-danger mb-2" role="alert">{error}</p>
          )}
          
          {blocked && (
            <p className="text-center text-sm text-warning" aria-live="assertive">
              Desbloqueo en {remainingTime} segundos...
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(key => (
            <button
              key={key}
              disabled={blocked || (key === '')}
              onClick={() => key === 'del' ? handleDelete() : key && handleNumberClick(key)}
              aria-label={key === 'del' ? 'Borrar dígito' : key || undefined}
              className={`h-12 rounded-lg text-lg font-medium transition-colors ${
                key === 'del'
                  ? 'bg-surface-hover text-danger hover:bg-danger/20'
                  : key === ''
                  ? 'bg-transparent'
                  : 'bg-surface-hover text-text hover:bg-primary/20'
              } disabled:opacity-50`}
            >
              {key === 'del' ? '←' : key}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={blocked}
          >
            Cancelar
          </Button>
          <Button
            className="flex-1"
            onClick={handleVerify}
            disabled={blocked || pin.length < 4}
          >
            {isInitialVerification ? 'Identificarse' : 'Verificar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
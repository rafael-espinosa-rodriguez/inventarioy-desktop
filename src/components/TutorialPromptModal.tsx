import { useState, useEffect } from 'react';
import { Play, X, Check, CheckCircle2 } from 'lucide-react';

const STORAGE_KEY = 'tutorial_prompt_dismissed';

export function shouldShowTutorialPrompt(): boolean {
  if (typeof window === 'undefined') return false;
  return !localStorage.getItem(STORAGE_KEY);
}

interface TutorialPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
}

export default function TutorialPromptModal({ isOpen, onClose, onAccept }: TutorialPromptModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDontShowAgain(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    onClose();
  };

  const handleAccept = () => {
    if (dontShowAgain) {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    onAccept();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-prompt-title"
    >
      <div className="w-full max-w-md mx-4 bg-surface rounded-2xl border border-border/50 shadow-2xl p-6 space-y-4 modal-transition">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
            <Play className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 id="tutorial-prompt-title" className="text-xl font-semibold text-text">
              ¿Desea aprender a usar la App?
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Descubra cómo sacarle el máximo rendimiento a su negocio en Cuba con InventarioY
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer px-1">
          <div className="relative flex items-center justify-center">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="peer h-4 w-4 appearance-none rounded border border-border bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-surface checked:bg-primary checked:border-primary transition-colors"
              aria-label="No mostrar de nuevo"
            />
            <Check className="absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" />
          </div>
          <span className="text-sm text-text-secondary">No mostrar de nuevo</span>
        </label>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleClose}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
          >
            <X className="h-4 w-4" />
            No, gracias
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 shadow-lg shadow-red-500/25 hover:shadow-red-500/40 transition-all duration-300"
          >
            <Play className="h-4 w-4" />
            Sí, ver tutorial
          </button>
        </div>
      </div>
    </div>
  );
}
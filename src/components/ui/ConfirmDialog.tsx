import * as React from "react"
import { AlertTriangle } from "lucide-react"
import { Modal } from "./Modal"
import { Button } from "./button"

export interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  isLoading?: boolean
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "¿Está seguro?",
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = true,
  isLoading = false,
}: ConfirmDialogProps) {
  const confirmRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(() => confirmRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [isOpen])

  const handleConfirm = () => {
    if (isLoading) return
    onConfirm()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} showCloseButton={false} size="sm">
      {destructive && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10">
          <AlertTriangle className="h-6 w-6 text-danger" />
        </div>
      )}
      {description && (
        <p className="text-sm text-text-secondary">{description}</p>
      )}
      <div className="mt-6 flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onClose}
          disabled={isLoading}
        >
          {cancelLabel}
        </Button>
        <Button
          ref={confirmRef}
          variant={destructive ? "destructive" : "default"}
          className="flex-1"
          onClick={handleConfirm}
          disabled={isLoading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

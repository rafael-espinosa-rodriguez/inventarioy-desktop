import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from './ui/Modal';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useDatabaseStore, type ImportProductsResult } from '../store/dbStore';
import { isActive, normalizeStr } from '../lib/utils';
import {
  buildErrorsCsv,
  buildTemplateCsv,
  decodeImportFile,
  downloadTextFile,
  parseImportText,
  type ImportPreview,
} from '../lib/importProducts';

interface ImportProductsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportProductsDialog({ isOpen, onClose }: ImportProductsDialogProps) {
  const { products, importProducts } = useDatabaseStore();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportProductsResult | null>(null);
  const [readError, setReadError] = useState('');

  const existingNames = useMemo(
    () => products.filter(isActive).map(p => normalizeStr(p.name)),
    [products]
  );

  useEffect(() => {
    if (!isOpen) return;
    setText('');
    setFileName('');
    setIsImporting(false);
    setResult(null);
    setReadError('');
  }, [isOpen]);

  const preview: ImportPreview | null = useMemo(() => {
    if (!text.trim()) return null;
    return parseImportText(text, existingNames);
  }, [text, existingNames]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setReadError('');
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const content = decodeImportFile(buffer);
      setText(content);
      setFileName(file.name);
    } catch (error: any) {
      setReadError(error?.message || 'No se pudo leer el archivo');
    }
  };

  const handleTemplate = () => {
    downloadTextFile('plantilla-inventario.csv', buildTemplateCsv());
  };

  const handleDownloadIssues = () => {
    if (!preview) return;
    downloadTextFile('errores-importacion.csv', buildErrorsCsv([...preview.errors, ...preview.duplicates]));
  };

  const handleImport = async () => {
    if (!preview || preview.rows.length === 0 || isImporting) return;
    setIsImporting(true);
    try {
      const res = await importProducts(preview.rows);
      setResult(res);
      if (res.imported > 0) {
        toast.success(`${res.imported} producto${res.imported === 1 ? '' : 's'} importado${res.imported === 1 ? '' : 's'}`);
      } else {
        toast.warning('No se importó ningún producto');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Error al importar el inventario');
    } finally {
      setIsImporting(false);
    }
  };

  const validCount = preview?.rows.length ?? 0;
  const errorCount = preview?.errors.length ?? 0;
  const duplicateCount = preview?.duplicates.length ?? 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Importar inventario"
      description="Cargue sus productos desde Excel (CSV) o pegando las celdas copiadas."
      size="full"
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />
            <span>Descargue la plantilla, complétela en Excel y guárdela como CSV.</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Descargar plantilla
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="import-file" className="text-sm font-medium text-text">Archivo CSV/TSV</label>
            <Input
              id="import-file"
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              onChange={e => handleFile(e.target.files?.[0])}
            />
            {fileName && <p className="text-xs text-text-secondary">Archivo: {fileName}</p>}
            {readError && <p className="text-xs text-danger">{readError}</p>}
          </div>
          <div className="space-y-2">
            <label htmlFor="import-paste" className="text-sm font-medium text-text">o pegue las celdas de Excel</label>
            <textarea
              id="import-paste"
              value={text}
              onChange={e => { setResult(null); setText(e.target.value); }}
              rows={4}
              placeholder={'Nombre;Categoría;Unidad;Cantidad;Costo;Precio\nArroz;Granos y Cereales;kg;10;250;0'}
              className="flex w-full rounded-xl border border-border bg-bg px-3 py-2 font-mono text-xs text-text placeholder:text-text-secondary/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {preview?.fatal && (
          <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{preview.fatal}</span>
          </div>
        )}

        {preview && !preview.fatal && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
              <span className="rounded bg-success/15 px-2 py-1 text-success">{validCount} válidas</span>
              <span className="rounded bg-warning/15 px-2 py-1 text-warning">{duplicateCount} duplicadas (se omiten)</span>
              <span className="rounded bg-danger/15 px-2 py-1 text-danger">{errorCount} con error</span>
              <span className="text-text-secondary">de {preview.totalRows} filas</span>
              {(errorCount > 0 || duplicateCount > 0) && (
                <button type="button" onClick={handleDownloadIssues} className="underline text-text-secondary hover:text-text">
                  Descargar errores
                </button>
              )}
            </div>

            {validCount > 0 && (
              <div className="max-h-64 overflow-auto rounded-xl border border-border">
                <table className="w-full font-mono text-xs">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-border text-left text-text-secondary">
                      <th className="p-2">Fila</th>
                      <th className="p-2">Nombre</th>
                      <th className="p-2">Categoría</th>
                      <th className="p-2">Unidad</th>
                      <th className="p-2 text-right">Cantidad</th>
                      <th className="p-2 text-right">Costo</th>
                      <th className="p-2 text-right">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 50).map(row => (
                      <tr key={row.line} className="border-b border-border/50 last:border-0">
                        <td className="p-2 text-text-secondary">{row.line}</td>
                        <td className="p-2 text-text">{row.name}</td>
                        <td className="p-2 text-text-secondary">{row.category}</td>
                        <td className="p-2 text-text-secondary">{row.unit}</td>
                        <td className="p-2 text-right text-text">{row.quantity}</td>
                        <td className="p-2 text-right text-text">{row.cost}</td>
                        <td className="p-2 text-right text-text">{row.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(errorCount > 0 || duplicateCount > 0) && (
              <div className="max-h-40 space-y-1 overflow-auto rounded-xl border border-border bg-bg p-3 font-mono text-[11px]">
                {preview.duplicates.map(issue => (
                  <div key={`dup-${issue.line}`} className="text-warning">
                    Fila {issue.line} · {issue.name} · {issue.message}
                  </div>
                ))}
                {preview.errors.map(issue => (
                  <div key={`err-${issue.line}`} className="text-danger">
                    Fila {issue.line} · {issue.name} · {issue.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="flex items-start gap-2 rounded-xl border border-success/40 bg-success/10 p-3 text-sm text-text">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <div>
              <p className="font-semibold">Importación terminada</p>
              <p className="text-text-secondary">
                {result.imported} producto{result.imported === 1 ? '' : 's'} importado{result.imported === 1 ? '' : 's'}
                {result.skipped.length > 0 && ` · ${result.skipped.length} omitido${result.skipped.length === 1 ? '' : 's'} por duplicado`}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!result && (
            <Button
              type="button"
              onClick={handleImport}
              disabled={validCount === 0 || isImporting || !!preview?.fatal}
            >
              <Upload className="mr-2 h-4 w-4" />
              {isImporting ? 'Importando…' : `Importar ${validCount} producto${validCount === 1 ? '' : 's'}`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

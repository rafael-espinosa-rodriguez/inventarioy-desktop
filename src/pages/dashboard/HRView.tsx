import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useDatabaseStore } from '../../store/dbStore';
import { useAuthStore } from '../../store/authStore';
import { localDb } from '../../lib/db/localClient';
import { Users, UserPlus, Trash2, Mail, Phone, Briefcase, DollarSign, FileText, Upload, Download, X, FolderOpen, BookOpen, ShieldCheck, Paperclip, Eye, ChevronDown, Building2, Calculator, Settings, RefreshCw, Save, Edit, FileSpreadsheet, Camera, RotateCcw, UserCheck, CreditCard, HandCoins, Plus, CheckCircle2, Clock, Printer, Building, HelpCircle } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { toast } from 'sonner';
import { validateNumber, getNumberFromString, exportToExcel } from '../../lib/utils';
import { calcularLiquidacion } from '../../utils/payrollCalculations';
import { useStaggerEnter } from '../../lib/animations/useStaggerEnter';
import { usePersistentFilters } from '../../lib/hooks/usePersistentFilters';
import { useIsOffline } from '../../hooks/useOfflineDisabled';
import PaginationControls from '../../components/PaginationControls';
import OfflineLimitBanner from '../../components/OfflineLimitBanner';

const DOC_TYPE_LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  REGLAMENTO: 'Reglamento Interno',
  PNO: 'PNO',
  CONTRATO: 'Contrato',
  IDENTIFICACION: 'Identificación',
  OTRO: 'Otro',
};

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Etiquetas de los tipos de deducción/retención
const DEDUCTION_TYPE_LABELS: Record<string, string> = {
  prestamo: 'Préstamo',
  credito_bancario: 'Crédito bancario',
  inasistencia: 'Inasistencia',
  sancion: 'Sanción',
  rotura_equipo: 'Rotura de equipo',
  otro: 'Otro',
};

const DOC_TYPE_PLURALS: Record<string, string> = {
  MANUAL: 'Manuales',
  REGLAMENTO: 'Reglamentos Internos',
  PNO: 'PNOs',
};

const DOC_TYPE_ICONS: Record<string, React.ElementType> = {
  MANUAL: BookOpen,
  REGLAMENTO: ShieldCheck,
  PNO: FolderOpen,
  CONTRATO: FileText,
  IDENTIFICACION: Paperclip,
  OTRO: FileText,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

type HelpSectionKey = 'nomina' | 'prestamos' | 'liquidaciones' | 'configuracion';

interface HelpStep {
  heading: string;
  text: string;
}

interface HelpContent {
  title: string;
  subtitle: string;
  steps: HelpStep[];
}

const HELP_CONTENT: Record<HelpSectionKey, HelpContent> = {
  nomina: {
    title: 'Guía de Nómina',
    subtitle: 'Funcionamiento de la sección',
    steps: [
      {
        heading: '1. Período de cálculo',
        text: 'Para generar la nómina es preciso seleccionar el mes y el año correspondientes en los desplegables situados en la parte superior derecha de la sección. El cálculo se realiza sobre el período elegido.',
      },
      {
        heading: '2. Captación pre-nómina',
        text: 'Antes de generar, la "Captación Pre-nómina" permite definir qué trabajadores aplican en el mes (casilla ✓), sus horas realmente trabajadas, la tasa horaria (por defecto: salario ÷ fondo de tiempo), y sus incidencias: bonificación (BON), anticipo, retención (RET), vacaciones pagadas y nota. El filtro por departamento y las acciones en lote permiten, por ejemplo, bonificar a todo un área. Guarda la captación antes de generar.',
      },
      {
        heading: '3. Generación en Borrador',
        text: 'Al pulsar "Generar Nómina" se crea la nómina SOLO de los trabajadores incluidos. El salario del período es tasa × horas trabajadas. Sobre el bruto (salario + horas extra + bonos + vacaciones) se calculan la base imponible, el IIP (escala Res. 41/2023) y la CESS.',
      },
      {
        heading: '4. Revisión de conceptos',
        text: 'Mientras la nómina está en Borrador, el botón de calculadora de cada fila permite ajustar conceptos (horas extra, bonificaciones, anticipos, cuotas y otras deducciones). El Salario Devengado y los días de vacaciones no son editables en la tabla: se ajustan desde la Captación o los conceptos.',
      },
      {
        heading: '5. Aplicar la nómina',
        text: 'El botón "Aplicar Nómina" certifica el mes: la nómina queda bloqueada e inmutable (como al contabilizar en VERSAT). Solo el Dueño/a puede reabrirla, quedando la acción registrada en el historial de actividad.',
      },
      {
        heading: '6. Deducciones y vacaciones',
        text: 'La columna RET agrupa las deducciones tras impuestos (anticipo + cuota + otras). Las vacaciones se acumulan por mes (configurable) y se debitan al pagarlas: el saldo aparece en "Vac. Acum." (aviso si supera 210 días).',
      },
      {
        heading: '7. Totales del período',
        text: 'Al final de la tabla se presentan los totales por concepto y el Total Salario Devengado (a Pagar). La Seguridad Social patronal (14%) se consulta en la pestaña "Imp. Empresa", pues es un costo de la empresa y no se descuenta al trabajador.',
      },
      {
        heading: '8. Exportación',
        text: 'Los botones de exportación permiten descargar la nómina en formato Excel (estilo SC4-06), así como el modelo TA-6 y la planilla TSS, para su uso en reportes o ante la ONAT.',
      },
      {
        heading: '9. Consideración sobre los socios',
        text: 'De conformidad con el DL 92/2024, los socios no generan IIP ni provisión de vacaciones; su contribución corresponde al 20% de su base de aportación. Por ello, su base imponible se muestra en 0,00.',
      },
    ],
  },
  prestamos: {
    title: 'Guía de Deducciones y Retenciones',
    subtitle: 'Funcionamiento de la sección',
    steps: [
      {
        heading: '1. Registro de la deducción',
        text: 'El registro se efectúa mediante el formulario "Nueva Deducción / Retención": se selecciona el empleado, el tipo (préstamo, crédito bancario, inasistencia, sanción, rotura de equipo u otro), el criterio/motivo, el monto total y la cuota mensual. La fecha de inicio es opcional.',
      },
      {
        heading: '2. Descuento en la nómina',
        text: 'La cuota mensual se descuenta de forma automática de la nómina del empleado en cada período (columna RET, después de aplicar los impuestos), por lo que no requiere gestión manual.',
      },
      {
        heading: '3. Consulta del estado',
        text: 'La tabla "Deducciones / Retenciones de Personal" permite consultar el tipo, el motivo, el monto total, la cuota mensual, el saldo pendiente y el estado (Activo o Pagado).',
      },
      {
        heading: '4. Registro del pago de cuota',
        text: 'Cuando el empleado realice el pago de una cuota, se utiliza el botón de verificación (✓). El sistema registra el pago, reduce el saldo pendiente y, al alcanzar cero, la deducción pasa a estado "Pagado".',
      },
      {
        heading: '5. Eliminación',
        text: 'La eliminación de una deducción se realiza mediante el botón de la papelera. Antes de eliminar el registro, el sistema solicita la confirmación correspondiente.',
      },
    ],
  },
  liquidaciones: {
    title: 'Guía de Liquidaciones',
    subtitle: 'Funcionamiento de la sección',
    steps: [
      {
        heading: '1. Selección del empleado',
        text: 'En el desplegable "Seleccionar empleado..." se elige el trabajador cuya relación laboral finaliza. Los socios no aparecen en la lista por no generar liquidación.',
      },
      {
        heading: '2. Datos del cese',
        text: 'El formulario de liquidación permite revisar y ajustar el salario base, la fecha de alta, la fecha de cese, los días de vacaciones disfrutadas y el tipo de contrato.',
      },
      {
        heading: '3. Cálculo',
        text: 'El sistema calcula de forma automática las vacaciones pendientes (2,5 días por mes trabajado), el auxilio de despido y el preaviso (estos últimos para contratos indeterminados), y presenta el bruto, la CESS, el IIP y el neto a pagar.',
      },
      {
        heading: '4. Registro y consulta',
        text: 'Al guardar la liquidación, el registro queda disponible en el historial para su consulta posterior. Desde dicho historial es posible verla o eliminarla, previa confirmación.',
      },
    ],
  },
  configuracion: {
    title: 'Guía de Configuración',
    subtitle: 'Funcionamiento de la sección',
    steps: [
      {
        heading: '1. Base exenta mensual',
        text: 'La "Base Exenta Mensual" define el monto del salario que queda exento del Impuesto sobre los Ingresos Personales (IIP). El valor establecido por defecto conforme a la Res. 41/2023 es de $3,260.00.',
      },
      {
        heading: '2. Guardado automático',
        text: 'El valor se guarda automáticamente al abandonar el campo (al hacer clic fuera de él o al pulsar la tecla Tab).',
      },
      {
        heading: '3. Incidencia en la nómina',
        text: 'Este parámetro incide en el cálculo del IIP de todos los empleados: la parte del salario bruto que excede la base exenta constituye la base imponible sujeta a la escala progresiva.',
      },
      {
        heading: '4. Escala aplicada',
        text: 'El cálculo aplica la escala de la Res. 41/2023 (3%, 5%, 7,5%, 10%, 15% y 20%) y la Contribución Especial a la Seguridad Social (CESS) del 5% hasta $15,000 y del 10% sobre el exceso.',
      },
    ],
  },
};

function EmployeeDocumentsPanel({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const { employeeDocuments, uploadEmployeeDocument, fetchEmployeeDocuments, deleteEmployeeDocument } = useDatabaseStore();
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [docType, setDocType] = useState<'CONTRATO' | 'IDENTIFICACION' | 'OTRO'>('CONTRATO');
  const [customName, setCustomName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOffline = useIsOffline();
  const [pendingDelete, setPendingDelete] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null);

  const docs = employeeDocuments.filter(d => d.employee_id === employeeId);

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Selecciona un archivo primero');
      return;
    }

    setIsUploading(true);
    const result = await uploadEmployeeDocument(selectedFile, employeeId, docType, customName || undefined);
    setIsUploading(false);

    if (result.success) {
      toast.success('Documento subido exitosamente');
      setShowUploadForm(false);
      setSelectedFile(null);
      setCustomName('');
      setDocType('CONTRATO');
    } else {
      toast.error(result.error || 'Error al subir el documento');
    }
  };

  const handleDelete = (doc: typeof docs[0]) => {
    setPendingDelete({
      title: 'Eliminar documento',
      description: `¿Eliminar el documento "${doc.name}"? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await deleteEmployeeDocument(doc.id, doc.file_url);
          toast.success('Documento eliminado');
        } catch {
          toast.error('Error al eliminar el documento');
        }
      },
    });
  };

  return (
    <div className="mt-4 rounded-xl border border-border bg-bg/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold text-text">Documentos de {employeeName}</h4>
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-secondary">{docs.length}</span>
        </div>
        <Button
          size="sm"
          variant={showUploadForm ? 'ghost' : 'outline'}
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="h-8 gap-1.5 text-xs"
          title={isOffline ? 'Requiere conexión para subir documentos' : (showUploadForm ? 'Cerrar panel de subida' : 'Subir un documento para este empleado')}
          disabled={isOffline}
        >
          {showUploadForm ? <X className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
          {showUploadForm ? 'Cancelar' : 'Subir documento'}
          {isOffline && <span className="text-[10px] opacity-70">(offline)</span>}
        </Button>
      </div>

      {showUploadForm && (
        <div className="mb-4 space-y-3 rounded-lg border border-dashed border-border bg-surface/50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-text-secondary">Tipo de documento *</Label>
                <select
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                  value={docType}
                  onChange={e => setDocType(e.target.value as typeof docType)}
                  title="Tipo de documento que vas a subir"
                >
                  <option value="CONTRATO">Contrato</option>
                  <option value="IDENTIFICACION">Identificación</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-text-secondary">Nombre (opcional)</Label>
                <Input
                  className="h-9 text-sm"
                  placeholder="Ej: Contrato 2024"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  title="Nombre personalizado para identificar el documento"
                />
              </div>
          </div>

          <div
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface/30 p-6 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            title="Arrastra un archivo o haz clic para seleccionar"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) setSelectedFile(file);
              }}
            />
            {selectedFile ? (
              <div className="flex items-center gap-2 text-sm text-success">
                <FileText className="h-4 w-4" />
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-text-secondary">({formatFileSize(selectedFile.size)})</span>
              </div>
            ) : (
              <div className="text-center text-sm text-text-secondary">
                <Upload className="mx-auto mb-2 h-6 w-6 opacity-50" />
                <p>Haz clic o arrastra un archivo</p>
                <p className="text-xs mt-1">PDF, JPG, PNG, DOC, DOCX</p>
              </div>
            )}
          </div>

          <Button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading || isOffline}
            className="w-full gap-2"
            size="sm"
            title={isOffline ? 'Requiere conexión para subir documentos' : 'Subir el documento seleccionado'}
          >
            {isUploading ? 'Subiendo...' : <><Upload className="h-4 w-4" /> Subir documento</>}
            {isOffline && <span className="text-[10px] opacity-70">(offline)</span>}
          </Button>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="py-6 text-center text-sm text-text-secondary">
          No hay documentos cargados para este empleado.
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => {
            const Icon = DOC_TYPE_ICONS[doc.doc_type] || FileText;
            return (
              <div key={doc.id} className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 hover:border-primary/30 transition-colors group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text truncate">{doc.name}</p>
                    <p className="text-xs text-text-secondary flex items-center gap-2">
                      <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase">{DOC_TYPE_LABELS[doc.doc_type]}</span>
                      <span>{formatFileSize(doc.file_size || 0)}</span>
                      <span>{new Date(doc.created_at).toLocaleDateString('es-ES')}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                    title="Ver documento"
                  >
                    <Eye className="h-4 w-4" />
                  </a>
                  <a
                    href={doc.file_url}
                    download={doc.file_name}
                    className="flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-success hover:bg-success/10 transition-colors"
                    title="Descargar"
                  >
                    <Download className="h-4 w-4" />
                  </a>
<button
                      onClick={() => handleDelete(doc)}
                      disabled={isOffline}
                      className={`flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors opacity-0 group-hover:opacity-100 ${isOffline ? 'opacity-30 cursor-not-allowed' : ''}`}
                      title={isOffline ? 'Requiere conexión para eliminar documentos' : 'Eliminar'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={pendingDelete?.title}
        description={pendingDelete?.description}
        confirmLabel="Eliminar"
        onConfirm={() => {
          const action = pendingDelete?.onConfirm;
          setPendingDelete(null);
          if (action) action();
        }}
      />
    </div>
  );
}

export default function HRView() {
  const { user } = useAuthStore();
  const { 
    employees, departments, addEmployee, deleteEmployee, 
    hrDocuments, uploadHRDocument, fetchHRDocuments, deleteHRDocument,
    payrollConfig, payrollEntries, calculatePayroll, getPayrollEntries, 
    updatePayrollConfig, updatePayrollEntry, logAction, forceRefreshData,
    getEmployeesCount, getDepartmentsCount, getPayrollEntriesCount,
    employeeLoans, getEmployeeLoans, addLoan, updateLoan, deleteLoan, payLoanInstallment,
    payrollLiquidations, saveLiquidation, deleteLiquidation,
    payrollDrafts, getPayrollDrafts, savePayrollDrafts,
    payrollPeriod, getPayrollPeriod, applyPayroll, reopenPayroll,
  } = useDatabaseStore();

  const { filters, setFilters, resetFilters } = usePersistentFilters<{
    activeTab: 'personal' | 'departamentos' | 'nomina' | 'prestamos' | 'liquidaciones' | 'configuracion' | 'documentos' | 'impuestos';
    employeeSearchTerm: string;
    departmentsPage: number;
    employeesPage: number;
    payrollPage: number;
  }>('hr', { activeTab: 'personal', employeeSearchTerm: '', departmentsPage: 1, employeesPage: 1, payrollPage: 1 });
  const { activeTab, employeeSearchTerm, departmentsPage, employeesPage, payrollPage } = filters;
  const setActiveTab = (v: 'personal' | 'departamentos' | 'nomina' | 'prestamos' | 'liquidaciones' | 'configuracion' | 'documentos' | 'impuestos') => setFilters({ activeTab: v });
  const setEmployeeSearchTerm = (v: string) => setFilters({ employeeSearchTerm: v });
  const setDepartmentsPage = (v: number | ((p: number) => number)) => setFilters(prev => ({ ...prev, departmentsPage: typeof v === 'function' ? v(prev.departmentsPage) : v }));
  const setEmployeesPage = (v: number | ((p: number) => number)) => setFilters(prev => ({ ...prev, employeesPage: typeof v === 'function' ? v(prev.employeesPage) : v }));
  const setPayrollPage = (v: number | ((p: number) => number)) => setFilters(prev => ({ ...prev, payrollPage: typeof v === 'function' ? v(prev.payrollPage) : v }));
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [uploadDocType, setUploadDocType] = useState<'MANUAL' | 'REGLAMENTO' | 'PNO'>('MANUAL');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedEmployeeDoc, setSelectedEmployeeDoc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newEmployee, setNewEmployee] = useState({
    name: '', role: '', salary: 0, phone: '', email: '', nit_id: '', category: '', hire_date: '', photo_url: '',
    person_type: 'employee' as 'employee' | 'partner', base_contribution: 0,
    contract_type: 'indefinite' as 'indefinite' | 'fixed' | 'probation', contract_end_date: '',
  });
  const [newEmployeePhoto, setNewEmployeePhoto] = useState<File | null>(null);
  const [newEmployeePhotoUrl, setNewEmployeePhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (newEmployeePhoto) {
      const url = URL.createObjectURL(newEmployeePhoto);
      setNewEmployeePhotoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setNewEmployeePhotoUrl(null);
  }, [newEmployeePhoto]);

  const [newDepartment, setNewDepartment] = useState('');
  const [editingDepartment, setEditingDepartment] = useState<{id: string, name: string} | null>(null);
  const [payrollMonth, setPayrollMonth] = useState(() => {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  });
  const [isCalculatingPayroll, setIsCalculatingPayroll] = useState(false);
  const [isCreatingDepartment, setIsCreatingDepartment] = useState(false);
  const [isCreatingEmployee, setIsCreatingEmployee] = useState(false);
  const [receiptEntry, setReceiptEntry] = useState<any | null>(null);
  const [conceptsEntry, setConceptsEntry] = useState<any | null>(null);
  const [showSc406, setShowSc406] = useState(false);
  const [conceptsForm, setConceptsForm] = useState({
    overtime_hours: 0, overtime_type: 'diurna' as 'diurna' | 'nocturna' | 'descanso' | 'feriado',
    bonus: 0, vacation_days: 0, advances: 0, loan_deduction: 0, other_deductions: 0,
  });

  const [loanForm, setLoanForm] = useState({
    employee_id: '', total_amount: 0, monthly_payment: 0, start_date: '',
    deduction_type: 'prestamo' as 'prestamo' | 'credito_bancario' | 'inasistencia' | 'sancion' | 'rotura_equipo' | 'otro',
    reason: '',
  });
  const [isSavingLoan, setIsSavingLoan] = useState(false);
  const [isSavingConcepts, setIsSavingConcepts] = useState(false);
  const [deleteLoanTarget, setDeleteLoanTarget] = useState<any | null>(null);
  const [deleteLiquidationTarget, setDeleteLiquidationTarget] = useState<any | null>(null);
  const [helpModal, setHelpModal] = useState<HelpSectionKey | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ title: string; description: string; onConfirm: () => void; confirmLabel?: string; destructive?: boolean } | null>(null);

  // ── Captación pre-nómina ──────────────────────────────────────────────────
  interface DraftRow {
    include: boolean; worked_hours: number; hourly_rate: number;
    bonus: number; advances: number; retention: number; vacation_days: number; note: string;
  }
  const isOwner = user?.role === 'owner';
  const payrollApplied = payrollPeriod?.status === 'applied';
  const [draftRows, setDraftRows] = useState<Record<string, DraftRow>>({});
  const [draftDeptFilter, setDraftDeptFilter] = useState('');
  const [bulkBonus, setBulkBonus] = useState('');
  const [bulkRetention, setBulkRetention] = useState('');
  const [isSavingDrafts, setIsSavingDrafts] = useState(false);
  const [configMonthlyHours, setConfigMonthlyHours] = useState(190.6);
  const [configVacAccrual, setConfigVacAccrual] = useState(2.5);

  // Fila por defecto de captación para un empleado (fondo completo).
  const defaultDraftRow = (empSalary: number): DraftRow => {
    const mh = payrollConfig?.monthly_hours || 190.6;
    return {
      include: true,
      worked_hours: mh,
      hourly_rate: Math.round((empSalary / mh) * 100) / 100,
      bonus: 0, advances: 0, retention: 0, vacation_days: 0, note: '',
    };
  };

  // Sincroniza las filas de captación con los borradores del mes seleccionado.
  useEffect(() => {
    const store = useDatabaseStore.getState();
    store.getPayrollDrafts(payrollMonth.month, payrollMonth.year).catch(() => {});
    store.getPayrollPeriod(payrollMonth.month, payrollMonth.year).catch(() => {});
  }, [payrollMonth]);

  useEffect(() => {
    const rows: Record<string, DraftRow> = {};
    for (const emp of employees) {
      const d = payrollDrafts.find(x => x.month === payrollMonth.month && x.year === payrollMonth.year && x.employee_id === emp.id);
      const def = defaultDraftRow(emp.salary);
      rows[emp.id] = d ? {
        include: d.include === 1,
        worked_hours: d.worked_hours || def.worked_hours,
        hourly_rate: d.hourly_rate || def.hourly_rate,
        bonus: d.bonus || 0,
        advances: d.advances || 0,
        retention: d.retention || 0,
        vacation_days: d.vacation_days || 0,
        note: d.note || '',
      } : def;
    }
    setDraftRows(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payrollDrafts, employees, payrollMonth, payrollConfig]);

  const updateDraftRow = (empId: string, patch: Partial<DraftRow>) => {
    setDraftRows(prev => ({ ...prev, [empId]: { ...prev[empId], ...patch } }));
  };

  // Persiste la captación tal como se ve en pantalla (lanza error si falla).
  const persistCaptacion = async () => {
    const rows = Object.entries(draftRows).map(([employee_id, r]) => ({
      employee_id,
      include: r.include ? 1 : 0,
      worked_hours: Number(r.worked_hours) || 0,
      hourly_rate: Number(r.hourly_rate) || 0,
      bonus: Number(r.bonus) || 0,
      advances: Number(r.advances) || 0,
      retention: Number(r.retention) || 0,
      vacation_days: Number(r.vacation_days) || 0,
      note: r.note || '',
    }));
    await savePayrollDrafts(payrollMonth.month, payrollMonth.year, rows);
    await getPayrollDrafts(payrollMonth.month, payrollMonth.year);
  };

  const saveCaptacion = async () => {
    setIsSavingDrafts(true);
    try {
      await persistCaptacion();
      toast.success('Captación guardada');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSavingDrafts(false);
    }
  };

  const applyBulkToSelected = (patch: Partial<DraftRow>) => {
    setDraftRows(prev => {
      const next = { ...prev };
      for (const emp of employees) {
        // Aplica solo a los trabajadores incluidos del filtro de departamento actual.
        if (draftDeptFilter && emp.category !== draftDeptFilter) continue;
        const row = next[emp.id];
        if (row && row.include) next[emp.id] = { ...row, ...patch };
      }
      return next;
    });
  };

  const handleApplyPayroll = () => {
    setPendingDelete({
      title: 'Aplicar Nómina',
      description: `¿Certificar y aplicar la nómina de ${MONTH_NAMES[payrollMonth.month - 1]} ${payrollMonth.year}? Una vez aplicada quedará bloqueada y no podrá modificarse (podrás reabrirla como Dueño/a).`,
      confirmLabel: 'Aplicar',
      destructive: false,
      onConfirm: async () => {
        try {
          await applyPayroll(payrollMonth.month, payrollMonth.year);
          toast.success('Nómina aplicada y bloqueada');
        } catch (err) {
          toast.error((err as Error).message);
        }
      },
    });
  };

  const handleReopenPayroll = () => {
    setPendingDelete({
      title: 'Reabrir Nómina',
      description: `¿Reabrir la nómina de ${MONTH_NAMES[payrollMonth.month - 1]} ${payrollMonth.year}? Volverá a estado Borrador y podrá editarse. La acción quedará registrada en el registro de actividad.`,
      confirmLabel: 'Reabrir',
      destructive: false,
      onConfirm: async () => {
        try {
          await reopenPayroll(payrollMonth.month, payrollMonth.year);
          await logAction('payroll', 'REABRIR_NOMINA', { month: payrollMonth.month, year: payrollMonth.year, by: 'owner' });
          toast.success('Nómina reabierta (Borrador)');
        } catch (err) {
          toast.error((err as Error).message);
        }
      },
    });
  };


  const openConceptsModal = (entry: any) => {
    setConceptsEntry(entry);
    setConceptsForm({
      overtime_hours: entry.overtime_hours || 0,
      overtime_type: entry.overtime_type || 'diurna',
      bonus: entry.bonus || 0,
      vacation_days: entry.vacation_days || 0,
      advances: entry.advances || 0,
      loan_deduction: entry.loan_deduction || 0,
      other_deductions: entry.other_deductions || 0,
    });
  };

  const saveConcepts = async () => {
    if (!conceptsEntry) return;
    setIsSavingConcepts(true);
    try {
      const { updatePayrollEntry } = useDatabaseStore.getState();
      await updatePayrollEntry(conceptsEntry.id, {
        overtime_hours: Number(conceptsForm.overtime_hours) || 0,
        overtime_type: conceptsForm.overtime_type,
        bonus: Number(conceptsForm.bonus) || 0,
        vacation_days: Number(conceptsForm.vacation_days) || 0,
        advances: Number(conceptsForm.advances) || 0,
        loan_deduction: Number(conceptsForm.loan_deduction) || 0,
        other_deductions: Number(conceptsForm.other_deductions) || 0,
      });
      await getPayrollEntries(payrollMonth.month, payrollMonth.year);
      setConceptsEntry(null);
      toast.success('Conceptos actualizados');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSavingConcepts(false);
    }
  };

  const saveLoan = async () => {
    const { addLoan } = useDatabaseStore.getState();
    setIsSavingLoan(true);
    try {
      if (!loanForm.employee_id) {
        toast.error('Selecciona un empleado');
        return;
      }
      const total = Number(loanForm.total_amount) || 0;
      const monthly = Number(loanForm.monthly_payment) || 0;
      if (total <= 0) {
        toast.error('El monto total debe ser mayor que 0');
        return;
      }
      if (monthly <= 0 || monthly > total) {
        toast.error('La cuota mensual debe ser mayor que 0 y no superar el monto total');
        return;
      }
      await addLoan({
        employee_id: loanForm.employee_id,
        total_amount: total,
        monthly_payment: monthly,
        start_date: loanForm.start_date || undefined,
        deduction_type: loanForm.deduction_type || 'prestamo',
        reason: loanForm.reason || undefined,
      });
      setLoanForm({ employee_id: '', total_amount: 0, monthly_payment: 0, start_date: '', deduction_type: 'prestamo', reason: '' });
      toast.success('Deducción registrada');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSavingLoan(false);
    }
  };

  const [liquidationEmployee, setLiquidationEmployee] = useState<any | null>(null);
  const [liquidationForm, setLiquidationForm] = useState({
    end_date: new Date().toISOString().slice(0, 10),
    vacation_taken: 0,
  });
  const [liquidationResult, setLiquidationResult] = useState<any | null>(null);
  const [isSavingLiquidation, setIsSavingLiquidation] = useState(false);

  const openLiquidationModal = (employee: any) => {
    setLiquidationEmployee(employee);
    setLiquidationForm({
      end_date: new Date().toISOString().slice(0, 10),
      vacation_taken: 0,
    });
    setLiquidationResult(null);
  };

  const computeLiquidation = () => {
    if (!liquidationEmployee) return;
    const result = calcularLiquidacion({
      baseSalary: liquidationEmployee.salary,
      hireDate: liquidationEmployee.hire_date,
      endDate: liquidationForm.end_date,
      vacationTaken: Number(liquidationForm.vacation_taken) || 0,
      contractType: liquidationEmployee.contract_type || 'indefinite',
    });
    setLiquidationResult(result);
  };

  const guardarLiquidacion = async () => {
    if (!liquidationEmployee || !liquidationResult) return;
    const { saveLiquidation: saveLiq } = useDatabaseStore.getState();
    setIsSavingLiquidation(true);
    try {
      await saveLiq({
        employee_id: liquidationEmployee.id,
        employee_name: liquidationEmployee.name,
        base_salary: liquidationEmployee.salary,
        hire_date: liquidationEmployee.hire_date,
        end_date: liquidationForm.end_date,
        months_worked: liquidationResult.monthsWorked,
        vacation_accumulated: liquidationResult.vacationAccumulated,
        vacation_taken: liquidationResult.vacationTaken,
        vacation_pending: liquidationResult.vacationPending,
        vacation_pay: liquidationResult.vacationPay,
        severance_months: liquidationResult.severanceMonths,
        severance_pay: liquidationResult.severancePay,
        notice_days: liquidationResult.noticeDays,
        notice_pay: liquidationResult.noticePay,
        gross_total: liquidationResult.grossTotal,
        cess: liquidationResult.cess,
        iip: liquidationResult.iip,
        net_total: liquidationResult.netTotal,
      });
      setLiquidationEmployee(null);
      setLiquidationResult(null);
      toast.success('Liquidación guardada');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSavingLiquidation(false);
    }
  };

  const [departmentsTotal, setDepartmentsTotal] = useState(0);
  const [employeesTotal, setEmployeesTotal] = useState(0);
  const [payrollTotal, setPayrollTotal] = useState(0);

  const [configBaseExenta, setConfigBaseExenta] = useState(0);
  
  const [orgDocModal, setOrgDocModal] = useState<'PNO' | 'REGLAMENTO' | null>(null);
  const [orgDocFile, setOrgDocFile] = useState<File | null>(null);
  const [isUploadingOrgDoc, setIsUploadingOrgDoc] = useState(false);
  const [showDocDropdown, setShowDocDropdown] = useState(false);
  
  const orgDocsData = {
    PNO: localStorage.getItem('org_doc_pno') || null,
    REGLAMENTO: localStorage.getItem('org_doc_reglamento') || null,
  };

  useEffect(() => {
    if (payrollConfig) {
      setConfigBaseExenta(payrollConfig.tax_exemption_base);
      setConfigMonthlyHours(payrollConfig.monthly_hours || 190.6);
      setConfigVacAccrual(payrollConfig.vacation_accrual_days || 2.5);
    }
  }, [payrollConfig]);

  useEffect(() => {
    const store = useDatabaseStore.getState();
    store.getEmployeesCount(employeeSearchTerm || undefined).then(count => {
      setEmployeesTotal(count);
    });
  }, [employeeSearchTerm]);

  useEffect(() => {
    const store = useDatabaseStore.getState();
    store.getDepartmentsCount().then(count => {
      setDepartmentsTotal(count);
    });
  }, []);

  useEffect(() => {
    const store = useDatabaseStore.getState();
    store.getEmployeeLoans().catch(() => {});
    store.getLiquidations().catch(() => {});
  }, []);

  useEffect(() => {
    const store = useDatabaseStore.getState();
    if (payrollMonth.month && payrollMonth.year) {
      store.getPayrollEntriesCount(payrollMonth.month, payrollMonth.year).then(count => {
        setPayrollTotal(count);
      });
    }
  }, [payrollMonth]);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const salaryValidation = validateNumber(String(newEmployee.salary), { required: true, min: 1, fieldName: 'Salario' });
    if (!salaryValidation.isValid) {
      toast.error(salaryValidation.error);
      return;
    }

    if (newEmployee.person_type === 'partner') {
      if (!newEmployee.base_contribution || newEmployee.base_contribution < 2000 || newEmployee.base_contribution > 9500) {
        toast.error('La base de contribución del socio debe estar entre $2,000 y $9,500 (DL 92/2024)');
        return;
      }
    }

    try {
      let photoUrl = null;
      if (newEmployeePhoto) {
        const fileName = `employee-${Date.now()}-${newEmployeePhoto.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
        const { data: uploadData, error: uploadError } = await localDb.storage
          .from('hr-documents')
          .upload(fileName, newEmployeePhoto);
        
        if (uploadError) {
          if (import.meta.env.DEV) console.error('Error uploading photo:', uploadError);
          toast.error('Error al subir la foto');
          return;
        }
        
        if (uploadData) {
          const { data: urlData } = localDb.storage.from('hr-documents').getPublicUrl(fileName);
          photoUrl = urlData.publicUrl;
        }
      }

      await addEmployee({ 
        name: newEmployee.name, 
        role: newEmployee.role, 
        salary: newEmployee.salary, 
        phone: newEmployee.phone, 
        email: newEmployee.email, 
        nit_id: newEmployee.nit_id, 
        category: newEmployee.category,
        hire_date: newEmployee.hire_date || undefined,
        photo_url: photoUrl || undefined,
        person_type: newEmployee.person_type,
        base_contribution: newEmployee.person_type === 'partner' ? newEmployee.base_contribution : undefined,
        contract_type: newEmployee.contract_type,
        contract_end_date: newEmployee.contract_type === 'fixed' ? newEmployee.contract_end_date || undefined : undefined,
      });
      setNewEmployee({ name: '', role: '', salary: 0, phone: '', email: '', nit_id: '', category: '', hire_date: '', photo_url: '', person_type: 'employee', base_contribution: 0, contract_type: 'indefinite', contract_end_date: '' });
      setNewEmployeePhoto(null);
      toast.success('Empleado agregado exitosamente');
    } catch (err) {
      toast.error((err as Error).message || 'Error al agregar el empleado');
    }
  };

  const handleUploadDoc = async () => {
    if (!selectedFile) {
      toast.error('Selecciona un archivo primero');
      return;
    }

    setIsUploading(true);
    const result = await uploadHRDocument(selectedFile, uploadDocType);
    setIsUploading(false);

    if (result.success) {
      toast.success('Documento subido exitosamente');
      setSelectedFile(null);
      setUploadDocType('MANUAL');
    } else {
      toast.error(result.error || 'Error al subir el documento');
    }
  };

  const handleDeleteDoc = (doc: typeof hrDocuments[0]) => {
    setPendingDelete({
      title: 'Eliminar documento',
      description: `¿Eliminar "${doc.name}"? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await deleteHRDocument(doc.id, doc.file_url);
          toast.success('Documento eliminado');
        } catch {
          toast.error('Error al eliminar el documento');
        }
      },
    });
  };

  const groupedDocs = hrDocuments.reduce((acc, doc) => {
    if (!acc[doc.doc_type]) acc[doc.doc_type] = [];
    acc[doc.doc_type].push(doc);
    return acc;
  }, {} as Record<string, typeof hrDocuments>);

  const hrTbodyRef = useStaggerEnter<HTMLTableSectionElement>([]);

  // Búsqueda de trabajadores por nombre O número de expediente.
  const filteredEmployeeList = useMemo(() => {
    if (!employeeSearchTerm) return employees;
    const q = employeeSearchTerm.toLowerCase().trim();
    return employees.filter(e =>
      e.name.toLowerCase().includes(q) || String(e.expediente ?? '').includes(q)
    );
  }, [employees, employeeSearchTerm]);

  return (
    <div className="space-y-6">
      <OfflineLimitBanner moduleName="Recursos Humanos" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Recursos Humanos</h1>
          <p className="text-sm text-text-secondary">Gestión de personal y documentación laboral</p>
        </div>

<div className="flex rounded-xl border border-border bg-surface p-1 shadow-sm overflow-x-auto">
          <button
            onClick={() => setActiveTab('personal')}
            className={`flex items-center gap-2 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'personal'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            <Users className="h-4 w-4" />
            <span className="hidden xs:inline">Personal</span>
            <span className="inline xs:hidden">Pers.</span>
          </button>
          <button
            onClick={() => setActiveTab('departamentos')}
            className={`flex items-center gap-2 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'departamentos'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span className="hidden xs:inline">Departamentos</span>
            <span className="inline xs:hidden">Deptos.</span>
          </button>
          <button
            onClick={() => setActiveTab('nomina')}
            title="Genera y consulta la nómina mensual (IIP, CESS, salario social, préstamos)"
            className={`flex items-center gap-2 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'nomina'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            <DollarSign className="h-4 w-4" />
            <span className="hidden xs:inline">Nómina</span>
            <span className="inline xs:hidden">Nóm.</span>
          </button>
          <button
            onClick={() => setActiveTab('prestamos')}
            title="Deducciones y retenciones: préstamos, sanciones, inasistencias (descuento automático en nómina)"
            className={`flex items-center gap-2 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'prestamos'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            <CreditCard className="h-4 w-4" />
            <span className="hidden xs:inline">Deducciones</span>
            <span className="inline xs:hidden">Deduc.</span>
          </button>
          <button
            onClick={() => setActiveTab('impuestos')}
            title="Impuestos de la empresa: seguridad social patronal (14%) por trabajador y mes"
            className={`flex items-center gap-2 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'impuestos'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            <Building className="h-4 w-4" />
            <span className="hidden xs:inline">Imp. Empresa</span>
            <span className="inline xs:hidden">Imp.</span>
          </button>
          <button
            onClick={() => setActiveTab('liquidaciones')}
            title="Calcula la liquidación al cese: vacaciones pendientes, auxilio de despido y preaviso"
            className={`flex items-center gap-2 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'liquidaciones'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span className="hidden xs:inline">Liquidaciones</span>
            <span className="inline xs:hidden">Liq.</span>
          </button>
          <button
            onClick={() => setActiveTab('configuracion')}
            title="Ajusta la base exenta mensual del cálculo de nómina (Res. 41/2023)"
            className={`flex items-center gap-2 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'configuracion'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            <Settings className="h-4 w-4" />
            <span className="hidden xs:inline">Configuración</span>
            <span className="inline xs:hidden">Config.</span>
          </button>
          <button
            onClick={() => setActiveTab('documentos')}
            className={`flex items-center gap-2 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'documentos'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            <FolderOpen className="h-4 w-4" />
            <span className="hidden xs:inline">Biblioteca</span>
            <span className="inline xs:hidden">Docs</span>
          </button>
        </div>
      </div>

      {activeTab === 'personal' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm lg:col-span-1 h-fit">
            <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <UserPlus className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-text">Nuevo Empleado</h2>
            </div>

            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div className="space-y-2">
                <Label>Número de Expediente / Contrato</Label>
                <Input
                  readOnly
                  disabled
                  value={`#${(employees.reduce((m, e) => Math.max(m, e.expediente || 0), 0) || 0) + 1}`}
                  className="bg-bg text-text-secondary cursor-not-allowed"
                />
                <p className="text-xs text-text-secondary">Se asigna automáticamente al registrar. No es editable.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nombre Completo *</Label>
                <Input
                  id="name"
                  required
                  value={newEmployee.name}
                  onChange={e => setNewEmployee({ ...newEmployee, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Puesto / Rol *</Label>
                <Input
                  id="role"
                  required
                  placeholder="Ej: Cajero, Cocinero, Mesero..."
                  value={newEmployee.role}
                  onChange={e => setNewEmployee({ ...newEmployee, role: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de Persona *</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewEmployee({ ...newEmployee, person_type: 'employee' })}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      newEmployee.person_type === 'employee'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-bg text-text-secondary hover:border-primary/50'
                    }`}
                  >
                    <Briefcase className="h-4 w-4" />
                    Empleado
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewEmployee({ ...newEmployee, person_type: 'partner' })}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      newEmployee.person_type === 'partner'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-bg text-text-secondary hover:border-primary/50'
                    }`}
                  >
                    <UserCheck className="h-4 w-4" />
                    Socio
                  </button>
                </div>
                <p className="text-xs text-text-secondary">
                  {newEmployee.person_type === 'employee'
                    ? 'Asalariado: paga IIP y CESS según Res. 41/2023'
                    : 'Socio de Mipyme/CNA: contribución del 20% de la base (DL 92/2024)'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="salary">
                  {newEmployee.person_type === 'partner' ? 'Retiro Mensual *' : 'Salario Básico *'}
                </Label>
                <Input
                  id="salary"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={newEmployee.salary || ''}
                  onChange={e => setNewEmployee({ ...newEmployee, salary: Number(e.target.value) })}
                />
                {newEmployee.person_type === 'partner' && (
                  <p className="text-xs text-text-secondary">Remuneración que el socio retira del negocio cada mes</p>
                )}
              </div>

              {newEmployee.person_type === 'partner' && (
                <div className="space-y-2">
                  <Label htmlFor="base_contribution">Base de Contribución SS *</Label>
                  <Input
                    id="base_contribution"
                    type="number"
                    min="2000"
                    max="9500"
                    step="0.01"
                    required
                    placeholder="Entre $2,000 y $9,500"
                    value={newEmployee.base_contribution || ''}
                    onChange={e => setNewEmployee({ ...newEmployee, base_contribution: Number(e.target.value) })}
                  />
                  <p className="text-xs text-text-secondary">Base de contribución al régimen especial de seguridad social (DL 92/2024). Contribución mensual = 20% de esta base.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono (opcional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  maxLength={10}
                  placeholder="Máximo 10 dígitos"
                  value={newEmployee.phone}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setNewEmployee({ ...newEmployee, phone: val });
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  value={newEmployee.email}
                  onChange={e => setNewEmployee({ ...newEmployee, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nit_id">NIT / Carnet de Identidad (opcional)</Label>
                <Input
                  id="nit_id"
                  maxLength={11}
                  placeholder="Máximo 11 dígitos"
                  value={newEmployee.nit_id}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 11);
                    setNewEmployee({ ...newEmployee, nit_id: val });
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Departamento *</Label>
                <select
                  id="category"
                  required
                  className="flex h-10 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                  value={newEmployee.category}
                  onChange={e => setNewEmployee({ ...newEmployee, category: e.target.value })}
                >
                  <option value="">Seleccionar departamento...</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hire_date">Fecha de Contratación</Label>
                <Input
                  id="hire_date"
                  type="date"
                  value={newEmployee.hire_date}
                  onChange={e => setNewEmployee({ ...newEmployee, hire_date: e.target.value })}
                />
              </div>

              {newEmployee.person_type === 'employee' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="contract_type">Tipo de Contrato *</Label>
                    <select
                      id="contract_type"
                      className="flex h-10 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                      value={newEmployee.contract_type}
                      onChange={e => setNewEmployee({ ...newEmployee, contract_type: e.target.value as any })}
                    >
                      <option value="indefinite">Por tiempo indeterminado</option>
                      <option value="fixed">Por tiempo determinado</option>
                      <option value="probation">Período de prueba</option>
                    </select>
                  </div>
                  {newEmployee.contract_type === 'fixed' && (
                    <div className="space-y-2">
                      <Label htmlFor="contract_end_date">Fecha de Fin de Contrato *</Label>
                      <Input
                        id="contract_end_date"
                        type="date"
                        required
                        value={newEmployee.contract_end_date}
                        onChange={e => setNewEmployee({ ...newEmployee, contract_end_date: e.target.value })}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label>Foto del Empleado</Label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center justify-center w-24 h-24 sm:w-20 sm:h-20 rounded-lg border-2 border-dashed border-border hover:border-primary cursor-pointer transition-colors overflow-hidden bg-bg">
                    {newEmployeePhoto ? (
                      <img src={newEmployeePhotoUrl || ''} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <Camera className="h-6 w-6 text-text-secondary" />
                        <span className="text-[10px] text-text-secondary">Subir</span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          if (file.size > 500 * 1024) {
                            toast.warning('Archivo muy grande. Se recomienda max 500KB para mejor rendimiento.');
                          }
                          setNewEmployeePhoto(file);
                        }
                      }}
                    />
                  </label>
                  {newEmployeePhoto && (
                    <button
                      type="button"
                      onClick={() => setNewEmployeePhoto(null)}
                      className="text-xs text-danger hover:underline"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                <p className="text-xs text-text-secondary">Formato: JPG, PNG o WebP. Tamaño máx: 500KB (optimizado: 100-200KB)</p>
              </div>

              <Button type="submit" className="mt-6 px-8 w-full gap-2">
                <UserPlus className="h-4 w-4" />
                Registrar Empleado
              </Button>
            </form>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm lg:col-span-2">
            <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-text">Directorio de Personal</h2>
              <span className="ml-auto rounded-full bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                {employees.length} empleado{employees.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="mb-4 flex items-center gap-2">
              <Input
                placeholder="Buscar por nombre o #expediente..."
                value={employeeSearchTerm}
                onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                className="h-9"
              />
              {employeeSearchTerm && (
                <button
                  onClick={() => setEmployeeSearchTerm('')}
                  className="inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-text-secondary hover:text-text hover:border-primary transition-colors"
                  title="Limpiar filtros"
                >
                  <X className="h-3 w-3" /> Limpiar
                </button>
              )}
            </div>

            <div className="space-y-3">
              {filteredEmployeeList.length === 0 ? (
                <div className="col-span-full py-12 text-center text-text-secondary">
                  No hay empleados registrados.
                </div>
              ) : (
                filteredEmployeeList.map(employee => (
                  <div key={employee.id} className="rounded-xl border border-border bg-bg transition-colors hover:border-primary/30">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {employee.photo_url ? (
                          <img
                            src={employee.photo_url}
                            alt={employee.name}
                            className="h-10 w-10 shrink-0 rounded-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm ${
                            employee.photo_url ? 'hidden' : ''
                          }`}
                        >
                          {employee.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-text flex items-center gap-2">
                            {employee.expediente != null && (
                              <span className="inline-flex items-center rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-semibold text-secondary" title="Número de Expediente / Contrato">
                                #{employee.expediente}
                              </span>
                            )}
                            {employee.name}
                            {employee.person_type === 'partner' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning" title="Socio de Mipyme/CNA: contribución del 20% de la base (DL 92/2024)">
                                <UserCheck className="h-3 w-3" /> Socio
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary" title="Empleado asalariado: IIP + CESS según Res. 41/2023">
                                <Briefcase className="h-3 w-3" /> Empleado
                              </span>
                            )}
                            {employee.contract_type === 'fixed' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-medium text-info" title="Contrato por tiempo determinado">
                                Determinado
                              </span>
                            )}
                            {employee.contract_type === 'probation' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning" title="Período de prueba">
                                Prueba
                              </span>
                            )}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                            <span className="flex items-center gap-1">
                              <Briefcase className="h-3 w-3 text-primary/70" />
                              {employee.role}
                            </span>
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3 text-primary/70" />
                              ${employee.salary.toFixed(2)}/mes
                            </span>
                            {employee.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-primary/70" />
                                {employee.phone}
                              </span>
                            )}
                            {employee.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3 text-primary/70" />
                                {employee.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button
                          onClick={() => setExpandedEmployee(expandedEmployee === employee.id ? null : employee.id)}
                          className={`flex items-center justify-center h-9 w-9 rounded-lg transition-all ${
                            expandedEmployee === employee.id
                              ? 'bg-primary/10 text-primary'
                              : 'text-text-secondary hover:text-primary hover:bg-primary/10'
                          }`}
                          title="Ver documentos del empleado"
                        >
                          <Paperclip className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setPendingDelete({
                              title: 'Eliminar empleado',
                              description: `¿Seguro que deseas eliminar a "${employee.name}"? Se perderán sus documentos y registros asociados. Esta acción no se puede deshacer.`,
                              onConfirm: async () => {
                                try {
                                  await deleteEmployee(employee.id);
                                  toast.success('Empleado eliminado');
                                } catch (err) {
                                  toast.error((err as Error).message || 'Error al eliminar');
                                }
                              },
                            });
                          }}
                          className="flex items-center justify-center h-9 w-9 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Eliminar empleado"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {expandedEmployee === employee.id && (
                      <EmployeeDocumentsPanel employeeId={employee.id} employeeName={employee.name} />
                    )}
                  </div>
))
              )}
            </div>

            <PaginationControls page={departmentsPage} total={employeesTotal} onPageChange={setDepartmentsPage} />
          </div>
        </div>
      )}

      {activeTab === 'departamentos' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm lg:col-span-1 h-fit">
            <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-text">Nuevo Departamento</h2>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newDepartment.trim()) return;
              if (departments.some(d => d.name.toLowerCase() === newDepartment.trim().toLowerCase())) {
                toast.error('Ya existe un departamento con ese nombre');
                return;
              }
              setIsCreatingDepartment(true);
              try {
                const { addDepartment } = useDatabaseStore.getState();
                await addDepartment(newDepartment);
                setNewDepartment('');
                toast.success('Departamento creado');
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setIsCreatingDepartment(false);
              }
            }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre del Departamento *</Label>
                <Input
                  placeholder="Ej: Cocina, Limpieza..."
                  value={newDepartment}
                  onChange={e => setNewDepartment(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={isCreatingDepartment} className="w-full gap-2">
                {isCreatingDepartment ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                {isCreatingDepartment ? 'Creando...' : 'Crear'}
              </Button>
            </form>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm lg:col-span-2">
            <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
              <h2 className="text-lg font-semibold text-text">Lista de Departamentos</h2>
              <span className="ml-auto bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary rounded-full">
                {departments.length}
              </span>
            </div>
            <div className="space-y-3">
              {departments.length === 0 ? (
                <div className="py-12 text-center text-text-secondary">No hay departamentos</div>
              ) : (
                departments.map(dept => {
                  const empCount = employees.filter(e => e.category === dept.id).length;
                  return (
                    <div key={dept.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-bg hover:border-primary/30">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                          {dept.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          {editingDepartment?.id === dept.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editingDepartment.name}
                                onChange={e => setEditingDepartment({ ...editingDepartment, name: e.target.value })}
                                className="h-8 w-full sm:w-48 max-w-[200px]"
                              />
                              <Button size="sm" onClick={async () => {
                                const { updateDepartment } = useDatabaseStore.getState();
                                await updateDepartment(dept.id, editingDepartment.name);
                                setEditingDepartment(null);
                              }}><Save className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingDepartment(null)}><X className="h-4 w-4" /></Button>
                            </div>
                          ) : (
                            <>
                              <h3 className="font-semibold text-text">{dept.name}</h3>
                              <p className="text-xs text-text-secondary">{empCount} empleado{empCount !== 1 ? 's' : ''}</p>
                            </>
                          )}
                        </div>
                      </div>
                      {editingDepartment?.id !== dept.id && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditingDepartment({ id: dept.id, name: dept.name })}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => {
                            if (empCount > 0) { toast.error(`Hay ${empCount} empleados en este departamento`); return; }
                            setPendingDelete({
                              title: 'Eliminar departamento',
                              description: `¿Eliminar el departamento "${dept.name}"? Esta acción no se puede deshacer.`,
                              onConfirm: async () => {
                                const { deleteDepartment } = useDatabaseStore.getState();
                                await deleteDepartment(dept.id);
                              },
                            });
                          }} className="text-danger hover:text-danger"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <PaginationControls page={departmentsPage} total={departmentsTotal} onPageChange={setDepartmentsPage} />
          </div>
        </div>
      )}

      {activeTab === 'nomina' && (
        <div className="space-y-6">
          {payrollApplied && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-warning flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Nómina aplicada (bloqueada)
                </p>
                <p className="text-xs text-text-secondary">
                  {payrollPeriod?.applied_at && `Aplicada el ${new Date(payrollPeriod.applied_at).toLocaleString('es')}`}
                  {payrollPeriod?.applied_by ? ` por ${payrollPeriod.applied_by}. ` : '. '}
                  No se puede modificar; las correcciones se realizan reabriendo (solo Dueño/a).
                </p>
              </div>
              {isOwner && (
                <Button variant="outline" onClick={handleReopenPayroll} className="gap-2 shrink-0">
                  <RotateCcw className="h-4 w-4" /> Reabrir Nómina
                </Button>
              )}
            </div>
          )}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Calculator className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text">Nómina Mensual</h2>
                  <p className="text-sm text-text-secondary">Captación pre-nómina, generación en Borrador y aplicación final</p>
                </div>
                <button
                  onClick={() => setHelpModal('nomina')}
                  title="Cómo usar esta sección"
                  className="flex items-center justify-center h-8 w-8 shrink-0 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <select
                  className="h-10 rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                  value={payrollMonth.month}
                  onChange={e => setPayrollMonth({ ...payrollMonth, month: Number(e.target.value) })}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(0, i).toLocaleString('es', { month: 'long' }).charAt(0).toUpperCase() + new Date(0, i).toLocaleString('es', { month: 'long' }).slice(1)}
                    </option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                  value={payrollMonth.year}
                  onChange={e => setPayrollMonth({ ...payrollMonth, year: Number(e.target.value) })}
                >
                  {Array.from({ length: 67 }, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <Button onClick={async () => {
                  const toastId = toast.loading('Calculando nómina...', { duration: 30000 });
                  setIsCalculatingPayroll(true);
                  try {
                    // Auto-guarda la captación: Generar usa SIEMPRE lo que se ve en pantalla
                    await persistCaptacion();
                    await calculatePayroll(payrollMonth.month, payrollMonth.year);
                    await getPayrollEntries(payrollMonth.month, payrollMonth.year);
                    toast.success('Nómina generada (Borrador)');
                  } catch (err) {
                    toast.error((err as Error).message || 'Error al calcular nómina');
                  } finally {
                    setIsCalculatingPayroll(false);
                    toast.dismiss(toastId);
                  }
                }} disabled={isCalculatingPayroll || payrollApplied} className="gap-2 min-w-[140px]" title={payrollApplied ? 'La nómina está aplicada y bloqueada' : 'Guarda la captación y genera la nómina en Borrador con los trabajadores incluidos'}>
                  {isCalculatingPayroll ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  {isCalculatingPayroll ? 'Calculando...' : 'Generar Nómina'}
                </Button>
                {!payrollApplied && payrollEntries.length > 0 && (
                  <Button onClick={handleApplyPayroll} className="gap-2" title="Certifica la nómina: queda bloqueada e inmutable">
                    <CheckCircle2 className="h-4 w-4" />
                    Aplicar Nómina
                  </Button>
                )}
                {payrollEntries.length > 0 && (
                  <Button variant="outline" onClick={() => setShowSc406(true)} className="gap-2" title="Hoja oficial SC4-06 lista para imprimir y firmar">
                    <Printer className="h-4 w-4" />
                    Imprimir SC4-06
                  </Button>
                )}
                {payrollEntries.length > 0 && (
                  <>
                  <Button variant="outline" onClick={() => {
                    const fmt = (v: number) => v?.toFixed(2).replace('.', ',') || '0,00';
                    const columns = [
                      { header: 'Código', key: 'expediente', format: (v: number) => (v != null ? `#${v}` : '') },
                      { header: 'Empleado', key: 'employee_name' },
                      { header: 'Cargo/Ocupación', key: 'role' },
                      { header: 'NIT/Carnet', key: 'nit_id' },
                      { header: 'Tasa $/h', key: 'hourly_rate', format: fmt },
                      { header: 'Horas Trabajadas', key: 'worked_hours', format: (v: number) => v?.toString() || '0' },
                      { header: 'Días a Cobrar', key: 'days_paid', format: fmt },
                      { header: 'Salario Base', key: 'base_salary', format: fmt },
                      { header: 'BON', key: 'bonus', format: fmt },
                      { header: 'Horas Extra', key: 'overtime_hours', format: (v: number) => v?.toString() || '0' },
                      { header: 'Pago Horas Extra', key: 'overtime_pay', format: fmt },
                      { header: 'Pago de Vacaciones', key: 'vacation_pay', format: fmt },
                      { header: 'Bruto', key: 'gross_salary', format: fmt },
                      { header: 'Base de Cotización', key: 'vacation_base', format: fmt },
                      { header: 'Base Exenta', key: 'exemption_base', format: fmt },
                      { header: 'Base Imponible', key: 'taxable_base', format: fmt },
                      { header: 'IIP', key: 'tax_amount', format: fmt },
                      { header: 'CESS', key: 'special_contribution', format: fmt },
                      { header: 'Anticipo', key: 'advances', format: fmt },
                      { header: 'RET (Deducciones)', key: 'ret', format: fmt },
                      { header: 'Salario Devengado (a Cobrar)', key: 'net_salary', format: fmt },
                      { header: 'Vac. Acumuladas (días)', key: 'vacation_balance', format: fmt },
                    ];
                    
                    const data = payrollEntries.map(entry => {
                      const employee = employees.find(e => e.id === entry.employee_id);
                      return {
                        ...entry,
                        role: employee?.role || '',
                        nit_id: employee?.nit_id || '',
                        expediente: employee?.expediente,
                        vacation_balance: employee?.vacation_balance || 0,
                        ret: (entry.loan_deduction || 0) + (entry.other_deductions || 0),
                      };
                    });
                    
                    exportToExcel(columns, data, `Nomina_${MONTH_NAMES[payrollMonth.month - 1]}_${payrollMonth.year}`);
                    toast.success('Nómina exportada correctamente');
                  }} className="gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Exportar Excel
                  </Button>
                  <Button variant="outline" onClick={() => {
                    const columns = [
                      { header: 'NIT/Carnet', key: 'nit_id' },
                      { header: 'Empleado', key: 'employee_name' },
                      { header: 'Salario Devengado', key: 'earned_salary', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
                      { header: 'Base Imponible', key: 'taxable_base', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
                      { header: 'IIP', key: 'tax_amount', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
                      { header: 'CESS', key: 'special_contribution', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
                    ];
                    const data = payrollEntries.map(entry => {
                      const employee = employees.find(e => e.id === entry.employee_id);
                      return { ...entry, nit_id: employee?.nit_id || '' };
                    });
                    exportToExcel(columns, data, `Modelo_TA6_${payrollMonth.month}_${payrollMonth.year}`);
                    toast.success('Modelo TA-6 exportado');
                  }} className="gap-2" title="Declaración de IIP y CESS (ONAT)">
                    <FileText className="h-4 w-4" />
                    Modelo TA-6
                  </Button>
                  <Button variant="outline" onClick={() => {
                    const columns = [
                      { header: 'NIT/Carnet', key: 'nit_id' },
                      { header: 'Empleado', key: 'employee_name' },
                      { header: 'Salario Devengado', key: 'earned_salary', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
                      { header: 'Base de Cotización', key: 'vacation_base', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
                      { header: 'CESS (trabajador)', key: 'special_contribution', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
                      { header: 'SS Empleador (14%)', key: 'employer_contribution', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
                      { header: 'Provisión Vacaciones', key: 'vacation_provision', format: (v: number) => v?.toFixed(2).replace('.', ',') || '0,00' },
                    ];
                    const data = payrollEntries.map(entry => {
                      const employee = employees.find(e => e.id === entry.employee_id);
                      return {
                        ...entry,
                        nit_id: employee?.nit_id || '',
                        vacation_provision: Math.max(0, (entry.vacation_base || 0) - entry.earned_salary),
                      };
                    });
                    exportToExcel(columns, data, `Planilla_TSS_${payrollMonth.month}_${payrollMonth.year}`);
                    toast.success('Planilla TSS exportada');
                  }} className="gap-2" title="Planilla de Seguridad Social">
                    <ShieldCheck className="h-4 w-4" />
                    Planilla TSS
                  </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Captación Pre-nómina ─────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-semibold text-text flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" /> Captación Pre-nómina
                </h3>
                <p className="text-xs text-text-secondary">
                  Define qué trabajadores aplican en {MONTH_NAMES[payrollMonth.month - 1]} {payrollMonth.year}, sus horas reales e incidencias antes de generar. Marca/desmarca la casilla para incluir o excluir.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="h-9 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm"
                  value={draftDeptFilter}
                  onChange={e => setDraftDeptFilter(e.target.value)}
                  title="Filtrar la captación por departamento"
                >
                  <option value="">Todos los departamentos</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <Button onClick={saveCaptacion} disabled={isSavingDrafts || payrollApplied} className="gap-2 h-9" title="Guarda la captación del mes">
                  {isSavingDrafts ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar Captación
                </Button>
              </div>
            </div>

            {/* Acciones masivas sobre los trabajadores incluidos del filtro actual */}
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-bg border border-border px-3 py-2">
              <span className="text-xs text-text-secondary">
                Acciones en lote sobre los incluidos{draftDeptFilter ? ` de "${departments.find(d => d.id === draftDeptFilter)?.name || ''}"` : ''}:
              </span>
              <Input
                type="number" step="0.01" placeholder="Bonificación $"
                value={bulkBonus} onChange={e => setBulkBonus(e.target.value)}
                className="w-32 h-8 text-sm" disabled={payrollApplied}
              />
              <Button size="sm" variant="outline" className="h-8" disabled={payrollApplied}
                onClick={() => {
                  const v = Number(bulkBonus) || 0;
                  if (v <= 0) { toast.error('Ingresa un monto de bonificación'); return; }
                  applyBulkToSelected({ bonus: v });
                  toast.success(`Bonificación de $${v.toFixed(2)} aplicada a los incluidos`);
                }}>
                <Plus className="h-3.5 w-3.5" /> Bonificar
              </Button>
              <Input
                type="number" step="0.01" placeholder="Retención $"
                value={bulkRetention} onChange={e => setBulkRetention(e.target.value)}
                className="w-32 h-8 text-sm" disabled={payrollApplied}
              />
              <Button size="sm" variant="outline" className="h-8" disabled={payrollApplied}
                onClick={() => {
                  const v = Number(bulkRetention) || 0;
                  if (v <= 0) { toast.error('Ingresa un monto de retención'); return; }
                  applyBulkToSelected({ retention: v });
                  toast.success(`Retención de $${v.toFixed(2)} aplicada a los incluidos`);
                }}>
                <Plus className="h-3.5 w-3.5" /> Retener
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg text-text-secondary">
                  <tr>
                    <th className="px-3 py-2 text-center w-10" title="Incluir en la nómina del mes">✓</th>
                    <th className="px-3 py-2 text-left">Empleado</th>
                    <th className="px-3 py-2 text-left hidden md:table-cell">Departamento</th>
                    <th className="px-3 py-2 text-right" title="Horas reales trabajadas en el mes">Horas trab.</th>
                    <th className="px-3 py-2 text-right" title="Tasa salarial horaria (editable). Por defecto: salario / fondo de tiempo">Tasa $/h</th>
                    <th className="px-3 py-2 text-right" title="Tasa × horas trabajadas">A cobrar</th>
                    <th className="px-3 py-2 text-right" title="Bonificación / estímulo del mes (BON)">BON $</th>
                    <th className="px-3 py-2 text-right hidden md:table-cell" title="Anticipo entregado">Anticipo $</th>
                    <th className="px-3 py-2 text-right" title="Retención / sanción del mes (se descuenta tras impuestos)">RET $</th>
                    <th className="px-3 py-2 text-right hidden md:table-cell" title="Días de vacaciones pagadas este mes">Vac. días</th>
                    <th className="px-3 py-2 text-left hidden lg:table-cell" title="Nota / criterio de la incidencia">Nota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {employees
                    .filter(emp => !draftDeptFilter || emp.category === draftDeptFilter)
                    .map(emp => {
                      const row = draftRows[emp.id] || defaultDraftRow(emp.salary);
                      const aCobrar = Math.round((Number(row.hourly_rate) || 0) * (Number(row.worked_hours) || 0) * 100) / 100;
                      return (
                        <tr key={emp.id} className={`hover:bg-bg/50 ${!row.include ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={row.include}
                              disabled={payrollApplied}
                              onChange={e => updateDraftRow(emp.id, { include: e.target.checked })}
                              className="h-4 w-4 accent-primary"
                              title="Incluir este trabajador en la nómina del mes"
                            />
                          </td>
                          <td className="px-3 py-1.5 font-medium">
                            {emp.expediente != null && <span className="text-[10px] font-semibold text-secondary mr-1">#{emp.expediente}</span>}
                            {emp.name}
                          </td>
                          <td className="px-3 py-1.5 text-text-secondary hidden md:table-cell">
                            {departments.find(d => d.id === emp.category)?.name || '-'}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <Input type="number" step="0.5" min="0" value={row.worked_hours}
                              disabled={payrollApplied}
                              onChange={e => updateDraftRow(emp.id, { worked_hours: Number(e.target.value) })}
                              onBlur={e => {
                                const v = Number(e.target.value) || 0;
                                const fondo = payrollConfig?.monthly_hours || 190.6;
                                if (v > fondo) {
                                  toast.warning(`Horas (${v}) superan el fondo de tiempo (${fondo} h). Se pagará tasa × horas trabajadas.`, { duration: 5000 });
                                }
                              }}
                              title={`Horas reales trabajadas (fondo de tiempo: ${payrollConfig?.monthly_hours || 190.6} h)`}
                              className="w-20 h-7 text-right text-sm" />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <Input type="number" step="0.01" min="0" value={row.hourly_rate}
                              disabled={payrollApplied}
                              onChange={e => updateDraftRow(emp.id, { hourly_rate: Number(e.target.value) })}
                              className="w-24 h-7 text-right text-sm" />
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium">${aCobrar.toFixed(2)}</td>
                          <td className="px-3 py-1.5 text-right">
                            <Input type="number" step="0.01" min="0" value={row.bonus}
                              disabled={payrollApplied}
                              onChange={e => updateDraftRow(emp.id, { bonus: Number(e.target.value) })}
                              className="w-24 h-7 text-right text-sm" />
                          </td>
                          <td className="px-3 py-1.5 text-right hidden md:table-cell">
                            <Input type="number" step="0.01" min="0" value={row.advances}
                              disabled={payrollApplied}
                              onChange={e => updateDraftRow(emp.id, { advances: Number(e.target.value) })}
                              className="w-24 h-7 text-right text-sm" />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <Input type="number" step="0.01" min="0" value={row.retention}
                              disabled={payrollApplied}
                              onChange={e => updateDraftRow(emp.id, { retention: Number(e.target.value) })}
                              className="w-24 h-7 text-right text-sm" />
                          </td>
                          <td className="px-3 py-1.5 text-right hidden md:table-cell">
                            <Input type="number" step="1" min="0" max="30" value={row.vacation_days}
                              disabled={payrollApplied}
                              onChange={e => updateDraftRow(emp.id, { vacation_days: Number(e.target.value) })}
                              className="w-16 h-7 text-right text-sm" />
                          </td>
                          <td className="px-3 py-1.5 hidden lg:table-cell">
                            <Input value={row.note} placeholder="Ej: bono por rendimiento"
                              disabled={payrollApplied}
                              onChange={e => updateDraftRow(emp.id, { note: e.target.value })}
                              className="w-40 h-7 text-sm" />
                          </td>
                        </tr>
                      );
                    })}
                  {employees.filter(emp => !draftDeptFilter || emp.category === draftDeptFilter).length === 0 && (
                    <tr><td colSpan={11} className="px-3 py-6 text-center text-text-secondary">No hay trabajadores en este departamento.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {payrollEntries.length > 0 ? (
            <div className="space-y-4">
              {Object.entries(payrollEntries.reduce((acc, entry) => {
                if (!acc[entry.employee_category]) acc[entry.employee_category] = [];
                acc[entry.employee_category].push(entry);
                return acc;
              }, {} as Record<string, typeof payrollEntries>)).map(([category, entries]) => {
                const categoryTotal = entries.reduce((sum, e) => sum + e.net_salary, 0);
                return (
                  <div key={category} className="rounded-xl border border-border bg-surface overflow-hidden">
                    <div className="bg-primary/5 border-b px-6 py-3 flex justify-between">
                      <h3 className="font-semibold">{category}</h3>
                      <span className="text-sm">Total: <span className="font-bold text-primary">${categoryTotal.toFixed(2)}</span></span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-bg text-text-secondary">
                          <tr>
                             <th className="px-4 py-2 text-left" title="Número de Expediente / Contrato del trabajador">Código</th>
                             <th className="px-4 py-2 text-left" title="Nombre del trabajador">Empleado</th>
                             <th className="px-4 py-2 text-left hidden md:table-cell" title="Número de Identificación Tributaria o Carnet de Identidad">NIT/Carnet</th>
                             <th className="px-4 py-2 text-right hidden md:table-cell" title="Tasa salarial horaria = Salario / Fondo de tiempo">Tasa $/h</th>
                             <th className="px-4 py-2 text-right hidden md:table-cell" title="Horas trabajadas y su equivalente en días (jornada de 8h)">Horas / Días</th>
                             <th className="px-4 py-2 text-right" title="Bonificaciones y estímulos del período (suman al bruto)">BON</th>
                             <th className="px-4 py-2 text-right hidden md:table-cell" title="Pago por horas extra">H. Extra</th>
                             <th className="px-4 py-2 text-right hidden md:table-cell" title="Salario del período + horas extra + bonificación + pago de vacaciones. Sobre este monto se calculan IIP y CESS">Bruto</th>
                             <th className="px-4 py-2 text-right hidden md:table-cell" title="Remuneración total gravable (incluye salario, vacaciones y bonificaciones) sobre la que se aplica la escala progresiva de IIP">Base Imponible</th>
                             <th className="px-4 py-2 text-right" title="Impuesto sobre los Ingresos Personales. Escala progresiva 0%–20% (Res. 41/2023)">IIP</th>
                             <th className="px-4 py-2 text-right" title="CESS (empleado): 5% hasta $15,000 y 10% sobre el exceso. Socio: 20% de la base seleccionada (DL 92/2024)">CESS / Contrib.</th>
                             <th className="px-4 py-2 text-right" title="Retenciones y deducciones tras impuestos: anticipo + cuota de préstamo + otras deducciones">RET</th>
                             <th className="px-4 py-2 text-right" title="Líquido real a cobrar: Bruto − IIP − CESS − RET">Salario Devengado (a Cobrar)</th>
                             <th className="px-4 py-2 text-right hidden lg:table-cell" title="Saldo de días de vacaciones acumulados">Vac. Acum.</th>
                             <th className="px-4 py-2 text-center" title="Opciones adicionales por empleado">Acciones</th>
                          </tr>
                        </thead>
                        <tbody ref={hrTbodyRef} className="divide-y divide-border">
                          {entries.map(entry => {
                            const employee = employees.find(e => e.id === entry.employee_id);
                            return (
                            <tr key={entry.id} className="hover:bg-bg/50">
                              <td className="px-4 py-2 text-text-secondary font-medium">
                                {employee?.expediente != null ? `#${employee.expediente}` : '-'}
                              </td>
                              <td className="px-4 py-2 font-medium">
                                <span className="inline-flex items-center gap-1.5">
                                  {entry.employee_name}
                                  {employee?.person_type === 'partner' && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[9px] font-medium text-warning" title="Socio: contribución SS del 20% de la base (DL 92/2024)">
                                      <UserCheck className="h-2.5 w-2.5" /> Socio
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-text-secondary hidden md:table-cell">{employee?.nit_id || '-'}</td>
                              <td className="px-4 py-2 text-right text-text-secondary hidden md:table-cell">
                                ${(entry.hourly_rate || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-right text-text-secondary hidden md:table-cell">
                                {(entry.worked_hours || 0).toFixed(1)} h
                                <span className="block text-[10px] text-text-secondary/70">{(entry.days_paid || 0).toFixed(2)} días</span>
                              </td>
                              <td className="px-4 py-2 text-right">
                                {(entry.bonus || 0) > 0
                                  ? <span className="text-success font-medium">+${(entry.bonus || 0).toFixed(2)}</span>
                                  : <span className="text-text-secondary">0,00</span>}
                              </td>
                              <td className="px-4 py-2 text-right hidden md:table-cell">
                                {(entry.overtime_pay || 0) > 0
                                  ? <span className="text-success">+${(entry.overtime_pay || 0).toFixed(2)}</span>
                                  : <span className="text-text-secondary">0,00</span>}
                              </td>
                              <td className="px-4 py-2 text-right font-semibold text-text hidden md:table-cell">
                                <span title="Salario del período + horas extra + bonificación + pago de vacaciones">
                                  ${(entry.gross_salary ?? entry.earned_salary).toFixed(2)}
                                </span>
                                {(entry.vacation_pay || 0) > 0 && (
                                  <span className="block text-[10px] font-normal text-primary/80 mt-0.5">+${(entry.vacation_pay || 0).toFixed(2)} vac</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right text-text-secondary hidden md:table-cell">
                                {employee?.person_type === 'partner'
                                  ? '0,00'
                                  : `$${Math.max(0, entry.taxable_base ?? (entry.gross_salary ?? entry.earned_salary)).toFixed(2)}`}
                              </td>
                              <td className="px-4 py-2 text-right text-danger">${entry.tax_amount.toFixed(2)}</td>
                              <td className="px-4 py-2 text-right text-danger">${entry.special_contribution.toFixed(2)}</td>
                              <td className="px-4 py-2 text-right text-danger">
                                {((entry.advances || 0) + (entry.loan_deduction || 0) + (entry.other_deductions || 0)) > 0
                                  ? `-$${((entry.advances || 0) + (entry.loan_deduction || 0) + (entry.other_deductions || 0)).toFixed(2)}`
                                  : <span className="text-text-secondary">0,00</span>}
                              </td>
                              <td className="px-4 py-2 text-right font-bold text-success" title="Líquido real a cobrar: Bruto − IIP − CESS − RET">
                                ${entry.net_salary.toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-right hidden lg:table-cell">
                                {(employee?.vacation_balance || 0) > 210 ? (
                                  <span className="text-warning font-medium" title="El saldo acumulado supera los 210 días de referencia">
                                    {(employee?.vacation_balance || 0).toFixed(1)} ⚠
                                  </span>
                                ) : (
                                  <span className="text-text-secondary">{(employee?.vacation_balance || 0).toFixed(1)}</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <button
                                  onClick={() => setReceiptEntry(entry)}
                                  className="flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="Ver recibo de pago"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => openConceptsModal(entry)}
                                  disabled={payrollApplied}
                                  className="flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={payrollApplied ? 'Nómina aplicada: no editable' : 'Editar conceptos (horas extra, bonos, anticipos, préstamos, deducciones)'}
                                >
                                  <Calculator className="h-3.5 w-3.5" />
                                </button>
                                {entry.is_custom && !payrollApplied && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await useDatabaseStore.getState().regeneratePayrollEntry(entry.id);
                                        await getPayrollEntries(payrollMonth.month, payrollMonth.year);
                                        toast.success('Valores regenerados');
                                      } catch (err) {
                                        toast.error((err as Error).message);
                                      }
                                    }}
                                    className="flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                                    title="Regenerar valores por defecto"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              <PaginationControls page={payrollPage} total={payrollTotal} itemsPerPage={20} onPageChange={setPayrollPage} />

              <div className="rounded-xl border border-primary bg-primary/5 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span title="Suma del Impuesto sobre los Ingresos Personales de todos los trabajadores">Total IIP</span>
                  <span className="font-semibold text-danger">${payrollEntries.reduce((sum, e) => sum + e.tax_amount, 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span title="Suma de la Contribución Especial a la Seguridad Social de todos los trabajadores">Total CESS</span>
                  <span className="font-semibold text-danger">${payrollEntries.reduce((sum, e) => sum + e.special_contribution, 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span title="Suma de la provisión mensual de vacaciones (9.09% del salario). No se descuenta del salario. Los socios no generan provisión">Total Provisión de Vacaciones</span>
                  <span className="font-semibold text-text-secondary">${payrollEntries.reduce((sum, e) => sum + Math.max(0, (e.vacation_base || 0) - e.earned_salary), 0).toFixed(2)}</span>
                </div>
                {payrollEntries.some(e => (e.overtime_pay || 0) > 0) && (
                  <div className="flex justify-between text-sm">
                    <span title="Suma del pago por horas extra de todos los trabajadores">Total Horas Extra</span>
                    <span className="font-semibold text-text-secondary">${payrollEntries.reduce((sum, e) => sum + (e.overtime_pay || 0), 0).toFixed(2)}</span>
                  </div>
                )}
                {payrollEntries.some(e => (e.bonus || 0) > 0) && (
                  <div className="flex justify-between text-sm">
                    <span title="Suma de bonificaciones y estímulos">Total Bonificaciones</span>
                    <span className="font-semibold text-text-secondary">${payrollEntries.reduce((sum, e) => sum + (e.bonus || 0), 0).toFixed(2)}</span>
                  </div>
                )}
                {payrollEntries.some(e => (e.advances || 0) > 0) && (
                  <div className="flex justify-between text-sm">
                    <span title="Suma de anticipos entregados (se descuentan del neto)">Total Anticipos</span>
                    <span className="font-semibold text-danger">${payrollEntries.reduce((sum, e) => sum + (e.advances || 0), 0).toFixed(2)}</span>
                  </div>
                )}
                {payrollEntries.some(e => (e.loan_deduction || 0) > 0 || (e.other_deductions || 0) > 0) && (
                  <div className="flex justify-between text-sm">
                    <span title="Suma de retenciones y deducciones tras impuestos (cuotas de préstamo + otras)">Total RET (Deducciones)</span>
                    <span className="font-semibold text-danger">${payrollEntries.reduce((sum, e) => sum + (e.loan_deduction || 0) + (e.other_deductions || 0), 0).toFixed(2)}</span>
                  </div>
                )}
                <hr className="border-border" />
                <div className="flex justify-between">
                  <span className="font-semibold" title="Líquido total a pagar a los trabajadores: Bruto − IIP − CESS − RET">Total Salario Devengado (a Pagar)</span>
                  <span className="text-xl font-bold text-primary">
                    ${payrollEntries.reduce((sum, e) => sum + e.net_salary, 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface p-12 text-center">
              <Calculator className="h-12 w-12 text-text-secondary mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay nómina generada</h3>
              <p className="text-text-secondary">Completa la Captación Pre-nómina, luego pulsa "Generar Nómina"</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'prestamos' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm lg:col-span-1 h-fit">
            <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <HandCoins className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-text">Nuevo Préstamo</h2>
              <button
                onClick={() => setHelpModal('prestamos')}
                title="Cómo usar esta sección"
                className="ml-auto flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); saveLoan(); }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="loan_employee">Empleado *</Label>
                <select
                  id="loan_employee"
                  required
                  className="flex h-10 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                  value={loanForm.employee_id}
                  onChange={e => setLoanForm({ ...loanForm, employee_id: e.target.value })}
                >
                  <option value="">Seleccionar empleado...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="loan_type">Tipo de Deducción *</Label>
                <select
                  id="loan_type"
                  className="flex h-10 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                  value={loanForm.deduction_type}
                  onChange={e => setLoanForm({ ...loanForm, deduction_type: e.target.value as typeof loanForm.deduction_type })}
                >
                  {Object.entries(DEDUCTION_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <p className="text-xs text-text-secondary">Créditos bancarios, inasistencias, sanciones, rotura de equipos, préstamos internos...</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="loan_reason">Criterio / Motivo</Label>
                <Input
                  id="loan_reason"
                  placeholder="Ej: crédito bancario BPA, inasistencia 12/08, rotura de cafetera..."
                  value={loanForm.reason}
                  onChange={e => setLoanForm({ ...loanForm, reason: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="loan_total">Monto Total ($) *</Label>
                <Input
                  id="loan_total"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={loanForm.total_amount || ''}
                  onChange={e => setLoanForm({ ...loanForm, total_amount: Number(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="loan_monthly">Cuota Mensual ($) *</Label>
                <Input
                  id="loan_monthly"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={loanForm.monthly_payment || ''}
                  onChange={e => setLoanForm({ ...loanForm, monthly_payment: Number(e.target.value) })}
                />
                <p className="text-xs text-text-secondary">Este monto se descuenta automáticamente de la nómina mensual del empleado</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="loan_start">Fecha de Inicio</Label>
                <Input
                  id="loan_start"
                  type="date"
                  value={loanForm.start_date}
                  onChange={e => setLoanForm({ ...loanForm, start_date: e.target.value })}
                />
              </div>

              <Button type="submit" className="mt-6 px-8 w-full gap-2" disabled={isSavingLoan}>
                <Plus className="h-4 w-4" />
                {isSavingLoan ? 'Registrando...' : 'Registrar Deducción'}
              </Button>
            </form>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm lg:col-span-2">
            <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <CreditCard className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-text">Deducciones / Retenciones de Personal</h2>
              <span className="ml-auto rounded-full bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                {employeeLoans.length} deducci{employeeLoans.length !== 1 ? 'ones' : 'ón'}
              </span>
            </div>

            {employeeLoans.length === 0 ? (
              <div className="py-12 text-center text-text-secondary">No hay deducciones ni retenciones registradas.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-bg text-text-secondary">
                    <tr>
                      <th className="px-4 py-2 text-left">Empleado</th>
                      <th className="px-4 py-2 text-left">Tipo</th>
                      <th className="px-4 py-2 text-left hidden md:table-cell" title="Criterio / motivo de la deducción">Motivo</th>
                      <th className="px-4 py-2 text-right">Monto Total</th>
                      <th className="px-4 py-2 text-right">Cuota Mensual</th>
                      <th className="px-4 py-2 text-right">Saldo</th>
                      <th className="px-4 py-2 text-center">Estado</th>
                      <th className="px-4 py-2 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {employeeLoans.map(loan => {
                      const employee = employees.find(e => e.id === loan.employee_id);
                      return (
                        <tr key={loan.id} className="hover:bg-bg/50">
                          <td className="px-4 py-2 font-medium">{employee?.name || 'Desconocido'}</td>
                          <td className="px-4 py-2">
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                              {DEDUCTION_TYPE_LABELS[loan.deduction_type || 'prestamo'] || 'Préstamo'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-text-secondary hidden md:table-cell">{loan.reason || '-'}</td>
                          <td className="px-4 py-2 text-right">${loan.total_amount.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right">${loan.monthly_payment.toFixed(2)}</td>
                          <td className={`px-4 py-2 text-right font-semibold ${loan.balance > 0 ? 'text-warning' : 'text-success'}`}>${loan.balance.toFixed(2)}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              loan.status === 'active' ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'
                            }`}>
                              {loan.status === 'active' ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                              {loan.status === 'active' ? 'Activo' : 'Pagado'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {loan.status === 'active' && (
                                <button
                                  onClick={async () => {
                                    try {
                                      await payLoanInstallment(loan.id);
                                      toast.success('Cuota registrada');
                                    } catch (err) {
                                      toast.error((err as Error).message);
                                    }
                                  }}
                                  className="flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-success hover:bg-success/10 transition-colors"
                                  title="Registrar pago de una cuota"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={() => setDeleteLoanTarget(loan)}
                                className="flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                                title="Eliminar deducción"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'impuestos' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3 border-b border-border pb-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Building className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text">Impuestos de la Empresa</h2>
                <p className="text-sm text-text-secondary">
                  Seguridad Social patronal (14% sobre la base de cotización) de {MONTH_NAMES[payrollMonth.month - 1]} {payrollMonth.year}. Costo empresarial: no se descuenta del salario del trabajador.
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <select
                  className="h-10 rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                  value={payrollMonth.month}
                  onChange={e => setPayrollMonth({ ...payrollMonth, month: Number(e.target.value) })}
                >
                  {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
                <select
                  className="h-10 rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                  value={payrollMonth.year}
                  onChange={e => setPayrollMonth({ ...payrollMonth, year: Number(e.target.value) })}
                >
                  {Array.from({ length: 67 }, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {payrollEntries.length === 0 ? (
              <div className="py-12 text-center text-text-secondary">
                No hay nómina generada para este mes. Genera la nómina primero.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-bg text-text-secondary">
                      <tr>
                        <th className="px-4 py-2 text-left">Empleado</th>
                        <th className="px-4 py-2 text-left hidden md:table-cell">Departamento</th>
                        <th className="px-4 py-2 text-right" title="Base de cotización (incluye provisión de vacaciones 9.09%)">Base Cotización</th>
                        <th className="px-4 py-2 text-right" title="Aportación patronal: 14% de la base de cotización">SS Empleador (14%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {payrollEntries.map(entry => {
                        const employee = employees.find(e => e.id === entry.employee_id);
                        return (
                          <tr key={entry.id} className="hover:bg-bg/50">
                            <td className="px-4 py-2 font-medium">
                              {employee?.expediente != null && <span className="text-[10px] font-semibold text-secondary mr-1">#{employee.expediente}</span>}
                              {entry.employee_name}
                            </td>
                            <td className="px-4 py-2 text-text-secondary hidden md:table-cell">{entry.employee_category}</td>
                            <td className="px-4 py-2 text-right text-text-secondary">${(entry.vacation_base || 0).toFixed(2)}</td>
                            <td className="px-4 py-2 text-right font-semibold text-warning">${(entry.employer_contribution || 0).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 rounded-xl border border-warning/40 bg-warning/5 p-4 flex justify-between">
                  <span className="font-semibold">Total SS Empleador del mes</span>
                  <span className="text-xl font-bold text-warning">
                    ${payrollEntries.reduce((sum, e) => sum + (e.employer_contribution || 0), 0).toFixed(2)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'liquidaciones' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm lg:col-span-1 h-fit">
            <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-text">Calcular Liquidación</h2>
              <button
                onClick={() => setHelpModal('liquidaciones')}
                title="Cómo usar esta sección"
                className="ml-auto flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="liq_employee">Empleado *</Label>
                <select
                  id="liq_employee"
                  className="flex h-10 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                  value={liquidationEmployee?.id || ''}
                  onChange={e => {
                    const emp = employees.find(x => x.id === e.target.value);
                    if (emp) openLiquidationModal(emp);
                  }}
                >
                  <option value="">Seleccionar empleado...</option>
                  {employees.filter(e => e.person_type !== 'partner').map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              {liquidationEmployee && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="liq_end">Fecha de Cese</Label>
                    <Input
                      id="liq_end"
                      type="date"
                      value={liquidationForm.end_date}
                      onChange={e => setLiquidationForm({ ...liquidationForm, end_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="liq_vac">Días de Vacaciones Tomados</Label>
                    <Input
                      id="liq_vac"
                      type="number"
                      min="0"
                      step="1"
                      value={liquidationForm.vacation_taken || ''}
                      onChange={e => setLiquidationForm({ ...liquidationForm, vacation_taken: Number(e.target.value) })}
                    />
                  </div>
                  <Button onClick={computeLiquidation} className="w-full gap-2">
                    <Calculator className="h-4 w-4" /> Calcular Liquidación
                  </Button>

                  {liquidationResult && (
                    <div className="rounded-lg bg-bg border border-border p-4 space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-text-secondary">Meses trabajados</span><span>{liquidationResult.monthsWorked}</span></div>
                      <div className="flex justify-between"><span className="text-text-secondary">Vacaciones acumuladas</span><span>{liquidationResult.vacationAccumulated} días</span></div>
                      <div className="flex justify-between"><span className="text-text-secondary">Vacaciones pendientes</span><span>{liquidationResult.vacationPending} días</span></div>
                      <div className="flex justify-between"><span className="text-text-secondary">Pago vacaciones</span><span>${liquidationResult.vacationPay.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-text-secondary">Auxilio de despido ({liquidationResult.severanceMonths} meses)</span><span>${liquidationResult.severancePay.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-text-secondary">Preaviso ({liquidationResult.noticeDays} días)</span><span>${liquidationResult.noticePay.toFixed(2)}</span></div>
                      <hr className="border-border" />
                      <div className="flex justify-between font-semibold"><span>Total bruto</span><span>${liquidationResult.grossTotal.toFixed(2)}</span></div>
                      <div className="flex justify-between text-danger"><span>CESS</span><span>-${liquidationResult.cess.toFixed(2)}</span></div>
                      <div className="flex justify-between text-danger"><span>IIP</span><span>-${liquidationResult.iip.toFixed(2)}</span></div>
                      <div className="flex justify-between font-bold text-primary"><span>Neto a pagar</span><span>${liquidationResult.netTotal.toFixed(2)}</span></div>
                      <Button onClick={guardarLiquidacion} className="w-full mt-3 gap-2" disabled={isSavingLiquidation}>
                        <Save className="h-4 w-4" /> {isSavingLiquidation ? 'Guardando...' : 'Guardar Liquidación'}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm lg:col-span-2">
            <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-text">Historial de Liquidaciones</h2>
              <span className="ml-auto rounded-full bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                {payrollLiquidations.length} liquidación{payrollLiquidations.length !== 1 ? 'es' : ''}
              </span>
            </div>

            {payrollLiquidations.length === 0 ? (
              <div className="py-12 text-center text-text-secondary">No hay liquidaciones registradas.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-bg text-text-secondary">
                    <tr>
                      <th className="px-4 py-2 text-left">Empleado</th>
                      <th className="px-4 py-2 text-right">Fecha Cese</th>
                      <th className="px-4 py-2 text-right">Bruto</th>
                      <th className="px-4 py-2 text-right">CESS</th>
                      <th className="px-4 py-2 text-right">IIP</th>
                      <th className="px-4 py-2 text-right">Neto</th>
                      <th className="px-4 py-2 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payrollLiquidations.map(liq => (
                      <tr key={liq.id} className="hover:bg-bg/50">
                        <td className="px-4 py-2 font-medium">{liq.employee_name}</td>
                        <td className="px-4 py-2 text-right">{liq.end_date || '-'}</td>
                        <td className="px-4 py-2 text-right">${liq.gross_total.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-danger">${liq.cess.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-danger">${liq.iip.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-bold text-success">${liq.net_total.toFixed(2)}</td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => setDeleteLiquidationTarget(liq)}
                            className="flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                            title="Eliminar liquidación"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'configuracion' && (
        <div className="max-w-2xl">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Settings className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-text">Parámetros de Nómina</h2>
              <button
                onClick={() => setHelpModal('configuracion')}
                title="Cómo usar esta sección"
                className="ml-auto flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
            {payrollConfig ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Base Exenta Mensual ($)</Label>
                  <Input
                    type="number"
                    value={configBaseExenta}
                    onChange={e => setConfigBaseExenta(Number(e.target.value))}
                    onBlur={e => {
                      const { updatePayrollConfig } = useDatabaseStore.getState();
                      updatePayrollConfig({ tax_exemption_base: Number(e.target.value) });
                      toast.success('Base exenta actualizada', { duration: 1500 });
                    }}
                  />
                  <p className="text-xs text-text-secondary">Base exenta según Res. 41/2023</p>
                </div>

                <div className="space-y-2">
                  <Label>Fondo de Tiempo Estimado (horas/mes)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={configMonthlyHours}
                    onChange={e => setConfigMonthlyHours(Number(e.target.value))}
                    onBlur={e => {
                      const { updatePayrollConfig } = useDatabaseStore.getState();
                      updatePayrollConfig({ monthly_hours: Number(e.target.value) || 190.6 });
                      toast.success('Fondo de tiempo actualizado', { duration: 1500 });
                    }}
                  />
                  <p className="text-xs text-text-secondary">
                    Tasa salarial horaria = Salario Base ÷ Fondo de tiempo. Ej: $26,000 ÷ 190.6 h = $136.41/h (estilo Versat).
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Acumulación de Vacaciones (días/mes)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={configVacAccrual}
                    onChange={e => setConfigVacAccrual(Number(e.target.value))}
                    onBlur={e => {
                      const { updatePayrollConfig } = useDatabaseStore.getState();
                      updatePayrollConfig({ vacation_accrual_days: Number(e.target.value) || 2.5 });
                      toast.success('Acumulación de vacaciones actualizada', { duration: 1500 });
                    }}
                  />
                  <p className="text-xs text-text-secondary">
                    Días de vacaciones que se acumulan a cada trabajador por mes trabajado. Se acreditan al generar la nómina y se debitan las vacaciones pagadas.
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-bg p-3 text-xs text-text-secondary space-y-1">
                  <p className="font-semibold text-text">Bases legales de los cálculos (tasas fijas por ley):</p>
                  <p>• IIP: escala progresiva Res. 41/2023 (MFP) — 0% hasta la base exenta; 3%–20% según tramo.</p>
                  <p>• CESS (trabajador): 5% hasta $15,000 y 10% sobre el exceso (Ley 164/2023).</p>
                  <p>• Seguridad Social patronal: 14% sobre la base de cotización (con provisión de vacaciones 9.09%).</p>
                  <p>• Vacaciones: 30 días por año trabajado (2.5/mes, Código de Trabajo Ley 116).</p>
                  <p>• Socios Mipyme/CNA: contribución del 20% de la base (DL 92/2024), sin IIP mensual.</p>
                  <p className="italic">Verifique posibles cambios normativos con la MFP / ONAT.</p>
                </div>
              </div>
            ) : (
              <div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-primary" /></div>
            )}
          </div>
</div>
        )}
        
        {activeTab === 'documentos' && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* PNO */}
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
                  <FileText className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold text-text">PNO</h2>
                <span className="ml-auto text-xs text-text-secondary">Procedimientos Normalizados de Operación</span>
              </div>
              
              {orgDocsData.PNO ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-bg p-4 border border-border">
                    <p className="text-sm text-text-secondary mb-3">Documento actual:</p>
                    <a 
                      href={orgDocsData.PNO} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-primary hover:underline"
                    >
                      <Eye className="h-4 w-4" />
                      Ver documento
                    </a>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setOrgDocModal('PNO')}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Reemplazar documento
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-text-secondary opacity-50" />
                  <p className="text-sm text-text-secondary mb-4">No hay documento PNO cargado</p>
                  <Button onClick={() => setOrgDocModal('PNO')}>
                    <Upload className="h-4 w-4 mr-2" />
                    Subir documento PNO
                  </Button>
                </div>
              )}
            </div>
            
            {/* Reglamento del Negocio */}
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
                <div className="rounded-lg bg-purple-500/10 p-2 text-purple-600">
                  <BookOpen className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold text-text">Reglamento del Negocio</h2>
                <span className="ml-auto text-xs text-text-secondary">Normativas internas</span>
              </div>
              
              {orgDocsData.REGLAMENTO ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-bg p-4 border border-border">
                    <p className="text-sm text-text-secondary mb-3">Documento actual:</p>
                    <a 
                      href={orgDocsData.REGLAMENTO} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-primary hover:underline"
                    >
                      <Eye className="h-4 w-4" />
                      Ver documento
                    </a>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setOrgDocModal('REGLAMENTO')}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Reemplazar documento
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <BookOpen className="h-12 w-12 mx-auto mb-3 text-text-secondary opacity-50" />
                  <p className="text-sm text-text-secondary mb-4">No hay documento de reglamento cargado</p>
                  <Button onClick={() => setOrgDocModal('REGLAMENTO')}>
                    <Upload className="h-4 w-4 mr-2" />
                    Subir reglamento
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      
      {/* Biblioteca de Documentos - Modal para PNO y Reglamento */}
      {orgDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm modal-backdrop">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl max-h-[90dvh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <FolderOpen className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-text">
                    {orgDocModal === 'PNO' ? 'Procedimientos Normalizados de Operación (PNO)' : 'Reglamento del Negocio'}
                  </h2>
                </div>
              </div>
              <button onClick={() => { setOrgDocModal(null); setOrgDocFile(null); }} className="rounded-full p-2 text-text-secondary hover:bg-surface-hover hover:text-text transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {orgDocsData[orgDocModal] ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-bg p-4 border border-border">
                  <p className="text-sm text-text-secondary mb-2">Documento actual:</p>
                  <a 
                    href={orgDocsData[orgDocModal]!} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    Ver documento
                  </a>
                </div>
                <p className="text-sm text-text-secondary">Para reemplazar, sube un nuevo archivo:</p>
              </div>
            ) : (
              <p className="text-sm text-text-secondary mb-4">No hay documento cargado. Sube uno nuevo:</p>
            )}
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Seleccionar archivo (PDF, imagen, etc.)</Label>
                <input
                  type="file"
                  accept="*"
                  className="block w-full text-sm text-text file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      setOrgDocFile(e.target.files[0]);
                    }
                  }}
                />
              </div>
              
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => { setOrgDocModal(null); setOrgDocFile(null); }}
                  disabled={isUploadingOrgDoc}
                >
                  Cancelar
                </Button>
                <Button 
                  className="flex-1 gap-2"
                  onClick={async () => {
                    if (!orgDocFile) {
                      toast.error('Selecciona un archivo primero');
                      return;
                    }
                    
                    setIsUploadingOrgDoc(true);
                    try {
                      const docType = orgDocModal === 'PNO' ? 'pno' : 'reglamento';
                      const fileName = `${docType}-${Date.now()}-${orgDocFile.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
                      
                      const { data: uploadData, error: uploadError } = await localDb.storage
                        .from('hr-documents')
                        .upload(fileName, orgDocFile);
                      
                      if (uploadError) {
                        throw new Error(uploadError.message);
                      }
                      
                      if (uploadData) {
                        const { data: urlData } = localDb.storage.from('hr-documents').getPublicUrl(fileName);
                        const docUrl = urlData.publicUrl;
                        
                        localStorage.setItem(`org_doc_${docType}`, docUrl);
                        toast.success('Documento subido exitosamente');
                        setOrgDocModal(null);
                        setOrgDocFile(null);
                      }
                    } catch (err: any) {
                      toast.error(err.message || 'Error al subir el documento');
                    } finally {
                      setIsUploadingOrgDoc(false);
                    }
                  }}
                  disabled={isUploadingOrgDoc || !orgDocFile}
                >
                  {isUploadingOrgDoc ? 'Subiendo...' : 'Subir Documento'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={!!conceptsEntry}
        onClose={() => setConceptsEntry(null)}
        title="Conceptos de Nómina"
        description={conceptsEntry ? `Editando conceptos de ${conceptsEntry.employee_name}` : undefined}
        size="lg"
      >
        {conceptsEntry && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Horas Extra</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={conceptsForm.overtime_hours || ''}
                  onChange={e => setConceptsForm({ ...conceptsForm, overtime_hours: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Hora Extra</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                  value={conceptsForm.overtime_type}
                  onChange={e => setConceptsForm({ ...conceptsForm, overtime_type: e.target.value as any })}
                >
                  <option value="diurna">Diurna (tarifa × 2)</option>
                  <option value="nocturna">Nocturna (tarifa × 2.5)</option>
                  <option value="descanso">Día de descanso (tarifa × 2)</option>
                  <option value="feriado">Día feriado (tarifa × 3)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Bonificación / Estímulo ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={conceptsForm.bonus || ''}
                  onChange={e => setConceptsForm({ ...conceptsForm, bonus: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Días de Vacaciones Pagadas</Label>
                <Input
                  type="number"
                  min="0"
                  max="30"
                  step="1"
                  value={conceptsForm.vacation_days || ''}
                  onChange={e => setConceptsForm({ ...conceptsForm, vacation_days: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Anticipo ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={conceptsForm.advances || ''}
                  onChange={e => setConceptsForm({ ...conceptsForm, advances: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cuota de Préstamo ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={conceptsForm.loan_deduction || ''}
                  onChange={e => setConceptsForm({ ...conceptsForm, loan_deduction: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Otras Deducciones ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={conceptsForm.other_deductions || ''}
                  onChange={e => setConceptsForm({ ...conceptsForm, other_deductions: Number(e.target.value) })}
                />
              </div>
            </div>
            <p className="text-xs text-text-secondary rounded-lg bg-bg p-3 border border-border">
              El bruto = salario + horas extra + bonificación + pago de vacaciones. Sobre el bruto se calculan IIP y CESS.
              El neto = bruto − IIP − CESS − anticipo − cuota de préstamo − otras deducciones.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConceptsEntry(null)}>Cancelar</Button>
              <Button className="flex-1" onClick={saveConcepts} disabled={isSavingConcepts}>
                {isSavingConcepts ? 'Guardando...' : 'Guardar Conceptos'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!receiptEntry}
        onClose={() => setReceiptEntry(null)}
        title="Recibo de Pago"
        description={receiptEntry ? `${receiptEntry.employee_name} — ${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][receiptEntry.month - 1]} ${receiptEntry.year}` : undefined}
        size="lg"
      >
        {receiptEntry && (() => {
          const r = receiptEntry;
          const emp = employees.find(e => e.id === r.employee_id);
          const gross = r.gross_salary ?? r.earned_salary;
          const row = (label: string, value: number, cls?: string) => (
            <div className="flex justify-between py-0.5 text-sm">
              <span className="text-text-secondary">{label}</span>
              <span className={cls || 'text-text'}>${value.toFixed(2)}</span>
            </div>
          );
          return (
            <div>
              <div className="rounded-lg border border-border p-4 space-y-1 mb-4">
                <div className="flex items-center gap-2 border-b border-border pb-2 mb-2">
                  <Building className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-text">InventarioY</span>
                </div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">Expediente</span><span className="font-semibold">{emp?.expediente != null ? `#${emp.expediente}` : '-'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">Empleado</span><span className="font-semibold">{r.employee_name}</span></div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">Cargo</span><span>{emp?.role || '-'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">NIT / Carnet</span><span>{emp?.nit_id || '-'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">Departamento</span><span>{r.employee_category || '-'}</span></div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Horas / Días trabajados</span>
                  <span>{(r.worked_hours || 0).toFixed(1)} h ({(r.days_paid || 0).toFixed(2)} días)</span>
                </div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">Período</span><span>{['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][r.month - 1]} {r.year}</span></div>
                <hr className="border-border my-2" />
                <div className="font-semibold text-sm text-primary pt-1">Ingresos</div>
                {row('Salario del período', r.earned_salary)}
                {row('Horas extra', r.overtime_pay || 0)}
                {row('Bonificación', r.bonus || 0)}
                {row('Pago de vacaciones', r.vacation_pay || 0)}
                <div className="flex justify-between py-0.5 text-sm font-semibold border-t border-border mt-1 pt-1">
                  <span>Total bruto</span>
                  <span>${gross.toFixed(2)}</span>
                </div>
                <div className="font-semibold text-sm text-danger pt-2">Deducciones</div>
                {row('IIP', r.tax_amount || 0, 'text-danger')}
                {row('CESS', r.special_contribution || 0, 'text-danger')}
                {row('Anticipo', r.advances || 0, 'text-danger')}
                {row('Cuota de préstamo', r.loan_deduction || 0, 'text-danger')}
                {row('Otras deducciones', r.other_deductions || 0, 'text-danger')}
                <div className="flex justify-between py-1 text-sm font-bold border-t-2 border-border mt-2 pt-2">
                  <span>Salario Devengado (a cobrar)</span>
                  <span className="text-success">${r.net_salary.toFixed(2)}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setReceiptEntry(null)}>Cerrar</Button>
                <Button className="flex-1 gap-2" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" /> Imprimir
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal
        isOpen={showSc406}
        onClose={() => setShowSc406(false)}
        title="Modelo SC4-06 — Nómina"
        description="Hoja oficial para imprimir y firmar (Elaborada / Revisada / Aprobada / Contabilizada)"
        size="xl"
      >
        {payrollEntries.length > 0 && (() => {
          const lastDay = new Date(payrollMonth.year, payrollMonth.month, 0).getDate();
          const mm = String(payrollMonth.month).padStart(2, '0');
          const periodo = `01/${mm}/${payrollMonth.year} al ${lastDay}/${mm}/${payrollMonth.year}`;
          const businessName = (user as any)?.businessName || '';
          const businessCode = (user as any)?.business_code || '';
          const fmt = (v: number) => (v || 0).toFixed(2);
          const groups = Object.entries(payrollEntries.reduce((acc, entry) => {
            if (!acc[entry.employee_category]) acc[entry.employee_category] = [];
            acc[entry.employee_category].push(entry);
            return acc;
          }, {} as Record<string, typeof payrollEntries>));
          const totalNomina = payrollEntries.reduce((s, e) => s + e.net_salary, 0);
          const headCells = ['Código', 'Nombre y Apellidos', 'CI', 'Cat', 'Tarf. Sal', 'Días A cobrar', 'Bon.', 'P.A.T', 'Deveng.', 'Imp. S.', 'Ret.', 'Pagado', 'Vac. Acum.'];
          return (
            <div>
              <div className="print-sc406 bg-white !text-black border border-border p-4 max-h-[60vh] overflow-auto">
                <div className="text-center font-bold text-sm mb-2">MODELO SC4-06 NOMINA</div>
                <div className="grid grid-cols-2 gap-x-6 text-[11px] mb-2">
                  <div>MIPYMES: {businessName}</div>
                  <div className="text-right">Fecha: {new Date().toLocaleDateString('es')}</div>
                  <div>{businessCode ? `Código: ${businessCode}` : 'Código: ________'}</div>
                  <div className="text-right">INTRAM DE PAGO Nº ________</div>
                  <div className="col-span-2">Periodo de pago: {periodo}</div>
                </div>
                {groups.map(([cat, entries]) => {
                  const tDias = entries.reduce((s, e) => s + (e.days_paid || 0), 0);
                  const tBon = entries.reduce((s, e) => s + (e.bonus || 0), 0);
                  const tPat = entries.reduce((s, e) => s + (e.overtime_pay || 0) + (e.vacation_pay || 0), 0);
                  const tDev = entries.reduce((s, e) => s + (e.gross_salary ?? e.earned_salary), 0);
                  const tImp = entries.reduce((s, e) => s + (e.tax_amount || 0), 0);
                  const tRet = entries.reduce((s, e) => s + (e.advances || 0) + (e.loan_deduction || 0) + (e.other_deductions || 0), 0);
                  const tPag = entries.reduce((s, e) => s + e.net_salary, 0);
                  return (
                    <div key={cat} className="mb-3">
                      <div className="font-bold uppercase text-[11px] px-1 border-t border-x border-black bg-black/5">{cat}</div>
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="text-left">
                            {headCells.map(h => <th key={h} className="border border-black px-1 py-0.5">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map(entry => {
                            const employee = employees.find(e => e.id === entry.employee_id);
                            return (
                              <tr key={entry.id}>
                                <td className="border border-black px-1 py-0.5">{employee?.expediente != null ? `#${employee.expediente}` : ''}</td>
                                <td className="border border-black px-1 py-0.5">{entry.employee_name}</td>
                                <td className="border border-black px-1 py-0.5">{employee?.nit_id || ''}</td>
                                <td className="border border-black px-1 py-0.5 text-center">{employee?.person_type === 'partner' ? 'S' : 'T'}</td>
                                <td className="border border-black px-1 py-0.5 text-right">{fmt(entry.hourly_rate || 0)}</td>
                                <td className="border border-black px-1 py-0.5 text-right">{fmt(entry.days_paid || 0)}</td>
                                <td className="border border-black px-1 py-0.5 text-right">{fmt(entry.bonus || 0)}</td>
                                <td className="border border-black px-1 py-0.5 text-right">{fmt((entry.overtime_pay || 0) + (entry.vacation_pay || 0))}</td>
                                <td className="border border-black px-1 py-0.5 text-right">{fmt(entry.gross_salary ?? entry.earned_salary)}</td>
                                <td className="border border-black px-1 py-0.5 text-right">{fmt(entry.tax_amount)}</td>
                                <td className="border border-black px-1 py-0.5 text-right">{fmt((entry.advances || 0) + (entry.loan_deduction || 0) + (entry.other_deductions || 0))}</td>
                                <td className="border border-black px-1 py-0.5 text-right font-bold">{fmt(entry.net_salary)}</td>
                                <td className="border border-black px-1 py-0.5 text-right">{fmt(employee?.vacation_balance || 0)}</td>
                              </tr>
                            );
                          })}
                          <tr className="font-bold">
                            <td className="border border-black px-1 py-0.5 text-right" colSpan={5}>TOTAL POR ÁREA</td>
                            <td className="border border-black px-1 py-0.5 text-right">{fmt(tDias)}</td>
                            <td className="border border-black px-1 py-0.5 text-right">{fmt(tBon)}</td>
                            <td className="border border-black px-1 py-0.5 text-right">{fmt(tPat)}</td>
                            <td className="border border-black px-1 py-0.5 text-right">{fmt(tDev)}</td>
                            <td className="border border-black px-1 py-0.5 text-right">{fmt(tImp)}</td>
                            <td className="border border-black px-1 py-0.5 text-right">{fmt(tRet)}</td>
                            <td className="border border-black px-1 py-0.5 text-right">{fmt(tPag)}</td>
                            <td className="border border-black px-1 py-0.5" />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}
                <div className="flex justify-between font-bold text-[11px] border border-black px-2 py-1 mt-2">
                  <span>TOTAL NÓMINA</span>
                  <span>${fmt(totalNomina)}</span>
                </div>
                <div className="grid grid-cols-4 gap-4 mt-10 text-center text-[10px]">
                  {['Elaborada por', 'Revisada por', 'Aprobada por', 'Contabilizada por'].map(label => (
                    <div key={label}>
                      <div className="border-t border-black mt-8" />
                      <div className="mt-1">{label}: ________</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => setShowSc406(false)}>Cerrar</Button>
                <Button className="flex-1 gap-2" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" /> Imprimir
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal
        isOpen={!!deleteLoanTarget}
        onClose={() => setDeleteLoanTarget(null)}
        title="Eliminar préstamo"
        description={deleteLoanTarget ? `¿Seguro que deseas eliminar el préstamo de ${employees.find(e => e.id === deleteLoanTarget.employee_id)?.name || 'Desconocido'} por $${deleteLoanTarget.total_amount.toFixed(2)}? Esta acción no se puede deshacer.` : undefined}
        size="sm"
      >
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteLoanTarget(null)}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={async () => {
              const target = deleteLoanTarget;
              setDeleteLoanTarget(null);
              try {
                await deleteLoan(target.id);
                toast.success('Préstamo eliminado');
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            <Trash2 className="h-4 w-4" /> Eliminar
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={!!deleteLiquidationTarget}
        onClose={() => setDeleteLiquidationTarget(null)}
        title="Eliminar liquidación"
        description={deleteLiquidationTarget ? `¿Seguro que deseas eliminar la liquidación de ${deleteLiquidationTarget.employee_name} ($${deleteLiquidationTarget.net_total.toFixed(2)})? Esta acción no se puede deshacer.` : undefined}
        size="sm"
      >
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteLiquidationTarget(null)}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={async () => {
              const target = deleteLiquidationTarget;
              setDeleteLiquidationTarget(null);
              try {
                await deleteLiquidation(target.id);
                toast.success('Liquidación eliminada');
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            <Trash2 className="h-4 w-4" /> Eliminar
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={helpModal !== null}
        onClose={() => setHelpModal(null)}
        title={helpModal ? HELP_CONTENT[helpModal].title : undefined}
        description={helpModal ? HELP_CONTENT[helpModal].subtitle : undefined}
        size="xl"
      >
        {helpModal && (
          <div className="space-y-3">
            {HELP_CONTENT[helpModal].steps.map(step => (
              <div key={step.heading} className="rounded-lg bg-bg p-4 border border-border">
                <p className="font-semibold text-text text-sm mb-1">{step.heading}</p>
                <p className="text-sm text-text-secondary leading-relaxed">{step.text}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={pendingDelete?.title}
        description={pendingDelete?.description}
        confirmLabel={pendingDelete?.confirmLabel || 'Eliminar'}
        destructive={pendingDelete?.destructive ?? true}
        onConfirm={async () => {
          const action = pendingDelete?.onConfirm;
          setPendingDelete(null);
          if (action) await action();
        }}
      />
    </div>
  );
}

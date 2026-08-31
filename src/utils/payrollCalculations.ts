export interface PayrollResult {
  vacationBase: number;
  taxableBase: number;
  taxAmount: number;
  specialContribution: number;
  employerContribution: number;
  netSalary: number;
  // Conceptos de la nómina (Fase 3)
  grossSalary: number;
  overtimePay: number;
  bonus: number;
  vacationPay: number;
  advances: number;
  loanDeduction: number;
  otherDeductions: number;
}

export type PersonType = 'employee' | 'partner';

export type OvertimeType = 'diurna' | 'nocturna' | 'descanso' | 'feriado';

export interface PayrollOptions {
  personType?: PersonType;
  // Base de contribución seleccionada por el socio (DL 92/2024: 2,000 – 9,500 CUP).
  baseContribution?: number;
  // Mínimo exento mensual de IIP (Res. 41/2023: 3,260 CUP). Configurable en Settings.
  exemptionBase?: number;
  // Horas extra y su tipo (empleados).
  overtimeHours?: number;
  overtimeType?: OvertimeType;
  // Bonificación / estímulo del período.
  bonus?: number;
  // Días de vacaciones pagadas en el período (pago anticipado).
  vacationDays?: number;
  // Anticipo entregado en el período (se descuenta del neto).
  advances?: number;
  // Cuota de préstamo del período (se descuenta del neto).
  loanDeduction?: number;
  // Otras deducciones (cuota sindical, pensiones alimenticias, embargos...).
  otherDeductions?: number;
  // Fondo de tiempo estimado (horas/mes). Por defecto 190.6 h (Versat).
  monthlyHours?: number;
}

const ROUND = (v: number) => Math.round(v * 100) / 100;

// Escala progresiva IIP — Resolución 41/2023 MFP (GOC-2023-271-EX20).
// La escala se aplica sobre la remuneración total; el primer tramo
// (0 – 3,260 CUP) queda exento con tasa 0%. Vigente para trabajadores asalariados
// del sector empresarial, presupuestado y personal contratado por Mipymes,
// Cooperativas No Agropecuarias y proyectos de desarrollo local (homologado 2024).
const IIP_BRACKETS = [
  { min: 0, max: 3260, rate: 0 },
  { min: 3260, max: 9510, rate: 0.03 },
  { min: 9510, max: 15000, rate: 0.05 },
  { min: 15000, max: 20000, rate: 0.075 },
  { min: 20000, max: 25000, rate: 0.10 },
  { min: 25000, max: 30000, rate: 0.15 },
  { min: 30000, max: Infinity, rate: 0.20 },
];

// Umbral mensual de CESS (Ley 164/2023 y Resolución 41/2023).
const CESS_THRESHOLD = 15000;

// Régimen especial de seguridad social de los socios (Decreto-Ley 92/2024).
const PARTNER_CONTRIBUTION_RATE = 0.20;
const PARTNER_MIN_BASE = 2000;
const PARTNER_MAX_BASE = 9500;

// Recargo sobre la tarifa horaria por tipo de hora extra (Código de Trabajo, Ley 116).
// - Diurna: +100% (tarifa × 2)
// - Nocturna: +150% (tarifa × 2.5)
// - Día de descanso: +100% (tarifa × 2)
// - Día feriado: +200% (tarifa × 3)
const OVERTIME_MULTIPLIERS: Record<OvertimeType, number> = {
  diurna: 2.0,
  nocturna: 2.5,
  descanso: 2.0,
  feriado: 3.0,
};

// Horas mensuales estándar para el cálculo de la tarifa horaria cuando no se
// configura un fondo de tiempo propio (fallback; el valor operativo por defecto
// es 190.6 h y se pasa vía opts.monthlyHours desde payroll_config).
const DEFAULT_MONTHLY_HOURS = 190.6;
// Días para el cálculo del salario diario (pago de vacaciones).
const MONTHLY_DAYS = 30;
const VACATION_DAYS_PER_YEAR = 30; // 30 días de vacaciones por año trabajado (2.5/mes).
const NOTICE_DAYS_INDEFINITE = 30; // Preaviso para contratos indeterminados.

function calcularAsalariado(
  salarioBase: number,
  opts: PayrollOptions,
): PayrollResult {
  // Tarifa horaria a partir del salario base y el fondo de tiempo estimado.
  const monthlyHours = opts.monthlyHours || DEFAULT_MONTHLY_HOURS;
  const tarifaHoraria = salarioBase / monthlyHours;
  const horas = opts.overtimeHours || 0;
  const tipo = opts.overtimeType || 'diurna';
  const overtimePay = ROUND(tarifaHoraria * horas * OVERTIME_MULTIPLIERS[tipo]);

  const bonus = ROUND(opts.bonus || 0);
  const vacationPay = ROUND((salarioBase / MONTHLY_DAYS) * (opts.vacationDays || 0));
  const advances = ROUND(opts.advances || 0);
  const loanDeduction = ROUND(opts.loanDeduction || 0);
  const otherDeductions = ROUND(opts.otherDeductions || 0);

  // Remuneración total gravable: salario base + horas extra + bonos + pago de vacaciones.
  const grossSalary = ROUND(salarioBase + overtimePay + bonus + vacationPay);

  // Base de cotización a la seguridad social (incluye provisión de vacaciones 9.09%).
  const vacationBase = ROUND(grossSalary * 1.0909);

  // CESS: 5% sobre la remuneración hasta 15,000 CUP y 10% sobre el exceso.
  const specialContribution = ROUND(
    Math.min(grossSalary, CESS_THRESHOLD) * 0.05 +
      Math.max(0, grossSalary - CESS_THRESHOLD) * 0.10
  );

  // IIP: escala progresiva Res. 41/2023 aplicada sobre la remuneración total.
  // El primer tramo (0 – exención) queda exento con tasa 0%. La exención por
  // defecto es 3,260 CUP (Res. 41/2023) pero puede configurarse en Settings.
  const exemption = Math.max(0, opts.exemptionBase ?? 3260);
  const brackets = [{ min: 0, max: exemption, rate: 0 }, ...IIP_BRACKETS.filter(b => b.min >= exemption || b.rate > 0).map(b => (b.min < exemption ? { ...b, min: exemption } : b))];
  let taxAmount = 0;
  for (const b of brackets) {
    if (grossSalary > b.min) {
      const taxableInBracket = Math.min(grossSalary, b.max) - b.min;
      taxAmount += taxableInBracket * b.rate;
    }
  }
  taxAmount = ROUND(taxAmount);

  // Aporte del empleador a la seguridad social (14% sobre la base de cotización).
  const employerContribution = ROUND(vacationBase * 0.14);

  const totalDeductions = ROUND(specialContribution + taxAmount + advances + loanDeduction + otherDeductions);
  const netSalary = ROUND(grossSalary - totalDeductions);

  return {
    vacationBase,
    taxableBase: grossSalary,
    taxAmount,
    specialContribution,
    employerContribution,
    netSalary,
    grossSalary,
    overtimePay,
    bonus,
    vacationPay,
    advances,
    loanDeduction,
    otherDeductions,
  };
}

// Socio de Mipyme/CNA (DL 92/2024):
// - No paga IIP mensual sobre el retiro (lo paga anualmente sobre utilidades, min. exento 39,120).
// - Contribuye al régimen especial de seguridad social con el 20% de la base seleccionada (2,000-9,500).
// - El "retiro" mensual (salario base) es la remuneración que se toma del negocio.
function calcularSocio(
  retiroMensual: number,
  opts: PayrollOptions,
): PayrollResult {
  const base = Math.min(Math.max(opts.baseContribution || 0, PARTNER_MIN_BASE), PARTNER_MAX_BASE);
  const specialContribution = ROUND(base * PARTNER_CONTRIBUTION_RATE);

  const bonus = ROUND(opts.bonus || 0);
  const advances = ROUND(opts.advances || 0);
  const loanDeduction = ROUND(opts.loanDeduction || 0);
  const otherDeductions = ROUND(opts.otherDeductions || 0);

  const grossSalary = ROUND(retiroMensual + bonus);

  const totalDeductions = ROUND(specialContribution + advances + loanDeduction + otherDeductions);
  const netSalary = ROUND(grossSalary - totalDeductions);

  return {
    vacationBase: 0,
    taxableBase: 0,
    taxAmount: 0,
    specialContribution,
    employerContribution: 0,
    netSalary,
    grossSalary,
    overtimePay: 0,
    bonus,
    vacationPay: 0,
    advances,
    loanDeduction,
    otherDeductions,
  };
}

export function calcularNomina(
  salarioDevengado: number,
  options?: PayrollOptions,
): PayrollResult {
  const opts: PayrollOptions = options || {};
  if (opts.personType === 'partner') {
    return calcularSocio(salarioDevengado, opts);
  }
  return calcularAsalariado(salarioDevengado, opts);
}

// ─── Liquidación laboral ─────────────────────────────────────────────────────

export interface LiquidationInput {
  baseSalary: number;
  hireDate?: string;
  endDate?: string;
  vacationTaken?: number;
  contractType?: 'indefinite' | 'fixed' | 'probation';
}

export interface LiquidationResult {
  monthsWorked: number;
  vacationAccumulated: number;
  vacationTaken: number;
  vacationPending: number;
  vacationPay: number;
  severanceMonths: number;
  severancePay: number;
  noticeDays: number;
  noticePay: number;
  grossTotal: number;
  cess: number;
  iip: number;
  netTotal: number;
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(0, Math.floor((e.getTime() - s.getTime()) / 86400000));
}

export function calcularLiquidacion(input: LiquidationInput): LiquidationResult {
  const { baseSalary, hireDate, endDate, vacationTaken = 0, contractType = 'indefinite' } = input;

  const end = endDate || new Date().toISOString().slice(0, 10);
  const hire = hireDate || end;
  const days = daysBetween(hire, end);
  const monthsWorked = days / MONTHLY_DAYS;
  const yearsWorked = days / 365;

  // Vacaciones: se acumulan 2.5 días por mes (30 al año). Las no disfrutadas se pagan.
  const vacationAccumulated = ROUND(monthsWorked * (VACATION_DAYS_PER_YEAR / 12));
  const vacationPending = Math.max(0, Math.round(vacationAccumulated - vacationTaken));
  const vacationPay = ROUND((baseSalary / MONTHLY_DAYS) * vacationPending);

  // Auxilio de despido: 30 días de salario por cada año trabajado (contratos indeterminados).
  let severanceMonths = 0;
  if (contractType === 'indefinite') {
    severanceMonths = Math.min(yearsWorked, 6); // tope razonable de 6 meses por año de servicio
    severanceMonths = ROUND(severanceMonths);
  }
  const severancePay = ROUND(severanceMonths * baseSalary);

  // Preaviso: 30 días de salario para contratos indeterminados si no se notificó.
  const noticeDays = contractType === 'indefinite' ? NOTICE_DAYS_INDEFINITE : 0;
  const noticePay = ROUND((baseSalary / MONTHLY_DAYS) * noticeDays);

  // Bruto de la liquidación.
  const grossTotal = ROUND(vacationPay + severancePay + noticePay);

  // Retenciones aplicables (CESS + IIP) sobre el bruto (escala Res. 41/2023).
  const cess = ROUND(
    Math.min(grossTotal, CESS_THRESHOLD) * 0.05 +
      Math.max(0, grossTotal - CESS_THRESHOLD) * 0.10
  );
  let iip = 0;
  for (const b of IIP_BRACKETS) {
    if (grossTotal > b.min) {
      iip += (Math.min(grossTotal, b.max) - b.min) * b.rate;
    }
  }
  iip = ROUND(iip);

  const netTotal = ROUND(grossTotal - cess - iip);

  return {
    monthsWorked: ROUND(monthsWorked),
    vacationAccumulated: ROUND(vacationAccumulated),
    vacationTaken,
    vacationPending,
    vacationPay,
    severanceMonths,
    severancePay,
    noticeDays,
    noticePay,
    grossTotal,
    cess,
    iip,
    netTotal,
  };
}

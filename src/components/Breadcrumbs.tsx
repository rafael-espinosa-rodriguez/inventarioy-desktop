import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useMemo } from 'react';

const labelMap: Record<string, string> = {
  '': 'Almacén',
  'inventory': 'Inventario',
  'movements': 'Movimientos',
  'transit': 'Tránsito',
  'sales': 'Ventas',
  'closings': 'Cierres de Caja',
  'recipes': 'Recetas',
  'consumption': 'Consumo',
  'analysis': 'Análisis',
  'charts': 'Gráficos',
  'filtered': 'Centro Filtrado',
  'hr': 'RRHH',
  'settings': 'Configuración',
  'license': 'Licencia',
  'action-logs': 'Registro de Acciones',
  'users': 'Gestión de Usuarios',
};

export default function Breadcrumbs() {
  const location = useLocation();
  const segments = useMemo(() => {
    const parts = location.pathname.replace('/dashboard', '').split('/').filter(Boolean);
    return parts.map((part, i) => ({
      label: labelMap[part] || part,
      path: '/dashboard/' + parts.slice(0, i + 1).join('/'),
      isLast: i === parts.length - 1,
    }));
  }, [location.pathname]);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 text-sm text-text-secondary">
        <li>
          <Link to="/dashboard" className="hover:text-primary transition-colors">
            Almacén
          </Link>
        </li>
        {segments.map((seg) => (
          <li key={seg.path} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5" />
            {seg.isLast ? (
              <span className="text-text font-medium" aria-current="page">{seg.label}</span>
            ) : (
              <Link to={seg.path} className="hover:text-primary transition-colors">{seg.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

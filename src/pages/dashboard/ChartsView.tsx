import React, { useMemo } from 'react';
import { useDatabaseStore } from '../../store/dbStore';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';

const COLORS = ['#d4af37', '#b8962f', '#a68527', '#947220', '#83601a', '#724e15'];

// "YYYY-MM-DD" lo interpreta new Date() como medianoche UTC y toLocaleDateString lo
// mostraría 1 día atrás en hora local; construimos una fecha local para que la etiqueta
// del gráfico coincida con el día en que se registró la venta.
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export default function ChartsView() {
  const { sales, products, recipes } = useDatabaseStore();

  // 1. Sales Over Time (Line Chart)
  const salesOverTime = useMemo(() => {
    const sorted = [...sales].sort((a, b) =>
      parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime()
    );
    const grouped = sorted.reduce((acc, sale) => {
      const date = parseLocalDate(sale.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
      acc[date] = (acc[date] || 0) + sale.total_amount;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped)
      .map(([date, total]) => ({ date, total }))
      .slice(-14);
  }, [sales]);

  // 2. Top Selling Products (Bar Chart) - incluye productos individuales y recetas
  const topProducts = useMemo(() => {
    const productSales = sales.flatMap(s => s.items || []).reduce((acc, item) => {
      let name: string;
      
      if (item.is_recipe) {
        if (item.recipe_snapshot?.name) {
          name = item.recipe_snapshot.name;
        } else {
          const recipe = recipes.find(r => r.id === item.product_id);
          if (!recipe) return acc;
          name = recipe.name;
        }
      } else {
        const product = products.find(p => p.id === item.product_id);
        if (!product) return acc;
        name = product.name;
      }
      
      const qty = Number(item.quantity) || 0;
      acc[name] = (acc[name] || 0) + qty;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(productSales)
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5); // Top 5
  }, [sales, products, recipes]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Gráficos y Visualizaciones</h1>
        <p className="text-sm text-text-secondary">
          Representación visual del rendimiento de su negocio
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sales Over Time Chart */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm lg:col-span-2">
          <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <TrendingUp className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold text-text">Evolución de Ventas</h2>
          </div>
          
          <div className="h-[250px] sm:h-[300px] w-full">
            {salesOverTime.length === 0 ? (
              <div className="flex h-full items-center justify-center text-text-secondary">
                No hay datos de ventas suficientes
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesOverTime} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="date" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Ventas']}
                  />
                  <Line type="monotone" dataKey="total" stroke="#d4af37" strokeWidth={3} dot={{ fill: '#d4af37', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top Products Chart */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <BarChart3 className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold text-text">Top 5 Productos Más Vendidos</h2>
          </div>
          
          <div className="h-[200px] sm:h-[250px] w-full">
            {topProducts.length === 0 ? (
              <div className="flex h-full items-center justify-center text-text-secondary">
                No hay datos de ventas
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                  <XAxis type="number" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" stroke="#888" fontSize={12} tickLine={false} axisLine={false} width={100} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px' }}
                    cursor={{ fill: '#333', opacity: 0.4 }}
                    formatter={(value: any) => [value, 'Unidades']}
                  />
                  <Bar dataKey="quantity" fill="#d4af37" radius={[0, 4, 4, 0]} barSize={24}>
                    {topProducts.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

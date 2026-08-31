import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { localDb } from '../lib/db/localClient';
import { Search, X, ShoppingBag, AlertCircle, Loader2, MapPin, Clock, Phone } from 'lucide-react';
import { Input } from '../components/ui/input';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  categoryName: string;
  is_recipe: boolean;
  stock?: number;
}

const isActive = (v: any) => v === true || v === 1;

export default function MenuView() {
  const [searchParams] = useSearchParams();
  const businessId = searchParams.get('b');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [businessName, setBusinessName] = useState('Negocio');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [businessHours, setBusinessHours] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!businessId) {
        setError('Negocio no encontrado. Escanea el código QR correcto.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const menuRes = await localDb.fetchMenu(businessId);
        if (menuRes.error) {
          setError(menuRes.error?.message || 'Error al cargar el menú.');
          return;
        }
        const data = menuRes.data || {};
        setProducts(data.products || []);
        setRecipes(data.recipes || []);
        setCategories(data.categories || []);
        const profile = data.profile || null;
        if (profile?.businessName || profile?.business_name) setBusinessName(profile.businessName || profile.business_name);
        if (profile?.phone) setPhone(profile.phone);
        if (profile?.address) setAddress(profile.address);
        if (profile?.businessHours || profile?.business_hours) setBusinessHours(profile.businessHours || profile.business_hours);
        if (!profile) {
          setError('Negocio no encontrado.');
        }

      } catch (err) {
        if (import.meta.env.DEV) console.error('Error fetching menu data:', err);
        setError('Error al cargar el menú.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [businessId]);

  const menuItems = useMemo(() => {
    const items: MenuItem[] = [];
    
    products
      .filter(p => isActive(p.is_active) && p.is_individual === true)
      .forEach(product => {
        items.push({
          id: product.id,
          name: product.name,
          price: Number(product.price) || 0,
          category: product.category || 'uncategorized',
          categoryName: product.category || 'Sin categoría',
          is_recipe: false,
          stock: product.quantity || 0
        });
      });

    recipes
      .filter(r => isActive(r.is_active))
      .forEach(recipe => {
        items.push({
          id: recipe.id,
          name: recipe.name,
          price: Number(recipe.selling_price) || 0,
          category: recipe.category || 'uncategorized',
          categoryName: recipe.category || 'Sin categoría',
          is_recipe: true,
          stock: undefined
        });
      });

    return items;
  }, [products, recipes, categories]);

  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      const matchesSearch = (item.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [menuItems, searchTerm, selectedCategory]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set(menuItems.map(item => item.categoryName));
    const result = Array.from(cats).map(catName => ({
      id: catName,
      name: catName
    }));
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [menuItems]);

  const menuTitle = `${businessName}-Menú`;

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 right-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-10 w-48 h-48 bg-primary/3 rounded-full blur-3xl"></div>
        </div>
        <div className="text-center relative z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2 drop-shadow-[0_0_10px_rgba(255,193,7,0.5)]" />
          <p className="text-text-secondary text-sm">Cargando menú...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 right-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-10 w-48 h-48 bg-primary/3 rounded-full blur-3xl"></div>
        </div>
        <div className="text-center px-4 relative z-10">
          <AlertCircle className="h-12 w-12 text-danger mx-auto mb-3 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
          <p className="text-text font-medium">{error}</p>
          <p className="text-text-secondary text-sm mt-2">Escanea el código QR de su negocio para ver el menú.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg relative overflow-hidden border-2 sm:border-4 border-white/10 rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 left-0 w-64 h-64 bg-primary/3 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-primary/4 rounded-full blur-3xl"></div>
      </div>

      <div className="bg-surface/80 backdrop-blur-md border-b border-border/50 sticky top-0 z-10 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none"></div>
        <div className="max-w-2xl mx-auto px-4 py-5 relative">
          <h1 className="text-2xl font-bold text-text text-center drop-shadow-[0_0_15px_rgba(255,193,7,0.6)]">
            {menuTitle}
          </h1>
          
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input
              placeholder="Buscar productos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-bg/80 border-border/50 text-text placeholder:text-text-secondary backdrop-blur-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 text-xs rounded-full whitespace-nowrap transition-all duration-300 ${
                selectedCategory === 'all'
                  ? 'bg-gradient-to-r from-primary to-primary-hover text-black font-semibold shadow-[0_0_15px_rgba(255,193,7,0.4)]'
                  : 'bg-surface-hover/80 text-text-secondary hover:bg-surface-hover hover:border-primary/30 border border-border/50'
              }`}
            >
              Todo
            </button>
            {uniqueCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 text-xs rounded-full whitespace-nowrap transition-all duration-300 ${
                  selectedCategory === cat.id
                    ? 'bg-gradient-to-r from-primary to-primary-hover text-black font-semibold shadow-[0_0_15px_rgba(255,193,7,0.4)]'
                    : 'bg-surface-hover/80 text-text-secondary hover:bg-surface-hover hover:border-primary/30 border border-border/50'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 relative">
        {filteredItems.length === 0 ? (
          <div className="text-center py-16">
            <div className="relative inline-block">
              <ShoppingBag className="h-16 w-16 text-text-secondary/30 mx-auto mb-4" />
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-2xl"></div>
            </div>
            <p className="text-text-secondary">No se encontraron productos</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filteredItems.map(item => {
              const isOutOfStock = !item.is_recipe && item.stock !== undefined && item.stock <= 0;
              
              return (
                <div
                  key={item.id}
                  className={`group relative bg-surface/60 backdrop-blur-sm rounded-xl overflow-hidden border transition-all duration-300 hover:border-primary/40 hover:shadow-[0_0_25px_-5px_rgba(255,193,7,0.2)] ${
                    isOutOfStock ? 'opacity-60' : ''
                  }`}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="p-4 relative">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-text truncate group-hover:text-primary transition-colors">
                          {item.name}
                        </h3>
                        <p className="text-xs text-text-secondary/70 mt-1">
                          {item.categoryName}
                        </p>
                      </div>
                      {isOutOfStock && (
                        <span className="ml-2 inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-danger/20 text-danger border border-danger/30">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Agotado
                        </span>
                      )}
                    </div>
                    <p className="text-xl font-bold text-primary mt-3 drop-shadow-[0_0_8px_rgba(255,193,7,0.5)]">
                      ${item.price.toFixed(2)}
                    </p>
                    {item.is_recipe && (
                      <span className="inline-block mt-2 text-xs bg-gradient-to-r from-warning/30 to-warning/20 text-warning-border px-2 py-1 rounded-md border border-warning/30">
                        Receta
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-10 space-y-4 text-center">
          {(phone || address || businessHours) && (
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-primary/10 rounded-2xl blur-xl"></div>
              <div className="relative bg-surface/80 backdrop-blur-md rounded-2xl p-6 border border-border/50">
                <p className="text-xs text-text-secondary mb-4 font-medium uppercase tracking-wider">Información de contacto</p>
                <div className="space-y-3">
                  {phone && (
                    <p className="text-sm text-text flex items-center justify-center gap-3">
                      <Phone className="h-4 w-4 text-primary" />
                      {phone}
                    </p>
                  )}
                  {address && (
                    <p className="text-sm text-text flex items-center justify-center gap-3">
                      <MapPin className="h-4 w-4 text-primary" />
                      {address}
                    </p>
                  )}
                  {businessHours && (
                    <p className="text-sm text-text flex items-center justify-center gap-3">
                      <Clock className="h-4 w-4 text-primary" />
                      {businessHours}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <p className="text-xs text-text-secondary/50">Powered by InventarioY</p>
        </div>
      </div>
    </div>
  );
}
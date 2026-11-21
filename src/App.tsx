import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ClipboardList,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package2,
  PanelLeftClose,
  PanelLeftOpen,
  ScanLine,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { apiFetch, formatCurrency, setAuthToken } from './lib/api';
import type { AuthUser, Movement, Product } from './types';
import { AuthView } from './views/AuthView';
import { DashboardView } from './views/DashboardView';
import { InventoryView } from './views/InventoryView';
import { MovementsView } from './views/MovementsView';
import { OrdersView } from './views/OrdersView';
import { ReportsView } from './views/ReportsView';
import { AdminRolesView } from './views/AdminRolesView';
import { AdminCrudView } from './views/AdminCrudView';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { ExitReportModal } from './components/ExitReportModal';

type TabKey = 'dashboard' | 'inventory' | 'movements' | 'orders' | 'reports' | 'roles' | 'cruds';

interface AuthStatusResponse {
  needsSetup: boolean;
  hasEnvPasscode: boolean;
  accounts: Array<{ email: string; name: string; role_slug: string; role_name: string }>;
}

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sidebar collapse & Dark Mode
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('almacenpro-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return (
        localStorage.getItem('almacenpro-theme') === 'dark' ||
        document.documentElement.classList.contains('dark')
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem('almacenpro-theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('almacenpro-sidebar-collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Shared catalog & cross-tab actions
  const [products, setProducts] = useState<Product[]>([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [refreshSignal, setRefreshSignal] = useState(0);

  // Preselection when jumping from Inventory/Dashboard/Scan into Movements or Orders
  const [preselectedProduct, setPreselectedProduct] = useState<Product | null>(null);
  const [preselectedMovMode, setPreselectedMovMode] = useState<'INGRESO' | 'SALIDA'>('INGRESO');
  const [preselectedOrderProd, setPreselectedOrderProd] = useState<Product | null>(null);

  // Modals
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedResult, setScannedResult] = useState<Product | null>(null);
  const [scanError, setScanError] = useState('');
  const [exitReportMovement, setExitReportMovement] = useState<Movement | null>(null);

  const loadAuthStatus = useCallback(async () => {
    try {
      const res = await apiFetch<AuthStatusResponse>('/api/auth/status');
      setAuthStatus(res);
    } catch {
      setAuthStatus({ needsSetup: false, hasEnvPasscode: false, accounts: [] });
    }
  }, []);

  useEffect(() => {
    loadAuthStatus();
  }, [loadAuthStatus]);

  const loadAllProducts = useCallback(async () => {
    if (!user || !user.permissions.view_inventory) return;
    try {
      const res = await apiFetch<{ products: Product[] }>('/api/products');
      setProducts(res.products);
    } catch {
      // handled in view
    }
  }, [user]);

  useEffect(() => {
    loadAllProducts();
  }, [loadAllProducts, refreshSignal]);

  const refreshCurrentUser = useCallback(async () => {
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/me');
      setUser(res.user);
    } catch {
      // keep current
    }
  }, []);

  const handleLogout = () => {
    setAuthToken(null);
    setUser(null);
    setActiveTab('dashboard');
    loadAuthStatus();
  };

  const handleBarcodeDetected = async (code: string) => {
    setScanError('');
    try {
      const res = await apiFetch<{ product: Product }>(
        `/api/products/barcode/${encodeURIComponent(code)}`
      );
      setScannedResult(res.product);
    } catch (err) {
      setInventorySearch(code);
      setActiveTab('inventory');
      setScanError(
        err instanceof Error ? err.message : `No se encontró producto con código ${code}.`
      );
    }
  };

  if (!authStatus) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Conectando con la base de datos SQLite...
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        needsSetup={authStatus.needsSetup}
        accounts={authStatus.accounts}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        onAuthenticated={(u) => {
          setUser(u);
          if (u.permissions.view_dashboard) setActiveTab('dashboard');
          else if (u.permissions.view_inventory) setActiveTab('inventory');
          else setActiveTab('orders');
        }}
      />
    );
  }

  const allNavItems: Array<{
    key: TabKey;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    visible: boolean;
  }> = [
    {
      key: 'dashboard',
      label: 'Panel General',
      shortLabel: 'Inicio',
      icon: LayoutDashboard,
      visible: Boolean(user.permissions.view_dashboard),
    },
    {
      key: 'inventory',
      label: 'Inventario',
      shortLabel: 'Stock',
      icon: Boxes,
      visible: Boolean(user.permissions.view_inventory),
    },
    {
      key: 'movements',
      label: 'Ingresos / Salidas',
      shortLabel: 'Movim.',
      icon: ArrowLeftRight,
      visible: Boolean(
        user.permissions.register_entry ||
          user.permissions.register_exit ||
          user.permissions.view_inventory
      ),
    },
    {
      key: 'orders',
      label: 'Pedidos',
      shortLabel: 'Pedidos',
      icon: ClipboardList,
      visible: Boolean(
        user.permissions.request_order ||
          user.permissions.approve_orders ||
          user.permissions.register_exit
      ),
    },
    {
      key: 'reports',
      label: 'Reportes',
      shortLabel: 'Reportes',
      icon: BarChart3,
      visible: Boolean(user.permissions.view_reports),
    },
    {
      key: 'roles',
      label: 'Usuarios y Roles',
      shortLabel: 'Roles',
      icon: ShieldCheck,
      visible: Boolean(user.permissions.manage_users),
    },
    {
      key: 'cruds',
      label: 'Tablas CRUD',
      shortLabel: 'CRUDs',
      icon: Database,
      visible: user.role_slug === 'admin',
    },
  ];
  const navItems = allNavItems.filter((item) => item.visible);

  const primaryMobileTabs = navItems.slice(0, 4);
  const overflowMobileTabs = navItems.slice(4);

  const jumpToEntry = (p: Product) => {
    setPreselectedProduct(p);
    setPreselectedMovMode('INGRESO');
    setActiveTab('movements');
  };

  const jumpToExit = (p: Product) => {
    setPreselectedProduct(p);
    setPreselectedMovMode('SALIDA');
    setActiveTab('movements');
  };

  const jumpToOrder = (p: Product) => {
    setPreselectedOrderProd(p);
    setActiveTab('orders');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row">
      {/* Desktop Sidebar (Expandable 240px <-> Minimized 72px with hover hints) */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30 transition-[width] duration-200 ${
          sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-60'
        }`}
      >
        {/* Brand + Collapse Toggle */}
        <div
          className={`h-16 flex items-center border-b border-slate-200 dark:border-slate-800 ${
            sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-blue-700 text-white flex items-center justify-center shrink-0">
                <Package2 className="w-4 h-4" />
              </div>
              <span className="font-display font-bold text-lg tracking-tight text-slate-900 dark:text-white whitespace-nowrap truncate">
                AlmacénPro
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Expandir menú lateral' : 'Minimizar menú lateral'}
            aria-label={sidebarCollapsed ? 'Expandir menú lateral' : 'Minimizar menú lateral'}
            className="group relative min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-5 h-5" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
            {sidebarCollapsed && (
              <span
                role="tooltip"
                className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium whitespace-nowrap shadow-lg border border-slate-700 z-50"
              >
                Expandir menú
              </span>
            )}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                title={sidebarCollapsed ? item.label : undefined}
                aria-label={item.label}
                className={`group relative w-full min-h-[42px] rounded-lg text-sm font-medium flex items-center transition-colors whitespace-nowrap ${
                  sidebarCollapsed ? 'justify-center px-0' : 'px-3 gap-2.5'
                } ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}

                {sidebarCollapsed && (
                  <span
                    role="tooltip"
                    className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium whitespace-nowrap shadow-lg border border-slate-700 z-50"
                  >
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Controls: Theme Toggle & User / Logout */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
          {!sidebarCollapsed && (
            <div className="px-2 py-1.5 mb-1">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {user.name}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {user.role_name} · {user.department}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            title={sidebarCollapsed ? (darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro') : undefined}
            aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className={`group relative w-full min-h-[40px] rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center transition-colors ${
              sidebarCollapsed ? 'justify-center px-0' : 'px-3 gap-2'
            }`}
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <Moon className="w-4 h-4 text-slate-500 shrink-0" />
            )}
            {!sidebarCollapsed && (
              <span>{darkMode ? 'Modo Claro' : 'Modo Oscuro'}</span>
            )}
            {sidebarCollapsed && (
              <span
                role="tooltip"
                className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium whitespace-nowrap shadow-lg border border-slate-700 z-50"
              >
                {darkMode ? 'Modo Claro' : 'Modo Oscuro'}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            title={sidebarCollapsed ? `Cambiar usuario / Salir (${user.name})` : undefined}
            aria-label="Cambiar Usuario / Salir"
            className={`group relative w-full min-h-[40px] rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center transition-colors ${
              sidebarCollapsed ? 'justify-center px-0' : 'px-3 gap-2'
            }`}
          >
            <LogOut className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
            {!sidebarCollapsed && <span>Cambiar Usuario / Salir</span>}
            {sidebarCollapsed && (
              <span
                role="tooltip"
                className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium whitespace-nowrap shadow-lg border border-slate-700 z-50"
              >
                Salir ({user.name})
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div
        className={`flex-1 flex flex-col min-w-0 pb-20 lg:pb-6 transition-[padding] duration-200 ${
          sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-60'
        }`}
      >
        {/* Compact Top Header (<= 56px mobile, 64px desktop) */}
        <header className="sticky top-0 z-20 h-14 lg:h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="lg:hidden w-8 h-8 rounded-lg bg-slate-900 dark:bg-blue-700 text-white flex items-center justify-center shrink-0">
              <Package2 className="w-4 h-4" />
            </div>
            <span className="lg:hidden font-display font-bold text-base text-slate-900 dark:text-white whitespace-nowrap">
              AlmacénPro
            </span>
            <span className="hidden lg:inline text-sm font-medium text-slate-600 dark:text-slate-300 truncate">
              {navItems.find((n) => n.key === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Theme toggle visible on mobile, tablet & desktop top bar */}
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="min-h-[40px] min-w-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              <span className="hidden sm:inline">{darkMode ? 'Claro' : 'Oscuro'}</span>
            </button>

            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <ScanLine className="w-4 h-4" />
              <span>Escanear</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="hidden sm:inline-flex lg:hidden min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Salir
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              aria-label="Más opciones"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Scan Error Notice */}
        {scanError && (
          <div className="mx-4 lg:mx-8 mt-4 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
            <span>{scanError}</span>
            <button
              type="button"
              onClick={() => setScanError('')}
              className="p-1 text-amber-700 dark:text-amber-300 hover:text-amber-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Viewport Content */}
        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && user.permissions.view_dashboard && (
            <DashboardView
              user={user}
              onQuickEntry={jumpToEntry}
              onQuickOrder={jumpToOrder}
              onOpenExitPdf={(m) => setExitReportMovement(m)}
              onNavigate={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'inventory' && user.permissions.view_inventory && (
            <InventoryView
              user={user}
              externalSearch={inventorySearch}
              onExternalSearchChange={setInventorySearch}
              onOpenScanner={() => setScannerOpen(true)}
              onStartEntry={jumpToEntry}
              onStartExit={jumpToExit}
              onStartOrder={jumpToOrder}
              refreshSignal={refreshSignal}
            />
          )}

          {activeTab === 'movements' && (
            <MovementsView
              user={user}
              products={products}
              preselectedProduct={preselectedProduct}
              preselectedMode={preselectedMovMode}
              onClearPreselected={() => setPreselectedProduct(null)}
              onOpenScanner={() => setScannerOpen(true)}
              onOpenExitPdf={(m) => setExitReportMovement(m)}
              onStockChanged={() => setRefreshSignal((s) => s + 1)}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              user={user}
              products={products}
              preselectedProduct={preselectedOrderProd}
              onClearPreselected={() => setPreselectedOrderProd(null)}
              onDispatchedExit={(m) => setExitReportMovement(m)}
              onStockChanged={() => setRefreshSignal((s) => s + 1)}
            />
          )}

          {activeTab === 'reports' && user.permissions.view_reports && <ReportsView />}

          {activeTab === 'roles' && user.permissions.manage_users && (
            <AdminRolesView onPermissionsChanged={refreshCurrentUser} />
          )}

          {activeTab === 'cruds' && user.role_slug === 'admin' && (
            <AdminCrudView
              user={user}
              onDataChanged={() => {
                setRefreshSignal((s) => s + 1);
                refreshCurrentUser();
              }}
            />
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation (compact 56px height) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid"
        style={{ gridTemplateColumns: `repeat(${primaryMobileTabs.length}, minmax(0, 1fr))` }}
      >
        {primaryMobileTabs.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                active
                  ? 'text-blue-700 dark:text-blue-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="truncate max-w-[72px]">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Overflow Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end">
          <div className="w-full bg-white dark:bg-slate-900 rounded-t-3xl p-5 space-y-3 border-t border-slate-200 dark:border-slate-800">
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-2" />
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{user.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {user.role_name} · {user.department}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 dark:text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {overflowMobileTabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.key);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full min-h-[46px] px-4 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-3"
                >
                  <Icon className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="w-full min-h-[46px] px-4 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-3"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
              <span>{darkMode ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full min-h-[46px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-3"
            >
              <LogOut className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span>Cambiar Usuario / Cerrar Sesión</span>
            </button>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeDetected}
        sampleProducts={products}
      />

      {/* Scanned Product Quick Action Sheet */}
      {scannedResult && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-mono text-blue-700 dark:text-blue-400 font-semibold">
                  Código detectado: {scannedResult.barcode}
                </p>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {scannedResult.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  SKU {scannedResult.sku} · {scannedResult.location}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScannedResult(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/70 rounded-xl p-3 border border-slate-200 dark:border-slate-700 text-xs font-mono tabular-nums">
              <div>
                <span className="block font-sans text-slate-500 dark:text-slate-400">Stock</span>
                <strong className="text-base text-slate-900 dark:text-slate-100">
                  {scannedResult.stock_current} {scannedResult.unit}
                </strong>
              </div>
              <div>
                <span className="block font-sans text-slate-500 dark:text-slate-400">Costo</span>
                <strong className="text-base text-slate-900 dark:text-slate-100">
                  {formatCurrency(scannedResult.cost_current)}
                </strong>
              </div>
              <div className="text-right">
                <span className="block font-sans text-slate-500 dark:text-slate-400">Precio</span>
                <strong className="text-base text-blue-800 dark:text-blue-400">
                  {formatCurrency(scannedResult.price_current)}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {user.permissions.register_entry && (
                <button
                  type="button"
                  onClick={() => {
                    const p = scannedResult;
                    setScannedResult(null);
                    jumpToEntry(p);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium"
                >
                  Registrar Ingreso
                </button>
              )}
              {user.permissions.register_exit && scannedResult.stock_current > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const p = scannedResult;
                    setScannedResult(null);
                    jumpToExit(p);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-sm font-medium"
                >
                  Registrar Salida
                </button>
              )}
              {user.permissions.request_order && (
                <button
                  type="button"
                  onClick={() => {
                    const p = scannedResult;
                    setScannedResult(null);
                    jumpToOrder(p);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm font-medium"
                >
                  Solicitar Pedido
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setInventorySearch(scannedResult.barcode);
                  setScannedResult(null);
                  setActiveTab('inventory');
                }}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 text-sm font-medium"
              >
                Ver en Inventario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit Report PDF & Export Modal */}
      <ExitReportModal
        movement={exitReportMovement}
        onClose={() => setExitReportMovement(null)}
      />
    </div>
  );
}

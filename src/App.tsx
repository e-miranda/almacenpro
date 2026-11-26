import React, { useCallback, useEffect, useState } from 'react';
import { onIdTokenChanged, signOut } from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Check,
  ClipboardList,
  Database,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package2,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { auth } from './lib/firebase';
import { apiFetch, getAuthToken, setAuthToken } from './lib/api';
import type { AuthSystemStatus, AuthUser, Movement, Product } from './types';
import { AuthView } from './views/AuthView';
import { DashboardView } from './views/DashboardView';
import { InventoryView } from './views/InventoryView';
import { MovementsView } from './views/MovementsView';
import { OrdersView } from './views/OrdersView';
import { ReportsView } from './views/ReportsView';
import { AdminRolesView } from './views/AdminRolesView';
import { AdminCrudView } from './views/AdminCrudView';
import { QuickStockSearchModal } from './components/QuickStockSearchModal';
import { ExitReportModal } from './components/ExitReportModal';

type TabKey = 'dashboard' | 'inventory' | 'movements' | 'orders' | 'reports' | 'roles' | 'cruds';

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [authStatus, setAuthStatus] = useState<AuthSystemStatus>({
    needsSetup: false,
    hasEnvPasscode: false,
    allowRegistration: true,
    sectors: [],
  });
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Change password modal state
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmNewPwd, setConfirmNewPwd] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

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
  const [stockSearchOpen, setStockSearchOpen] = useState(false);
  const [exitReportData, setExitReportData] = useState<{
    primary: Movement;
    items?: Movement[];
  } | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setStockSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const pickLandingTab = useCallback((u: AuthUser) => {
    setActiveTab((prev) => {
      if (prev !== 'dashboard') return prev;
      if (u.permissions.view_dashboard) return 'dashboard';
      if (u.permissions.view_inventory) return 'inventory';
      return 'orders';
    });
  }, []);

  const refreshAuthStatus = useCallback(async () => {
    try {
      const res = await apiFetch<AuthSystemStatus>('/api/auth/status');
      setAuthStatus(res);
    } catch {
      // keep fallback status
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let statusDone = false;
    let firebaseDone = false;

    const maybeFinishCheck = () => {
      if (mounted && statusDone && firebaseDone) {
        setAuthChecking(false);
      }
    };

    refreshAuthStatus().finally(() => {
      statusDone = true;
      maybeFinishCheck();
    });

    const unsubscribe = onIdTokenChanged(auth, async (fbUser) => {
      if (!mounted) return;
      if (!fbUser) {
        // Preserve active classic username/password session held in memory
        if (!getAuthToken()?.startsWith('ap1.')) {
          setAuthToken(null);
          setUser(null);
        }
        firebaseDone = true;
        maybeFinishCheck();
        return;
      }

      try {
        const token = await fbUser.getIdToken();
        setAuthToken(token);
        const res = await apiFetch<{ user: AuthUser }>('/api/auth/me');
        if (!mounted) return;
        setUser(res.user);
        pickLandingTab(res.user);
      } catch {
        if (!mounted) return;
        if (!getAuthToken()?.startsWith('ap1.')) {
          setAuthToken(null);
          setUser(null);
        }
      } finally {
        firebaseDone = true;
        maybeFinishCheck();
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [pickLandingTab, refreshAuthStatus]);

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

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore signOut errors
    }
    setAuthToken(null);
    setUser(null);
    setMobileMenuOpen(false);
    setActiveTab('dashboard');
    await refreshAuthStatus();
  };

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    if (newPwd.length < 6) {
      setPwdError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPwd !== confirmNewPwd) {
      setPwdError('Las contraseñas nuevas no coinciden.');
      return;
    }

    setPwdSaving(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPwd,
          new_password: newPwd,
        }),
      });
      setPwdSuccess('Contraseña actualizada correctamente.');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmNewPwd('');
      await refreshCurrentUser();
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setPwdSaving(false);
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Cargando AlmacénPro...
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        authStatus={authStatus}
        onRefreshStatus={refreshAuthStatus}
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

        {/* Bottom Controls: Stock Search, Theme Toggle & User / Logout */}
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
            onClick={() => setStockSearchOpen(true)}
            title={sidebarCollapsed ? 'Buscar Stock (Ctrl+K)' : 'Buscar producto y cantidad en existencia (Ctrl+K)'}
            aria-label="Buscar Stock"
            className={`group relative w-full min-h-[40px] rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center transition-colors ${
              sidebarCollapsed ? 'justify-center px-0' : 'px-3 gap-2'
            }`}
          >
            <Search className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            {!sidebarCollapsed && <span>Buscar Stock</span>}
            {sidebarCollapsed && (
              <span
                role="tooltip"
                className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium whitespace-nowrap shadow-lg border border-slate-700 z-50"
              >
                Buscar Stock
              </span>
            )}
          </button>

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
            {!sidebarCollapsed && <span>{darkMode ? 'Modo Claro' : 'Modo Oscuro'}</span>}
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
            onClick={() => {
              setPwdError('');
              setPwdSuccess('');
              setCurrentPwd('');
              setNewPwd('');
              setConfirmNewPwd('');
              setPwdModalOpen(true);
            }}
            title={sidebarCollapsed ? 'Cambiar contraseña' : undefined}
            aria-label="Cambiar contraseña"
            className={`group relative w-full min-h-[40px] rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center transition-colors ${
              sidebarCollapsed ? 'justify-center px-0' : 'px-3 gap-2'
            }`}
          >
            <KeyRound className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
            {!sidebarCollapsed && <span>Cambiar Contraseña</span>}
            {sidebarCollapsed && (
              <span
                role="tooltip"
                className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium whitespace-nowrap shadow-lg border border-slate-700 z-50"
              >
                Cambiar Contraseña
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
        {/* Compact Top Header */}
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

          <div className="flex items-center gap-2 shrink-0 lg:hidden">
            <button
              type="button"
              onClick={handleLogout}
              className="hidden sm:inline-flex min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Salir
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              aria-label="Más opciones"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Viewport Content */}
        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && user.permissions.view_dashboard && (
            <DashboardView
              user={user}
              onQuickEntry={jumpToEntry}
              onQuickOrder={jumpToOrder}
              onOpenExitPdf={(m) => setExitReportData({ primary: m })}
              onNavigate={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'inventory' && user.permissions.view_inventory && (
            <InventoryView
              user={user}
              externalSearch={inventorySearch}
              onExternalSearchChange={setInventorySearch}
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
              onOpenStockSearch={() => setStockSearchOpen(true)}
              onOpenExitPdf={(m, items) => setExitReportData({ primary: m, items })}
              onStockChanged={() => setRefreshSignal((s) => s + 1)}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              user={user}
              products={products}
              preselectedProduct={preselectedOrderProd}
              onClearPreselected={() => setPreselectedOrderProd(null)}
              onDispatchedExit={(m, items) => setExitReportData({ primary: m, items })}
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

      {/* Mobile Fixed Bottom Navigation */}
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
              onClick={() => {
                setMobileMenuOpen(false);
                setStockSearchOpen(true);
              }}
              className="w-full min-h-[46px] px-4 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-3"
            >
              <Search className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Buscar Stock</span>
            </button>
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
              onClick={() => {
                setMobileMenuOpen(false);
                setPwdError('');
                setPwdSuccess('');
                setCurrentPwd('');
                setNewPwd('');
                setConfirmNewPwd('');
                setPwdModalOpen(true);
              }}
              className="w-full min-h-[46px] px-4 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-3"
            >
              <KeyRound className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span>Cambiar Contraseña</span>
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

      {/* Real-Time Product & Stock Search Modal */}
      <QuickStockSearchModal
        open={stockSearchOpen}
        user={user}
        products={products}
        onClose={() => setStockSearchOpen(false)}
        onQuickEntry={jumpToEntry}
        onQuickExit={jumpToExit}
        onQuickOrder={jumpToOrder}
        onViewInInventory={(q) => {
          setInventorySearch(q);
          setActiveTab('inventory');
        }}
      />

      {/* Exit Report PDF & Export Modal */}
      <ExitReportModal
        movement={exitReportData?.primary ?? null}
        movements={exitReportData?.items}
        onClose={() => setExitReportData(null)}
      />

      {/* Change Password Modal */}
      {pwdModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {user.has_password ? 'Cambiar Contraseña' : 'Configurar Contraseña Local'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPwdModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangeOwnPassword} className="space-y-3">
              {user.has_password && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Contraseña actual *
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nueva contraseña (mín. 6 caracteres) *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Confirmar nueva contraseña *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmNewPwd}
                  onChange={(e) => setConfirmNewPwd(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              {pwdError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-800 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{pwdError}</span>
                </div>
              )}

              {pwdSuccess && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{pwdSuccess}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPwdModalOpen(false)}
                  className="flex-1 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={pwdSaving}
                  className="flex-1 min-h-[44px] rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold"
                >
                  {pwdSaving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

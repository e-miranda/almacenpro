import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import {
  AlertCircle,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Lock,
  LogIn,
  Moon,
  Package2,
  ShieldCheck,
  Sun,
  User,
  UserPlus,
} from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch, setAuthToken } from '../lib/api';
import type { AuthSystemStatus, AuthUser } from '../types';

const REMEMBERED_USER_KEY = 'almacenpro-remembered-user';

interface AuthViewProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  authStatus: AuthSystemStatus;
  onRefreshStatus: () => Promise<void>;
  onAuthenticated: (user: AuthUser) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  darkMode,
  onToggleDarkMode,
  authStatus,
  onRefreshStatus,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [skipSetup, setSkipSetup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  // Login form state
  const [identifier, setIdentifier] = useState<string>(() => {
    try {
      return localStorage.getItem(REMEMBERED_USER_KEY) || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUser, setRememberUser] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem(REMEMBERED_USER_KEY));
    } catch {
      return false;
    }
  });
  const [showForgotHelp, setShowForgotHelp] = useState(false);

  // First-run admin setup form state
  const [setupName, setSetupName] = useState('Administrador Principal');
  const [setupUsername, setSetupUsername] = useState('admin');
  const [setupEmail, setSetupEmail] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [createTeamDemo, setCreateTeamDemo] = useState(false);

  // Self-registration form state
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regSectorId, setRegSectorId] = useState<number>(
    authStatus.sectors[0]?.id ?? 0
  );
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  const persistRememberedHint = (userHint: string) => {
    try {
      if (rememberUser && userHint.trim()) {
        localStorage.setItem(REMEMBERED_USER_KEY, userHint.trim());
      } else {
        localStorage.removeItem(REMEMBERED_USER_KEY);
      }
    } catch {
      // ignore storage errors
    }
  };

  const handleClassicLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
        }),
      });
      persistRememberedHint(identifier);
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setAuthToken(null);
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  const handleInitialSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (setupPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (setupPassword !== setupConfirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({
          name: setupName.trim(),
          username: setupUsername.trim(),
          email: setupEmail.trim(),
          password: setupPassword,
          createTeamDemo,
        }),
      });
      setAuthToken(res.token);
      await onRefreshStatus();
      onAuthenticated(res.user);
    } catch (err) {
      setAuthToken(null);
      setError(err instanceof Error ? err.message : 'No se pudo completar la configuración inicial.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (regPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (regPassword !== regConfirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: regName.trim(),
          username: regUsername.trim(),
          email: regEmail.trim(),
          sector_id: regSectorId > 0 ? regSectorId : null,
          password: regPassword,
        }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setAuthToken(null);
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      setAuthToken(idToken);
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/me');
      onAuthenticated(res.user);
    } catch (err) {
      setAuthToken(null);
      if (err instanceof Error && err.message.includes('popup-closed-by-user')) {
        setError('Se cerró la ventana de inicio de sesión antes de completar el acceso.');
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 relative">
      <button
        type="button"
        onClick={onToggleDarkMode}
        aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        className="absolute top-4 right-4 min-h-[42px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 text-xs font-medium"
      >
        {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        <span>{darkMode ? 'Modo Claro' : 'Modo Oscuro'}</span>
      </button>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex items-center justify-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-slate-900 dark:bg-blue-700 text-white flex items-center justify-center">
            <Package2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              AlmacénPro
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Administración e Inventario en Tiempo Real · Bs.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-7 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5">
          {authStatus.needsSetup && !skipSetup ? (
            <>
              <div className="flex items-start gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Configuración Inicial del Administrador
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Define el usuario y contraseña principal para administrar el almacén.
                  </p>
                </div>
              </div>

              <form onSubmit={handleInitialSetup} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nombre completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={setupName}
                    onChange={(e) => setSetupName(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Usuario *
                    </label>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={setupUsername}
                      onChange={(e) => setSetupUsername(e.target.value.toLowerCase())}
                      placeholder="admin"
                      className="w-full min-h-[44px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Correo electrónico *
                    </label>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={setupEmail}
                      onChange={(e) => setSetupEmail(e.target.value)}
                      placeholder="admin@empresa.com"
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Contraseña (mín. 6 caracteres) *
                  </label>
                  <div className="relative">
                    <input
                      type={showSetupPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={setupPassword}
                      onChange={(e) => setSetupPassword(e.target.value)}
                      className="w-full min-h-[44px] pl-3 pr-11 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSetupPassword((v) => !v)}
                      aria-label={showSetupPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      {showSetupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Confirmar contraseña *
                  </label>
                  <input
                    type={showSetupPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={setupConfirm}
                    onChange={(e) => setSetupConfirm(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createTeamDemo}
                    onChange={(e) => setCreateTeamDemo(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-700"
                  />
                  <span>
                    Crear también usuarios operativos iniciales (<strong>almacenista</strong> y{' '}
                    <strong>operaciones</strong>) con esta misma contraseña
                  </span>
                </label>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3 py-2.5 text-xs text-red-800 dark:text-red-300">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{loading ? 'Configurando...' : 'Crear Administrador e Ingresar'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setSkipSetup(true);
                  }}
                  className="w-full min-h-[36px] text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline text-center"
                >
                  ¿Ya tienes una cuenta o código de acceso? Ir a Iniciar Sesión
                </button>
              </form>
            </>
          ) : (
            <>
              {/* Classic Mode Tabs: Iniciar Sesión | Crear Cuenta */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                  className={`min-h-[42px] rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    mode === 'login'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Iniciar Sesión</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError('');
                  }}
                  className={`min-h-[42px] rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    mode === 'register'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Crear Cuenta</span>
                </button>
              </div>

              {mode === 'login' ? (
                <form onSubmit={handleClassicLogin} className="space-y-4">
                  <div>
                    <label
                      htmlFor="login-identifier"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Usuario o Correo electrónico
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-identifier"
                        type="text"
                        required
                        autoComplete="username"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="usuario o correo@empresa.com"
                        className="w-full min-h-[44px] pl-10 pr-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Contraseña
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full min-h-[44px] pl-10 pr-11 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Classic login options: Recordar usuario & ¿Olvidaste tu contraseña? */}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300 cursor-pointer min-h-[36px]">
                      <input
                        type="checkbox"
                        checked={rememberUser}
                        onChange={(e) => setRememberUser(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-700"
                      />
                      <span>Recordar usuario</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotHelp((v) => !v)}
                      className="min-h-[36px] text-blue-700 dark:text-blue-400 hover:underline font-medium flex items-center gap-1"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>¿Olvidaste tu contraseña?</span>
                    </button>
                  </div>

                  {showForgotHelp && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-1">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">
                        Recuperación de acceso
                      </p>
                      <p>
                        • Solicita al <strong>Administrador</strong> restablecer tu contraseña desde{' '}
                        <em>Usuarios y Roles</em> o <em>Tablas CRUD → Usuarios</em>.
                      </p>
                      {authStatus.hasEnvPasscode && (
                        <p>
                          • Si eres Administrador, también puedes ingresar con el usuario{' '}
                          <code className="font-mono">admin</code> y el código de acceso configurado.
                        </p>
                      )}
                    </div>
                  )}

                  {error && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3 py-2.5 text-xs text-red-800 dark:text-red-300">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || googleLoading}
                    className="w-full min-h-[48px] px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{loading ? 'Verificando acceso...' : 'Ingresar al Sistema'}</span>
                  </button>

                  {authStatus.needsSetup && (
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setSkipSetup(false);
                      }}
                      className="w-full min-h-[36px] text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline text-center"
                    >
                      Volver a Configuración Inicial del Administrador
                    </button>
                  )}
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Nombre completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Ej. María Fernández"
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Usuario *
                      </label>
                      <input
                        type="text"
                        required
                        autoComplete="username"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value.toLowerCase())}
                        placeholder="mfernandez"
                        className="w-full min-h-[44px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Sector / Área
                      </label>
                      <select
                        value={regSectorId}
                        onChange={(e) => setRegSectorId(Number(e.target.value))}
                        className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        {authStatus.sectors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                        <option value={0}>Operaciones</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Correo electrónico *
                    </label>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="nombre@empresa.com"
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Contraseña *
                      </label>
                      <div className="relative">
                        <input
                          type={showRegPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          className="w-full min-h-[44px] pl-3 pr-10 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword((v) => !v)}
                          aria-label={showRegPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[36px] flex items-center justify-center text-slate-500"
                        >
                          {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Confirmar *
                      </label>
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={regConfirm}
                        onChange={(e) => setRegConfirm(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3 py-2.5 text-xs text-red-800 dark:text-red-300">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || googleLoading}
                    className="w-full min-h-[48px] px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{loading ? 'Creando cuenta...' : 'Registrarme e Ingresar'}</span>
                  </button>
                </form>
              )}
            </>
          )}

          {/* Classic alternative separator + Google Sign-In */}
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-200 dark:border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white dark:bg-slate-900 px-3 text-slate-400 dark:text-slate-500">
                o continuar con
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={loading || googleLoading}
            onClick={handleGoogleLogin}
            className="w-full min-h-[46px] px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 text-slate-800 dark:text-slate-100 text-sm font-medium flex items-center justify-center gap-2.5 transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1H12v3.8h5.35c-.25 1.45-1.55 4.25-5.35 4.25-3.22 0-5.85-2.67-5.85-5.95s2.63-5.95 5.85-5.95c1.83 0 3.06.78 3.76 1.45l2.57-2.48C16.73 4.72 14.58 3.8 12 3.8 7.03 3.8 3 7.83 3 12.8s4.03 9 9 9c5.19 0 8.63-3.65 8.63-8.79 0-.59-.06-1.04-.15-1.49Z"
              />
            </svg>
            <span>{googleLoading ? 'Conectando con Google...' : 'Continuar con Google'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

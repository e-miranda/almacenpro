import React, { useCallback, useEffect, useState } from 'react';
import { Check, Shield, UserPlus, Users, AlertCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { PermissionCatalogItem, RoleConfig, Sector, SystemUser } from '../types';

interface AdminRolesViewProps {
  onPermissionsChanged: () => void;
}

export const AdminRolesView: React.FC<AdminRolesViewProps> = ({ onPermissionsChanged }) => {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRoleId, setSavingRoleId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRoleId, setNewRoleId] = useState<number>(2);
  const [newSectorId, setNewSectorId] = useState<number>(0);
  const [newDepartment, setNewDepartment] = useState('Operaciones');
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, rRes, sRes] = await Promise.all([
        apiFetch<{ users: SystemUser[] }>('/api/users'),
        apiFetch<{ roles: RoleConfig[]; catalog: PermissionCatalogItem[] }>('/api/roles'),
        apiFetch<{ sectors: Sector[] }>('/api/sectors'),
      ]);
      setUsers(uRes.users);
      setRoles(rRes.roles);
      setCatalog(rRes.catalog);
      setSectors(sRes.sectors);
      if (rRes.roles.length > 0) {
        const alm = rRes.roles.find((r) => r.slug === 'almacenista');
        if (alm) setNewRoleId(alm.id);
      }
      if (sRes.sectors.length > 0) {
        setNewSectorId(sRes.sectors[0].id);
        setNewDepartment(sRes.sectors[0].name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar roles y usuarios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const togglePermission = async (role: RoleConfig, permKey: string) => {
    if (role.slug === 'admin' && permKey === 'manage_users') return;
    const updatedPerms = {
      ...role.permissions,
      [permKey]: !role.permissions[permKey],
    };
    setRoles((prev) =>
      prev.map((r) => (r.id === role.id ? { ...r, permissions: updatedPerms } : r))
    );
    setSavingRoleId(role.id);
    setFeedback('');
    setError('');
    try {
      await apiFetch(`/api/roles/${role.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: updatedPerms }),
      });
      setFeedback(`Permisos actualizados para el rol ${role.name}.`);
      onPermissionsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el permiso.');
      loadData();
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');
    setCreating(true);
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          username: newUsername,
          email: newEmail,
          password: newPassword,
          role_id: newRoleId,
          sector_id: newSectorId > 0 ? newSectorId : null,
          department: newDepartment,
        }),
      });
      setNewName('');
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setFeedback('Usuario registrado correctamente.');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario.');
    } finally {
      setCreating(false);
    }
  };

  const toggleUserActive = async (u: SystemUser) => {
    setError('');
    setFeedback('');
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: u.active === 1 ? 0 : 1 }),
      });
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
    }
  };

  const changeUserRole = async (u: SystemUser, roleId: number) => {
    setError('');
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ role_id: roleId }),
      });
      setFeedback(`Rol actualizado para ${u.name}.`);
      loadData();
      onPermissionsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el rol.');
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Cargando configuración de usuarios y permisos...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
          Administración de Usuarios y Roles Configurables
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configura los privilegios de Administrador, Almacenista y Usuario y sus credenciales de acceso
        </p>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-xs font-medium text-emerald-900 dark:text-emerald-200">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{feedback}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-xs font-medium text-red-800 dark:text-red-300">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Matriz de Permisos por Rol
            </h3>
          </div>
          {savingRoleId && (
            <span className="text-xs text-slate-500 dark:text-slate-400">Guardando...</span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-600 dark:text-slate-300">
                <th className="py-3.5 px-4">Permiso Operativo</th>
                {roles.map((r) => (
                  <th key={r.id} className="py-3.5 px-4 text-center min-w-[140px]">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{r.name}</p>
                    <p className="text-[11px] font-normal text-slate-500 dark:text-slate-400">{r.slug}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {catalog.map((perm) => (
                <tr key={perm.key} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{perm.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{perm.group}</p>
                  </td>
                  {roles.map((role) => {
                    const checked = Boolean(role.permissions[perm.key]);
                    const locked = role.slug === 'admin' && perm.key === 'manage_users';
                    return (
                      <td key={role.id} className="py-3 px-4 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={checked}
                          disabled={locked}
                          onClick={() => togglePermission(role, perm.key)}
                          className={`inline-flex items-center justify-center min-h-[36px] min-w-[68px] px-3 rounded-md text-xs font-semibold border transition-colors ${
                            checked
                              ? 'bg-blue-700 border-blue-700 text-white'
                              : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          } ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {checked ? 'Activo' : 'Restringido'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <form
          onSubmit={handleCreateUser}
          className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-3.5"
        >
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <UserPlus className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Registrar Nuevo Usuario
            </h3>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Crea cuentas con usuario y contraseña o pre-autoriza correos de Google con su rol y sector.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nombre completo *
            </label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Usuario
              </label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
                placeholder="jperez"
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Contraseña (mín. 6)
              </label>
              <input
                type="password"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={newUsername ? 'Requerida para usuario' : 'Opcional si usa Google'}
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Correo electrónico *
            </label>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="colaborador@empresa.com"
              className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Rol asignado *
              </label>
              <select
                value={newRoleId}
                onChange={(e) => setNewRoleId(Number(e.target.value))}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Sector
              </label>
              <select
                value={newSectorId}
                onChange={(e) => {
                  const sid = Number(e.target.value);
                  setNewSectorId(sid);
                  const sec = sectors.find((s) => s.id === sid);
                  if (sec) setNewDepartment(sec.name);
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value={0}>Otro</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="w-full min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 hover:bg-slate-800 dark:hover:bg-blue-800 text-white text-sm font-semibold"
          >
            {creating ? 'Registrando...' : 'Autorizar Usuario'}
          </button>
        </form>

        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Usuarios Registrados
            </h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map((u) => (
              <div key={u.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {u.name}
                    {u.username && (
                      <span className="ml-2 text-xs font-mono font-normal text-blue-700 dark:text-blue-400">
                        @{u.username}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {u.email} · {u.department}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={u.role_id}
                    onChange={(e) => changeUserRole(u, Number(e.target.value))}
                    className="min-h-[38px] px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => toggleUserActive(u)}
                    className={`min-h-[38px] px-3 py-1 rounded-lg text-xs font-medium border ${
                      u.active === 1
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {u.active === 1 ? 'Activo' : 'Inactivo'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

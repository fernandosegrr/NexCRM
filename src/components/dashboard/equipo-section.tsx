"use client";

import { useCallback, useEffect, useState } from "react";

import { hasPermission } from "@/lib/permissions";
import { EquipoTab, type TeamMember, type BusinessRoleWithCount } from "@/components/team/equipo-tab";

type TeamData = {
  members: TeamMember[];
  roles: BusinessRoleWithCount[];
  callerPermisos: string[] | null;
  currentUserId: string;
};

export function EquipoSection({ businessId }: { businessId: string }) {
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/team");
      if (res.ok) {
        const json = (await res.json()) as TeamData;
        setData(json);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No se pudo cargar tu equipo. Intenta recargar la página.
      </p>
    );
  }

  const canManageRoles = hasPermission({ permisos: data.callerPermisos }, "gestionar_roles");
  const canManageUsers = hasPermission({ permisos: data.callerPermisos }, "gestionar_usuarios");

  return (
    <EquipoTab
      businessId={businessId}
      initialMembers={data.members}
      initialRoles={data.roles}
      currentUserId={data.currentUserId}
      canManageRoles={canManageRoles}
      canManageUsers={canManageUsers}
      onDataChanged={load}
    />
  );
}

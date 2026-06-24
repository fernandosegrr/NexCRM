import type { Metadata } from "next";

import { getBusinessesForSelect, getUsersList } from "@/lib/data";
import { UsersManager } from "@/components/admin/users/users-manager";

export const metadata: Metadata = { title: "Usuarios" };
export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const [users, businesses] = await Promise.all([
    getUsersList(),
    getBusinessesForSelect(),
  ]);

  return <UsersManager users={users} businesses={businesses} />;
}

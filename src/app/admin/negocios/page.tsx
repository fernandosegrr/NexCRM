import type { Metadata } from "next";
import { Store } from "lucide-react";

import { getBusinessesWithStats } from "@/lib/data";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { BusinessCard } from "@/components/admin/business/business-card";
import { NewBusinessDrawer } from "@/components/admin/business/new-business-drawer";

export const metadata: Metadata = { title: "Negocios" };
export const dynamic = "force-dynamic";

export default async function NegociosPage() {
  const businesses = await getBusinessesWithStats();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Negocios"
        description="Gestiona los negocios conectados y sus canales."
      >
        <NewBusinessDrawer />
      </PageHeader>

      {businesses.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Aún no hay negocios"
          description="Crea tu primer negocio para empezar a registrar conversaciones desde n8n."
          action={<NewBusinessDrawer />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {businesses.map((b) => (
            <BusinessCard key={b.id} business={b} />
          ))}
        </div>
      )}
    </div>
  );
}

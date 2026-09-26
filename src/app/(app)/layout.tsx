import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegistrar } from "@/components/service-worker";
import { getSidebarData } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const sidebar = await getSidebarData(user.id);
  return (
    <AppShell sidebar={sidebar} user={{ name: user.name, email: user.email, role: user.role }}>
      <ServiceWorkerRegistrar />
      {children}
    </AppShell>
  );
}

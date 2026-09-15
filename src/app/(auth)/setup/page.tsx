import { redirect } from "next/navigation";
import { isSetupRequired } from "@/lib/env";
import { SetupWizard } from "./setup-wizard";

export const metadata = { title: "Configuração inicial" };
export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (!isSetupRequired()) redirect("/");
  return <SetupWizard />;
}

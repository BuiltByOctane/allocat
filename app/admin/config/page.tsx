import { requireAdmin } from "@/lib/admin/guard";
import { getAppConfig } from "@/lib/admin/queries";
import { parseFlags } from "@/lib/config/flags";
import { ConfigForm } from "@/components/admin/ConfigForm";

export default async function AdminConfigPage() {
  await requireAdmin();
  const cfg = await getAppConfig();

  return (
    <ConfigForm
      initial={{
        minAndroidVersionCode: cfg.min_android_version_code,
        updateMessage: cfg.update_message,
        flags: parseFlags(cfg.flags),
      }}
    />
  );
}

import { Suspense } from "react";
import { JoinGroup } from "@/components/patron/JoinGroup";

// Group invite link: https://<domain>/g/<CODE>
export default function GroupInvitePage({ params }: PageProps<"/g/[code]">) {
  return (
    <Suspense fallback={<div className="brand-canvas min-h-dvh" />}>
      <Invite params={params} />
    </Suspense>
  );
}

async function Invite({ params }: Pick<PageProps<"/g/[code]">, "params">) {
  const { code } = await params;
  return <JoinGroup code={code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)} />;
}

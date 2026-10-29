import { Suspense } from "react";
import { RoomScreen } from "@/components/play/RoomScreen";

// Shareable room link: https://<domain>/play/r/<CODE>
export default function RoomPage({ params }: PageProps<"/play/r/[code]">) {
  return (
    <Suspense fallback={<div className="brand-canvas min-h-dvh" />}>
      <RoomLoader params={params} />
    </Suspense>
  );
}

async function RoomLoader({ params }: Pick<PageProps<"/play/r/[code]">, "params">) {
  const { code } = await params;
  return <RoomScreen code={decodeURIComponent(code).toUpperCase()} />;
}

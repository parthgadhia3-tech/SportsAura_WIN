import type { Metadata } from "next";
import { CreateRoom } from "@/components/play/CreateRoom";

export const metadata: Metadata = { title: "Create a room" };

export default function NewRoomPage() {
  return <CreateRoom />;
}

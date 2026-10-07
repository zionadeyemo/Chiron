import { SessionView } from "@/components/session/SessionView";

export default async function SessionPage({ params }: PageProps<"/session/[id]">) {
  const { id } = await params;
  return <SessionView id={id} />;
}

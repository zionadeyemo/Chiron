import { SessionSummary } from "@/components/research/SessionSummary";

export default async function SummaryPage({ params }: PageProps<"/session/[id]/summary">) {
  const { id } = await params;
  return <SessionSummary id={id} />;
}

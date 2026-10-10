import { Workspace } from "@/components/workspace/Workspace";

export default async function CoursePage({ params }: PageProps<"/course/[id]">) {
  const { id } = await params;
  return <Workspace courseId={id} />;
}

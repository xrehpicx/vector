import ProjectViewClient from "./project-view-client";

interface ProjectViewPageProps {
  params: Promise<{ orgId: string; projectKey: string }>;
}

export default async function ProjectViewPage({
  params,
}: ProjectViewPageProps) {
  const resolvedParams = await params;

  return <ProjectViewClient params={resolvedParams} />;
}

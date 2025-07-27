import ProjectViewClient from "./project-view-client";

interface ProjectViewPageProps {
  params: Promise<{ orgSlug: string; projectKey: string }>;
}

export default async function ProjectViewPage({
  params,
}: ProjectViewPageProps) {
  const p = await params;
  return (
    <ProjectViewClient
      params={{ orgSlug: p.orgSlug, projectKey: p.projectKey }}
    />
  );
}

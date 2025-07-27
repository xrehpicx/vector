import { ProjectsPageContent } from "@/components/projects/projects-page-content";

interface ProjectsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function ProjectsPage({ params }: ProjectsPageProps) {
  const { orgSlug } = await params;

  return <ProjectsPageContent orgSlug={orgSlug} />;
}

import { redirect } from "next/navigation";

interface OrgRootPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function OrgRootPage({ params }: OrgRootPageProps) {
  redirect(`/${(await params).orgSlug}/issues`);
}

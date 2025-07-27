"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AuthRootPage() {
  const router = useRouter();

  useEffect(() => {
    router.push("/auth/login");
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-lg font-medium">Redirecting...</div>
    </div>
  );
}

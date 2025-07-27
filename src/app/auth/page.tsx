"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

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

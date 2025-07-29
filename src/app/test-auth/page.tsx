"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { extractAuthErrorMessage } from "@/lib/auth-error-handler";

export default function TestAuthPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="mb-6 text-2xl font-bold">Convex Auth Test</h1>

      <AuthLoading>
        <div>Loading authentication state...</div>
      </AuthLoading>

      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>

      <Authenticated>
        <UserProfile />
      </Authenticated>
    </div>
  );
}

function SignInForm() {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      await signIn("password", formData);
    } catch (error) {
      console.error("Sign in error:", error);
      setError(extractAuthErrorMessage(error));
    }
  };

  return (
    <div className="max-w-md">
      <h2 className="mb-4 text-xl font-semibold">Sign In</h2>
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      <form onSubmit={handleSignIn} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Name (for new accounts)
          </label>
          <input
            id="name"
            name="name"
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <button
          type="submit"
          className="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
        >
          Sign In / Sign Up
        </button>
      </form>
    </div>
  );
}

function UserProfile() {
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.currentUser);

  if (!user) {
    return <div>Loading user data...</div>;
  }

  return (
    <div className="max-w-md">
      <h2 className="mb-4 text-xl font-semibold">Welcome!</h2>
      <div className="space-y-2">
        <p>
          <strong>Name:</strong> {user.name}
        </p>
        <p>
          <strong>Email:</strong> {user.email}
        </p>
        <p>
          <strong>Username:</strong> {user.username || "Not set"}
        </p>
        <p>
          <strong>Email Verified:</strong>{" "}
          {user.emailVerificationTime ? "Yes" : "No"}
        </p>
      </div>

      <button
        onClick={() => signOut()}
        className="mt-4 inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none"
      >
        Sign Out
      </button>
    </div>
  );
}

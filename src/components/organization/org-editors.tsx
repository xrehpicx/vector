"use client";

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit, Check, X, Loader2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// Get the current origin from the browser
const getUrlOrigin = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "localhost:3000"; // fallback for SSR
};

interface EditorProps {
  orgSlug: string;
  initialValue: string;
}

// Edit organization NAME
export function OrgNameEditor({ orgSlug, initialValue }: EditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const mutation = trpc.organization.update.useMutation({
    onSuccess: () => {
      setEditing(false);
      setError(null);
      router.refresh();
    },
    onError: (error) => {
      setError(error.message || "Failed to update organization name");
    },
  });

  // Reset value when editing starts
  useEffect(() => {
    if (editing) {
      setValue(initialValue);
      setError(null);
      // Focus input after render
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing, initialValue]);

  const handleSave = () => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setError("Organization name cannot be empty");
      return;
    }
    if (trimmedValue === initialValue) {
      setEditing(false);
      return;
    }
    mutation.mutate({ orgSlug, data: { name: trimmedValue } });
  };

  const handleCancel = () => {
    setValue(initialValue);
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div
        className="group hover:bg-muted/50 flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 transition-colors"
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        <span className="truncate text-sm" title={initialValue}>
          {initialValue}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          className={cn(
            "h-9",
            error && "border-destructive focus-visible:ring-destructive",
          )}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            } else if (e.key === "Escape") {
              e.preventDefault();
              handleCancel();
            }
          }}
          disabled={mutation.isPending}
          placeholder="Enter organization name"
        />
        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          disabled={
            !value.trim() || mutation.isPending || value.trim() === initialValue
          }
          className="h-9 shrink-0"
        >
          {mutation.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Check className="size-3" />
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={mutation.isPending}
          className="h-9 shrink-0"
        >
          <X className="size-3" />
        </Button>
      </div>
      {error && (
        <div className="text-destructive flex items-center gap-1 text-xs">
          <AlertCircle className="size-3" />
          {error}
        </div>
      )}
    </div>
  );
}

// Edit organization SLUG
export function OrgSlugEditor({ orgSlug, initialValue }: EditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const mutation = trpc.organization.update.useMutation({
    onSuccess: (data) => {
      setEditing(false);
      setError(null);
      if (data?.slug && data.slug !== orgSlug) {
        // Redirect to new slug path
        router.push(`/${data.slug}/settings`);
      } else {
        router.refresh();
      }
    },
    onError: (error) => {
      setError(error.message || "Failed to update organization slug");
    },
  });

  // Reset value when editing starts
  useEffect(() => {
    if (editing) {
      setValue(initialValue);
      setError(null);
      // Focus input after render
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing, initialValue]);

  const validateSlug = (slug: string): string | null => {
    if (!slug.trim()) return "Slug cannot be empty";
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return "Slug can only contain lowercase letters, numbers, and hyphens";
    }
    if (slug.startsWith("-") || slug.endsWith("-")) {
      return "Slug cannot start or end with a hyphen";
    }
    if (slug.includes("--")) {
      return "Slug cannot contain consecutive hyphens";
    }
    return null;
  };

  const handleSave = () => {
    const trimmedValue = value.trim();
    const validationError = validateSlug(trimmedValue);

    if (validationError) {
      setError(validationError);
      return;
    }

    if (trimmedValue === initialValue) {
      setEditing(false);
      return;
    }

    mutation.mutate({ orgSlug, data: { slug: trimmedValue } });
  };

  const handleCancel = () => {
    setValue(initialValue);
    setError(null);
    setEditing(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value.toLowerCase();
    // Auto-format: remove invalid characters and clean up hyphens
    newValue = newValue.replace(/[^a-z0-9-]/g, "").replace(/--+/g, "-");

    setValue(newValue);
    if (error) setError(null);
  };

  const urlOrigin = getUrlOrigin();

  if (!editing) {
    return (
      <div
        className="group bg-muted/30 hover:bg-muted/50 flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 transition-colors"
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        <span className="truncate font-mono text-sm" title={initialValue}>
          {initialValue}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="bg-background flex items-center rounded-md border">
          <span className="text-muted-foreground px-3 py-2 pr-0 text-sm">
            {urlOrigin}/
          </span>
          <Input
            ref={inputRef}
            value={value}
            onChange={handleInputChange}
            className={cn(
              "h-9 border-0 pl-1 font-mono shadow-none focus-visible:ring-0",
              error && "text-destructive",
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              } else if (e.key === "Escape") {
                e.preventDefault();
                handleCancel();
              }
            }}
            disabled={mutation.isPending}
            placeholder="my-org"
          />
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          disabled={
            !value.trim() || mutation.isPending || value.trim() === initialValue
          }
          className="h-9 shrink-0"
        >
          {mutation.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Check className="size-3" />
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={mutation.isPending}
          className="h-9 shrink-0"
        >
          <X className="size-3" />
        </Button>
      </div>
      {error && (
        <div className="text-destructive flex items-center gap-1 text-xs">
          <AlertCircle className="size-3" />
          {error}
        </div>
      )}
      {!error && value && value !== initialValue && (
        <div className="text-muted-foreground text-xs">
          URL will be: {urlOrigin}/{value}
        </div>
      )}
    </div>
  );
}

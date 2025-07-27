"use client";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type NonOwnerMemberRole = "member" | "admin";

export function InviteDialog({
  orgSlug,
  onClose,
}: {
  orgSlug: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<NonOwnerMemberRole>("member");
  const [isLoading, setIsLoading] = useState(false);

  const inviteMutation = useMutation(api.organizations.invite);

  const handleInvite = async () => {
    if (!email) return;

    setIsLoading(true);
    try {
      await inviteMutation({ orgSlug, email, role });
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Enter the email address of the person you want to invite.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Input
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
          />

          <div className="flex gap-2">
            <Button
              variant={role === "member" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setRole("member")}
            >
              Member
            </Button>
            <Button
              variant={role === "admin" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setRole("admin")}
            >
              Admin
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!email || isLoading}
            onClick={handleInvite}
          >
            {isLoading ? "Sending…" : "Send Invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

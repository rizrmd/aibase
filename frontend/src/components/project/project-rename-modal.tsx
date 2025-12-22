"use client";

import { useState, useEffect } from "react";
import { useProjectStore, type Project } from "@/stores/project-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

interface ProjectRenameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
}

export function ProjectRenameModal({ open, onOpenChange, project }: ProjectRenameModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { renameProject, isLoading } = useProjectStore();

  // Initialize form with project data when modal opens
  useEffect(() => {
    if (open && project) {
      setName(project.name);
      setDescription(project.description || "");
    }
  }, [open, project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!project) return;

    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }

    const success = await renameProject(project.id, name.trim(), description.trim() || undefined);

    if (success) {
      toast.success("Project renamed successfully");
      onOpenChange(false);
    } else {
      toast.error("Failed to rename project");
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Rename Project</DialogTitle>
          <DialogDescription>
            Update the name and description of your project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="rename-project-name" className="text-sm font-medium">
              Project Name *
            </label>
            <input
              id="rename-project-name"
              type="text"
              placeholder="My Project"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isLoading}
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="rename-project-description" className="text-sm font-medium">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="rename-project-description"
              placeholder="A brief description of your project..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              disabled={isLoading}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

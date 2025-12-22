"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStore } from "@/stores/project-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProjectCreateModal } from "@/components/project/project-create-modal";
import { ProjectRenameModal } from "@/components/project/project-rename-modal";
import { Folder, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/stores/project-store";

export function ProjectSelectorPage() {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [projectToRename, setProjectToRename] = useState<Project | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(
    null
  );

  const {
    projects,
    currentProject,
    selectProject,
    deleteProject,
    renameProject,
    isLoading,
    initializeProject,
  } = useProjectStore();

  useEffect(() => {
    initializeProject();
  }, [initializeProject]);

  const handleSelectProject = (projectId: string) => {
    selectProject(projectId);
    navigate(`/projects/${projectId}/chat`);
  };

  const handleRenameProject = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setProjectToRename(project);
    setIsRenameModalOpen(true);
  };

  const handleDeleteProject = async (
    e: React.MouseEvent,
    projectId: string,
    projectName: string
  ) => {
    e.stopPropagation();

    if (
      !confirm(
        `Are you sure you want to delete "${projectName}"? This will permanently delete all conversations and files in this project.`
      )
    ) {
      return;
    }

    setDeletingProjectId(projectId);
    const success = await deleteProject(projectId);
    setDeletingProjectId(null);

    if (success) {
      toast.success("Project deleted successfully");
    }
  };

  const handleCreateProject = () => {
    setIsCreateModalOpen(true);
  };

  const handleProjectCreated = () => {
    // After creating a project, navigate to chat
    if (currentProject) {
      navigate(`/projects/${currentProject.id}/chat`);
    }
  };

  if (isLoading && projects.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-lg font-medium">Loading projects...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center p-4 bg-gradient-to-br from-background to-muted/20">
      <div className="w-full max-w-4xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">
            Select a Project
          </h1>
          <p className="text-muted-foreground text-lg">
            Choose a project to start chatting, or create a new one
          </p>
        </div>

        {/* Projects Grid */}
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] relative group flex flex-col items-stretch justify-center"
                onClick={() => handleSelectProject(project.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Folder className="size-5 text-primary" />
                      <CardTitle className="text-xl">{project.name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => handleRenameProject(e, project)}
                        disabled={deletingProjectId === project.id}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      {projects.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) =>
                            handleDeleteProject(e, project.id, project.name)
                          }
                          disabled={deletingProjectId === project.id}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {project.description?.trim() && (
                    <CardDescription className="line-clamp-2">
                      {project.description}
                    </CardDescription>
                  )}

                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    {new Date(project.created_at).toLocaleDateString()}
                  </div>
                </CardHeader>
              </Card>
            ))}

            {/* Create New Project Card - Only show when there are projects */}
            <Card
              className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] border-dashed border-2 flex items-center justify-center min-h-[200px]"
              onClick={handleCreateProject}
            >
              <CardContent className="flex flex-col items-center gap-2 py-8">
                <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Plus className="size-6 text-primary" />
                </div>
                <div className="text-center">
                  <div className="font-medium">Create New Project</div>
                  <div className="text-sm text-muted-foreground">
                    Start a fresh workspace
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          !isLoading && (
            <div className="text-center py-12 space-y-4">
              <p className="text-muted-foreground">No projects found</p>
              <Button onClick={handleCreateProject}>
                <Plus className="size-4 mr-2" />
                Create Your First Project
              </Button>
            </div>
          )
        )}
      </div>

      {/* Create Project Modal */}
      <ProjectCreateModal
        open={isCreateModalOpen}
        onOpenChange={(open) => {
          setIsCreateModalOpen(open);
          if (!open && currentProject) {
            // If modal was closed and we have a current project (just created), navigate to chat
            handleProjectCreated();
          }
        }}
      />

      {/* Rename Project Modal */}
      <ProjectRenameModal
        open={isRenameModalOpen}
        onOpenChange={setIsRenameModalOpen}
        project={projectToRename}
      />
    </div>
  );
}

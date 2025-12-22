import { create } from "zustand";
import { ProjectManager } from "@/lib/project-manager";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  user_id: number;
  tenant_id: number | null;
  is_shared: boolean;
  is_embeddable: boolean;
  embed_token: string | null;
  created_at: number;
  updated_at: number;
}

interface ProjectStore {
  // State
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setProjects: (projects: Project[]) => void;
  setCurrentProject: (project: Project | null) => void;
  selectProject: (projectId: string) => void;
  addProject: (project: Project) => void;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  removeProject: (projectId: string) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;

  // Async actions
  fetchProjects: () => Promise<void>;
  createProject: (name: string, description?: string, is_shared?: boolean) => Promise<Project | null>;
  renameProject: (projectId: string, name: string, description?: string) => Promise<boolean>;
  deleteProject: (projectId: string) => Promise<boolean>;
  initializeProject: () => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  // Initial state
  projects: [],
  currentProject: null,
  isLoading: false,
  error: null,

  // Synchronous actions
  setProjects: (projects) => set({ projects }),

  setCurrentProject: (project) => {
    set({ currentProject: project });
    if (project) {
      ProjectManager.setCurrentProjectId(project.id);
    } else {
      ProjectManager.clearProjectId();
    }
  },

  selectProject: (projectId) => {
    const state = get();
    const project = state.projects.find((p) => p.id === projectId);
    if (project) {
      state.setCurrentProject(project);
    }
  },

  addProject: (project) => set((state) => ({
    projects: [...state.projects, project]
  })),

  updateProject: (projectId, updates) => set((state) => ({
    projects: state.projects.map((p) =>
      p.id === projectId ? { ...p, ...updates } : p
    )
  })),

  removeProject: (projectId) => set((state) => {
    const newProjects = state.projects.filter((p) => p.id !== projectId);
    const newCurrentProject = state.currentProject?.id === projectId
      ? (newProjects[0] || null)
      : state.currentProject;

    if (newCurrentProject) {
      ProjectManager.setCurrentProjectId(newCurrentProject.id);
    }

    return {
      projects: newProjects,
      currentProject: newCurrentProject
    };
  }),

  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  // Async actions
  fetchProjects: async () => {
    const state = get();
    state.setIsLoading(true);
    state.setError(null);

    try {
      const response = await fetch("/api/projects");
      const data = await response.json();

      if (data.success) {
        state.setProjects(data.data.projects);
      } else {
        state.setError(data.error || "Failed to fetch projects");
      }
    } catch (error) {
      state.setError(error instanceof Error ? error.message : "Failed to fetch projects");
    } finally {
      state.setIsLoading(false);
    }
  },

  createProject: async (name, description, is_shared = false) => {
    const state = get();
    state.setIsLoading(true);
    state.setError(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, is_shared }),
      });

      const data = await response.json();

      if (data.success) {
        const newProject = data.data.project;
        state.addProject(newProject);
        return newProject;
      } else {
        state.setError(data.error || "Failed to create project");
        return null;
      }
    } catch (error) {
      state.setError(error instanceof Error ? error.message : "Failed to create project");
      return null;
    } finally {
      state.setIsLoading(false);
    }
  },

  renameProject: async (projectId, name, description) => {
    const state = get();
    state.setIsLoading(true);
    state.setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });

      const data = await response.json();

      if (data.success) {
        state.updateProject(projectId, {
          name: data.data.project.name,
          description: data.data.project.description,
          updated_at: data.data.project.updated_at,
        });
        return true;
      } else {
        state.setError(data.error || "Failed to rename project");
        return false;
      }
    } catch (error) {
      state.setError(error instanceof Error ? error.message : "Failed to rename project");
      return false;
    } finally {
      state.setIsLoading(false);
    }
  },

  deleteProject: async (projectId) => {
    const state = get();
    state.setIsLoading(true);
    state.setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        state.removeProject(projectId);
        return true;
      } else {
        state.setError(data.error || "Failed to delete project");
        return false;
      }
    } catch (error) {
      state.setError(error instanceof Error ? error.message : "Failed to delete project");
      return false;
    } finally {
      state.setIsLoading(false);
    }
  },

  initializeProject: async () => {
    const state = get();

    // Fetch all projects
    await state.fetchProjects();

    // Get stored project ID from localStorage
    const storedProjectId = ProjectManager.getCurrentProjectId();

    const { projects } = get();

    if (projects.length === 0) {
      state.setError("No projects available. Please contact support.");
      return;
    }

    // Try to find and set the stored project
    if (storedProjectId) {
      const storedProject = projects.find((p) => p.id === storedProjectId);
      if (storedProject) {
        state.setCurrentProject(storedProject);
        return;
      }
    }

    // Fall back to first project
    state.setCurrentProject(projects[0]);
  },
}));

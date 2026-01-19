import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";
import {
  MessageSquare,
  ListTodo,
  ArrowLeft,
  MessagesSquare,
  Brain,
  ScrollText,
  FolderTree,
  Code,
  Puzzle,
} from "lucide-react";

interface ProjectNavigationProps {
  projectId: string;
  conversationsCount: number;
  hasTodos: boolean;
  isTodoPanelVisible: boolean;
  onToggleTodoPanel: () => void;
}

export function ProjectNavigation({
  projectId,
  conversationsCount,
  hasTodos,
  isTodoPanelVisible,
  onToggleTodoPanel,
}: ProjectNavigationProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const chatPath = `/projects/${projectId}/chat`;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      // Cmd/Ctrl + key combinations
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "c":
            e.preventDefault();
            navigate(chatPath);
            break;
          case "h":
            if (conversationsCount > 0) {
              e.preventDefault();
              navigate(`/projects/${projectId}/history`);
            }
            break;
          case "m":
            e.preventDefault();
            navigate(`/projects/${projectId}/memory`);
            break;
          case "k":
            e.preventDefault();
            navigate(`/projects/${projectId}/context`);
            break;
          case "f":
            e.preventDefault();
            navigate(`/projects/${projectId}/files`);
            break;
          case "e":
            e.preventDefault();
            navigate(`/projects/${projectId}/embed`);
            break;
          case "x":
            e.preventDefault();
            navigate(`/projects/${projectId}/extensions`);
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [projectId, conversationsCount, navigate]);

  return (
    <div className="absolute top-0 left-0 m-3 z-10 flex flex-wrap gap-2 max-w-[calc(100%-80px)] sm:max-w-none">
      {/* Back to Projects Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/")}
        title="Back to Projects"
      >
        <ArrowLeft />
      </Button>

      {/* Menubar Navigation */}
      <Menubar>
        {/* Chat Menu */}
        <MenubarMenu>
          <MenubarTrigger>
            <MessageSquare className="h-4 w-4 mr-2" />
            Chat
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => navigate(chatPath)}>
              <MessageSquare className="h-4 w-4 mr-2" />
              New Chat
              <MenubarShortcut>⌘C</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => navigate(`/projects/${projectId}/history`)}>
              <MessagesSquare className="h-4 w-4 mr-2" />
              History
              <MenubarShortcut>⌘H</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        {/* Knowledge Menu */}
        <MenubarMenu>
          <MenubarTrigger>
            <Brain className="h-4 w-4 mr-2" />
            Knowledge
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => navigate(`/projects/${projectId}/memory`)}>
              <Brain className="h-4 w-4 mr-2" />
              Memory
              <MenubarShortcut>⌘M</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => navigate(`/projects/${projectId}/context`)}>
              <ScrollText className="h-4 w-4 mr-2" />
              Context
              <MenubarShortcut>⌘K</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => navigate(`/projects/${projectId}/files`)}>
              <FolderTree className="h-4 w-4 mr-2" />
              Files
              <MenubarShortcut>⌘F</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        {/* Settings Menu */}
        <MenubarMenu>
          <MenubarTrigger>
            <Code className="h-4 w-4 mr-2" />
            Settings
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => navigate(`/projects/${projectId}/embed`)}>
              <Code className="h-4 w-4 mr-2" />
              Embed
              <MenubarShortcut>⌘E</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => navigate(`/projects/${projectId}/extensions`)}>
              <Puzzle className="h-4 w-4 mr-2" />
              Extensions
              <MenubarShortcut>⌘X</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      {/* Tasks Toggle Button */}
      {hasTodos && location.pathname === chatPath && (
        <Button
          variant={isTodoPanelVisible ? "outline" : "ghost"}
          size="sm"
          onClick={onToggleTodoPanel}
          title={isTodoPanelVisible ? "Hide tasks" : "Show tasks"}
        >
          <ListTodo />
          {isTodoPanelVisible && <span className="hidden sm:inline">Tasks</span>}
        </Button>
      )}
    </div>
  );
}

import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { MainChat } from "./main-chat";
import { MemoryEditor } from "./memory-editor";
import { Button } from "./ui/button";
import { MessageSquare, Database, TableProperties, Binary, ListTodo } from "lucide-react";
import { Toaster } from "./ui/sonner";
import { useState } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useShallow } from "zustand/react/shallow";

interface AppRouterProps {
  wsUrl: string;
}

export function AppRouter({ wsUrl }: AppRouterProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isTodoPanelVisible, setIsTodoPanelVisible] = useState(true);

  const { todos } = useChatStore(
    useShallow((state) => ({
      todos: state.todos,
    }))
  );

  return (
    <div className="flex h-screen flex-col">
      {/* Navigation Bar */}
      <div className="absolute top-0 left-0 m-3 z-1 flex gap-2">
        <Button
          variant={location.pathname === "/" ? "default" : "ghost"}
          size="sm"
          onClick={() => navigate("/")}
        >
          <MessageSquare />
          {location.pathname === "/" && <>Chat</>}
        </Button>
        <Button
          variant={location.pathname === "/memory" ? "default" : "ghost"}
          size="sm"
          onClick={() => navigate("/memory")}
        >
          <Binary />
          {location.pathname === "/memory" && <>Memory</>}
        </Button>
        {location.pathname === "/" && todos?.items?.length > 0 && (
          <Button
            variant={isTodoPanelVisible ? "outline" : "ghost"}
            size="sm"
            onClick={() => setIsTodoPanelVisible(!isTodoPanelVisible)}
            title={isTodoPanelVisible ? "Hide tasks" : "Show tasks"}
          >
            <ListTodo />
            {isTodoPanelVisible && <>Tasks</>}
          </Button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<MainChat wsUrl={wsUrl} isTodoPanelVisible={isTodoPanelVisible} />} />
          <Route path="/memory" element={<MemoryEditor />} />
        </Routes>
      </div>

      {/* Toast Notifications */}
      <Toaster />
    </div>
  );
}

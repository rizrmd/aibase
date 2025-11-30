"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TodoItem {
  id: string;
  text: string;
  checked: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TodoList {
  items: TodoItem[];
  updatedAt: string;
}

interface TodoPanelProps {
  todos: TodoList | null;
  isLoading?: boolean;
  isVisible?: boolean;
}

export function TodoPanel({ todos, isLoading = false, isVisible = true }: TodoPanelProps) {
  if (!todos || todos.items.length === 0) {
    return null;
  }

  const total = todos.items.length;
  const completed = todos.items.filter((item) => item.checked).length;
  const pending = total - completed;

  return (
    <div className={`h-full flex transition-all duration-300 ${isVisible ? 'w-80' : 'w-0 opacity-0'}`}>
      {isVisible && (
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-center pr-4">
            <h2 className="text-lg font-semibold">Tasks</h2>
            <div className="flex gap-4 text-sm text-muted-foreground items-center">
              <span>{pending} pending</span>
              <span>{completed} completed</span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full pb-6">
              <ul className="">
                {todos.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 py-2 border-b last:border-0"
                  >
                    {item.checked ? (
                      <CheckCircle2 className="h-5 w-5 text-green-700/80 mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <span
                      className={`text-xs flex-1 flex items-center pr-4 ${
                        item.checked
                          ? "line-through text-green-700/80"
                          : "text-foreground"
                      }`}
                    >
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
}

export function TodoPanel({ todos, isLoading = false }: TodoPanelProps) {
  if (isLoading) {
    return (
      <Card className="w-80 h-full">
        <CardHeader>
          <CardTitle className="text-lg">Tasks</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!todos || todos.items.length === 0) {
    return (
      <Card className="w-80 h-full">
        <CardHeader>
          <CardTitle className="text-lg">Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No tasks yet</p>
        </CardContent>
      </Card>
    );
  }

  const total = todos.items.length;
  const completed = todos.items.filter((item) => item.checked).length;
  const pending = total - completed;

  return (
    <Card className="w-80 h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Tasks</CardTitle>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{pending} pending</span>
          <span>{completed} completed</span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-6 pb-6">
          <ul className="space-y-2">
            {todos.items.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2 py-2 border-b last:border-0"
              >
                {item.checked ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                )}
                <span
                  className={`text-sm flex-1 ${
                    item.checked
                      ? "line-through text-muted-foreground"
                      : "text-foreground"
                  }`}
                >
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

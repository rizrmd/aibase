/**
 * Embed Button Component
 * Button to open the embed dialog
 */

import { Code2 } from "lucide-react";
import { Button } from "./button";
import { useState } from "react";
import { EmbedDialog } from "./embed-dialog";

interface EmbedButtonProps {
  projectId: string;
}

export function EmbedButton({ projectId }: EmbedButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        title="Embed chat"
      >
        <Code2 />
      </Button>
      <EmbedDialog open={open} onOpenChange={setOpen} projectId={projectId} />
    </>
  );
}

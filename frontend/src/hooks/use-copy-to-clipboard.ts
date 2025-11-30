import { useCallback, useRef } from "react"
import { toast } from "sonner"
import { useUtilityStore } from "@/stores/utility-store"

type UseCopyToClipboardProps = {
  text: string
  copyMessage?: string
}

export function useCopyToClipboard({
  text,
  copyMessage = "Copied to clipboard!",
}: UseCopyToClipboardProps) {
  const { isCopied, setIsCopied, resetCopied } = useUtilityStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success(copyMessage)
        setIsCopied(true)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        timeoutRef.current = setTimeout(() => {
          resetCopied()
        }, 2000)
      })
      .catch(() => {
        toast.error("Failed to copy to clipboard.")
      })
  }, [text, copyMessage])

  return { isCopied, handleCopy }
}

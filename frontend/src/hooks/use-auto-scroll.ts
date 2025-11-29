import { useCallback, useEffect, useRef, useState } from "react"

// Auto-scroll activates when user is within 30% from the bottom of the viewport
const ACTIVATION_THRESHOLD_PERCENT = 0.3
// Minimum pixels of scroll-up movement required to disable auto-scroll
const MIN_SCROLL_UP_THRESHOLD = 10

export function useAutoScroll(dependencies: React.DependencyList) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const previousScrollTop = useRef<number | null>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    // Force immediate scroll to bottom
    container.scrollTop = container.scrollHeight
  }, [])

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current

      const distanceFromBottom = Math.abs(
        scrollHeight - scrollTop - clientHeight
      )

      const isScrollingUp = previousScrollTop.current
        ? scrollTop < previousScrollTop.current
        : false

      const scrollUpDistance = previousScrollTop.current
        ? previousScrollTop.current - scrollTop
        : 0

      const isDeliberateScrollUp =
        isScrollingUp && scrollUpDistance > MIN_SCROLL_UP_THRESHOLD

      if (isDeliberateScrollUp) {
        setShouldAutoScroll(false)
      } else {
        // Auto-scroll if within 30% from the bottom of the viewport
        const activationThreshold = clientHeight * ACTIVATION_THRESHOLD_PERCENT
        const isScrolledToBottom = distanceFromBottom < activationThreshold
        setShouldAutoScroll(isScrolledToBottom)
      }

      previousScrollTop.current = scrollTop
    }
  }, [])

  const handleTouchStart = useCallback(() => {
    setShouldAutoScroll(false)
  }, [])

  // Scroll when dependencies change (messages update)
  useEffect(() => {
    if (shouldAutoScroll && containerRef.current) {
      // Use setTimeout to defer scroll until after React has finished rendering
      const timeoutId = setTimeout(() => {
        scrollToBottom()
      }, 0)

      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  return {
    containerRef,
    scrollToBottom,
    handleScroll,
    shouldAutoScroll,
    handleTouchStart,
  }
}

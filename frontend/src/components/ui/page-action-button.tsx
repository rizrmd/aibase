import { Button } from "@/components/ui/button";
import type { ButtonHTMLAttributes, ElementType } from "react";
import { forwardRef, useState } from "react";

export interface PageActionButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick"
> {
  /**
   * The icon component from lucide-react
   */
  icon: ElementType;
  /**
   * The button label text
   */
  label: string;
  /**
   * Click handler
   */
  onClick: () => void | Promise<void>;
  /**
   * Button variant - defaults to "default" for primary actions
   */
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  /**
   * Button size - defaults to "sm" for header actions
   */
  size?: "default" | "sm" | "lg";
  /**
   * Whether the button is in a loading state
   */
  isLoading?: boolean;
  /**
   * Text to show when loading (if different from label)
   */
  loadingText?: string;
  /**
   * Whether to show a confirmation dialog before executing onClick
   */
  confirmMessage?: string;
  /**
   * Whether to use absolute positioning (for floating buttons like chat "+ New")
   */
  position?: "static" | "absolute";
  /**
   * CSS classes for absolute positioning (e.g., "top-4 right-4")
   */
  positionClasses?: string;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Whether the icon should spin (for refresh buttons)
   */
  spinIcon?: boolean;
}

/**
 * Standardized action button component for page-level actions
 *
 * Usage examples:
 * - Primary action: <PageActionButton icon={Plus} label="New" onClick={...} />
 * - Secondary action: <PageActionButton icon={RefreshCw} label="Refresh" variant="outline" onClick={...} />
 * - With confirmation: <PageActionButton icon={Trash2} label="Delete" confirmMessage="Are you sure?" onClick={...} />
 * - Floating button: <PageActionButton icon={Plus} label="New" position="absolute" positionClasses="top-4 right-4" onClick={...} />
 */
export const PageActionButton = forwardRef<
  HTMLButtonElement,
  PageActionButtonProps
>(
  (
    {
      icon: Icon,
      label,
      onClick,
      variant = "default",
      size = "sm",
      isLoading = false,
      loadingText,
      confirmMessage,
      position = "static",
      positionClasses = "",
      className = "",
      spinIcon = false,
      disabled,
      ...props
    },
    ref
  ) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const handleClick = async () => {
      if (confirmMessage) {
        if (!window.confirm(confirmMessage)) {
          return;
        }
      }

      setIsProcessing(true);
      try {
        await onClick();
      } finally {
        setIsProcessing(false);
      }
    };

    const isButtonLoading = isLoading || isProcessing;
    const displayText = isButtonLoading && loadingText ? loadingText : label;

    const buttonClasses = [
      position === "absolute" && "absolute z-10 shadow-md",
      position === "absolute" && positionClasses,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <Button
        ref={ref}
        onClick={handleClick}
        size={size}
        variant={variant}
        className={buttonClasses}
        disabled={disabled || isButtonLoading}
        {...props}
      >
        <Icon
          className={`h-4 w-4 mr-2 ${spinIcon && isButtonLoading ? "animate-spin" : ""}`}
        />
        {displayText}
      </Button>
    );
  }
);

PageActionButton.displayName = "PageActionButton";

/**
 * Container for grouping multiple page action buttons
 *
 * Usage:
 * <PageActionGroup>
 *   <PageActionButton icon={Save} label="Save" onClick={...} />
 *   <PageActionButton icon={Cancel} label="Cancel" variant="outline" onClick={...} />
 * </PageActionGroup>
 *
 * For mobile-fixed positioning (like chat "+ New" button):
 * <PageActionGroup isFixedOnMobile={true}>
 *   <PageActionButton icon={Plus} label="New" onClick={...} />
 * </PageActionGroup>
 */
export const PageActionGroup = ({
  children,
  className = "",
  isFixedOnMobile = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** If true, use fixed positioning on mobile, absolute on desktop */
  isFixedOnMobile?: boolean;
}) => {
  // When isFixedOnMobile is true, use fixed positioning to break out of relative parent
  if (isFixedOnMobile) {
    return (
      <>
        {/* Mobile: Fixed positioned at top-right, with equal top/bottom spacing */}
        <div className={`fixed top-0 right-0 mx-3 my-4 flex gap-2 z-50 md:hidden ${className}`}>
          {children}
        </div>
        {/* Desktop: Absolute positioned (parent-relative) */}
        <div className={`hidden md:flex absolute top-4 right-3 sm:right-4 flex gap-2 z-10 ${className}`}>
          {children}
        </div>
      </>
    );
  }

  // Default behavior: absolute positioned
  return (
    <div className={`absolute md:top-4 top-15 right-3 sm:right-4 flex gap-2 z-10 ${className}`}>
      {children}
    </div>
  );
};

import * as React from "react"
import { cn } from "@/lib/utils"

interface TooltipContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const TooltipContext = React.createContext<TooltipContextValue | undefined>(undefined)

const useTooltipContext = () => {
  const context = React.useContext(TooltipContext)
  if (!context) {
    throw new Error("Tooltip components must be used within TooltipProvider")
  }
  return context
}

interface TooltipProviderProps {
  children: React.ReactNode
  delayDuration?: number
}

const TooltipProvider = ({ children, delayDuration = 300 }: TooltipProviderProps) => {
  return <>{children}</>
}

interface TooltipProps {
  children: React.ReactNode
}

const Tooltip = ({ children }: TooltipProps) => {
  const [open, setOpen] = React.useState(false)
  
  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      {children}
    </TooltipContext.Provider>
  )
}

interface TooltipTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean
}

const TooltipTrigger = React.forwardRef<
  HTMLDivElement,
  TooltipTriggerProps
>(({ className, children, asChild, ...props }, ref) => {
  const { setOpen } = useTooltipContext()
  
  const handleMouseEnter = () => setOpen(true)
  const handleMouseLeave = () => setOpen(false)

  const {
    onMouseEnter: propsOnMouseEnter,
    onMouseLeave: propsOnMouseLeave,
    ...restProps
  } = props
  
  if (asChild && React.isValidElement(children)) {
    // `asChild` can be any element type; keep typing flexible so event handlers compose cleanly.
    const childElement = children as React.ReactElement<any>
    const childProps = childElement.props
    return React.cloneElement(childElement, {
      ...restProps,
      onMouseEnter: (e: React.MouseEvent<any>) => {
        handleMouseEnter()
        propsOnMouseEnter?.(e as any)
        childProps.onMouseEnter?.(e)
      },
      onMouseLeave: (e: React.MouseEvent<any>) => {
        handleMouseLeave()
        propsOnMouseLeave?.(e as any)
        childProps.onMouseLeave?.(e)
      },
    })
  }
  
  return (
    <div
      ref={ref}
      className={className}
      {...restProps}
      onMouseEnter={(e) => {
        handleMouseEnter()
        propsOnMouseEnter?.(e)
      }}
      onMouseLeave={(e) => {
        handleMouseLeave()
        propsOnMouseLeave?.(e)
      }}
    >
      {children}
    </div>
  )
})
TooltipTrigger.displayName = "TooltipTrigger"

const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { open } = useTooltipContext()
  
  if (!open) return null
  
  return (
    <div
      ref={ref}
      className={cn(
        "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95",
        className
      )}
      {...props}
    />
  )
})
TooltipContent.displayName = "TooltipContent"

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }

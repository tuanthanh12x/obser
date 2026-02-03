import * as React from "react"
import { cn } from "@/lib/utils"

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, defaultChecked, onCheckedChange, onChange, ...props }, ref) => {
    const controlled = checked !== undefined

    const [internalChecked, setInternalChecked] = React.useState<boolean>(() => {
      if (controlled) return Boolean(checked)
      return Boolean(defaultChecked)
    })

    const isChecked = controlled ? Boolean(checked) : internalChecked

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e)
      const newChecked = e.target.checked
      if (!controlled) setInternalChecked(newChecked)
      onCheckedChange?.(newChecked)
    }

    return (
      <label className="inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          ref={ref}
          {...(controlled ? { checked: isChecked } : { defaultChecked: Boolean(defaultChecked) })}
          onChange={handleChange}
          className="sr-only"
          {...props}
        />
        <div
          className={cn(
            "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
            isChecked ? "bg-primary" : "bg-input",
            className
          )}
        >
          <div
            className={cn(
              "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
              isChecked ? "translate-x-5" : "translate-x-0"
            )}
          />
        </div>
      </label>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }

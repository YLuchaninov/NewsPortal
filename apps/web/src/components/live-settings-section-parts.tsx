import type { ReactNode } from "react";

interface SettingsCardProps {
  title: string;
  description: ReactNode;
  children: ReactNode;
}

export function SettingsCard({
  title,
  description,
  children,
}: SettingsCardProps) {
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      {children}
    </section>
  );
}

interface ToggleRowProps {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  name?: string;
  className?: string;
}

export function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  name,
  className = "flex items-center justify-between py-3 border-b border-border",
}: ToggleRowProps) {
  return (
    <div className={className}>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <label className="relative inline-flex cursor-pointer items-center">
        {name ? <input type="hidden" name={name} value="false" /> : null}
        <input
          type="checkbox"
          name={name}
          value={name ? "true" : undefined}
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="sr-only peer"
        />
        <div className="peer h-5 w-9 rounded-full bg-input peer-checked:bg-primary after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-4 after:shadow-sm"></div>
      </label>
    </div>
  );
}

interface SubmitButtonProps {
  disabled: boolean;
  pendingLabel: string;
  idleLabel: string;
}

export function SubmitButton({
  disabled,
  pendingLabel,
  idleLabel,
}: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
    >
      {disabled ? pendingLabel : idleLabel}
    </button>
  );
}

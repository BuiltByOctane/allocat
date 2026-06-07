import { MaterialSymbol } from "./MaterialSymbol";
import { Button } from "./Button";

interface Action {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  action?: Action;
  secondaryAction?: Action;
  className?: string;
}

function ActionButton({
  action,
  variant,
}: {
  action: Action;
  variant: "primary" | "ghost";
}) {
  if (action.href) {
    return (
      <Button href={action.href} variant={variant}>
        {action.label}
      </Button>
    );
  }
  return (
    <Button variant={variant} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-20 px-8 bg-muted/40 border border-border rounded-xl ${className}`}
    >
      <MaterialSymbol icon={icon} className="text-[56px] text-muted-foreground/60 mb-6" />
      <h2 className="t-heading text-foreground mb-2">{title}</h2>
      {description && (
        <p className="t-body text-muted-foreground max-w-sm mb-8">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {action && <ActionButton action={action} variant="primary" />}
          {secondaryAction && (
            <ActionButton action={secondaryAction} variant="ghost" />
          )}
        </div>
      )}
    </div>
  );
}

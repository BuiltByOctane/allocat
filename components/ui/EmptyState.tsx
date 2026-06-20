import { MaterialSymbol } from "./MaterialSymbol";
import { Button, type ButtonVariant, type ButtonSize } from "./Button";

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
  size,
  block,
  className,
}: {
  action: Action;
  variant: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}) {
  if (action.href) {
    return (
      <Button href={action.href} variant={variant} size={size} block={block} className={className}>
        {action.label}
      </Button>
    );
  }
  return (
    <Button variant={variant} size={size} block={block} className={className} onClick={action.onClick}>
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
      className={`flex flex-col items-center justify-center text-center py-16 px-8 bg-card rounded-card ${className}`}
    >
      <span className="flex items-center justify-center w-16 h-16 rounded-[20px] bg-tile mb-6">
        <MaterialSymbol icon={icon} className="text-[32px] text-muted-foreground" />
      </span>
      <h2 className="t-heading text-foreground mb-2">{title}</h2>
      {description && (
        <p className="t-body text-muted-foreground max-w-sm mb-8">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-col items-center gap-3 w-full max-w-[260px]">
          {action && (
            <ActionButton action={action} variant="primary" size="lg" block />
          )}
          {secondaryAction && (
            <ActionButton
              action={secondaryAction}
              variant="link"
              size="sm"
              className="text-[13px] font-semibold text-muted-foreground decoration-transparent"
            />
          )}
        </div>
      )}
    </div>
  );
}

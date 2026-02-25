import { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface BentoGridProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  className?: string;
}

interface BentoCardProps extends ComponentPropsWithoutRef<"section"> {
  title?: string;
  description: string;
  className?: string;
  header?: ReactNode;
  children?: ReactNode;
  as?: "section" | "div";
}

export function BentoGrid({ children, className, ...props }: BentoGridProps) {
  return (
    <div
      className={cn(
        "grid w-full auto-rows-[20rem] grid-cols-1 gap-4 md:grid-cols-6",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function BentoCard({
  title,
  description,
  className,
  header,
  children,
  as = "section",
  ...props
}: BentoCardProps) {
  const Component = as;
  const hasTitle = title?.trim().length;
  const hasDescription = description.trim().length > 0;

  return (
    <Component
      className={cn(
        "relative overflow-hidden rounded-3xl border border-[var(--surface-border)] bg-[var(--surface-1)] p-5 shadow-[0_20px_70px_-45px_rgba(30,44,72,0.65)] backdrop-blur-xl",
        "transition-all duration-300 ease-out hover:border-[var(--accent)]",
        className,
      )}
      {...props}
    >
      {header ? <div className="relative mb-4">{header}</div> : null}
      <div className="relative z-10 flex h-full flex-col">
        {hasTitle ? (
          <h3 className="text-xl font-semibold tracking-tight text-[var(--text-main)]">
            {title}
          </h3>
        ) : null}
        {hasDescription ? <p className="mt-2 text-sm text-[var(--text-muted)]">{description}</p> : null}
        <div className={cn(hasDescription || hasTitle ? "mt-4" : "mt-2", "flex-1")}>{children}</div>
      </div>
    </Component>
  );
}

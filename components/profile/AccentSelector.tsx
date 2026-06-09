"use client";

import { Palette } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useAccent } from "@/lib/providers/AccentProvider";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { ACCENTS, accentLabel } from "@/lib/theme/accents";

export default function AccentSelector() {
  const { accent, setAccent, hydrated } = useAccent();
  const haptic = useHaptic();

  return (
    <Card className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
          <Palette size={18} strokeWidth={1.7} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-bold text-foreground leading-none">Accent</p>
          <p className="text-[10.5px] font-medium text-muted-foreground mt-1" suppressHydrationWarning>
            {hydrated ? accentLabel(accent) : "Theme color"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 pl-12">
        {ACCENTS.map((a) => {
          const active = hydrated && accent === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                haptic.selection();
                setAccent(a.id);
              }}
              aria-label={a.label}
              aria-pressed={active}
              className={`size-7 rounded-full transition-transform active:scale-90 ${
                active ? "ring-2 ring-offset-2 ring-offset-card ring-foreground" : ""
              }`}
              style={{ background: a.swatch }}
            />
          );
        })}
      </div>
    </Card>
  );
}

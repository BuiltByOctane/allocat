"use client";

import { Drawer } from "vaul";
import { useEffect, useRef, useState } from "react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import EmojiPickerModal from "@/components/ui/EmojiPickerModal";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { Progress } from "@/components/ui/Progress";
import type { CatKey } from "@/lib/theme/dataViz";

export interface GoalFormData {
  name: string;
  targetAmount: number;
  currentAmount: number;
  notes: string;
  icon: string | null;
  color: string | null;
}

interface GoalData {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  target_amount: number;
  current_amount: number;
  notes?: string | null;
  priority?: number;
}

interface GoalDetailSheetProps {
  mode: "add" | "edit";
  goal?: GoalData;
  open: boolean;
  onClose: () => void;
  onSave: (data: GoalFormData) => void;
  onDelete?: (id: string) => void;
  onIconChange?: (id: string, icon: string) => void;
}

export function GoalDetailSheet({
  mode,
  goal,
  open,
  onClose,
  onSave,
  onDelete,
  onIconChange,
}: GoalDetailSheetProps) {
  const haptic = useHaptic();
  const nameRef = useRef<HTMLInputElement>(null);
  const isEdit = mode === "edit";

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState<CatKey | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isEdit && goal) {
      setName(goal.name);
      setTargetAmount(String(goal.target_amount));
      setCurrentAmount(String(goal.current_amount));
      setNotes(goal.notes ?? "");
      setIcon(goal.icon ?? null);
      setColor((goal.color as CatKey | null) ?? null);
    } else {
      setName("");
      setTargetAmount("");
      setCurrentAmount("");
      setNotes("");
      setIcon(null);
      setColor(null);
    }
    setError("");
    setConfirmDelete(false);
    setIsSaving(false);
    const timer = setTimeout(() => nameRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [open, goal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave() {
    if (!name.trim()) {
      setError("Name is required.");
      haptic.error();
      return;
    }
    const target = parseFloat(targetAmount);
    if (!target || target <= 0) {
      setError("Target amount must be greater than 0.");
      haptic.error();
      return;
    }
    const current = parseFloat(currentAmount) || 0;
    setIsSaving(true);
    setError("");
    try {
      onSave({
        name: name.trim(),
        targetAmount: target,
        currentAmount: current,
        notes: notes.trim(),
        icon,
        color,
      });
      haptic.success();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      haptic.error();
    } finally {
      setIsSaving(false);
    }
  }

  function handleDelete() {
    if (!goal || !onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      haptic.heavy();
      return;
    }
    onDelete(goal.id);
    onClose();
  }

  function handleEmojiSelect(emoji: string) {
    setIcon(emoji);
    setShowEmojiPicker(false);
    if (isEdit && goal && onIconChange) {
      onIconChange(goal.id, emoji);
    }
  }

  const pct = isEdit && goal
    ? Math.min(1, Number(goal.current_amount) / (Number(goal.target_amount) || 1))
    : 0;

  return (
    <>
      <Drawer.Root
        open={open}
        onOpenChange={(o) => { if (!o) onClose(); }}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Drawer.Content
            ref={setContentNode}
            aria-describedby="goal-sheet-desc"
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none sheet-3q"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="mx-auto w-9 h-1 bg-border rounded-full" />
            </div>

            <div className="overflow-y-auto flex-1">
              {/* Header */}
              <div className="px-6 pt-2 pb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowEmojiPicker(true)}
                    className="flex h-[44px] w-[44px] items-center justify-center rounded-[13px] bg-tile text-2xl transition-all"
                    title="Change icon"
                  >
                    {icon || "🎯"}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                      {isEdit ? "Edit Goal" : "New Goal"}
                    </div>
                    <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground truncate">
                      {isEdit && goal ? goal.name : "New Goal"}
                    </Drawer.Title>
                  </div>
                  <button
                    onClick={onClose}
                    className="size-8 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Close"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
                <p id="goal-sheet-desc" className="sr-only">
                  {isEdit ? "Edit goal details" : "Add a new savings goal"}
                </p>
                {isEdit && goal && (
                  <div className="mt-3">
                    <Progress value={pct * 100} className="h-1.5" />
                  </div>
                )}
              </div>

              {/* Form */}
              <div className="px-6 py-2 space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground block">Name</label>
                  <input
                    ref={nameRef}
                    type="text"
                    placeholder="e.g. Emergency Fund"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-card border border-border rounded-[13px] px-3.5 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground block">Color</label>
                  <ColorPicker value={color} onChange={setColor} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground block">Target</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={targetAmount}
                      onChange={(e) => setTargetAmount(e.target.value)}
                      className="w-full bg-card border border-border rounded-[13px] px-3.5 py-3 text-sm font-medium tabular-nums text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground block">Current</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={currentAmount}
                      onChange={(e) => setCurrentAmount(e.target.value)}
                      className="w-full bg-card border border-border rounded-[13px] px-3.5 py-3 text-sm font-medium tabular-nums text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                    />
                  </div>
                </div>
                <p className="text-[11px] font-medium text-muted-foreground -mt-2">
                  Tracked as an asset in Net Worth.
                </p>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground block">Notes <span className="normal-case">(optional)</span></label>
                  <textarea
                    placeholder="Any notes about this goal…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full bg-card border border-border rounded-[13px] px-3.5 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40 resize-none"
                  />
                </div>

                {error && (
                  <p className="text-[11px] font-medium text-neg">{error}</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-8 pt-3 shrink-0">
              <div className="flex gap-3">
                {isEdit && goal && onDelete ? (
                  <button
                    onClick={handleDelete}
                    className={`flex-1 h-[48px] rounded-pill text-sm font-bold transition-colors ${
                      confirmDelete
                        ? "bg-[var(--neg-dim)] text-neg"
                        : "border border-border bg-card text-neg"
                    }`}
                  >
                    {confirmDelete ? "Confirm Delete" : "Delete"}
                  </button>
                ) : (
                  <button
                    onClick={onClose}
                    className="flex-1 h-[48px] rounded-pill bg-muted text-foreground text-sm font-semibold"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-[2] h-[48px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold disabled:opacity-50 active:scale-[0.98] transition-all"
                >
                  {isSaving ? "Saving…" : isEdit ? "Save Changes" : "Add Goal"}
                </button>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <EmojiPickerModal
        isOpen={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onSelect={handleEmojiSelect}
        container={contentNode}
      />
    </>
  );
}

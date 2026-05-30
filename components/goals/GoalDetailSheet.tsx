"use client";

import { Drawer } from "vaul";
import { useEffect, useRef, useState } from "react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import EmojiPickerModal from "@/components/ui/EmojiPickerModal";

export interface GoalFormData {
  name: string;
  targetAmount: number;
  currentAmount: number;
  notes: string;
  icon: string | null;
}

interface GoalData {
  id: string;
  name: string;
  icon?: string | null;
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
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
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
    } else {
      setName("");
      setTargetAmount("");
      setCurrentAmount("");
      setNotes("");
      setIcon(null);
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
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
          <Drawer.Content
            aria-describedby="goal-sheet-desc"
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-card border-t border-border focus:outline-none max-h-[92dvh]"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-muted rounded-full" />
            </div>

            <div className="overflow-y-auto flex-1">
              {/* Header */}
              <div className="px-5 pt-2 pb-4 border-b border-border shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowEmojiPicker(true)}
                      className="text-2xl transition-all"
                      title="Change icon"
                    >
                      {icon || "🎯"}
                    </button>
                    <div>
                      <Drawer.Title className="text-[10px] font-mono font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        {isEdit ? "Edit Goal" : "New Goal"}
                      </Drawer.Title>
                      {isEdit && goal && (
                        <p className="text-base font-semibold text-foreground mt-0.5 tracking-tight">{goal.name}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="size-8 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
                <p id="goal-sheet-desc" className="sr-only">
                  {isEdit ? "Edit goal details" : "Add a new savings goal"}
                </p>
                {isEdit && goal && (
                  <div className="mt-3 flex gap-[2px]">
                    {Array.from({ length: 20 }).map((_, j) => (
                      <div
                        key={j}
                        className="flex-1"
                        style={{
                          height: 2,
                          background: j / 20 < pct ? "var(--foreground)" : "var(--progress-empty)",
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Form */}
              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">Name</label>
                  <input
                    ref={nameRef}
                    type="text"
                    placeholder="e.g. Emergency Fund"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">Target</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={targetAmount}
                      onChange={(e) => setTargetAmount(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono tabular-nums text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">Current</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={currentAmount}
                      onChange={(e) => setCurrentAmount(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono tabular-nums text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Tracked as an asset in Net Worth.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">Notes <span className="normal-case">(optional)</span></label>
                  <textarea
                    placeholder="Any notes about this goal…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>

                {error && (
                  <p className="text-[11px] text-red-400 font-mono">{error}</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-8 pt-3 border-t border-border shrink-0 space-y-2">
              {isEdit && goal && onDelete && (
                <button
                  onClick={handleDelete}
                  className={`w-full py-2.5 rounded-lg text-xs font-mono uppercase tracking-[0.1em] transition-colors ${
                    confirmDelete
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-muted text-muted-foreground hover:text-red-400"
                  }`}
                >
                  {confirmDelete ? "Confirm Delete" : "Delete Goal"}
                </button>
              )}
              <div className="flex gap-2">
                {!isEdit && (
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 rounded-lg text-sm font-mono uppercase tracking-[0.1em] bg-muted text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-3 rounded-lg text-sm font-mono uppercase tracking-[0.1em] bg-primary text-primary-foreground disabled:opacity-50 transition-all active:scale-95"
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
      />
    </>
  );
}

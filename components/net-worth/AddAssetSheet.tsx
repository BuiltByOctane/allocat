"use client";

import { Drawer } from "vaul";
import { useEffect, useRef, useState } from "react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useAddAsset } from "@/lib/hooks/useNetWorth";
import { useAssetCategories, useAddAssetCategory } from "@/lib/hooks/useAssetCategories";
import EmojiPickerModal from "@/components/ui/EmojiPickerModal";

const DEFAULT_CATEGORY_ICONS = ["💵", "📈", "🏠", "🥇", "🚗", "📦", "💳", "🏦", "💎", "🪙"];

interface AddAssetSheetProps {
  open: boolean;
  defaultCategoryId?: string | null;
  onClose: () => void;
}

export function AddAssetSheet({ open, defaultCategoryId, onClose }: AddAssetSheetProps) {
  const haptic = useHaptic();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(defaultCategoryId ?? null);
  const [icon, setIcon] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [isGoal, setIsGoal] = useState(false);
  const [targetAmount, setTargetAmount] = useState("");

  // New category creation
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("📦");
  const [newCatEmojiOpen, setNewCatEmojiOpen] = useState(false);

  const { data: categories, refetch: refetchCategories } = useAssetCategories();
  const addAssetMutation = useAddAsset();
  const addCategoryMutation = useAddAssetCategory();

  useEffect(() => {
    if (open) {
      setName("");
      setValue("");
      setSelectedCategoryId(defaultCategoryId ?? null);
      setIcon(null);
      setError("");
      setIsSaving(false);
      setShowNewCategory(false);
      setNewCatName("");
      setNewCatIcon("📦");
      setIsGoal(false);
      setTargetAmount("");
      const timer = setTimeout(() => nameRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [open, defaultCategoryId]);

  async function handleCreateCategory() {
    if (!newCatName.trim()) return;
    haptic.light();
    try {
      const result = await addCategoryMutation.mutateAsync({ name: newCatName.trim(), icon: newCatIcon });
      await refetchCategories();
      setSelectedCategoryId(result.id);
      setShowNewCategory(false);
      setNewCatName("");
      setNewCatIcon("📦");
    } catch {
      // silent
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Asset name is required.");
      haptic.error();
      return;
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      setError("Please enter a valid value.");
      haptic.error();
      return;
    }
    if (!selectedCategoryId) {
      setError("Please select a category.");
      haptic.error();
      return;
    }
    let goalTarget: number | null = null;
    if (isGoal) {
      goalTarget = parseFloat(targetAmount);
      if (isNaN(goalTarget) || goalTarget <= 0) {
        setError("Goal target must be greater than 0.");
        haptic.error();
        return;
      }
    }

    setIsSaving(true);
    setError("");
    try {
      await addAssetMutation.mutateAsync({
        name: name.trim(),
        categoryId: selectedCategoryId,
        value: numValue,
        icon,
        isGoal,
        targetAmount: goalTarget,
      });
      haptic.success();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save asset.");
      haptic.error();
    } finally {
      setIsSaving(false);
    }
  }

  const selectedCategory = (categories ?? []).find((c) => c.id === selectedCategoryId);

  return (
    <>
      <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
          <Drawer.Content
            aria-describedby="add-asset-description"
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-card border-t border-border focus:outline-none max-h-[90dvh]"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-muted rounded-full" />
            </div>

            <div className="overflow-y-auto flex-1 px-5 pt-4 pb-8 space-y-5">
              <div>
                <Drawer.Title className="text-base font-bold text-foreground">Add Asset</Drawer.Title>
                <p id="add-asset-description" className="text-sm text-muted-foreground mt-0.5">
                  Track a new asset in your net worth
                </p>
              </div>

              {/* Icon + Name row */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEmojiOpen(true)}
                  className="w-12 h-12 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center shrink-0 transition-colors"
                >
                  {icon ? (
                    <span className="text-2xl">{icon}</span>
                  ) : (
                    <span className="material-symbols-outlined text-muted-foreground text-xl">add_photo_alternate</span>
                  )}
                </button>
                <input
                  ref={nameRef}
                  type="text"
                  placeholder="Asset name (e.g. Groww MF, SBI Savings)"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(""); }}
                  className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground"
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {(categories ?? []).map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => { setSelectedCategoryId(cat.id); setError(""); }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        selectedCategoryId === cat.id
                          ? "bg-foreground text-background border-foreground"
                          : "bg-background text-foreground border-border hover:bg-muted"
                      }`}
                    >
                      <span className="text-base leading-none">{cat.icon}</span>
                      <span>{cat.name}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setShowNewCategory(!showNewCategory)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    New
                  </button>
                </div>

                {showNewCategory && (
                  <div className="flex items-center gap-2 p-3 bg-background rounded-xl border border-border">
                    <button
                      onClick={() => setNewCatEmojiOpen(true)}
                      className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-lg shrink-0"
                    >
                      {newCatIcon}
                    </button>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Category name"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCreateCategory(); }}
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                    <button
                      onClick={handleCreateCategory}
                      disabled={!newCatName.trim() || addCategoryMutation.isPending}
                      className="text-xs font-bold text-foreground disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>

              {/* Value */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Current Value
                </label>
                <div className="relative">
                  <span className="currency-symbol absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                    ₹
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder="0"
                    value={value}
                    onChange={(e) => { setValue(e.target.value); setError(""); }}
                    className="w-full bg-background border border-border rounded-xl pl-8 pr-4 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground"
                  />
                </div>
              </div>

              {/* Goal toggle */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => { haptic.selection(); setIsGoal((v) => !v); }}
                  className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
                    isGoal ? "border-foreground bg-muted/40" : "border-border bg-background"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-base leading-none">🎯</span>
                    <span className="font-medium text-foreground">Make this a goal</span>
                  </span>
                  <span
                    className={`w-9 h-5 rounded-full relative transition-colors ${
                      isGoal ? "bg-foreground" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background transition-transform ${
                        isGoal ? "translate-x-4" : ""
                      }`}
                    />
                  </span>
                </button>
                {isGoal && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Target Amount
                    </label>
                    <div className="relative">
                      <span className="currency-symbol absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                        ₹
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        placeholder="0"
                        value={targetAmount}
                        onChange={(e) => { setTargetAmount(e.target.value); setError(""); }}
                        className="w-full bg-background border border-border rounded-xl pl-8 pr-4 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground"
                      />
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <p className="text-xs text-red-500 font-medium">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-3.5 bg-foreground text-background rounded-xl font-bold text-sm active:scale-95 transition-transform disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : "Save Asset"}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-3.5 bg-background text-foreground rounded-xl font-medium text-sm border border-border hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <EmojiPickerModal
        isOpen={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        onSelect={(emoji) => { setIcon(emoji); setEmojiOpen(false); }}
      />

      <EmojiPickerModal
        isOpen={newCatEmojiOpen}
        onClose={() => setNewCatEmojiOpen(false)}
        onSelect={(emoji) => { setNewCatIcon(emoji); setNewCatEmojiOpen(false); }}
      />
    </>
  );
}

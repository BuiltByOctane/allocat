"use client";

import { Drawer } from "vaul";
import { useEffect, useRef, useState } from "react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useAddAsset } from "@/lib/hooks/useNetWorth";
import { useAssetCategories, useAddAssetCategory } from "@/lib/hooks/useAssetCategories";
import EmojiPickerModal from "@/components/ui/EmojiPickerModal";
import { CurrencySymbol } from "@/components/ui/CurrencySymbol";

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
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Drawer.Content
            aria-describedby="add-asset-description"
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none sheet-3q"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="mx-auto w-9 h-1 bg-border rounded-full" />
            </div>

            <div className="overflow-y-auto flex-1 px-6 pt-4 pb-8 space-y-5">
              <div>
                <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">Add asset</Drawer.Title>
                <p id="add-asset-description" className="text-[13px] text-muted-foreground mt-1">
                  Track a new asset in your net worth
                </p>
              </div>

              {/* Icon + Name row */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEmojiOpen(true)}
                  className="w-12 h-12 rounded-tile bg-tile hover:opacity-80 flex items-center justify-center shrink-0 transition-opacity"
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
                  className="flex-1 bg-card border border-border rounded-[13px] px-3.5 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                  Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {(categories ?? []).map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => { setSelectedCategoryId(cat.id); setError(""); }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-pill border text-sm font-medium transition-colors ${
                        selectedCategoryId === cat.id
                          ? "bg-[var(--pill)] text-[var(--pill-foreground)] border-transparent"
                          : "bg-card text-foreground border-border hover:border-foreground/40"
                      }`}
                    >
                      <span className="text-base leading-none">{cat.icon}</span>
                      <span>{cat.name}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setShowNewCategory(!showNewCategory)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-pill border-[1.5px] border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    New
                  </button>
                </div>

                {showNewCategory && (
                  <div className="flex items-center gap-2 p-3 bg-tile rounded-tile border border-border">
                    <button
                      onClick={() => setNewCatEmojiOpen(true)}
                      className="w-8 h-8 rounded-lg bg-card flex items-center justify-center text-lg shrink-0"
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
                <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                  Current Value
                </label>
                <div className="relative">
                  <CurrencySymbol className="currency-symbol absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder="0"
                    value={value}
                    onChange={(e) => { setValue(e.target.value); setError(""); }}
                    className="w-full bg-card border border-border rounded-[13px] pl-8 pr-3.5 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                  />
                </div>
              </div>

              {/* Goal toggle */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => { haptic.selection(); setIsGoal((v) => !v); }}
                  className={`w-full flex items-center justify-between rounded-[13px] border px-4 py-3 transition-colors ${
                    isGoal ? "border-[var(--accent-strong)] bg-tile" : "border-border bg-card"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-base leading-none">🎯</span>
                    <span className="font-medium text-foreground">Make this a goal</span>
                  </span>
                  <span
                    className={`w-9 h-5 rounded-full relative transition-colors ${
                      isGoal ? "bg-accent-strong" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-card transition-transform ${
                        isGoal ? "translate-x-4" : ""
                      }`}
                    />
                  </span>
                </button>
                {isGoal && (
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                      Target Amount
                    </label>
                    <div className="relative">
                      <CurrencySymbol className="currency-symbol absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        placeholder="0"
                        value={targetAmount}
                        onChange={(e) => { setTargetAmount(e.target.value); setError(""); }}
                        className="w-full bg-card border border-border rounded-[13px] pl-8 pr-3.5 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                      />
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <p className="text-xs text-neg font-medium">{error}</p>
              )}

              <div className="flex flex-col gap-3 pt-1">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full h-[48px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : "Save asset"}
                </button>
                <button
                  onClick={onClose}
                  className="w-full h-[48px] rounded-pill bg-muted text-foreground text-sm font-semibold"
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

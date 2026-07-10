"use client";

import { Drawer } from "vaul";
import { useState } from "react";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { useFormatCurrency } from "@/lib/hooks/useFormatCurrency";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useAssetHistory, useAddAssetEntry } from "@/lib/hooks/useAssetHistory";
import { useUpdateAsset, useDeleteAsset } from "@/lib/hooks/useNetWorth";
import { useAchieveGoalAsset } from "@/lib/hooks/useGoals";
import { useAssetCategories } from "@/lib/hooks/useAssetCategories";
import { BottomSheetSelect } from "@/components/ui/BottomSheetSelect";
import { ConfirmDrawer } from "@/components/ui/ConfirmDrawer";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { Progress } from "@/components/ui/Progress";
import type { CatKey } from "@/lib/theme/dataViz";
import { AssetEntrySheet } from "./AssetEntrySheet";

type EntryType = "add_funds" | "withdraw" | "update_value";

export interface AssetDetail {
  id: string;
  name: string;
  icon: string | null;
  color?: string | null;
  category_id: string | null;
  category_name: string;
  category_icon: string;
  value: number;
  invested_amount: number;
  is_goal?: boolean;
  target_amount?: number | null;
  achieved_at?: string | null;
}

interface AssetDetailSheetProps {
  asset: AssetDetail | null;
  onClose: () => void;
}

function entryTypeLabel(type: string) {
  switch (type) {
    case "initial": return "Initial";
    case "add_funds": return "Added";
    case "withdraw": return "Withdrawn";
    case "update_value": return "Revalued";
    default: return type;
  }
}

function entryTypeSign(type: string) {
  switch (type) {
    case "add_funds": return "+";
    case "withdraw": return "−";
    default: return "";
  }
}

export function AssetDetailSheet({ asset, onClose }: AssetDetailSheetProps) {
  const haptic = useHaptic();
  const [entrySheetType, setEntrySheetType] = useState<EntryType | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [editingCategory, setEditingCategory] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetValue, setTargetValue] = useState("");
  const [confirmAchieve, setConfirmAchieve] = useState(false);
  const fmt = useFormatCurrency();

  const { data: history } = useAssetHistory(asset?.id ?? null, 5);
  const { data: categories } = useAssetCategories();
  const addEntryMutation = useAddAssetEntry();
  const updateAssetMutation = useUpdateAsset();
  const deleteAssetMutation = useDeleteAsset();
  const achieveMutation = useAchieveGoalAsset();

  const categoryOptions = (categories ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    icon: c.icon,
  }));

  function handleEditName() {
    if (!asset) return;
    setNameValue(asset.name);
    setEditingName(true);
  }

  function handleSaveName() {
    if (!asset || !nameValue.trim()) return;
    if (nameValue.trim() !== asset.name) {
      updateAssetMutation.mutate({ id: asset.id, updates: { name: nameValue.trim() } });
    }
    setEditingName(false);
  }

  function handleSaveCategory(categoryId: string) {
    if (!asset) return;
    updateAssetMutation.mutate({ id: asset.id, updates: { category_id: categoryId } });
    setEditingCategory(false);
  }

  async function handleEntrySubmit(params: { entryType: EntryType; amount: number; note: string | null; entryDate: string }) {
    if (!asset) throw new Error("No asset");
    await addEntryMutation.mutateAsync({
      assetId: asset.id,
      entryType: params.entryType,
      amount: params.amount,
      note: params.note,
      entryDate: params.entryDate,
    });
  }

  return (
    <>
      <Drawer.Root open={!!asset} onOpenChange={(o) => { if (!o) onClose(); }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Drawer.Content
            aria-describedby="asset-detail-description"
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none sheet-3q"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="mx-auto w-9 h-1 bg-border rounded-full" />
            </div>

            <div className="overflow-y-auto flex-1">
              {asset && (
                <div className="px-6 pt-4 pb-8 space-y-6">
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <span className="text-3xl leading-none mt-0.5">
                      {asset.icon ?? asset.category_icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      {editingName ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={nameValue}
                            onChange={(e) => setNameValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
                            className="flex-1 bg-card border border-border rounded-[11px] px-3 py-1.5 text-base font-bold text-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                          />
                          <button onClick={handleSaveName} className="text-xs font-bold text-foreground px-3 py-1.5 bg-tile rounded-[11px]">Save</button>
                        </div>
                      ) : (
                        <button onClick={handleEditName} className="text-left w-full">
                          <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground leading-tight">{asset.name}</Drawer.Title>
                        </button>
                      )}
                      {editingCategory ? (
                        <div className="mt-2">
                          <BottomSheetSelect
                            id="asset-category-select"
                            title="Category"
                            options={categoryOptions}
                            value={asset.category_id ?? ""}
                            onChange={handleSaveCategory}
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingCategory(true)}
                          className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <span>{asset.category_icon}</span>
                          <span>{asset.category_name}</span>
                          <span className="material-symbols-outlined text-[14px]">edit</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Color */}
                  <div className="flex items-center gap-3 flex-wrap mb-4">
                    <span className="t-label text-muted-foreground shrink-0">Color</span>
                    <ColorPicker
                      value={(asset.color as CatKey | null) ?? null}
                      onChange={(c) =>
                        updateAssetMutation.mutate({ id: asset.id, updates: { color: c } })
                      }
                    />
                  </div>

                  {/* Current value + invested + gain/loss */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Current Value</p>
                      <CurrencyText
                        value={asset.value}
                        className="figure text-[38px] text-foreground"
                      />
                    </div>
                    {asset.invested_amount > 0 && (
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Invested</p>
                          <CurrencyText
                            value={asset.invested_amount}
                            className="figure text-sm tabular-nums text-foreground"
                          />
                        </div>
                        {(() => {
                          const gain = asset.value - asset.invested_amount;
                          const pct = asset.invested_amount > 0
                            ? ((gain / asset.invested_amount) * 100).toFixed(1)
                            : "0.0";
                          const isPositive = gain >= 0;
                          return (
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                                {isPositive ? "Gain" : "Loss"}
                              </p>
                              <span className={`text-sm font-semibold tabular-nums ${isPositive ? "text-pos" : "text-neg"}`}>
                                {isPositive ? "+" : ""}
                                <CurrencyText value={gain} className="inline" />
                                {" "}
                                <span className="text-xs font-medium">({isPositive ? "+" : ""}{pct}%)</span>
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Goal section */}
                  {asset.is_goal && (
                    <div className="rounded-tile border border-border bg-tile px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                          🎯 Goal Target
                        </span>
                        {asset.achieved_at ? (
                          <span className="text-[9px] font-bold uppercase tracking-wide text-foreground">
                            Achieved {new Date(asset.achieved_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setTargetValue(String(asset.target_amount ?? 0));
                              setEditingTarget(true);
                            }}
                            className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      {editingTarget ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            type="number"
                            min="0"
                            value={targetValue}
                            onChange={(e) => setTargetValue(e.target.value)}
                            className="flex-1 bg-card border border-border rounded-[11px] px-3 py-1.5 text-sm figure tabular-nums text-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                          />
                          <button
                            onClick={() => {
                              const t = parseFloat(targetValue);
                              if (!isNaN(t) && t >= 0) {
                                updateAssetMutation.mutate({
                                  id: asset.id,
                                  updates: { target_amount: t },
                                });
                              }
                              setEditingTarget(false);
                            }}
                            className="text-xs font-bold text-foreground px-3 py-1.5 bg-card rounded-[11px]"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-baseline justify-between">
                            <CurrencyText
                              value={Number(asset.target_amount ?? 0)}
                              className="figure text-lg tabular-nums text-foreground"
                            />
                            <span className="figure text-xs tabular-nums text-muted-foreground">
                              {asset.target_amount && asset.target_amount > 0
                                ? `${Math.round(Math.min(100, (asset.value / Number(asset.target_amount)) * 100))}%`
                                : "-"}
                            </span>
                          </div>
                          <Progress
                            className="h-1.5"
                            value={
                              asset.target_amount && asset.target_amount > 0
                                ? Math.min(100, (asset.value / Number(asset.target_amount)) * 100)
                                : 0
                            }
                          />
                          {!asset.achieved_at && (
                            <button
                              onClick={() => { haptic.heavy(); setConfirmAchieve(true); }}
                              className="w-full mt-2 py-2 text-xs font-bold text-[var(--accent-ink)] bg-accent rounded-pill active:scale-[0.98] transition-transform"
                            >
                              Mark achieved · Withdraw
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <button
                      onClick={() => { haptic.light(); setEntrySheetType("add_funds"); }}
                      className="flex flex-col items-center gap-1.5 py-3.5 bg-tile rounded-tile hover:opacity-80 active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-foreground text-[20px]">add_circle</span>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Add Funds</span>
                    </button>
                    <button
                      onClick={() => { haptic.light(); setEntrySheetType("withdraw"); }}
                      className="flex flex-col items-center gap-1.5 py-3.5 bg-tile rounded-tile hover:opacity-80 active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-foreground text-[20px]">remove_circle</span>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Withdraw</span>
                    </button>
                    <button
                      onClick={() => { haptic.light(); setEntrySheetType("update_value"); }}
                      className="flex flex-col items-center gap-1.5 py-3.5 bg-tile rounded-tile hover:opacity-80 active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-foreground text-[20px]">update</span>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Update Value</span>
                    </button>
                  </div>

                  {/* History */}
                  {history && history.length > 0 && (
                    <div>
                      <h3 className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground mb-3">History</h3>
                      <div className="space-y-2">
                        {history.map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between py-2.5 px-3 bg-tile rounded-tile">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-foreground capitalize">
                                {entryTypeLabel(entry.entry_type)}
                                {entry.note ? ` · ${entry.note}` : ""}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                <span className="tabular-nums">
                                  {new Date(entry.entry_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                </span>
                              </p>
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              <p className="figure text-xs tabular-nums text-foreground">
                                {entry.entry_type === "update_value" || entry.entry_type === "initial"
                                  ? <CurrencyText value={entry.running_total} />
                                  : (
                                      <>
                                        {entryTypeSign(entry.entry_type)}
                                        <CurrencyText value={entry.amount} />
                                      </>
                                    )}
                              </p>
                              {(entry.entry_type === "add_funds" || entry.entry_type === "withdraw") && (
                                <p className="text-[10px] text-muted-foreground tabular-nums">
                                  <CurrencyText value={entry.running_total} />
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Delete */}
                  <div className="pt-2">
                    <button
                      onClick={() => { haptic.heavy(); setConfirmDelete(true); }}
                      className="w-full py-3 text-neg text-sm font-bold rounded-pill bg-[var(--neg-dim)] hover:brightness-95 transition-all"
                    >
                      Delete asset
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <AssetEntrySheet
        open={entrySheetType !== null}
        entryType={entrySheetType ?? "add_funds"}
        currentValue={asset?.value ?? 0}
        onClose={() => setEntrySheetType(null)}
        onSave={handleEntrySubmit}
      />

      <ConfirmDrawer
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (asset) {
            deleteAssetMutation.mutate(asset.id);
            setConfirmDelete(false);
            onClose();
          }
        }}
        title="Delete Asset"
        description="This will permanently delete this asset and all its history. This cannot be undone."
        confirmText="Delete"
      />

      <ConfirmDrawer
        isOpen={confirmAchieve}
        onClose={() => setConfirmAchieve(false)}
        onConfirm={() => {
          if (asset) {
            achieveMutation.mutate(asset.id);
            setConfirmAchieve(false);
            onClose();
          }
        }}
        title={asset ? `Mark "${asset.name}" achieved?` : "Mark achieved?"}
        description={
          asset
            ? `This withdraws ${fmt(Number(asset.value))} from net worth and archives the goal. Linked budget items lose their link.`
            : ""
        }
        confirmText="Mark Achieved"
        cancelText="Cancel"
      />
    </>
  );
}

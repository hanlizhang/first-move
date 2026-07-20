"use client";

import { useRef, useState } from "react";

import { requestDayPlan } from "@/lib/day-planning";
import { DIRECTIONS, INTENDED_DURATIONS, type AppState, type Direction, type IntendedDuration } from "@/lib/models";
import { applyPlanningReview, makeReviewItemSmaller, planToReviewItems, validPlanningReview, type PlanningReviewItem, type ReviewGroup } from "@/lib/planning-review";

export default function DayPlanner({ id, state, update, initialItems, onConfirmed, onClose, onOpenTasks }: { id: string; state: AppState; update: (recipe: (state: AppState) => AppState) => void; initialItems?: PlanningReviewItem[]; onConfirmed: (items: PlanningReviewItem[]) => void; onClose?: () => void; onOpenTasks: () => void }) {
  const [brainDump, setBrainDump] = useState("");
  const [items, setItems] = useState<PlanningReviewItem[] | undefined>(() => initialItems?.map((item) => ({ ...item })));
  const [selectedId, setSelectedId] = useState(initialItems?.[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(initialItems ? "Review your confirmed plan. Changes are saved only when you confirm." : "");
  const requestActive = useRef(false);

  async function organize() {
    if (requestActive.current || !brainDump.trim() || brainDump.trim().length > 2_000) return;
    requestActive.current = true; setLoading(true); setNotice("");
    try {
      const result = await requestDayPlan(brainDump);
      if (result.outcome === "success") { const review = planToReviewItems(result.plan); setItems(review); setSelectedId(review[0]?.id ?? ""); setNotice(`${result.mode === "mock" ? "Mock" : "AI"} suggestions are ready to review. Nothing is saved yet.`); }
      else setNotice(result.message);
    } finally { requestActive.current = false; setLoading(false); }
  }

  function startManual() {
    const item = blankItem(); setItems([item]); setSelectedId(item.id); setNotice("Manual review started. No request was made.");
  }

  function updateItem(id: string, patch: Partial<PlanningReviewItem>) {
    setItems((current) => current?.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function changeGroup(item: PlanningReviewItem, group: ReviewGroup) {
    const count = items?.filter((candidate) => candidate.group === group && candidate.id !== item.id).length ?? 0;
    const limit = group === "first-move" ? 1 : 3;
    if (count >= limit) { setNotice(`Only ${limit} ${group === "first-move" ? "First Move" : `${group} tasks`} allowed.`); return; }
    updateItem(item.id, { group });
  }

  function move(index: number, offset: -1 | 1) {
    setItems((current) => { if (!current) return current; const destination = index + offset; if (destination < 0 || destination >= current.length) return current; const next = [...current]; [next[index], next[destination]] = [next[destination], next[index]]; return next; });
  }

  function addManualItem() {
    const priority = items?.filter((item) => item.group === "priority").length ?? 0;
    const optional = items?.filter((item) => item.group === "optional").length ?? 0;
    const group: ReviewGroup | undefined = optional < 3 ? "optional" : priority < 3 ? "priority" : undefined;
    if (!group) { setNotice("The review already has six task items. Delete one before adding another."); return; }
    const item = blankItem(group); setItems((current) => [...(current ?? []), item]); setSelectedId(item.id);
  }

  function confirm() {
    if (!items || !validPlanningReview(items)) { setNotice("Each remaining item needs a title, category, duration, and concrete first step."); return; }
    const hadPending = state.activityIntents.some((intent) => intent.status === "pending");
    if (!initialItems) update((current) => applyPlanningReview(current, items));
    onConfirmed(items);
    setItems(undefined); setBrainDump(""); setSelectedId("");
    setNotice(hadPending ? "Tasks saved. Your existing pending First Move was kept." : "Plan saved. Your reviewed First Move is ready in the existing Focus flow.");
  }

  return <section id={id} className="mt-6 min-w-0 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:p-6" aria-labelledby={`${id}-heading`}>
    <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">Optional planning · Manual path included</p><h2 id={`${id}-heading`} className="mt-2 text-2xl font-bold">Plan my day</h2>
    {!items ? <><label htmlFor={`${id}-brain-dump`} className="mt-4 block text-sm font-semibold">Brain dump</label><textarea id={`${id}-brain-dump`} rows={5} maxLength={2_000} value={brainDump} onChange={(event) => setBrainDump(event.target.value)} placeholder="Type what is on your mind, or use your device keyboard’s dictation button." className="mt-2 w-full rounded-xl border border-indigo-200 bg-white p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /><div className="mt-1 text-right text-xs text-stone-500">{brainDump.length}/2,000</div><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={loading || !brainDump.trim()} onClick={organize} className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Organizing…" : "Organize with AI"}</button><button type="button" onClick={startManual} className="rounded-xl border border-indigo-300 bg-white px-4 py-2.5 text-sm font-semibold">Plan manually</button><button type="button" onClick={onOpenTasks} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-indigo-800">Create tasks directly</button></div></> : <><p className="mt-3 text-sm text-stone-600">Edit everything below. Select one item for “Make this smaller.” No changes reach your task list until confirmation.</p><ol className="mt-4 space-y-3">{items.map((item, index) => <li key={item.id} className={`rounded-xl border bg-white p-4 ${selectedId === item.id ? "border-indigo-500" : "border-indigo-100"}`}><div className="flex items-start gap-3"><input type="radio" name={`${id}-selected-plan-item`} checked={selectedId === item.id} onChange={() => setSelectedId(item.id)} aria-label={`Select ${item.title || "untitled item"}`} className="mt-2" /><div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2"><ReviewInput label="Title" value={item.title} onChange={(value) => updateItem(item.id, { title: value })} /><ReviewInput label="Concrete first step" value={item.firstStep} onChange={(value) => updateItem(item.id, { firstStep: value })} /><ReviewSelect label="Type" value={item.group} options={["first-move", "priority", "optional"]} onChange={(value) => changeGroup(item, value as ReviewGroup)} /><ReviewSelect label="Category" value={item.category} options={DIRECTIONS} onChange={(value) => updateItem(item.id, { category: value as Direction })} /><ReviewSelect label="Duration" value={String(item.durationMinutes)} options={INTENDED_DURATIONS.map(String)} onChange={(value) => updateItem(item.id, { durationMinutes: Number(value) as IntendedDuration })} /></div></div><div className="mt-3 flex flex-wrap gap-2 pl-7"><SmallButton disabled={index === 0} onClick={() => move(index, -1)}>Up</SmallButton><SmallButton disabled={index === items.length - 1} onClick={() => move(index, 1)}>Down</SmallButton><SmallButton onClick={() => { setItems((current) => current?.filter((candidate) => candidate.id !== item.id)); if (selectedId === item.id) setSelectedId(""); }}>Delete</SmallButton></div></li>)}</ol><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => { const selected = items.find((item) => item.id === selectedId); if (selected) updateItem(selected.id, makeReviewItemSmaller(selected)); }} disabled={!selectedId} className="rounded-xl border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">Make this smaller</button><button type="button" onClick={addManualItem} className="rounded-xl border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold">Add item</button><button type="button" onClick={confirm} className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white">Confirm plan</button><button type="button" onClick={() => { if (initialItems) onClose?.(); else { setItems(undefined); setSelectedId(""); setNotice("Review cancelled. Nothing was saved."); } }} className="rounded-xl px-4 py-2 text-sm font-semibold text-stone-600">Cancel</button></div></>}
    {notice && <p className="mt-3 text-sm text-indigo-800" role="status">{notice}</p>}<p className="mt-3 text-xs text-stone-500">Only the brain-dump text is submitted when you click Organize with AI. Journal, habits, history, images, and cat data are excluded.</p>
  </section>;
}

function blankItem(group: ReviewGroup = "first-move"): PlanningReviewItem { return { id: `manual-${crypto.randomUUID()}`, group, title: "", firstStep: "", category: "Daily Life", durationMinutes: 2 }; }
function ReviewInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs font-semibold">{label}<input value={value} maxLength={160} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm font-normal" /></label>; }
function ReviewSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) { return <label className="text-xs font-semibold">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-normal">{options.map((option) => <option key={option} value={option}>{option === "first-move" ? "First Move" : option === "priority" ? "Priority task" : option === "optional" ? "Optional task" : option.match(/^\d+$/) ? `${option} minutes` : option}</option>)}</select></label>; }
function SmallButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) { return <button type="button" disabled={disabled} onClick={onClick} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-35">{children}</button>; }

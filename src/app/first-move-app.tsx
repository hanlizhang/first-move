"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import DayPlanner from "./day-planner";

import {
  addHabit,
  addTask,
  cancelPendingIntent,
  createPendingIntent,
  deleteHabit,
  deleteTask,
  editHabit,
  editTask,
  getPendingIntent,
  isHabitScheduled,
  localDateKey,
  moveTask,
  toggleHabit,
  toggleTask,
} from "@/lib/app-state";
import {
  DIRECTIONS,
  INTENDED_DURATIONS,
  STUCK_STATES,
  WEEKDAYS,
  type ActivityIntent,
  type ActivitySession,
  type AppState,
  type Direction,
  type Habit,
  type HabitSchedule,
  type IntendedDuration,
  type StuckState,
  type Task,
  type Weekday,
} from "@/lib/models";
import { updateAppState, useAppState } from "@/lib/store";
import { easierTemplateFor, nextShorterDuration, templatesFor } from "@/lib/templates";
import {
  completeSession,
  elapsedMs,
  getOpenSession,
  pauseSession,
  remainingMs,
  resumeSession,
  reviewSession,
  startCountdown,
  startStopwatch,
  stopSession,
} from "@/lib/sessions";
import { getTaskTrackedMs, getTodaySummary, getTodayTimeline } from "@/lib/summaries";
import { CAT_ITEMS, STORE_CATEGORIES, isCatItemUnlocked, type CatItemId } from "@/lib/cat-items";
import { inventoryQuantity, purchaseCatItem, useFood as consumeCatFood } from "@/lib/cat-store";
import { HAPPY_ROLL_DURATION_MS, clampRoomPoint, createCatActionSequencer, messageForPose, previewPose, scheduleIdleBehavior, type CatInteraction, type CatPose, type IdleAction } from "@/lib/cat-behavior";
import { CAT_MILESTONES } from "@/lib/cat-items";
import { gentleReturnMessage, kittenStage, syncProgress } from "@/lib/progress";
import { deleteReflection, hasReflectionContent, saveReflection, type ReflectionInput } from "@/lib/reflections";
import { getCalendarMonth, getDayDetail, getTrendSummary, HISTORY_CATEGORIES, type TrendSummary } from "@/lib/history";
import { captureVideoFrame, compressImageToJpeg } from "@/lib/image-compression";
import { MAX_MORNING_ATTEMPTS, completeMorningCheck, morningAttemptCount, recordMorningAttempt, resetMorningCheck, verifyToothbrushPhoto } from "@/lib/morning-check";
import { APP_VIEWS, APP_VIEW_LABELS, plannerPresentation, type AppView } from "@/lib/app-navigation";
import { loadDailyPlan, saveDailyPlan, type DailyPlanRecord } from "@/lib/daily-plan-state";
import type { PlanningReviewItem } from "@/lib/planning-review";
import { companionEventsForTransition, companionIdleAction, createCompanionEventController, shouldShowCompanion, type CompanionReaction } from "@/lib/companion-events";

const weekdayLabels: Record<Weekday, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

export default function FirstMoveApp() {
  const state = useAppState();
  const today = localDateKey();
  const pendingIntent = getPendingIntent(state);
  const openSession = getOpenSession(state);
  const morningComplete = state.morningChecks.some((check) => check.dateKey === today);
  const [activeView, setActiveView] = useState<AppView>("first-moves");
  const [dailyPlan, setDailyPlan] = useState<DailyPlanRecord>();
  const [reviewingPlan, setReviewingPlan] = useState(false);
  const [companionReaction, setCompanionReaction] = useState<CompanionReaction>();
  const companionController = useRef<ReturnType<typeof createCompanionEventController> | undefined>(undefined);

  const emitCompanionEvents = useCallback((events: ReturnType<typeof companionEventsForTransition>) => {
    companionController.current ??= createCompanionEventController({
      setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimer: (timerId) => window.clearTimeout(timerId),
      onReaction: setCompanionReaction,
    });
    companionController.current.enqueue(events);
  }, []);

  const update = useCallback((recipe: (current: AppState) => AppState) => {
    updateAppState((current) => {
      const next = recipe(current);
      emitCompanionEvents(companionEventsForTransition(current, next));
      return next;
    });
  }, [emitCompanionEvents]);

  useEffect(() => () => companionController.current?.dispose(), []);

  useEffect(() => {
    updateAppState((current) => syncProgress(current, today, true));
  }, [today]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDailyPlan(loadDailyPlan(window.localStorage, today));
      setReviewingPlan(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [today]);

  function navigate(view: AppView) {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function savePlan(items: PlanningReviewItem[]) {
    const record = { dateKey: today, items };
    saveDailyPlan(window.localStorage, record);
    setDailyPlan(record);
    setReviewingPlan(false);
  }

  function reviewPlan() { setReviewingPlan(true); navigate("first-moves"); }
  const plannerState = plannerPresentation(morningComplete, Boolean(dailyPlan), reviewingPlan);

  return (
    <div className="min-h-screen bg-[#f7f4ee] text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-[#f7f4ee]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 sm:gap-3">
          <button type="button" onClick={() => navigate("first-moves")} className="font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600">
            First Move
          </button>
          <nav aria-label="Main views" className="order-last w-full overflow-x-auto overscroll-x-contain sm:order-none sm:w-auto">
            <ul className="flex min-w-max gap-1 text-sm font-semibold text-stone-600">
              {APP_VIEWS.map((view) => <li key={view}><button type="button" aria-current={activeView === view ? "page" : undefined} onClick={() => navigate(view)} className={`min-h-11 rounded-lg px-3 py-2 focus-visible:outline-2 focus-visible:outline-orange-600 ${activeView === view ? "bg-white text-stone-950 shadow-sm" : "hover:bg-white"}`}>{APP_VIEW_LABELS[view]}</button></li>)}
            </ul>
          </nav>
          <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-bold shadow-sm" aria-live="polite">
            <span aria-hidden="true">✦</span> {formatPoints(state.progress.points)} points
          </div>
        </div>
      </header>

      {openSession && activeView !== "focus" && <button type="button" onClick={() => navigate("focus")} className="global-session-indicator fixed z-30 rounded-full bg-sky-800 px-4 py-2 text-sm font-bold text-white shadow-lg">{openSession.mode === "countdown" ? "Countdown" : "Tracking"} · {openSession.status}</button>}
      <main id="top" className={`mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6 sm:pt-8 ${shouldShowCompanion(activeView) ? "pb-36" : "pb-16"}`}>
        {activeView === "first-moves" && <>
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-orange-700">I&apos;m Stuck</p>
          <h1 className="mt-2 text-[clamp(2rem,5vw,3rem)] font-bold leading-[1.05] tracking-[-0.04em] text-stone-950">One small move is enough to begin.</h1>
          <p className="mt-4 text-base leading-7 text-stone-600 sm:text-lg">
            Name what is happening, choose a direction, and make one move small enough to begin. Everything here works locally without AI.
          </p>
          <p className="mt-3 text-sm text-stone-500" aria-live="polite">
            Local changes save automatically.
          </p>
        </div>

        {plannerState === "morning" && <MorningStart state={state} today={today} update={update} />}
        {plannerState === "full" && <><MorningStart state={state} today={today} update={update} /><DayPlanner id="daily-plan" state={state} update={update} onConfirmed={savePlan} onOpenTasks={() => navigate("tasks")} /></>}
        {plannerState === "summary" && dailyPlan && <PlanSummary plan={dailyPlan} pendingIntent={pendingIntent} actionLabel="Review or edit plan" onAction={reviewPlan} />}
        {plannerState === "review" && dailyPlan && <DayPlanner id="daily-plan" state={state} update={update} initialItems={dailyPlan.items} onConfirmed={savePlan} onClose={() => setReviewingPlan(false)} onOpenTasks={() => navigate("tasks")} />}

        <div className="mt-8 grid items-start gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <FirstMovePicker
            tasks={state.tasks}
            habits={state.habits}
            pendingIntent={pendingIntent}
            update={update}
            onGoFocus={() => navigate("focus")}
            onSaveAsTask={(title, direction) => update((current) => addTask(current, { title, direction }))}
          />
          <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:p-6" aria-labelledby="foundation-heading">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-700">This task only</p>
            <h2 id="foundation-heading" className="mt-3 text-2xl font-bold tracking-tight">A calm local starting point</h2>
            <p className="mt-3 text-sm leading-6 text-orange-950/70">
              Choose a small move, track the time you spend, and keep the outcome neutral. Your activity stays on this device.
            </p>
          </section>
        </div>
        </>}

        {activeView === "focus" && <FocusPanel key={pendingIntent?.id ?? "focus"} state={state} update={update} />}
        {activeView === "today" && <TodayOverview state={state} today={today} update={update} dailyPlan={dailyPlan} pendingIntent={pendingIntent} onReviewPlan={reviewPlan} />}

        {activeView === "tasks" && <section id="tasks" className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="tasks-heading">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Manual and editable</p>
            <h2 id="tasks-heading" className="mt-2 text-3xl font-bold tracking-tight">Tasks</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">Completing a task earns 5 points once per local day, even if it is unchecked and completed again.</p>
          </div>
          <TaskEditor state={state} today={today} update={update} />
        </section>}

        {activeView === "habits" && <section id="habits" className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="habits-heading">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Daily or selected days</p>
            <h2 id="habits-heading" className="mt-2 text-3xl font-bold tracking-tight">Habits</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">Today&apos;s scheduled habits can earn 3 points once. Unscheduled habits stay visible here so their schedule remains easy to edit.</p>
          </div>
          <HabitEditor habits={state.habits} today={today} update={update} />
        </section>}

        {activeView === "cat" && <CatRoom state={state} today={today} update={update} />}
      </main>
      {shouldShowCompanion(activeView) && <FloatingCompanion key={companionReaction?.id ?? "idle"} reaction={companionReaction} focusActive={Boolean(openSession)} onOpenStore={() => navigate("cat")} />}
    </div>
  );
}

type MorningPhase = "idle" | "permission" | "camera" | "preview" | "loading" | "failure" | "unsupported";

function MorningStart({ state, today, update }: { state: AppState; today: string; update: (recipe: (state: AppState) => AppState) => void }) {
  const completed = state.morningChecks.some((check) => check.dateKey === today);
  const [phase, setPhase] = useState<MorningPhase>("idle");
  const [image, setImage] = useState<Blob>();
  const [previewUrl, setPreviewUrl] = useState("");
  const [captureMethod, setCaptureMethod] = useState<"camera" | "upload">("camera");
  const [message, setMessage] = useState("");
  const [mockOutcome, setMockOutcome] = useState<"pass" | "fail">("pass");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const verifyingRef = useRef(false);
  const attempts = morningAttemptCount(state, today);

  const stopCamera = useCallback(() => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = undefined; }, []);
  const clearImage = useCallback(() => { setImage(undefined); setPreviewUrl(""); }, []);

  useEffect(() => {
    if (phase === "camera" && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [phase]);
  useEffect(() => () => stopCamera(), [stopCamera]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function startCamera() {
    clearImage(); setMessage("");
    if (!navigator.mediaDevices?.getUserMedia) { setPhase("unsupported"); return; }
    setPhase("permission");
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      setCaptureMethod("camera"); setPhase("camera");
    } catch {
      setMessage("Camera access was unavailable or not allowed. You can choose an image instead."); setPhase("failure");
    }
  }

  async function capture() {
    try { const compressed = await captureVideoFrame(videoRef.current!); stopCamera(); showPreview(compressed, "camera"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The photo could not be captured."); setPhase("failure"); }
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    stopCamera(); clearImage(); setPhase("loading"); setMessage("Compressing the photo in this browser…");
    try { showPreview(await compressImageToJpeg(file), "upload"); }
    catch { setMessage("That image could not be prepared. Try another image or skip for today."); setPhase("failure"); }
  }

  function showPreview(blob: Blob, method: "camera" | "upload") {
    clearImage(); setImage(blob); setPreviewUrl(URL.createObjectURL(blob)); setCaptureMethod(method); setMessage(""); setPhase("preview");
  }

  async function verify() {
    if (!image || verifyingRef.current || attempts >= MAX_MORNING_ATTEMPTS) return;
    verifyingRef.current = true;
    update((current) => recordMorningAttempt(current, today));
    setPhase("loading"); setMessage("Checking this photo…");
    try {
      const result = await verifyToothbrushPhoto(image, mockOutcome);
      if (result.outcome === "pass") {
        update((current) => completeMorningCheck(current, today, captureMethod, result.mode));
        window.dispatchEvent(new Event("first-move:morning-success"));
        clearImage(); setMessage("");
      } else {
        setMessage(result.message); setPhase(result.outcome === "unavailable" ? "unsupported" : "failure");
      }
    } finally { verifyingRef.current = false; }
  }

  function retry() { stopCamera(); clearImage(); setMessage(""); setPhase("idle"); }
  function skip() { stopCamera(); clearImage(); setMessage("Skipped for today. No reward or penalty was recorded."); setPhase("idle"); }
  function resetToday() { stopCamera(); clearImage(); setMessage(""); setPhase("idle"); update((current) => resetMorningCheck(current, today)); }

  if (completed) return <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4" aria-labelledby="morning-heading"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Morning Start complete</p><h2 id="morning-heading" className="mt-1 text-lg font-bold">The kitten enjoyed breakfast.</h2></div>{process.env.NODE_ENV === "development" && <details className="mt-3 border-t border-emerald-200 pt-2 text-xs text-stone-500"><summary className="cursor-pointer">Development tools</summary><button type="button" className="mt-2 underline underline-offset-2" onClick={resetToday}>Reset today&apos;s Morning Check</button></details>}</section>;

  return <section className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm sm:p-6" aria-labelledby="morning-heading"><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Morning Start · Fixed daily mission</p><h2 id="morning-heading" className="mt-2 text-2xl font-bold">Take a current photo with your toothbrush</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">The photo is resized to a maximum of 768 px in this browser and is never saved to local storage. This is a routine check, not dental analysis.</p>
    {phase === "idle" && <div className="mt-5 flex flex-wrap gap-2"><button type="button" className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white" onClick={startCamera}>Open camera</button><UploadButton onFile={chooseFile} /></div>}
    {phase === "permission" && <p className="mt-5 rounded-xl bg-white p-4 text-sm" role="status">Waiting for camera permission. Your browser may ask you to allow camera access.</p>}
    {phase === "camera" && <div className="mt-5"><video ref={videoRef} autoPlay playsInline muted className="max-h-96 w-full rounded-2xl bg-stone-900 object-contain" aria-label="Live camera preview" /><div className="mt-3 flex gap-2"><button type="button" className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white" onClick={capture}>Take photo</button><SecondaryButton onClick={retry}>Cancel</SecondaryButton></div></div>}
    {phase === "preview" && previewUrl && <div className="mt-5"><Image src={previewUrl} alt="Preview of the selected toothbrush check photo" width={768} height={768} unoptimized className="max-h-96 w-full rounded-2xl bg-stone-100 object-contain" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={attempts >= MAX_MORNING_ATTEMPTS} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" onClick={verify}>Verify photo</button><SecondaryButton onClick={retry}>Retake</SecondaryButton></div></div>}
    {phase === "loading" && <p className="mt-5 rounded-xl bg-white p-4 text-sm" role="status">{message || "Preparing the photo…"}</p>}
    {(phase === "failure" || phase === "unsupported") && <div className="mt-5 rounded-xl border border-sky-200 bg-white p-4" role="alert"><p className="text-sm">{message || (phase === "unsupported" ? "Camera capture is not supported in this browser. Choose an image from this device instead." : "The check did not pass.")}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="rounded-xl border border-sky-300 px-3 py-2 text-sm font-semibold" onClick={retry}>Retry</button><UploadButton onFile={chooseFile} /><button type="button" className="rounded-xl px-3 py-2 text-sm font-semibold text-stone-600" onClick={skip}>Skip without reward</button></div></div>}
    {message && phase === "idle" && <p className="mt-3 text-sm text-stone-600" role="status">{message}</p>}
    {process.env.NODE_ENV === "development" && <label className="mt-5 block border-t border-sky-200 pt-4 text-xs font-semibold text-stone-600">Development mock result <select className="ml-2 rounded-lg border border-sky-200 bg-white px-2 py-1" value={mockOutcome} onChange={(event) => setMockOutcome(event.target.value as "pass" | "fail")}><option value="pass">Simulate pass</option><option value="fail">Simulate fail</option></select></label>}
    <p className="mt-3 text-xs text-stone-500">{attempts} of {MAX_MORNING_ATTEMPTS} verification attempts used today. Mock mode is the safe server default unless live vision is explicitly configured.</p>
  </section>;
}

function UploadButton({ onFile }: { onFile: (file?: File) => void }) { return <label className="cursor-pointer rounded-xl border border-sky-300 bg-white px-4 py-2.5 text-sm font-semibold">Choose image<input className="sr-only" type="file" accept="image/*" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ""; }} /></label>; }

function FirstMovePicker({
  tasks,
  habits,
  pendingIntent,
  update,
  onGoFocus,
  onSaveAsTask,
}: {
  tasks: Task[];
  habits: Habit[];
  pendingIntent?: ActivityIntent;
  update: (recipe: (state: AppState) => AppState) => void;
  onGoFocus: () => void;
  onSaveAsTask: (title: string, direction: Direction) => void;
}) {
  const [stuckState, setStuckState] = useState<StuckState>(STUCK_STATES[0]);
  const [direction, setDirection] = useState<Direction>(DIRECTIONS[0]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const initial = templatesFor(stuckState, direction)[0];
  const [templateId, setTemplateId] = useState<string | undefined>(initial.id);
  const [moveText, setMoveText] = useState(initial.text);
  const [duration, setDuration] = useState<IntendedDuration>(initial.durationMinutes);
  const [linkedValue, setLinkedValue] = useState("");
  const [notice, setNotice] = useState("");

  function choose(stateChoice: StuckState, directionChoice: Direction, index = 0) {
    const options = templatesFor(stateChoice, directionChoice);
    const selectedIndex = index % options.length;
    setStuckState(stateChoice);
    setDirection(directionChoice);
    setSuggestionIndex(selectedIndex);
    setTemplateId(options[selectedIndex].id);
    setMoveText(options[selectedIndex].text);
    setDuration(options[selectedIndex].durationMinutes);
    setNotice("");
  }

  function chooseLink(value: string) {
    setLinkedValue(value);
    const [kind, id] = value.split(":");
    const source = kind === "task" ? tasks.find((task) => task.id === id) : habits.find((habit) => habit.id === id);
    if (source) setDirection(source.direction);
  }

  function makeEasier() {
    const easier = easierTemplateFor(stuckState, direction, templateId);
    setTemplateId(easier.id);
    setMoveText(easier.text);
    setDuration(nextShorterDuration(duration));
    setNotice("Made smaller using the local template library.");
  }

  function startMove() {
    if (!moveText.trim()) return;
    const [kind, id] = linkedValue.split(":");
    update((state) =>
      createPendingIntent(state, {
        stuckState,
        direction,
        moveText,
        intendedDurationMinutes: duration,
        linkedTaskId: kind === "task" ? id : undefined,
        linkedHabitId: kind === "habit" ? id : undefined,
      }),
    );
  }

  if (pendingIntent) {
    const linked = linkedItemLabel(pendingIntent, tasks, habits);
    return (
      <section id="moves" className="scroll-mt-24 rounded-[1.75rem] border border-violet-300 bg-violet-50 p-6 shadow-sm sm:p-7" aria-labelledby="intent-heading">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Ready when you are</p>
        <h2 id="intent-heading" className="mt-3 text-2xl font-bold tracking-tight">Your pending First Move</h2>
        <div className="mt-5 rounded-2xl border border-violet-200 bg-white p-4">
          <p className="font-semibold leading-6">{pendingIntent.moveText}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-stone-500">Direction</dt><dd className="font-semibold">{pendingIntent.direction}</dd></div>
            <div><dt className="text-stone-500">Intended duration</dt><dd className="font-semibold">{pendingIntent.intendedDurationMinutes} minutes</dd></div>
            {linked && <div className="sm:col-span-2"><dt className="text-stone-500">Linked item</dt><dd className="font-semibold">{linked}</dd></div>}
          </dl>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={onGoFocus} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">Go to Focus</button>
          <button type="button" className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-violet-700" onClick={() => update((state) => cancelPendingIntent(state, pendingIntent.id))}>Change move</button>
          <button type="button" className="rounded-xl px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-white focus-visible:outline-2 focus-visible:outline-stone-700" onClick={() => { update((state) => cancelPendingIntent(state, pendingIntent.id)); setNotice("Cancelled. Nothing was lost."); }}>Cancel</button>
        </div>
      </section>
    );
  }

  return (
    <section id="moves" className="scroll-mt-24 rounded-[1.75rem] border-2 border-violet-300 bg-violet-50 p-6 shadow-sm sm:p-7" aria-labelledby="moves-heading">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">I&apos;m Stuck · No AI required</p>
      <h2 id="moves-heading" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Choose one First Move</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <SelectField label="Right now, I am…" value={stuckState} options={STUCK_STATES} onChange={(value) => choose(value as StuckState, direction)} />
        <SelectField label="Direction" value={direction} options={DIRECTIONS} onChange={(value) => choose(stuckState, value as Direction)} />
      </div>
      <label className="mt-4 block text-sm font-semibold">Link to a task or habit <span className="font-normal text-stone-500">(optional)</span>
        <select className="mt-2 block w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200" value={linkedValue} onChange={(event) => chooseLink(event.target.value)}>
          <option value="">No linked item</option>
          {tasks.map((task) => <option key={task.id} value={`task:${task.id}`}>Task: {task.title}</option>)}
          {habits.map((habit) => <option key={habit.id} value={`habit:${habit.id}`}>Habit: {habit.title}</option>)}
        </select>
      </label>
      <label className="mt-5 block text-sm font-semibold" htmlFor="first-move-text">Your small move</label>
      <textarea id="first-move-text" className="mt-2 min-h-24 w-full rounded-2xl border border-violet-200 bg-white p-3 text-sm leading-6 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200" value={moveText} maxLength={160} onChange={(event) => { setMoveText(event.target.value); setTemplateId(undefined); }} />
      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">Intended duration</legend>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {INTENDED_DURATIONS.map((minutes) => <label key={minutes} className={`cursor-pointer rounded-xl border px-2 py-2.5 text-center text-sm font-semibold ${duration === minutes ? "border-violet-600 bg-violet-700 text-white" : "border-violet-200 bg-white"}`}><input className="sr-only" type="radio" name="duration" value={minutes} checked={duration === minutes} onChange={() => setDuration(minutes)} />{minutes} min</label>)}
        </div>
      </fieldset>
      {notice && <p className="mt-3 text-sm text-violet-800" aria-live="polite">{notice}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700" onClick={() => choose(stuckState, direction, suggestionIndex + 1)}>Another suggestion</button>
        <button type="button" className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700" onClick={makeEasier}>Make it easier</button>
        <button type="button" disabled={duration === 2} className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setDuration(nextShorterDuration(duration))}>Make shorter</button>
        <button type="button" className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700" onClick={() => { setMoveText(""); setTemplateId(undefined); setDuration(2); }}>Write my own</button>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-violet-200 pt-5">
        <button type="button" disabled={!moveText.trim()} className="rounded-xl bg-violet-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 disabled:cursor-not-allowed disabled:opacity-40" onClick={startMove}>Start this move</button>
        <button type="button" disabled={!moveText.trim()} className="rounded-xl px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-white focus-visible:outline-2 focus-visible:outline-violet-700 disabled:opacity-40" onClick={() => onSaveAsTask(moveText.trim(), direction)}>Save as task</button>
      </div>
    </section>
  );
}

function FocusPanel({ state, update }: { state: AppState; update: (recipe: (state: AppState) => AppState) => void }) {
  const pendingIntent = getPendingIntent(state);
  const openSession = getOpenSession(state);
  const lastClosedSession = [...state.sessions].reverse().find((session) => session.status === "completed" || session.status === "stopped");
  const [countdownDuration, setCountdownDuration] = useState<number>(pendingIntent?.intendedDurationMinutes ?? 25);
  const [customDuration, setCustomDuration] = useState("");
  const [stopwatchLink, setStopwatchLink] = useState("");
  const [stopwatchDirection, setStopwatchDirection] = useState<Direction>(DIRECTIONS[0]);
  const [stopwatchLabel, setStopwatchLabel] = useState("");
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    if (!openSession) return;
    const tick = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (
        openSession.status === "running" &&
        openSession.mode === "countdown" &&
        remainingMs(openSession, current) === 0
      ) {
        update((currentState) => completeSession(currentState, openSession.id, current));
      }
    }, 500);
    return () => window.clearInterval(tick);
  }, [openSession, update]);

  function chooseStopwatchLink(value: string) {
    setStopwatchLink(value);
    const [kind, id] = value.split(":");
    const source =
      kind === "task"
        ? state.tasks.find((task) => task.id === id)
        : kind === "habit"
          ? state.habits.find((habit) => habit.id === id)
          : state.activityIntents.find((intent) => intent.id === id);
    if (source) {
      setStopwatchDirection(source.direction);
      setStopwatchLabel("title" in source ? source.title : source.moveText);
    }
  }

  function beginStopwatch() {
    const [kind, id] = stopwatchLink.split(":");
    update((current) =>
      startStopwatch(current, {
        direction: stopwatchDirection,
        label: stopwatchLabel || undefined,
        linkedTaskId: kind === "task" ? id : undefined,
        linkedHabitId: kind === "habit" ? id : undefined,
        linkedIntentId: kind === "intent" ? id : undefined,
      }),
    );
  }

  const displayMs = openSession
    ? openSession.mode === "countdown"
      ? remainingMs(openSession, nowMs) ?? 0
      : elapsedMs(openSession, nowMs)
    : 0;

  return (
    <section id="focus" className="rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm sm:p-6" aria-labelledby="focus-heading">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Focus</p>
      <h2 id="focus-heading" className="mt-2 text-3xl font-bold tracking-tight">Track this time</h2>

      {openSession ? (
        <div className="mt-6 rounded-2xl border border-sky-300 bg-white p-5 text-center">
          <p className="text-sm font-semibold text-sky-700">{openSession.mode === "countdown" ? "Countdown" : "Stopwatch"} · {openSession.status}</p>
          <p className="mt-3 font-mono text-5xl font-bold tabular-nums" aria-live="polite">{formatDuration(displayMs)}</p>
          <p className="mt-3 font-semibold">{openSession.label}</p>
          <p className="mt-1 text-sm text-stone-500">{openSession.direction}{sessionLinkedLabel(openSession, state) ? ` · ${sessionLinkedLabel(openSession, state)}` : ""}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {openSession.status === "running" ? (
              <SecondaryButton onClick={() => update((current) => pauseSession(current, openSession.id))}>Pause</SecondaryButton>
            ) : (
              <SecondaryButton onClick={() => update((current) => resumeSession(current, openSession.id))}>Resume</SecondaryButton>
            )}
            <button type="button" className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700" onClick={() => update((current) => completeSession(current, openSession.id))}>Complete</button>
            <button type="button" className="rounded-xl px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-stone-700" onClick={() => update((current) => stopSession(current, openSession.id))}>Stop early</button>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-sky-200 bg-white p-5">
            <h3 className="text-xl font-bold">Countdown</h3>
            {pendingIntent ? (
              <>
                <p className="mt-2 font-semibold">{pendingIntent.moveText}</p>
                <p className="mt-1 text-sm text-stone-500">{pendingIntent.direction}</p>
                <fieldset className="mt-5">
                  <legend className="text-sm font-semibold">Duration</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[2, 5, 10, 25, 50].map((minutes) => (
                      <label key={minutes} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold ${countdownDuration === minutes && !customDuration ? "border-sky-700 bg-sky-700 text-white" : "border-sky-200"}`}>
                        <input className="sr-only" type="radio" name="countdown-duration" checked={countdownDuration === minutes && !customDuration} onChange={() => { setCountdownDuration(minutes); setCustomDuration(""); }} />{minutes} min
                      </label>
                    ))}
                  </div>
                  <label className="mt-3 block text-sm font-semibold">Custom minutes
                    <input className="mt-2 block w-32 rounded-xl border border-sky-200 px-3 py-2 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" type="number" min="1" max="720" value={customDuration} onChange={(event) => setCustomDuration(event.target.value)} />
                  </label>
                </fieldset>
                <button type="button" disabled={!validUiDuration(customDuration ? Number(customDuration) : countdownDuration)} className="mt-5 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => update((current) => startCountdown(current, { linkedIntentId: pendingIntent.id, direction: pendingIntent.direction, durationMinutes: customDuration ? Number(customDuration) : countdownDuration }))}>Start countdown</button>
              </>
            ) : <p className="mt-3 text-sm leading-6 text-stone-600">Choose “Start this move” in the I&apos;m Stuck area first. A countdown always begins from a pending ActivityIntent.</p>}
          </div>

          <div className="rounded-2xl border border-sky-200 bg-white p-5">
            <h3 className="text-xl font-bold">Stopwatch</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">Track open-ended time with or without a linked item.</p>
            <label className="mt-4 block text-sm font-semibold">Link <span className="font-normal text-stone-500">(optional)</span>
              <select className="mt-2 block w-full rounded-xl border border-sky-200 px-3 py-2.5 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" value={stopwatchLink} onChange={(event) => chooseStopwatchLink(event.target.value)}>
                <option value="">No linked item</option>
                {pendingIntent && <option value={`intent:${pendingIntent.id}`}>Intent: {pendingIntent.moveText}</option>}
                {state.tasks.map((task) => <option key={task.id} value={`task:${task.id}`}>Task: {task.title}</option>)}
                {state.habits.map((habit) => <option key={habit.id} value={`habit:${habit.id}`}>Habit: {habit.title}</option>)}
              </select>
            </label>
            <label className="mt-4 block text-sm font-semibold">Label <span className="font-normal text-stone-500">(optional)</span>
              <input className="mt-2 block w-full rounded-xl border border-sky-200 px-3 py-2.5 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" maxLength={160} placeholder="Tracked time" value={stopwatchLabel} onChange={(event) => setStopwatchLabel(event.target.value)} />
            </label>
            <div className="mt-4"><SelectField label="Direction" value={stopwatchDirection} options={DIRECTIONS} onChange={(value) => setStopwatchDirection(value as Direction)} /></div>
            <button type="button" className="mt-5 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900" onClick={beginStopwatch}>Start tracking</button>
          </div>
        </div>
      )}

      {!openSession && lastClosedSession && <SessionReview session={lastClosedSession} state={state} update={update} />}
    </section>
  );
}

function SessionReview({ session, state, update }: { session: ActivitySession; state: AppState; update: (recipe: (state: AppState) => AppState) => void }) {
  const [editing, setEditing] = useState(!session.reviewedAt);
  const [label, setLabel] = useState(session.label);
  const [direction, setDirection] = useState<Direction>(session.direction);
  const [linkedTaskId, setLinkedTaskId] = useState(session.linkedTaskId ?? "");
  const points = state.rewardEvents.find((event) => event.source === "session" && event.sourceId === session.id)?.points ?? 0;

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    update((current) => reviewSession(current, session.id, { label, direction, linkedTaskId: linkedTaskId || undefined }));
    setEditing(false);
  }

  return (
    <div className={`mt-5 rounded-2xl border p-5 ${session.status === "stopped" ? "border-stone-200 bg-stone-50" : "border-emerald-200 bg-emerald-50"}`} aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-bold">{session.status === "stopped" ? "Time saved — stopped when you chose" : "Session complete"}</p><p className="mt-1 text-sm text-stone-600">Actual time: {formatDuration(session.actualElapsedMs ?? 0)}{points ? ` · +${formatPoints(points)} points` : " · No time reward"}</p></div>
        {!editing && <MiniButton onClick={() => setEditing(true)}>Edit review</MiniButton>}
      </div>
      {editing ? (
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={save}>
          <TextField id={`session-title-${session.id}`} label="Activity title" value={label} onChange={setLabel} placeholder="What did you do?" />
          <SelectField label="Category" value={direction} options={DIRECTIONS} onChange={(value) => setDirection(value as Direction)} />
          <label className="block text-sm font-semibold sm:col-span-2">Linked Task <span className="font-normal text-stone-500">(optional)</span><select className="mt-2 block w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" value={linkedTaskId} onChange={(event) => setLinkedTaskId(event.target.value)}><option value="">Standalone — no Task</option>{state.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
          <div className="flex gap-2 sm:col-span-2"><PrimaryButton>Save session</PrimaryButton>{session.reviewedAt && <SecondaryButton onClick={() => setEditing(false)}>Cancel</SecondaryButton>}</div>
        </form>
      ) : <p className="mt-3 font-semibold">{session.label} <span className="font-normal text-stone-500">· {session.direction}{session.linkedTaskId ? ` · ${state.tasks.find((task) => task.id === session.linkedTaskId)?.title ?? "Linked Task"}` : " · Standalone"}</span></p>}
    </div>
  );
}

function DailyReflection({ state, today, update }: { state: AppState; today: string; update: (recipe: (current: AppState) => AppState) => void }) {
  const existing = state.journalEntries.find((entry) => entry.dateKey === today);
  const [mood, setMood] = useState(existing?.mood ? String(existing.mood) : "");
  const [energy, setEnergy] = useState(existing?.energy ? String(existing.energy) : "");
  const [completed, setCompleted] = useState(existing?.completed ?? "");
  const [difficult, setDifficult] = useState(existing?.difficult ?? "");
  const [nextStep, setNextStep] = useState(existing?.nextStep ?? "");
  const [freeText, setFreeText] = useState(existing?.freeText ?? "");
  const [notice, setNotice] = useState("");

  const input: ReflectionInput = {
    mood: mood ? Number(mood) as 1 | 2 | 3 | 4 | 5 : undefined,
    energy: energy ? Number(energy) as 1 | 2 | 3 | 4 | 5 : undefined,
    completed,
    difficult,
    nextStep,
    freeText,
  };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!hasReflectionContent(input)) return;
    update((current) => saveReflection(current, today, input));
    setNotice(existing ? "Mini Journal updated." : "Mini Journal saved privately in this browser.");
  }

  function remove() {
    update((current) => deleteReflection(current, today));
    setMood(""); setEnergy(""); setCompleted(""); setDifficult(""); setNextStep(""); setFreeText("");
    setNotice("Mini Journal entry removed. There is no penalty.");
  }

  return (
    <section className="mt-7 rounded-2xl border border-amber-200 bg-white p-5" aria-labelledby="reflection-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 id="reflection-heading" className="text-xl font-bold">Mini Journal</h3><p className="mt-1 text-sm text-stone-600">A few optional notes about today. Save any subset that feels useful.</p></div>
        {existing && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Saved today</span>}
      </div>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <RatingField label="Mood" value={mood} onChange={setMood} />
        <RatingField label="Energy" value={energy} onChange={setEnergy} />
        <ReflectionField id="reflection-completed" label="One thing I did" value={completed} onChange={setCompleted} />
        <ReflectionField id="reflection-difficult" label="What felt hard" value={difficult} onChange={setDifficult} />
        <ReflectionField id="reflection-next" label="My next small step" value={nextStep} onChange={setNextStep} />
        <ReflectionField id="reflection-notes" label="Anything else" value={freeText} onChange={setFreeText} />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button disabled={!hasReflectionContent(input)} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900">{existing ? "Update journal" : "Save journal"}</button>
          {existing && <SecondaryButton onClick={remove}>Delete today&apos;s entry</SecondaryButton>}
        </div>
      </form>
      <p className="mt-4 text-xs text-stone-500">Private: entries remain in this browser and are not analyzed or sent to AI.</p>
      {notice && <p className="mt-2 text-sm font-semibold text-emerald-700" role="status">{notice}</p>}
    </section>
  );
}

function RatingField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm font-semibold">{label} <span className="font-normal text-stone-500">(optional)</span><select className="mt-2 block w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" value={value} onChange={(event) => onChange(event.target.value)}><option value="">Not selected</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}</select></label>;
}

function ReflectionField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <label htmlFor={id} className="block text-sm font-semibold">{label} <span className="font-normal text-stone-500">(optional)</span><textarea id={id} rows={2} maxLength={1000} className="mt-2 block w-full resize-y rounded-xl border border-stone-200 px-3 py-2.5 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TodayOverview({ state, today, update, dailyPlan, pendingIntent, onReviewPlan }: { state: AppState; today: string; update: (recipe: (current: AppState) => AppState) => void; dailyPlan?: DailyPlanRecord; pendingIntent?: ActivityIntent; onReviewPlan: () => void }) {
  const [tab, setTab] = useState<"today" | "trends" | "calendar">("today");
  const summary = getTodaySummary(state, today);
  const timeline = getTodayTimeline(state, today);
  return (
    <section id="today" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-6" aria-labelledby="today-heading">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Today</p>
      <h2 id="today-heading" className="mt-2 text-3xl font-bold tracking-tight">Your intentional time</h2>
      <PlanSummary plan={dailyPlan} pendingIntent={pendingIntent} actionLabel="Review plan" onAction={onReviewPlan} compact />
      <div className="mt-5 flex gap-1 rounded-xl bg-amber-100 p-1" role="tablist" aria-label="Today views">{(["today", "trends", "calendar"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={`min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-semibold capitalize focus-visible:outline-2 focus-visible:outline-amber-700 ${tab === value ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:bg-white/60"}`} onClick={() => setTab(value)}>{value}</button>)}</div>
      {tab === "today" && <div role="tabpanel">
        <div className="mt-5 rounded-2xl bg-white p-4 sm:p-5"><p className="text-sm text-stone-500">Total tracked</p><p className="mt-1 font-mono text-3xl font-bold">{formatDuration(summary.totalTrackedMs)}</p><dl className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-5">{DIRECTIONS.map((direction) => <div key={direction} className="min-w-0"><dt className="text-xs text-stone-500">{direction}</dt><dd className="font-semibold">{formatDuration(summary.byDirection[direction])}</dd></div>)}</dl></div>
        <DailyReflection state={state} today={today} update={update} />
        <h3 className="mt-7 text-xl font-bold">Activity timeline</h3>
        {timeline.length === 0 ? <div className="mt-3"><EmptyState>No activity yet today. A tracked session, completed task, habit check-in, or journal entry will appear here.</EmptyState></div> : <ol className="mt-3 space-y-3">{timeline.map((entry) => <li key={entry.id} className="rounded-2xl border border-amber-200 bg-white p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{entry.title}</p><p className="mt-1 text-xs text-stone-500">{timelineDescription(entry)}</p></div><div className="text-right text-xs text-stone-500"><time dateTime={entry.timestamp}>{formatTimelineTime(entry.timestamp)}</time>{entry.points > 0 && <p className="mt-1 font-semibold text-amber-700">+{formatPoints(entry.points)}</p>}</div></div></li>)}</ol>}
      </div>}
      {tab === "trends" && <TrendsPanel state={state} today={today} />}
      {tab === "calendar" && <CalendarPanel state={state} today={today} onShowToday={() => setTab("today")} />}
    </section>
  );
}

function PlanSummary({ plan, pendingIntent, actionLabel, onAction, compact = false }: { plan?: DailyPlanRecord; pendingIntent?: ActivityIntent; actionLabel: string; onAction: () => void; compact?: boolean }) {
  const priorityCount = plan?.items.filter((item) => item.group === "priority").length ?? 0;
  const optionalCount = plan?.items.filter((item) => item.group === "optional").length ?? 0;
  const plannedMove = plan?.items.find((item) => item.group === "first-move")?.firstStep;
  return <section className={`${compact ? "mt-5" : "mt-6"} rounded-2xl border border-indigo-200 bg-white p-4 sm:p-5`} aria-label="Today's plan summary"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-indigo-700">Today&apos;s plan</p><h2 className="mt-1 text-xl font-bold">{plan ? "Today’s plan is ready" : "No plan confirmed yet"}</h2><p className="mt-2 text-sm text-stone-600">{priorityCount} priority · {optionalCount} optional</p>{(pendingIntent?.moveText || plannedMove) && <p className="mt-2 text-sm"><span className="font-semibold">Current First Move:</span> {pendingIntent?.moveText ?? plannedMove}</p>}</div><button type="button" onClick={onAction} className="rounded-xl border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-800">{actionLabel}</button></div></section>;
}

const chartColors: Record<(typeof HISTORY_CATEGORIES)[number], string> = { "Work & Study": "#2563eb", "Daily Life": "#d97706", "Exercise & Movement": "#059669", "Intentional Entertainment": "#9333ea", Rest: "#0e7490", Uncategorized: "#78716c" };

function TrendsPanel({ state, today }: { state: AppState; today: string }) {
  const [period, setPeriod] = useState<7 | 30>(7);
  const trend = getTrendSummary(state, today, period);
  return <div className="mt-5" role="tabpanel"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-bold">Trends</h3><label className="text-sm font-semibold">Period <select className="ml-2 rounded-lg border border-amber-200 bg-white px-3 py-2 font-normal" value={period} onChange={(event) => setPeriod(Number(event.target.value) as 7 | 30)}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select></label></div>
    <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Total tracked time" value={formatDuration(trend.totalTrackedMs)} /><Metric label="Active days" value={String(trend.activeDays)} /><Metric label="Completed First Moves" value={String(trend.completedFirstMoves)} /><Metric label="Completed sessions" value={String(trend.completedSessions)} /></dl>
    {trend.totalTrackedMs === 0 ? <div className="mt-5"><EmptyState>No tracked sessions in this period. Rest, entertainment, and every direction are shown neutrally when recorded.</EmptyState></div> : <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[1.35fr_0.65fr]"><LineChart trend={trend} /><CategoryChart trend={trend} /></div>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-white p-4"><dt className="text-xs text-stone-500">{label}</dt><dd className="mt-1 text-lg font-bold">{value}</dd></div>; }

function LineChart({ trend }: { trend: TrendSummary }) {
  const width = 600, height = 180, pad = 20, max = Math.max(...trend.daily.map((day) => day.totalMs), 1);
  const points = trend.daily.map((day, index) => `${pad + index * ((width - pad * 2) / Math.max(1, trend.daily.length - 1))},${height - pad - (day.totalMs / max) * (height - pad * 2)}`).join(" ");
  return <figure className="rounded-2xl bg-white p-4"><figcaption className="font-bold">Intentional tracked time by day</figcaption><svg className="mt-3 h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Daily tracked time across ${trend.daily.length} days`}><line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#d6d3d1" /><polyline points={points} fill="none" stroke="#b45309" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />{trend.daily.map((day, index) => <circle key={day.dateKey} cx={pad + index * ((width - pad * 2) / Math.max(1, trend.daily.length - 1))} cy={height - pad - (day.totalMs / max) * (height - pad * 2)} r="5" fill="#fff" stroke="#b45309"><title>{formatShortDate(day.dateKey)}: {formatDuration(day.totalMs)}</title></circle>)}</svg><p className="mt-2 text-xs text-stone-500">{formatShortDate(trend.daily[0].dateKey)} – {formatShortDate(trend.daily.at(-1)!.dateKey)}. Peak day: {formatDuration(max)}.</p></figure>;
}

function CategoryChart({ trend }: { trend: TrendSummary }) {
  const radius = 42, circumference = 2 * Math.PI * radius;
  const segments = HISTORY_CATEGORIES.map((category, index) => ({
    category,
    length: trend.totalTrackedMs ? (trend.byCategory[category] / trend.totalTrackedMs) * circumference : 0,
    offset: HISTORY_CATEGORIES.slice(0, index).reduce((total, previous) => total + (trend.totalTrackedMs ? (trend.byCategory[previous] / trend.totalTrackedMs) * circumference : 0), 0),
  }));
  return <figure className="rounded-2xl bg-white p-4"><figcaption className="font-bold">Time by category</figcaption><svg className="mx-auto mt-3 h-40 w-40 -rotate-90" viewBox="0 0 120 120" role="img" aria-label="Category composition donut chart"><circle cx="60" cy="60" r={radius} fill="none" stroke="#e7e5e4" strokeWidth="20" />{segments.map(({ category, length, offset }) => <circle key={category} cx="60" cy="60" r={radius} fill="none" stroke={chartColors[category]} strokeWidth="20" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset}><title>{category}: {formatDuration(trend.byCategory[category])}</title></circle>)}</svg><ul className="mt-3 space-y-1.5 text-xs">{HISTORY_CATEGORIES.map((category) => <li key={category} className="flex justify-between gap-3"><span><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: chartColors[category] }} aria-hidden="true" />{category}</span><span className="font-semibold">{formatDuration(trend.byCategory[category])}</span></li>)}</ul></figure>;
}

function CalendarPanel({ state, today, onShowToday }: { state: AppState; today: string; onShowToday: () => void }) {
  const todayDate = new Date(`${today}T12:00:00`);
  const [monthCursor, setMonthCursor] = useState(() => new Date(todayDate.getFullYear(), todayDate.getMonth(), 1, 12));
  const [selected, setSelected] = useState(today);
  const days = getCalendarMonth(state, monthCursor.getFullYear(), monthCursor.getMonth(), today);
  const detail = getDayDetail(state, selected);
  const maxTracked = Math.max(...days.map((day) => day.trackedMs), 1);
  function moveMonth(offset: number) { setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1, 12)); }
  return <div className="mt-5" role="tabpanel"><div className="flex items-center justify-between gap-3"><button type="button" className="rounded-lg border border-amber-200 bg-white px-3 py-2 font-semibold" onClick={() => moveMonth(-1)} aria-label="Previous month">←</button><h3 className="text-xl font-bold">{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(monthCursor)}</h3><button type="button" className="rounded-lg border border-amber-200 bg-white px-3 py-2 font-semibold" onClick={() => moveMonth(1)} aria-label="Next month">→</button></div>
    <div className="mt-4 min-w-0 rounded-2xl bg-white p-2 sm:p-3"><div className="grid grid-cols-7 text-center text-[0.6875rem] font-semibold text-stone-500 sm:text-xs">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day} className="py-2">{day}</span>)}</div><div className="grid grid-cols-7 gap-0.5 sm:gap-1">{days.map((day) => { const intensity = day.trackedMs / maxTracked; return <button key={day.dateKey} type="button" onClick={() => setSelected(day.dateKey)} aria-label={`${formatLongDate(day.dateKey)}${day.isActive ? ", active day" : ""}, ${formatDuration(day.trackedMs)} tracked`} aria-pressed={selected === day.dateKey} className={`relative min-h-11 min-w-0 rounded-lg border text-xs focus-visible:outline-2 focus-visible:outline-amber-700 sm:text-sm ${selected === day.dateKey ? "border-stone-900 ring-2 ring-stone-900" : day.isToday ? "border-amber-600" : "border-transparent"} ${day.inMonth ? "text-stone-900" : "text-stone-400"}`} style={{ backgroundColor: day.trackedMs ? `rgba(217, 119, 6, ${0.1 + intensity * 0.35})` : undefined }}><span>{day.dayNumber}</span>{day.isActive && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-stone-700" aria-hidden="true" />}</button>; })}</div><p className="mt-3 text-xs text-stone-500">Dot: active day. Deeper shading: more tracked minutes. Outline: today; dark ring: selected date.</p></div>
    <DayDetailPanel detail={detail} isToday={selected === today} onShowToday={onShowToday} />
  </div>;
}

function DayDetailPanel({ detail, isToday, onShowToday }: { detail: ReturnType<typeof getDayDetail>; isToday: boolean; onShowToday: () => void }) {
  const hasAnything = detail.totalTrackedMs > 0 || detail.completedTasks.length > 0 || detail.habitCheckIns.length > 0 || detail.journalEntry;
  return <section className="mt-5 rounded-2xl bg-white p-5" aria-live="polite"><h4 className="text-lg font-bold">{formatLongDate(detail.dateKey)}</h4><p className="mt-1 text-sm text-stone-600">Total tracked: <strong>{formatDuration(detail.totalTrackedMs)}</strong></p>
    {!hasAnything ? <p className="mt-4 text-sm text-stone-500">No recorded activity for this date.</p> : <><dl className="mt-4 grid gap-2 sm:grid-cols-2">{HISTORY_CATEGORIES.map((category) => detail.byCategory[category] > 0 && <div key={category} className="flex justify-between gap-3 text-sm"><dt>{category}</dt><dd className="font-semibold">{formatDuration(detail.byCategory[category])}</dd></div>)}</dl><DetailList title="Completed tasks" items={detail.completedTasks.map((item) => `${item.title} · ${item.direction}`)} /><DetailList title="Habit check-ins" items={detail.habitCheckIns.map((item) => `${item.title} · ${item.direction}`)} /><DetailList title="Sessions" items={detail.sessions.map((session) => `${session.label} · ${session.direction} · ${session.status === "stopped" ? "Stopped intentionally" : "Completed"} · ${formatDuration(session.actualElapsedMs ?? 0)}`)} />{detail.journalEntry && <div className="mt-4"><h5 className="text-sm font-bold">Mini Journal</h5><ul className="mt-1 space-y-1 text-sm text-stone-600">{detail.journalEntry.completed && <li>One thing I did: {detail.journalEntry.completed}</li>}{detail.journalEntry.difficult && <li>What felt hard: {detail.journalEntry.difficult}</li>}{detail.journalEntry.nextStep && <li>My next small step: {detail.journalEntry.nextStep}</li>}{detail.journalEntry.freeText && <li>Anything else: {detail.journalEntry.freeText}</li>}{detail.journalEntry.mood && <li>Mood: {detail.journalEntry.mood}/5</li>}{detail.journalEntry.energy && <li>Energy: {detail.journalEntry.energy}/5</li>}</ul></div>}</>}
    {isToday && <nav className="mt-5 flex flex-wrap gap-2 text-sm font-semibold" aria-label="Edit today's activity"><a className="rounded-lg border border-stone-200 px-3 py-2" href="#focus">Focus</a><a className="rounded-lg border border-stone-200 px-3 py-2" href="#tasks">Tasks</a><a className="rounded-lg border border-stone-200 px-3 py-2" href="#habits">Habits</a><button type="button" className="rounded-lg border border-stone-200 px-3 py-2" onClick={onShowToday}>Mini Journal</button></nav>}
  </section>;
}

function DetailList({ title, items }: { title: string; items: string[] }) { return <div className="mt-4"><h5 className="text-sm font-bold">{title}</h5>{items.length ? <ul className="mt-1 space-y-1 text-sm text-stone-600">{items.map((item, index) => <li key={`${item}:${index}`}>{item}</li>)}</ul> : <p className="mt-1 text-sm text-stone-400">None</p>}</div>; }

function formatShortDate(dateKey: string): string { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${dateKey}T12:00:00`)); }
function formatLongDate(dateKey: string): string { return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${dateKey}T12:00:00`)); }

function sessionLinkedLabel(session: ActivitySession, state: AppState): string | undefined {
  if (session.linkedTaskId) return state.tasks.find((task) => task.id === session.linkedTaskId)?.title;
  if (session.linkedHabitId) return state.habits.find((habit) => habit.id === session.linkedHabitId)?.title;
  if (session.linkedIntentId) return state.activityIntents.find((intent) => intent.id === session.linkedIntentId)?.moveText;
  return undefined;
}

function timelineDescription(entry: ReturnType<typeof getTodayTimeline>[number]): string {
  if (entry.kind === "reflection") return "Private Mini Journal entry";
  if (entry.kind === "morning") return "Morning Start completed";
  if (entry.kind === "session") return `${entry.direction} · ${entry.outcome === "stopped" ? "Stopped intentionally" : "Session"} · ${formatDuration(entry.durationMs)}`;
  return `${entry.direction} · ${entry.kind === "task" ? "Task completed" : "Habit checked in"}`;
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTimelineTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

function formatPoints(points: number): string {
  return points.toFixed(1);
}

function validUiDuration(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 720;
}

function linkedItemLabel(intent: ActivityIntent, tasks: Task[], habits: Habit[]): string | undefined {
  if (intent.linkedTaskId) {
    const task = tasks.find((candidate) => candidate.id === intent.linkedTaskId);
    return task ? `Task: ${task.title}` : undefined;
  }
  if (intent.linkedHabitId) {
    const habit = habits.find((candidate) => candidate.id === intent.linkedHabitId);
    return habit ? `Habit: ${habit.title}` : undefined;
  }
  return undefined;
}

function TaskEditor({ state, today, update }: { state: AppState; today: string; update: (recipe: (state: AppState) => AppState) => void }) {
  const tasks = state.tasks;
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [direction, setDirection] = useState<Direction>(DIRECTIONS[0]);

  function reset() { setEditing(null); setTitle(""); setDirection(DIRECTIONS[0]); }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    update((state) => editing ? editTask(state, editing, { title, direction }) : addTask(state, { title, direction }));
    reset();
  }

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <form onSubmit={submit} className="rounded-2xl bg-stone-50 p-4">
        <h3 className="font-bold">{editing ? "Edit task" : "Add a task"}</h3>
        <TextField id="task-title" label="Task" value={title} onChange={setTitle} placeholder="Open the document" />
        <SelectField label="Direction" value={direction} options={DIRECTIONS} onChange={(value) => setDirection(value as Direction)} />
        <div className="mt-4 flex gap-2">
          <PrimaryButton>{editing ? "Save changes" : "Add task"}</PrimaryButton>
          {editing && <SecondaryButton onClick={reset}>Cancel</SecondaryButton>}
        </div>
      </form>
      <div>
        {tasks.length === 0 ? <EmptyState>No tasks yet. Add one small, concrete action.</EmptyState> : (
          <ul className="space-y-3">
            {tasks.map((task, index) => {
              const complete = task.completedOn.includes(today);
              return (
                <li key={task.id} className="rounded-2xl border border-stone-200 p-4">
                  <div className="flex items-start gap-3">
                    <input className="mt-1 size-5 accent-emerald-700" type="checkbox" checked={complete} aria-label={`Complete ${task.title}`} onChange={() => update((state) => toggleTask(state, task.id, today))} />
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold ${complete ? "text-stone-400 line-through" : ""}`}>{task.title}</p>
                      <p className="mt-1 text-xs text-stone-500">{task.direction} · Tracked {formatDuration(getTaskTrackedMs(state, task.id))}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 pl-8">
                    <MiniButton disabled={index === 0} onClick={() => update((state) => moveTask(state, task.id, -1))}>Move up</MiniButton>
                    <MiniButton disabled={index === tasks.length - 1} onClick={() => update((state) => moveTask(state, task.id, 1))}>Move down</MiniButton>
                    <MiniButton onClick={() => { setEditing(task.id); setTitle(task.title); setDirection(task.direction); }}>Edit</MiniButton>
                    <MiniButton danger onClick={() => { update((state) => deleteTask(state, task.id)); if (editing === task.id) reset(); }}>Delete</MiniButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function HabitEditor({ habits, today, update }: { habits: Habit[]; today: string; update: (recipe: (state: AppState) => AppState) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [direction, setDirection] = useState<Direction>(DIRECTIONS[0]);
  const [scheduleKind, setScheduleKind] = useState<"daily" | "weekdays">("daily");
  const [weekdays, setWeekdays] = useState<Weekday[]>(["mon", "tue", "wed", "thu", "fri"]);

  function reset() { setEditing(null); setTitle(""); setDirection(DIRECTIONS[0]); setScheduleKind("daily"); setWeekdays(["mon", "tue", "wed", "thu", "fri"]); }
  function schedule(): HabitSchedule | null { return scheduleKind === "daily" ? { kind: "daily" } : weekdays.length ? { kind: "weekdays", weekdays } : null; }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextSchedule = schedule();
    if (!title.trim() || !nextSchedule) return;
    update((state) => editing ? editHabit(state, editing, { title, direction, schedule: nextSchedule }) : addHabit(state, { title, direction, schedule: nextSchedule }));
    reset();
  }
  function beginEdit(habit: Habit) {
    setEditing(habit.id); setTitle(habit.title); setDirection(habit.direction); setScheduleKind(habit.schedule.kind);
    setWeekdays(habit.schedule.kind === "weekdays" ? habit.schedule.weekdays : ["mon", "tue", "wed", "thu", "fri"]);
  }

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <form onSubmit={submit} className="rounded-2xl bg-stone-50 p-4">
        <h3 className="font-bold">{editing ? "Edit habit" : "Add a habit"}</h3>
        <TextField id="habit-title" label="Habit" value={title} onChange={setTitle} placeholder="Take a short walk" />
        <SelectField label="Direction" value={direction} options={DIRECTIONS} onChange={(value) => setDirection(value as Direction)} />
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Schedule</legend>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="schedule" checked={scheduleKind === "daily"} onChange={() => setScheduleKind("daily")} /> Daily</label>
            <label className="flex items-center gap-2"><input type="radio" name="schedule" checked={scheduleKind === "weekdays"} onChange={() => setScheduleKind("weekdays")} /> Selected days</label>
          </div>
          {scheduleKind === "weekdays" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => <label key={day} className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"><input type="checkbox" checked={weekdays.includes(day)} onChange={() => setWeekdays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])} /> {weekdayLabels[day]}</label>)}
            </div>
          )}
          {scheduleKind === "weekdays" && weekdays.length === 0 && <p className="mt-2 text-xs font-medium text-red-700">Choose at least one day.</p>}
        </fieldset>
        <div className="mt-4 flex gap-2">
          <PrimaryButton>{editing ? "Save changes" : "Add habit"}</PrimaryButton>
          {editing && <SecondaryButton onClick={reset}>Cancel</SecondaryButton>}
        </div>
      </form>
      <div>
        {habits.length === 0 ? <EmptyState>No habits yet. Keep them light and forgiving.</EmptyState> : (
          <ul className="space-y-3">
            {habits.map((habit) => {
              const scheduled = isHabitScheduled(habit, today);
              const complete = habit.completedOn.includes(today);
              const scheduleLabel = habit.schedule.kind === "daily" ? "Daily" : habit.schedule.weekdays.map((day) => weekdayLabels[day]).join(", ");
              return (
                <li key={habit.id} className={`rounded-2xl border p-4 ${scheduled ? "border-stone-200" : "border-dashed border-stone-200 bg-stone-50/70"}`}>
                  <div className="flex items-start gap-3">
                    <input className="mt-1 size-5 accent-sky-700" type="checkbox" checked={complete} disabled={!scheduled} aria-label={`Complete ${habit.title}`} onChange={() => update((state) => toggleHabit(state, habit.id, today))} />
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold ${complete ? "text-stone-400 line-through" : ""}`}>{habit.title}</p>
                      <p className="mt-1 text-xs text-stone-500">{habit.direction} · {scheduleLabel}{!scheduled ? " · Not scheduled today" : ""}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2 pl-8">
                    <MiniButton onClick={() => beginEdit(habit)}>Edit</MiniButton>
                    <MiniButton danger onClick={() => { update((state) => deleteHabit(state, habit.id)); if (editing === habit.id) reset(); }}>Delete</MiniButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function FloatingCompanion({ reaction, focusActive, onOpenStore }: { reaction?: CompanionReaction; focusActive: boolean; onOpenStore: () => void }) {
  const [idlePose, setIdlePose] = useState<CatPose>("sitting");
  const [blinking, setBlinking] = useState(false);
  const [walkingLeft, setWalkingLeft] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (reaction) return;
    return scheduleIdleBehavior({
      reducedMotion,
      random: Math.random,
      setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimer: (timerId) => window.clearTimeout(timerId),
      onAction: (action) => {
        const allowedAction = companionIdleAction(action, focusActive);
        setBlinking(allowedAction === "blink");
        setIdlePose(allowedAction === "walk" ? "walking" : allowedAction === "sleep" ? "sleeping" : "sitting");
        if (allowedAction === "walk") setWalkingLeft((value) => !value);
      },
      onSit: () => { setIdlePose("sitting"); setBlinking(false); },
    });
  }, [focusActive, reaction, reducedMotion]);

  const reactionPose: Partial<Record<CompanionReaction["kind"], CatPose>> = {
    morning: "eating",
    "session-complete": "happy",
    "session-stopped": "sitting",
    "task-complete": "proud",
    "habit-complete": "high-five",
    milestone: "milestone",
  };
  const pose = reaction ? reactionPose[reaction.kind] ?? "sitting" : idlePose;

  return <aside className="global-companion pointer-events-none fixed z-30" aria-live="polite">
    {reaction && <div className="companion-speech mb-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-center text-xs font-bold text-stone-800 shadow-lg">{reaction.message}</div>}
    <button type="button" className="pointer-events-auto block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-700" onClick={onOpenStore} aria-label="Open Cat Store">
      <PixelKitten compact pose={pose} walkingLeft={walkingLeft} blinking={blinking} wandPoint={{ x: 80, y: 40 }} />
    </button>
  </aside>;
}

function CatRoom({ state, today, update }: { state: AppState; today: string; update: (recipe: (state: AppState) => AppState) => void }) {
  const returnMessage = gentleReturnMessage(state.progress.lastActiveDate, today);
  const [pose, setPose] = useState<CatPose>("sitting");
  const [blinking, setBlinking] = useState(false);
  const [walkingLeft, setWalkingLeft] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [idleReset, setIdleReset] = useState(0);
  const [playMode, setPlayMode] = useState(false);
  const [wandPoint, setWandPoint] = useState({ x: 70, y: 38 });
  const [previewOutdoor, setPreviewOutdoor] = useState(false);
  const roomRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState(returnMessage ? `${returnMessage} The kitten is sitting calmly now.` : messageForPose("sitting"));
  const actionSequencer = useRef<ReturnType<typeof createCatActionSequencer> | undefined>(undefined);
  const stage = kittenStage(state.progress.totalActiveDays);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => scheduleIdleBehavior({
    reducedMotion,
    random: Math.random,
    setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimer: (timerId) => window.clearTimeout(timerId),
    onAction: (action: IdleAction) => {
      setBlinking(action === "blink");
      const nextPose = action === "walk" ? "walking" : action === "sleep" ? "sleeping" : "sitting";
      setPose(nextPose);
      setNotice(messageForPose(nextPose));
      if (action === "walk") setWalkingLeft((value) => !value);
    },
    onSit: () => { setPose("sitting"); setBlinking(false); setNotice(messageForPose("sitting")); },
  }), [idleReset, reducedMotion]);

  useEffect(() => () => actionSequencer.current?.cancel(), []);

  useEffect(() => {
    const handleMorningSuccess = () => {
      actionSequencer.current ??= createCatActionSequencer(
        (callback, delayMs) => window.setTimeout(callback, delayMs),
        (timerId) => window.clearTimeout(timerId),
      );
      const started = actionSequencer.current.startInteraction("milk", (nextPose) => {
        setBlinking(false);
        setPose(nextPose);
        setNotice(messageForPose(nextPose));
      });
      if (started) setIdleReset((value) => value + 1);
    };
    window.addEventListener("first-move:morning-success", handleMorningSuccess);
    return () => window.removeEventListener("first-move:morning-success", handleMorningSuccess);
  }, []);

  function getActionSequencer() {
    actionSequencer.current ??= createCatActionSequencer(
      (callback, delayMs) => window.setTimeout(callback, delayMs),
      (timerId) => window.clearTimeout(timerId),
    );
    return actionSequencer.current;
  }

  function applyActionPose(nextPose: CatPose) {
    setBlinking(false);
    setPose(nextPose);
    setNotice(messageForPose(nextPose));
  }

  function showInteraction(interaction: CatInteraction) {
    const sequencer = getActionSequencer();
    const started = sequencer.startInteraction(interaction, applyActionPose);
    if (!started) return false;
    setIdleReset((value) => value + 1);
    return true;
  }

  function showPreview(nextPose: CatPose) {
    getActionSequencer().cancel();
    setBlinking(false);
    setIdleReset((value) => value + 1);
    const preview = previewPose(nextPose);
    if (preview === "happy") getActionSequencer().startTemporary("happy", HAPPY_ROLL_DURATION_MS, applyActionPose);
    else applyActionPose(preview);
    if (preview === "walking") setWalkingLeft((value) => !value);
  }

  function buy(itemId: CatItemId) {
    update((current) => {
      const result = purchaseCatItem(current, itemId);
      const item = CAT_ITEMS.find((candidate) => candidate.id === itemId)!;
      setNotice(result.outcome === "purchased" ? `${item.name} added to the room.` : result.outcome === "locked" ? `Unlocks at ${item.unlockActiveDays} active days.` : result.outcome === "insufficient" ? "Not enough points yet. Nothing was lost." : result.outcome === "already-owned" ? `${item.name} is already yours.` : "That item is unavailable.");
      return result.state;
    });
  }

  function feed(itemId: CatItemId) {
    if (getActionSequencer().isActive()) return;
    update((current) => {
      const next = consumeCatFood(current, itemId);
      if (next === current) {
        setNotice("There is none of that food in the cupboard yet.");
        return current;
      }
      showInteraction(itemId === "kitten-milk" ? "milk" : itemId === "cat-treat" ? "treat" : "food");
      return next;
    });
  }

  const ownedFood = CAT_ITEMS.filter((item) => item.kind === "food" && inventoryQuantity(state, item.id) > 0);
  const ownsToy = inventoryQuantity(state, "yarn-toy") > 0;
  const ownsWand = inventoryQuantity(state, "teaser-wand") > 0;
  const ownsTrick = inventoryQuantity(state, "high-five") > 0;
  const ownsPawShake = inventoryQuantity(state, "paw-shake") > 0;
  const ownsGarden = inventoryQuantity(state, "outdoor-garden") > 0;
  const ownsButterfly = inventoryQuantity(state, "butterfly") > 0;
  const outdoor = ownsGarden || previewOutdoor;

  function moveWand(event: React.PointerEvent<HTMLDivElement>) {
    if (!playMode || !roomRef.current) return;
    setWandPoint(clampRoomPoint(event.clientX, event.clientY, roomRef.current.getBoundingClientRect()));
    if (pose !== "wand") applyActionPose("wand");
  }

  function toggleWand() {
    if (playMode) { setPlayMode(false); getActionSequencer().cancel(); applyActionPose("sitting"); return; }
    setPlayMode(true); getActionSequencer().cancel(); applyActionPose("wand"); setIdleReset((value) => value + 1);
  }

  return (
    <section id="cat" className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4 shadow-sm sm:p-6" aria-labelledby="cat-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-700">Cat Store</p><h2 id="cat-heading" className="mt-2 text-3xl font-bold tracking-tight">A little companion for the journey</h2></div>
        <div className="rounded-full bg-white px-4 py-2 text-sm font-bold">✦ {formatPoints(state.progress.points)} points</div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 text-sm sm:grid-cols-4">
        <div><dt className="text-stone-500">Today</dt><dd className="font-semibold">{formatRoomDate(today)}</dd></div>
        <div><dt className="text-stone-500">Journey day</dt><dd className="font-semibold">{state.progress.journeyDay || 1}</dd></div>
        <div><dt className="text-stone-500">Active days</dt><dd className="font-semibold">{state.progress.totalActiveDays}</dd></div>
        <div><dt className="text-stone-500">Gentle streak</dt><dd className="font-semibold">{state.progress.gentleStreak} day{state.progress.gentleStreak === 1 ? "" : "s"}</dd></div>
      </dl>
      <div ref={roomRef} onPointerMove={moveWand} className={`relative mt-5 overflow-hidden rounded-3xl border border-amber-200 p-4 text-center sm:p-5 ${outdoor ? "cat-garden" : "bg-gradient-to-b from-sky-100 via-amber-50 to-orange-100"} ${playMode ? "touch-none" : ""}`}>
          {outdoor && <GardenScene />}
          <p className="text-sm font-bold text-fuchsia-800">{stage}</p>
          <PixelKitten pose={pose} walkingLeft={walkingLeft} blinking={blinking} wandPoint={wandPoint} />
          {playMode && <div className="pointer-events-none absolute h-4 w-4 rounded-full bg-rose-500 shadow" style={{ left: wandPoint.x - 8, top: wandPoint.y - 8 }} aria-hidden="true" />}
          <p className="mx-auto max-w-md rounded-xl bg-white/80 px-3 py-2 text-sm text-stone-700" aria-live="polite">{notice}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {ownsToy && <MiniButton onClick={() => showInteraction("yarn")}>Play with yarn</MiniButton>}
            {ownsWand && <MiniButton onClick={toggleWand}>{playMode ? "End wand play" : "Play with wand"}</MiniButton>}
            {ownsTrick && <MiniButton onClick={() => showInteraction("high-five")}>High five</MiniButton>}
            {ownsPawShake && <MiniButton onClick={() => showInteraction("paw-shake")}>Paw shake</MiniButton>}
            {ownsButterfly && <MiniButton onClick={() => showInteraction("butterfly")}>Follow butterfly</MiniButton>}
          </div>
          {ownedFood.length > 0 && <div className="mt-4"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Use food</p><div className="mt-2 flex flex-wrap justify-center gap-2">{ownedFood.map((item) => <button key={item.id} type="button" className="rounded-lg bg-white px-3 py-2 text-xs font-semibold shadow-sm focus-visible:outline-2 focus-visible:outline-fuchsia-700" onClick={() => feed(item.id)}>{item.name} × {inventoryQuantity(state, item.id)}</button>)}</div></div>}
          {process.env.NODE_ENV === "development" && <DevelopmentPosePreview onPreview={showPreview} onInteraction={showInteraction} outdoor={previewOutdoor} onOutdoor={() => setPreviewOutdoor((value) => !value)} />}
      </div>
      <div className="mt-6"><h3 className="text-xl font-bold">Reward shelf</h3><p className="mt-1 text-sm text-stone-600">A few small things, unlocked by active days. Food can be used repeatedly; toys and tricks stay yours.</p><div className="mt-4 grid gap-4 md:grid-cols-2">{STORE_CATEGORIES.map((category) => <section key={category} className="rounded-2xl border border-fuchsia-200 bg-white p-4" aria-labelledby={`store-${category}`}><h4 id={`store-${category}`} className="text-sm font-bold uppercase tracking-wide text-fuchsia-800">{category}</h4><ul className="mt-2 space-y-2">{CAT_ITEMS.filter((item) => item.category === category).map((item) => { const quantity = inventoryQuantity(state, item.id); const owned = item.kind !== "food" && quantity > 0; const unlocked = isCatItemUnlocked(item, state.progress.totalActiveDays); const affordable = state.progress.points >= item.price; return <li key={item.id} className="rounded-xl bg-fuchsia-50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.name}</p><p className="mt-1 text-xs text-stone-500">{unlocked ? item.description : `Unlocks at ${item.unlockActiveDays} active days`}</p></div><span className="text-sm font-bold">{formatPoints(item.price)}</span></div><button type="button" disabled={!unlocked || owned || !affordable} className="mt-2 rounded-lg bg-fuchsia-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-fuchsia-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-700 disabled:cursor-not-allowed disabled:bg-stone-300" onClick={() => buy(item.id)}>{!unlocked ? `Locked · day ${item.unlockActiveDays}` : owned ? "Owned" : !affordable ? "Need more points" : "Buy"}</button>{item.kind === "food" && quantity > 0 && <span className="ml-2 text-xs text-stone-500">Owned: {quantity}</span>}</li>; })}</ul></section>)}</div></div>
      <MilestoneCards totalActiveDays={state.progress.totalActiveDays} completed={state.progress.grantedMilestones} />
      <p className="mt-5 text-sm text-stone-600">Active days never expire. Missing a day never removes points, items, or companionship.</p>
    </section>
  );
}

function DevelopmentPosePreview({ onPreview, onInteraction, outdoor, onOutdoor }: { onPreview: (pose: CatPose) => void; onInteraction: (interaction: CatInteraction) => void; outdoor: boolean; onOutdoor: () => void }) {
  const previews: Array<[string, CatInteraction]> = [["Milk", "milk"], ["Kibble", "food"], ["Treat", "treat"], ["Yarn", "yarn"], ["Wand", "wand"], ["High-five", "high-five"], ["Paw shake", "paw-shake"], ["Butterfly", "butterfly"]];
  return <div className="relative z-10 mx-auto mt-4 max-w-2xl rounded-xl border border-dashed border-stone-400 bg-white/80 p-3"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Development interaction preview</p><div className="mt-2 flex flex-wrap justify-center gap-1.5">{previews.map(([label, interaction]) => <MiniButton key={interaction} onClick={() => onInteraction(interaction)}>{label}</MiniButton>)}<MiniButton onClick={() => onPreview("happy")}>Happy roll</MiniButton><MiniButton onClick={onOutdoor}>{outdoor ? "Indoor scene" : "Garden milestone"}</MiniButton><MiniButton onClick={() => onPreview("sitting")}>Reset</MiniButton></div></div>;
}

function PixelKitten({ pose, walkingLeft, blinking, wandPoint, compact = false }: { pose: CatPose; walkingLeft: boolean; blinking: boolean; wandPoint: { x: number; y: number }; compact?: boolean }) {
  return (
    <div className={`pixel-kitten pixel-kitten-${pose} ${compact ? "pixel-kitten-compact" : ""} relative mx-auto my-2`} role="img" aria-label={`Pixel-art kitten ${pose}`}>
      <svg className="kitten-sprite h-auto w-full" viewBox="0 0 160 110" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="8" y="94" width="144" height="4" fill="#b08968"/><rect x="18" y="98" width="124" height="3" fill="#ddb892"/>
        <g className={pose === "walking" && walkingLeft ? "kitten-walker kitten-walker-left" : "kitten-walker"}><g className={pose === "walking" && walkingLeft ? "kitten-facing-left" : undefined}>
          {pose === "sleeping" ? <SleepingKitten /> : pose === "walking" ? <WalkingKitten /> : pose === "drinking" ? <DrinkingKitten /> : pose === "eating" ? <EatingKitten /> : pose === "licking" ? <LickingKitten /> : pose === "yarn" ? <PlayingKitten /> : pose === "wand" ? <WandKitten targetX={wandPoint.x} /> : pose === "high-five" ? <HighFiveKitten /> : pose === "paw-shake" ? <PawShakeKitten /> : pose === "butterfly" ? <ButterflyKitten /> : pose === "happy" ? <HappyRollKitten /> : pose === "proud" ? <ProudKitten /> : pose === "milestone" ? <MilestoneKitten /> : <SittingKitten blinking={blinking} />}
        </g></g>
      </svg>
    </div>
  );
}

const fur = "#b77945";
const furDark = "#7c4a2d";
const furLight = "#e7bd8c";
const ink = "#3f2d24";

function CatFace({ x, y, happy = false, sleepy = false }: { x: number; y: number; happy?: boolean; sleepy?: boolean }) {
  return <g><polygon points={`${x},${y + 12} ${x + 5},${y} ${x + 13},${y + 12}`} fill={furDark}/><polygon points={`${x + 27},${y + 12} ${x + 35},${y} ${x + 40},${y + 12}`} fill={furDark}/><polygon points={`${x + 4},${y + 9} ${x + 6},${y + 4} ${x + 10},${y + 10}`} fill="#e8a4a4"/><polygon points={`${x + 30},${y + 10} ${x + 34},${y + 4} ${x + 36},${y + 9}`} fill="#e8a4a4"/><rect x={x + 4} y={y + 9} width="32" height="24" fill={fur}/><rect x={x + 1} y={y + 15} width="38" height="12" fill={fur}/><rect x={x + 10} y={y + 20} width="20" height="13" fill={furLight}/>{sleepy || happy ? <><rect x={x + 9} y={y + 18} width="6" height="2" fill={ink}/><rect x={x + 25} y={y + 18} width="6" height="2" fill={ink}/></> : <><rect x={x + 10} y={y + 17} width="4" height="5" fill={ink}/><rect x={x + 26} y={y + 17} width="4" height="5" fill={ink}/></>}<rect x={x + 18} y={y + 23} width="4" height="3" fill={furDark}/><rect x={x + 16} y={y + 27} width="3" height="1" fill={furDark}/><rect x={x + 21} y={y + 27} width="3" height="1" fill={furDark}/><Whiskers x={x} y={y}/></g>;
}

function Whiskers({ x, y }: { x: number; y: number }) {
  return <g stroke={ink} strokeWidth="1"><line x1={x + 12} y1={y + 26} x2={x - 3} y2={y + 23}/><line x1={x + 12} y1={y + 29} x2={x - 4} y2={y + 31}/><line x1={x + 28} y1={y + 26} x2={x + 43} y2={y + 23}/><line x1={x + 28} y1={y + 29} x2={x + 44} y2={y + 31}/></g>;
}

function CurvedTail({ x, y, raised = false }: { x: number; y: number; raised?: boolean }) {
  return raised ? <g fill={furDark}><rect x={x} y={y} width="7" height="25"/><rect x={x + 5} y={y - 8} width="16" height="7"/><rect x={x + 16} y={y - 3} width="7" height="12"/></g> : <g fill={furDark}><rect x={x} y={y} width="22" height="7"/><rect x={x + 17} y={y - 9} width="7" height="14"/><rect x={x + 20} y={y - 13} width="10" height="6"/></g>;
}

function SittingKitten({ blinking }: { blinking: boolean }) {
  return <g><CurvedTail x={93} y={81}/><rect x="65" y="49" width="34" height="39" fill={fur}/><rect x="71" y="55" width="22" height="33" fill={furLight}/><CatFace x={62} y={17} happy={blinking}/><rect x="64" y="82" width="8" height="12" fill={furDark}/><rect x="74" y="82" width="8" height="12" fill={fur}/><rect x="86" y="82" width="8" height="12" fill={fur}/><rect x="96" y="82" width="8" height="12" fill={furDark}/></g>;
}

function WalkingKitten() {
  return <g><g className="walk-frame walk-frame-a"><WalkingFrame alternate={false}/></g><g className="walk-frame walk-frame-b"><WalkingFrame alternate/></g></g>;
}

function WalkingFrame({ alternate }: { alternate: boolean }) {
  return <g><CurvedTail x={40} y={58} raised/><rect x="51" y="51" width="50" height="27" fill={fur}/><rect x="57" y="57" width="36" height="16" fill={furLight}/><CatFace x={93} y={35}/><rect x="55" y="75" width="8" height={alternate ? 14 : 19} fill={furDark}/><rect x="70" y="75" width="8" height={alternate ? 19 : 14} fill={fur}/><rect x="86" y="75" width="8" height={alternate ? 14 : 19} fill={fur}/><rect x="99" y="75" width="8" height={alternate ? 19 : 14} fill={furDark}/></g>;
}

function SleepingKitten() {
  return <g><CurvedTail x={98} y={82}/><rect x="48" y="65" width="62" height="25" fill={fur}/><rect x="57" y="72" width="45" height="18" fill={furLight}/><CatFace x={30} y={55} sleepy/><rect x="54" y="85" width="12" height="7" fill={furDark}/><rect x="68" y="85" width="12" height="7" fill={fur}/><rect x="82" y="85" width="12" height="7" fill={fur}/><rect x="96" y="85" width="12" height="7" fill={furDark}/><text x="112" y="57" fill={ink} fontSize="10" fontWeight="bold">z</text><text x="121" y="48" fill={ink} fontSize="8" fontWeight="bold">z</text></g>;
}

function DrinkingKitten() {
  return <g><rect x="121" y="88" width="27" height="6" fill="#8aa4a8"/><rect x="125" y="86" width="19" height="3" fill="#f8fafc"/><rect x="112" y="59" width="8" height="26" fill="#f4f1de"/><rect x="114" y="62" width="4" height="7" fill="#9ad1d4"/><CurvedTail x={42} y={75}/><rect x="52" y="62" width="49" height="24" fill={fur}/><rect x="59" y="68" width="34" height="15" fill={furLight}/><CatFace x={99} y={49}/><rect x="57" y="82" width="10" height="12" fill={furDark}/><rect x="72" y="84" width="10" height="10" fill={fur}/><rect x="91" y="84" width="10" height="10" fill={furDark}/></g>;
}

function EatingKitten() {
  return <g><rect x="122" y="86" width="25" height="8" fill="#52796f"/><g className="kibble-pieces" fill="#7c4a2d"><rect x="126" y="82" width="4" height="4"/><rect x="133" y="81" width="4" height="4"/><rect x="140" y="83" width="4" height="3"/><rect x="130" y="85" width="4" height="2"/></g><CurvedTail x={42} y={75}/><rect x="52" y="62" width="49" height="24" fill={fur}/><rect x="59" y="68" width="34" height="15" fill={furLight}/><CatFace x={99} y={49}/><rect x="57" y="82" width="10" height="12" fill={furDark}/><rect x="70" y="84" width="10" height="10" fill={fur}/><rect x="86" y="84" width="10" height="10" fill={fur}/><rect x="99" y="82" width="10" height="12" fill={furDark}/></g>;
}

function LickingKitten() { return <g><rect x="125" y="63" width="14" height="27" fill="#d97757"/><rect x="128" y="67" width="8" height="5" fill="#f8d5c2"/><rect x="121" y="75" width="5" height="4" fill="#e8a4a4"/><CurvedTail x={43} y={76}/><rect x="58" y="55" width="43" height="31" fill={fur}/><CatFace x={78} y={28} happy/><rect x="63" y="81" width="9" height="13" fill={furDark}/><rect x="78" y="81" width="9" height="13" fill={fur}/><rect x="95" y="81" width="9" height="13" fill={furDark}/></g>; }

function PlayingKitten() {
  return <g><CurvedTail x={43} y={75} raised/><rect x="58" y="55" width="43" height="31" fill={fur}/><CatFace x={74} y={25}/><rect x="62" y="81" width="8" height="13" fill={furDark}/><rect x="74" y="81" width="8" height="13" fill={fur}/><rect x="91" y="78" width="28" height="7" fill={fur}/><rect x="105" y="84" width="8" height="8" fill={furDark}/><circle cx="130" cy="86" r="10" fill="#9c6644"/><path d="M120 87h20M126 78l8 17M122 81l15 11" stroke="#f0d5b5" strokeWidth="2"/></g>;
}

function WandKitten({ targetX }: { targetX: number }) { const left = targetX < 80; return <g transform={left ? "translate(160 0) scale(-1 1)" : undefined}><CurvedTail x={43} y={75} raised/><rect x="58" y="55" width="43" height="31" fill={fur}/><CatFace x={74} y={25}/><rect x="62" y="81" width="8" height="13" fill={furDark}/><rect x="76" y="81" width="8" height="13" fill={fur}/><rect x="94" y="74" width="25" height="7" fill={fur}/><rect x="111" y="79" width="8" height="8" fill={furDark}/></g>; }
function HighFiveKitten() { return <g><SittingKitten blinking={false}/><rect x="105" y="53" width="9" height="28" fill={fur}/><rect x="113" y="50" width="8" height="9" fill={furDark}/><rect x="128" y="45" width="20" height="28" rx="3" fill="#d8a47f"/><rect x="122" y="51" width="10" height="7" fill="#d8a47f"/></g>; }
function ProudKitten() { return <g><CurvedTail x={101} y={68} raised/><rect x="65" y="49" width="34" height="39" fill={fur}/><rect x="71" y="55" width="22" height="33" fill={furLight}/><CatFace x={62} y={17} happy/><rect x="64" y="82" width="8" height="12" fill={furDark}/><rect x="78" y="82" width="8" height="12" fill={fur}/><rect x="92" y="82" width="8" height="12" fill={furDark}/><g className="proud-sparkles" fill="#e9a23b"><rect x="42" y="30" width="4" height="10"/><rect x="39" y="33" width="10" height="4"/><rect x="121" y="26" width="4" height="9"/><rect x="118" y="29" width="10" height="4"/></g></g>; }
function MilestoneKitten() { return <g><ProudKitten/><g className="milestone-sparkles" fill="#d946ef"><rect x="29" y="50" width="4" height="11"/><rect x="25" y="54" width="12" height="4"/><rect x="132" y="52" width="4" height="11"/><rect x="128" y="56" width="12" height="4"/></g></g>; }
function PawShakeKitten() { return <g><SittingKitten blinking={false}/><rect x="98" y="78" width="28" height="8" fill={fur}/><rect x="119" y="80" width="25" height="12" rx="3" fill="#d8a47f"/><rect x="137" y="70" width="10" height="20" fill="#d8a47f"/></g>; }
function ButterflyKitten() { return <g><PlayingKitten/><g className="butterfly" transform="translate(2 -15)"><rect x="128" y="42" width="3" height="9" fill="#50394c"/><rect x="120" y="39" width="8" height="7" fill="#f4a261"/><rect x="131" y="39" width="8" height="7" fill="#e76f51"/></g></g>; }

function GardenScene() { return <div className="pointer-events-none absolute inset-0" aria-hidden="true"><div className="absolute inset-x-0 bottom-0 h-1/3 bg-emerald-200/70"/><span className="absolute bottom-5 left-[10%] text-2xl">🌼</span><span className="absolute bottom-8 left-[28%] text-xl">🌷</span><span className="absolute bottom-4 right-[18%] text-2xl">🌻</span><span className="absolute right-[12%] top-[18%] text-xl">🦋</span></div>; }

function MilestoneCards({ totalActiveDays, completed }: { totalActiveDays: number; completed: Array<21 | 50 | 100> }) {
  const next = CAT_MILESTONES.find((milestone) => totalActiveDays < milestone.day);
  return <div className="mt-6"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Active-day milestones</p><div className="mt-3 grid gap-3 md:grid-cols-3">{CAT_MILESTONES.map((milestone) => { const status = completed.includes(milestone.day) ? "Completed" : next?.day === milestone.day ? "Current" : "Locked"; return <article key={milestone.day} className={`rounded-2xl border p-4 ${status === "Completed" ? "border-emerald-300 bg-emerald-50" : status === "Current" ? "border-fuchsia-300 bg-white" : "border-stone-200 bg-white/60"}`}><div className="flex justify-between gap-2"><h4 className="font-bold">{milestone.name}</h4><span className="text-xs font-bold">{status}</span></div><p className="mt-1 text-xs text-stone-500">{milestone.day} total active days</p><p className="mt-3 text-sm"><strong>Unlocks:</strong> {milestone.unlocks}</p><p className="mt-1 text-sm"><strong>Free reward:</strong> {milestone.rewardText}</p>{status === "Current" && <div className="mt-3"><div className="h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full bg-fuchsia-600" style={{ width: `${Math.min(100, totalActiveDays / milestone.day * 100)}%` }} /></div><p className="mt-1 text-xs text-stone-500">{totalActiveDays} of {milestone.day} active days</p></div>}</article>; })}</div>{totalActiveDays >= 100 && <p className="mt-3 rounded-xl bg-emerald-100 p-3 text-sm font-bold text-emerald-900">Adventure-ready: the garden and butterfly are ready to explore.</p>}</div>;
}

function HappyRollKitten() {
  return <g><g className="roll-frame roll-frame-a"><HappyRollFrame frame={0}/></g><g className="roll-frame roll-frame-b"><HappyRollFrame frame={1}/></g><g className="roll-frame roll-frame-c"><HappyRollFrame frame={2}/></g></g>;
}

function HappyRollFrame({ frame }: { frame: 0 | 1 | 2 }) {
  if (frame === 1) return <g><CurvedTail x={103} y={73} raised/><rect x="52" y="61" width="59" height="29" fill={fur}/><rect x="64" y="65" width="35" height="21" fill={furLight}/><CatFace x={28} y={54} happy/><rect x="59" y="48" width="9" height="22" fill={furDark}/><rect x="75" y="45" width="9" height="24" fill={fur}/><rect x="88" y="48" width="9" height="22" fill={fur}/><rect x="102" y="53" width="9" height="19" fill={furDark}/></g>;
  if (frame === 2) return <g><CurvedTail x={38} y={76}/><rect x="49" y="64" width="62" height="27" fill={fur}/><rect x="62" y="67" width="36" height="20" fill={furLight}/><CatFace x={104} y={55} happy/><rect x="56" y="53" width="9" height="20" fill={furDark}/><rect x="70" y="49" width="9" height="22" fill={fur}/><rect x="86" y="50" width="9" height="22" fill={fur}/><rect x="99" y="55" width="9" height="18" fill={furDark}/></g>;
  return <g><CurvedTail x={99} y={79}/><rect x="48" y="66" width="63" height="25" fill={fur}/><rect x="61" y="68" width="37" height="19" fill={furLight}/><CatFace x={27} y={57} happy/><rect x="58" y="55" width="9" height="18" fill={furDark}/><rect x="72" y="51" width="9" height="21" fill={fur}/><rect x="87" y="52" width="9" height="20" fill={fur}/><rect x="101" y="57" width="9" height="17" fill={furDark}/></g>;
}

function formatRoomDate(dateKey: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${dateKey}T12:00:00`));
}

function TextField({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="mt-4 block text-sm font-semibold" htmlFor={id}>{label}<input id={id} className="mt-2 block w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" value={value} maxLength={160} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="block text-sm font-semibold">{label}<select className="mt-2 block w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function PrimaryButton({ children }: { children: React.ReactNode }) { return <button className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900">{children}</button>; }
function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <button type="button" className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-stone-900" onClick={onClick}>{children}</button>; }
function MiniButton({ children, onClick, disabled = false, danger = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) { return <button type="button" disabled={disabled} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-35 ${danger ? "text-red-700 hover:bg-red-50 focus-visible:outline-red-700" : "text-stone-600 hover:bg-stone-100 focus-visible:outline-stone-700"}`} onClick={onClick}>{children}</button>; }
function EmptyState({ children }: { children: React.ReactNode }) { return <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">{children}</p>; }

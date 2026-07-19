"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
import { HAPPY_ROLL_DURATION_MS, USER_ACTION_DURATION_MS, createCatActionSequencer, messageForPose, poseForAction, previewPose, scheduleIdleBehavior, type CatPose, type IdleAction } from "@/lib/cat-behavior";
import { gentleReturnMessage, kittenStage, syncProgress } from "@/lib/progress";

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

  const update = useCallback((recipe: (current: AppState) => AppState) => {
    updateAppState(recipe);
  }, []);

  useEffect(() => {
    update((current) => syncProgress(current, today, true));
  }, [today, update]);

  return (
    <div className="min-h-screen bg-[#f7f4ee] text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-[#f7f4ee]/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <a href="#top" className="font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600">
            First Move
          </a>
          <nav aria-label="Page sections" className="hidden sm:block">
            <ul className="flex gap-1 text-sm font-semibold text-stone-600">
              <li><a className="rounded-lg px-3 py-2 hover:bg-white focus-visible:outline-2 focus-visible:outline-orange-600" href="#moves">First Moves</a></li>
              <li><a className="rounded-lg px-3 py-2 hover:bg-white focus-visible:outline-2 focus-visible:outline-orange-600" href="#focus">Focus</a></li>
              <li><a className="rounded-lg px-3 py-2 hover:bg-white focus-visible:outline-2 focus-visible:outline-orange-600" href="#today">Today</a></li>
              <li><a className="rounded-lg px-3 py-2 hover:bg-white focus-visible:outline-2 focus-visible:outline-orange-600" href="#tasks">Tasks</a></li>
              <li><a className="rounded-lg px-3 py-2 hover:bg-white focus-visible:outline-2 focus-visible:outline-orange-600" href="#habits">Habits</a></li>
              <li><a className="rounded-lg px-3 py-2 hover:bg-white focus-visible:outline-2 focus-visible:outline-orange-600" href="#cat">Cat</a></li>
            </ul>
          </nav>
          <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-bold shadow-sm" aria-live="polite">
            <span aria-hidden="true">✦</span> {formatPoints(state.progress.points)} points
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-orange-700">I&apos;m Stuck</p>
          <h1 className="mt-2 text-4xl font-bold tracking-[-0.04em] text-stone-950 sm:text-5xl">One small move is enough to begin.</h1>
          <p className="mt-4 text-base leading-7 text-stone-600 sm:text-lg">
            Name what is happening, choose a direction, and make one move small enough to begin. Everything here works locally without AI.
          </p>
          <p className="mt-3 text-sm text-stone-500" aria-live="polite">
            Local changes save automatically.
          </p>
        </div>

        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <FirstMovePicker
            tasks={state.tasks}
            habits={state.habits}
            pendingIntent={pendingIntent}
            update={update}
            onSaveAsTask={(title, direction) => update((current) => addTask(current, { title, direction }))}
          />
          <section className="rounded-[1.75rem] border border-orange-200 bg-orange-50 p-6 sm:p-7" aria-labelledby="foundation-heading">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-700">This task only</p>
            <h2 id="foundation-heading" className="mt-3 text-2xl font-bold tracking-tight">A calm local starting point</h2>
            <p className="mt-3 text-sm leading-6 text-orange-950/70">
              Choose a small move, track the time you spend, and keep the outcome neutral. Your activity stays on this device.
            </p>
          </section>
        </div>

        <FocusPanel key={pendingIntent?.id ?? "focus"} state={state} update={update} />

        <TodayOverview state={state} today={today} />

        <section id="tasks" className="scroll-mt-24 mt-8 rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="tasks-heading">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Manual and editable</p>
            <h2 id="tasks-heading" className="mt-2 text-3xl font-bold tracking-tight">Tasks</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">Completing a task earns 5 points once per local day, even if it is unchecked and completed again.</p>
          </div>
          <TaskEditor state={state} today={today} update={update} />
        </section>

        <section id="habits" className="scroll-mt-24 mt-8 rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="habits-heading">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Daily or selected days</p>
            <h2 id="habits-heading" className="mt-2 text-3xl font-bold tracking-tight">Habits</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">Today&apos;s scheduled habits can earn 3 points once. Unscheduled habits stay visible here so their schedule remains easy to edit.</p>
          </div>
          <HabitEditor habits={state.habits} today={today} update={update} />
        </section>

        <CatRoom state={state} today={today} update={update} />
      </main>
    </div>
  );
}

function FirstMovePicker({
  tasks,
  habits,
  pendingIntent,
  update,
  onSaveAsTask,
}: {
  tasks: Task[];
  habits: Habit[];
  pendingIntent?: ActivityIntent;
  update: (recipe: (state: AppState) => AppState) => void;
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
          <a href="#focus" className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">Go to Focus</a>
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
    <section id="focus" className="scroll-mt-24 mt-8 rounded-[1.75rem] border border-sky-200 bg-sky-50 p-6 shadow-sm sm:p-8" aria-labelledby="focus-heading">
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
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
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

function TodayOverview({ state, today }: { state: AppState; today: string }) {
  const summary = getTodaySummary(state, today);
  const timeline = getTodayTimeline(state, today);
  return (
    <section id="today" className="scroll-mt-24 mt-8 rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6 shadow-sm sm:p-8" aria-labelledby="today-heading">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Today</p>
      <h2 id="today-heading" className="mt-2 text-3xl font-bold tracking-tight">Your intentional time</h2>
      <div className="mt-5 rounded-2xl bg-white p-5"><p className="text-sm text-stone-500">Total tracked</p><p className="mt-1 font-mono text-3xl font-bold">{formatDuration(summary.totalTrackedMs)}</p><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{DIRECTIONS.map((direction) => <div key={direction}><dt className="text-xs text-stone-500">{direction}</dt><dd className="font-semibold">{formatDuration(summary.byDirection[direction])}</dd></div>)}</dl></div>
      <h3 className="mt-7 text-xl font-bold">Activity timeline</h3>
      {timeline.length === 0 ? <div className="mt-3"><EmptyState>No activity yet today. A tracked session, completed task, or habit check-in will appear here.</EmptyState></div> : <ol className="mt-3 space-y-3">{timeline.map((entry) => <li key={entry.id} className="rounded-2xl border border-amber-200 bg-white p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{entry.title}</p><p className="mt-1 text-xs text-stone-500">{entry.direction} · {entry.kind === "session" ? (entry.outcome === "stopped" ? `Stopped intentionally · ${formatDuration(entry.durationMs)}` : `Session · ${formatDuration(entry.durationMs)}`) : entry.kind === "task" ? "Task completed" : "Habit checked in"}</p></div><div className="text-right text-xs text-stone-500"><time dateTime={entry.timestamp}>{formatTimelineTime(entry.timestamp)}</time>{entry.points > 0 && <p className="mt-1 font-semibold text-amber-700">+{formatPoints(entry.points)}</p>}</div></div></li>)}</ol>}
    </section>
  );
}

function sessionLinkedLabel(session: ActivitySession, state: AppState): string | undefined {
  if (session.linkedTaskId) return state.tasks.find((task) => task.id === session.linkedTaskId)?.title;
  if (session.linkedHabitId) return state.habits.find((habit) => habit.id === session.linkedHabitId)?.title;
  if (session.linkedIntentId) return state.activityIntents.find((intent) => intent.id === session.linkedIntentId)?.moveText;
  return undefined;
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
    <div className="mt-7 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
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
    <div className="mt-7 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
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

function CatRoom({ state, today, update }: { state: AppState; today: string; update: (recipe: (state: AppState) => AppState) => void }) {
  const returnMessage = gentleReturnMessage(state.progress.lastActiveDate, today);
  const [pose, setPose] = useState<CatPose>("sitting");
  const [blinking, setBlinking] = useState(false);
  const [walkingLeft, setWalkingLeft] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [idleReset, setIdleReset] = useState(0);
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

  function showAction(action: "food" | "toy" | "trick") {
    const sequencer = getActionSequencer();
    const started = action === "food"
      ? sequencer.startFoodSequence(applyActionPose)
      : sequencer.startTemporary(poseForAction(action), action === "trick" ? HAPPY_ROLL_DURATION_MS : USER_ACTION_DURATION_MS, applyActionPose);
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
      if (result.outcome === "purchased") showAction("trick");
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
      showAction("food");
      return next;
    });
  }

  const ownedFood = CAT_ITEMS.filter((item) => item.kind === "food" && inventoryQuantity(state, item.id) > 0);
  const ownsToy = inventoryQuantity(state, "yarn-toy") > 0;
  const ownsTrick = inventoryQuantity(state, "high-five") > 0;

  return (
    <section id="cat" className="scroll-mt-24 mt-8 rounded-[1.75rem] border border-fuchsia-200 bg-fuchsia-50 p-6 shadow-sm sm:p-8" aria-labelledby="cat-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-700">Cat Room</p><h2 id="cat-heading" className="mt-2 text-3xl font-bold tracking-tight">A little companion for the journey</h2></div>
        <div className="rounded-full bg-white px-4 py-2 text-sm font-bold">✦ {formatPoints(state.progress.points)} points</div>
      </div>
      <dl className="mt-5 grid gap-3 rounded-2xl bg-white p-4 text-sm sm:grid-cols-4">
        <div><dt className="text-stone-500">Today</dt><dd className="font-semibold">{formatRoomDate(today)}</dd></div>
        <div><dt className="text-stone-500">Journey day</dt><dd className="font-semibold">{state.progress.journeyDay || 1}</dd></div>
        <div><dt className="text-stone-500">Active days</dt><dd className="font-semibold">{state.progress.totalActiveDays}</dd></div>
        <div><dt className="text-stone-500">Gentle streak</dt><dd className="font-semibold">{state.progress.gentleStreak} day{state.progress.gentleStreak === 1 ? "" : "s"}</dd></div>
      </dl>
      <div className="mt-5 rounded-3xl border border-amber-200 bg-gradient-to-b from-sky-100 via-amber-50 to-orange-100 p-4 text-center sm:p-5">
          <p className="text-sm font-bold text-fuchsia-800">{stage}</p>
          <PixelKitten pose={pose} walkingLeft={walkingLeft} blinking={blinking} />
          <p className="mx-auto max-w-md rounded-xl bg-white/80 px-3 py-2 text-sm text-stone-700" aria-live="polite">{notice}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {ownsToy && <MiniButton onClick={() => showAction("toy")}>Play with yarn</MiniButton>}
            {ownsTrick && <MiniButton onClick={() => showAction("trick")}>High five</MiniButton>}
          </div>
          {ownedFood.length > 0 && <div className="mt-4"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Use food</p><div className="mt-2 flex flex-wrap justify-center gap-2">{ownedFood.map((item) => <button key={item.id} type="button" className="rounded-lg bg-white px-3 py-2 text-xs font-semibold shadow-sm focus-visible:outline-2 focus-visible:outline-fuchsia-700" onClick={() => feed(item.id)}>{item.name} × {inventoryQuantity(state, item.id)}</button>)}</div></div>}
          {process.env.NODE_ENV === "development" && <DevelopmentPosePreview onPreview={showPreview} />}
      </div>
      <div className="mt-6"><h3 className="text-xl font-bold">Reward shelf</h3><p className="mt-1 text-sm text-stone-600">A few small things, unlocked by active days. Food can be used repeatedly; toys and tricks stay yours.</p><div className="mt-4 grid gap-4 md:grid-cols-2">{STORE_CATEGORIES.map((category) => <section key={category} className="rounded-2xl border border-fuchsia-200 bg-white p-4" aria-labelledby={`store-${category}`}><h4 id={`store-${category}`} className="text-sm font-bold uppercase tracking-wide text-fuchsia-800">{category}</h4><ul className="mt-2 space-y-2">{CAT_ITEMS.filter((item) => item.category === category).map((item) => { const quantity = inventoryQuantity(state, item.id); const owned = item.kind !== "food" && quantity > 0; const unlocked = isCatItemUnlocked(item, state.progress.totalActiveDays); const affordable = state.progress.points >= item.price; return <li key={item.id} className="rounded-xl bg-fuchsia-50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.name}</p><p className="mt-1 text-xs text-stone-500">{unlocked ? item.description : `Unlocks at ${item.unlockActiveDays} active days`}</p></div><span className="text-sm font-bold">{formatPoints(item.price)}</span></div><button type="button" disabled={!unlocked || owned || !affordable} className="mt-2 rounded-lg bg-fuchsia-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-fuchsia-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-700 disabled:cursor-not-allowed disabled:bg-stone-300" onClick={() => buy(item.id)}>{!unlocked ? `Locked · day ${item.unlockActiveDays}` : owned ? "Owned" : !affordable ? "Need more points" : "Buy"}</button>{item.kind === "food" && quantity > 0 && <span className="ml-2 text-xs text-stone-500">Owned: {quantity}</span>}</li>; })}</ul></section>)}</div></div>
      <div className="mt-5"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Active-day milestones</p><div className="mt-2 flex flex-wrap gap-2">{([21, 50, 100] as const).map((milestone) => <span key={milestone} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${state.progress.unlockedMilestones.includes(milestone) ? "bg-fuchsia-700 text-white" : "bg-white text-stone-500"}`}>{milestone} days · {state.progress.unlockedMilestones.includes(milestone) ? "Unlocked" : "Ahead"}</span>)}</div></div>
      <p className="mt-5 text-sm text-stone-600">Active days never expire. Missing a day never removes points, items, or companionship.</p>
    </section>
  );
}

function DevelopmentPosePreview({ onPreview }: { onPreview: (pose: CatPose) => void }) {
  const previews: Array<[string, CatPose]> = [["Sit", "sitting"], ["Walk", "walking"], ["Sleep", "sleeping"], ["Eat", "eating"], ["Play", "playing"], ["Happy", "happy"]];
  return <div className="mx-auto mt-4 max-w-lg rounded-xl border border-dashed border-stone-400 bg-white/70 p-3"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Development pose preview</p><div className="mt-2 flex flex-wrap justify-center gap-1.5">{previews.map(([label, preview]) => <MiniButton key={preview} onClick={() => onPreview(preview)}>{label}</MiniButton>)}<MiniButton onClick={() => onPreview("sitting")}>Reset to sitting</MiniButton></div></div>;
}

function PixelKitten({ pose, walkingLeft, blinking }: { pose: CatPose; walkingLeft: boolean; blinking: boolean }) {
  return (
    <div className={`pixel-kitten pixel-kitten-${pose} relative mx-auto my-2`} role="img" aria-label={`Pixel-art kitten ${pose}`}>
      <svg className="kitten-sprite h-auto w-full" viewBox="0 0 160 110" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="8" y="94" width="144" height="4" fill="#b08968"/><rect x="18" y="98" width="124" height="3" fill="#ddb892"/>
        <g className={pose === "walking" && walkingLeft ? "kitten-walker kitten-walker-left" : "kitten-walker"}><g className={pose === "walking" && walkingLeft ? "kitten-facing-left" : undefined}>
          {pose === "sleeping" ? <SleepingKitten /> : pose === "walking" ? <WalkingKitten /> : pose === "eating" ? <EatingKitten /> : pose === "playing" ? <PlayingKitten /> : pose === "happy" ? <HappyRollKitten /> : <SittingKitten blinking={blinking} />}
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

function EatingKitten() {
  return <g><rect x="122" y="86" width="25" height="8" fill="#52796f"/><rect x="126" y="82" width="17" height="6" fill="#f2cc8f"/><CurvedTail x={42} y={75}/><rect x="52" y="62" width="49" height="24" fill={fur}/><rect x="59" y="68" width="34" height="15" fill={furLight}/><CatFace x={99} y={49}/><rect x="57" y="82" width="10" height="12" fill={furDark}/><rect x="70" y="84" width="10" height="10" fill={fur}/><rect x="86" y="84" width="10" height="10" fill={fur}/><rect x="99" y="82" width="10" height="12" fill={furDark}/></g>;
}

function PlayingKitten() {
  return <g><CurvedTail x={43} y={75} raised/><rect x="58" y="55" width="43" height="31" fill={fur}/><CatFace x={74} y={25}/><rect x="62" y="81" width="8" height="13" fill={furDark}/><rect x="74" y="81" width="8" height="13" fill={fur}/><rect x="91" y="78" width="28" height="7" fill={fur}/><rect x="105" y="84" width="8" height="8" fill={furDark}/><circle cx="130" cy="86" r="10" fill="#9c6644"/><path d="M120 87h20M126 78l8 17M122 81l15 11" stroke="#f0d5b5" strokeWidth="2"/></g>;
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

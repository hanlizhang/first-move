"use client";

import { useState } from "react";

import {
  addHabit,
  addTask,
  deleteHabit,
  deleteTask,
  editHabit,
  editTask,
  isHabitScheduled,
  localDateKey,
  moveTask,
  toggleHabit,
  toggleTask,
} from "@/lib/app-state";
import {
  DIRECTIONS,
  STUCK_STATES,
  WEEKDAYS,
  type AppState,
  type Direction,
  type Habit,
  type HabitSchedule,
  type StuckState,
  type Task,
  type Weekday,
} from "@/lib/models";
import { updateAppState, useAppState } from "@/lib/store";
import { templatesFor } from "@/lib/templates";

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

  function update(recipe: (current: AppState) => AppState) {
    updateAppState(recipe);
  }

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
              <li><a className="rounded-lg px-3 py-2 hover:bg-white focus-visible:outline-2 focus-visible:outline-orange-600" href="#tasks">Tasks</a></li>
              <li><a className="rounded-lg px-3 py-2 hover:bg-white focus-visible:outline-2 focus-visible:outline-orange-600" href="#habits">Habits</a></li>
            </ul>
          </nav>
          <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-bold shadow-sm" aria-live="polite">
            <span aria-hidden="true">✦</span> {state.progress.points} points
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-orange-700">Local foundation</p>
          <h1 className="mt-2 text-4xl font-bold tracking-[-0.04em] text-stone-950 sm:text-5xl">One small move is enough to begin.</h1>
          <p className="mt-4 text-base leading-7 text-stone-600 sm:text-lg">
            Choose an offline suggestion, or shape today with your own tasks and lightweight habits. Everything on this page stays in this browser.
          </p>
          <p className="mt-3 text-sm text-stone-500" aria-live="polite">
            Local changes save automatically.
          </p>
        </div>

        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <FirstMovePicker onSaveAsTask={(title, direction) => update((current) => addTask(current, { title, direction }))} />
          <section className="rounded-[1.75rem] border border-orange-200 bg-orange-50 p-6 sm:p-7" aria-labelledby="foundation-heading">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-700">This task only</p>
            <h2 id="foundation-heading" className="mt-3 text-2xl font-bold tracking-tight">A calm local starting point</h2>
            <p className="mt-3 text-sm leading-6 text-orange-950/70">
              First Move suggestions, tasks, habits, and reward records work without AI. Sessions, Morning verification, the cat store, and reflection arrive in later tasks. The I&apos;m Stuck flow arrives in TASK-02.
            </p>
          </section>
        </div>

        <section id="tasks" className="scroll-mt-24 mt-8 rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="tasks-heading">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Manual and editable</p>
            <h2 id="tasks-heading" className="mt-2 text-3xl font-bold tracking-tight">Tasks</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">Completing a task earns 5 points once per local day, even if it is unchecked and completed again.</p>
          </div>
          <TaskEditor tasks={state.tasks} today={today} update={update} />
        </section>

        <section id="habits" className="scroll-mt-24 mt-8 rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="habits-heading">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Daily or selected days</p>
            <h2 id="habits-heading" className="mt-2 text-3xl font-bold tracking-tight">Habits</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">Today&apos;s scheduled habits can earn 3 points once. Unscheduled habits stay visible here so their schedule remains easy to edit.</p>
          </div>
          <HabitEditor habits={state.habits} today={today} update={update} />
        </section>
      </main>
    </div>
  );
}

function FirstMovePicker({ onSaveAsTask }: { onSaveAsTask: (title: string, direction: Direction) => void }) {
  const [stuckState, setStuckState] = useState<StuckState>(STUCK_STATES[0]);
  const [direction, setDirection] = useState<Direction>(DIRECTIONS[0]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const initial = templatesFor(stuckState, direction)[0];
  const [moveText, setMoveText] = useState(initial.text);
  const [duration, setDuration] = useState(initial.durationMinutes);

  function choose(stateChoice: StuckState, directionChoice: Direction, index = 0) {
    const options = templatesFor(stateChoice, directionChoice);
    const selectedIndex = index % options.length;
    setStuckState(stateChoice);
    setDirection(directionChoice);
    setSuggestionIndex(selectedIndex);
    setMoveText(options[selectedIndex].text);
    setDuration(options[selectedIndex].durationMinutes);
  }

  return (
    <section id="moves" className="scroll-mt-24 rounded-[1.75rem] border border-violet-200 bg-violet-50 p-6 shadow-sm sm:p-7" aria-labelledby="moves-heading">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">No AI required</p>
      <h2 id="moves-heading" className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Find a local First Move</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <SelectField label="Right now, I am…" value={stuckState} options={STUCK_STATES} onChange={(value) => choose(value as StuckState, direction)} />
        <SelectField label="Direction" value={direction} options={DIRECTIONS} onChange={(value) => choose(stuckState, value as Direction)} />
      </div>
      <label className="mt-5 block text-sm font-semibold" htmlFor="first-move-text">Your small move</label>
      <textarea id="first-move-text" className="mt-2 min-h-24 w-full rounded-2xl border border-violet-200 bg-white p-3 text-sm leading-6 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200" value={moveText} maxLength={160} onChange={(event) => setMoveText(event.target.value)} />
      <p className="mt-2 text-sm text-violet-950/65">Suggested bound: {duration} minutes. Timing is not implemented yet.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700" onClick={() => choose(stuckState, direction, suggestionIndex + 1)}>Another suggestion</button>
        <button type="button" className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700" onClick={() => { setMoveText(""); setDuration(2); }}>Write my own</button>
        <button type="button" disabled={!moveText.trim()} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => onSaveAsTask(moveText.trim(), direction)}>Save as task</button>
      </div>
    </section>
  );
}

function TaskEditor({ tasks, today, update }: { tasks: Task[]; today: string; update: (recipe: (state: AppState) => AppState) => void }) {
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
                      <p className="mt-1 text-xs text-stone-500">{task.direction}</p>
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

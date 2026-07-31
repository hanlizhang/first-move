import type OpenAI from "openai";

import { DIRECTIONS, INTENDED_DURATIONS, type Direction, type IntendedDuration } from "./models.ts";

export const MAX_BRAIN_DUMP_LENGTH = 2_000;

export interface PlannedItem {
  title: string;
  category: Direction;
  durationMinutes: IntendedDuration;
  firstStep: string;
}

export interface DayPlan {
  firstMove: PlannedItem;
  priorityTasks: PlannedItem[];
  optionalTasks: PlannedItem[];
  suggestedCategory: Direction;
  suggestedDuration: IntendedDuration;
}

export type PlanningResult = { outcome: "success"; plan: DayPlan; mode: "mock" | "live" } | { outcome: "failure"; message: string };
type ResponsesClient = Pick<OpenAI["responses"], "create">;

export function planningMode(environment: Record<string, string | undefined>): "mock" | "live" {
  return environment.OPENAI_LIVE_PLANNING === "true" ? "live" : "mock";
}

export async function requestDayPlan(brainDump: string, request: typeof fetch = fetch): Promise<PlanningResult> {
  const text = brainDump.trim();
  if (!text || text.length > MAX_BRAIN_DUMP_LENGTH) return { outcome: "failure", message: "Enter between 1 and 2,000 characters." };
  try {
    const response = await request("/api/organize-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brainDump: text }) });
    const value = await response.json() as unknown;
    if (!response.ok || !isDayPlan(value)) return { outcome: "failure", message: response.status === 503 ? "AI planning is not configured. You can keep planning manually." : "The plan could not be organized. Your text is still here, and manual planning remains available." };
    return { outcome: "success", plan: value, mode: response.headers.get("x-planning-mode") === "live" ? "live" : "mock" };
  } catch {
    return { outcome: "failure", message: "Planning is unavailable. No retry was made; your text is still here." };
  }
}

export async function organizeWithOpenAI(client: ResponsesClient, brainDump: string, model = "gpt-5.6-luna"): Promise<DayPlan> {
  const response = await client.create({
    model,
    store: false,
    reasoning: { effort: "none" },
    max_output_tokens: 800,
    instructions: `Organize only the supplied brain dump into a gentle, editable day plan. Narration order is not priority order. Prioritize explicit deadlines, appointments, external commitments, prerequisites, and high-impact tasks; when those signals are absent, keep items neutral for manual review. Return exactly one smallest concrete First Move, no more than 3 priority tasks, and no more than 3 optional tasks. Use only these categories: ${DIRECTIONS.join(", ")}. Use only 2, 5, 10, or 25 minutes. Every item needs a concrete first physical or visible step. If the user describes low energy, reduce task size and duration instead of removing valid tasks. Treat Rest and Intentional Entertainment as normal valid options. Do not infer private context, invent obligations, or add anything unsupported by the text.`,
    input: [{ role: "user", content: [{ type: "input_text", text: brainDump }] }],
    text: { format: { type: "json_schema", name: "daily_plan", strict: true, schema: dayPlanJsonSchema }, verbosity: "low" },
  });
  return parseDayPlan(response.output_text);
}

export function createMockDayPlan(brainDump: string): DayPlan {
  const seeds = brainDump.split(/\n+|;/).map(cleanText).filter(Boolean).slice(0, 6);
  const titles = seeds.length ? seeds : ["Choose one thing for today"];
  const lowEnergy = /\b(low energy|tired|exhausted|drained|fatigued)\b/i.test(brainDump);
  const ranked = titles.map((title, index) => ({ item: mockItem(title, lowEnergy), index, score: priorityScore(title) }));
  const priorities = ranked.filter(({ score }) => score > 0).sort((left, right) => right.score - left.score || left.index - right.index).slice(0, 3);
  const priorityIndexes = new Set(priorities.map(({ index }) => index));
  const optional = ranked.filter(({ index }) => !priorityIndexes.has(index)).slice(0, 3);
  const startingItem = priorities[0]?.item ?? ranked[0].item;
  return {
    firstMove: { ...startingItem, durationMinutes: 2, firstStep: `Open or place one thing needed for “${shorten(startingItem.title, 80)}”.` },
    priorityTasks: priorities.map(({ item }) => item),
    optionalTasks: optional.map(({ item }) => item),
    suggestedCategory: startingItem.category,
    suggestedDuration: lowEnergy ? 2 : startingItem.durationMinutes,
  };
}

export function parseDayPlan(text: string): DayPlan {
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { throw new Error("Invalid planning response."); }
  if (!isDayPlan(value)) throw new Error("Invalid planning response.");
  return value;
}

export function isDayPlan(value: unknown): value is DayPlan {
  return isRecord(value) && isPlannedItem(value.firstMove) && Array.isArray(value.priorityTasks) && value.priorityTasks.length <= 3 && value.priorityTasks.every(isPlannedItem) && Array.isArray(value.optionalTasks) && value.optionalTasks.length <= 3 && value.optionalTasks.every(isPlannedItem) && isDirection(value.suggestedCategory) && isDuration(value.suggestedDuration);
}

function isPlannedItem(value: unknown): value is PlannedItem {
  return isRecord(value) && validText(value.title) && isDirection(value.category) && isDuration(value.durationMinutes) && validText(value.firstStep);
}

function mockItem(title: string, lowEnergy: boolean): PlannedItem {
  const category = inferCategory(title);
  return { title: shorten(title, 120), category, durationMinutes: lowEnergy ? 2 : category === "Intentional Entertainment" ? 5 : 10, firstStep: lowEnergy ? `Put only one thing needed for “${shorten(title, 80)}” within reach.` : `Prepare the first thing needed for “${shorten(title, 80)}”.` };
}

function priorityScore(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  if (/\b(deadline|due|today|tomorrow|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d|noon|midnight)|at \d{1,2}(?::\d{2})?)\b/.test(lower)) score += 4;
  if (/\b(appointment|meeting|interview|flight|reservation|class|exam|client|doctor|dentist|pickup|pick up|dropoff|drop off)\b/.test(lower)) score += 3;
  if (/\b(blocks?|blocking|prerequisite|before I can|depends? on|required for)\b/.test(lower)) score += 2;
  if (/\b(urgent|critical|important|high[- ]impact|must)\b/.test(lower)) score += 2;
  return score;
}

function inferCategory(text: string): Direction {
  const lower = text.toLowerCase();
  if (/rest|nap|sleep|break|recover/.test(lower)) return "Rest";
  if (/walk|run|exercise|stretch|gym|move/.test(lower)) return "Exercise & Movement";
  if (/watch|game|read for fun|music|movie/.test(lower)) return "Intentional Entertainment";
  if (/work|study|email|report|class|exam|meeting/.test(lower)) return "Work & Study";
  return "Daily Life";
}

function cleanText(value: string): string { return value.trim().replace(/^[-*\d.)\s]+/, "").replace(/\s+/g, " "); }
function shorten(value: string, length: number): string { return value.length > length ? `${value.slice(0, length - 1)}…` : value; }
function validText(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 160; }
function isDirection(value: unknown): value is Direction { return typeof value === "string" && DIRECTIONS.includes(value as Direction); }
function isDuration(value: unknown): value is IntendedDuration { return typeof value === "number" && INTENDED_DURATIONS.includes(value as IntendedDuration); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

const plannedItemSchema = { type: "object", additionalProperties: false, properties: { title: { type: "string", minLength: 1, maxLength: 160 }, category: { type: "string", enum: DIRECTIONS }, durationMinutes: { type: "integer", enum: INTENDED_DURATIONS }, firstStep: { type: "string", minLength: 1, maxLength: 160 } }, required: ["title", "category", "durationMinutes", "firstStep"] };
const dayPlanJsonSchema = { type: "object", additionalProperties: false, properties: { firstMove: plannedItemSchema, priorityTasks: { type: "array", maxItems: 3, items: plannedItemSchema }, optionalTasks: { type: "array", maxItems: 3, items: plannedItemSchema }, suggestedCategory: { type: "string", enum: DIRECTIONS }, suggestedDuration: { type: "integer", enum: INTENDED_DURATIONS } }, required: ["firstMove", "priorityTasks", "optionalTasks", "suggestedCategory", "suggestedDuration"] };

/**
 * the browser-safe surface of @mortal/wall: schema, read models, humanizer
 * and director logic, nothing that touches sqlite or node:crypto. the gate
 * and watch page import from here so both screens cut and caption exactly
 * like the tested pure functions.
 */
export {
  AGENT_CLASSES,
  AGENT_CLASS_DISPLAY,
  AGENT_STATES,
  ACTION_VERBS,
  DEATH_CAUSES,
  MONOLOGUE_MAX_CHARS,
  NARRATION_MAX_CHARS,
  MAX_INHERITED_FRAGMENTS,
  WALL_EVENT_KINDS,
} from "./schema.js";
export type {
  AgentClass,
  AgentState,
  ActionVerb,
  DeathCause,
  PayloadFor,
  WallEvent,
  WallEventInput,
  WallEventKind,
} from "./schema.js";
export { humanizeEvent, humanizeSeconds, shortReceipt } from "./humanize.js";
export {
  PANEL_TAGS,
  agentNow,
  depthScore,
  displayNameFromId,
  nowLine,
  panelEntries,
  recapFallback,
  tagFor,
  tickerLines,
} from "./read.js";
export type { AgentNow, DepthInputs, PanelEntry, PanelTag, TickerLine } from "./read.js";
export {
  DIRECTOR_EVENT_WINDOW_MS,
  SPOTLIGHT_SECONDS,
  directorPick,
  directorScore,
  spotlightAt,
} from "./director.js";
export type { Spotlight } from "./director.js";

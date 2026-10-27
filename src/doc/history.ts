import { UNDO_MAX_BYTES } from "../contracts";
import type { DocEvent } from "../contracts";
import type { Sprite } from "./model";

export interface Command {
  readonly label: string;
  do(sprite: Sprite): DocEvent[];
  undo(sprite: Sprite): DocEvent[];
  byteSize(): number;
}
interface Entry { command: Command; bytes: number }
export interface HistoryOptions { maxBytes?: number }

export class History {
  private readonly maxBytes: number;
  private past: Entry[] = [];
  private future: Entry[] = [];
  private group: { label: string; entries: Entry[] } | null = null;

  constructor({ maxBytes = UNDO_MAX_BYTES }: HistoryOptions = {}) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError("Invalid history budget");
    this.maxBytes = maxBytes;
  }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get undoLabel(): string | undefined { return this.past.at(-1)?.command.label; }
  get redoLabel(): string | undefined { return this.future.at(-1)?.command.label; }
  /** Includes both undo and redo storage, plus any open group. */
  get totalBytes(): number {
    return [...this.past, ...this.future, ...(this.group?.entries ?? [])]
      .reduce((total, entry) => total + entry.bytes, 0);
  }
  execute(sprite: Sprite, cmd: Command): DocEvent[] {
    const events = cmd.do(sprite);
    const bytes = cmd.byteSize();
    this.future = [];
    const entry = { command: cmd, bytes };
    if (this.group) this.group.entries.push(entry);
    else this.past.push(entry);
    this.trim();
    return events;
  }
  undo(sprite: Sprite): DocEvent[] {
    this.requireClosedGroup();
    const entry = this.past.at(-1);
    if (!entry) return [];
    const events = entry.command.undo(sprite);
    this.past.pop(); this.future.push(entry);
    return events;
  }
  redo(sprite: Sprite): DocEvent[] {
    this.requireClosedGroup();
    const entry = this.future.at(-1);
    if (!entry) return [];
    const events = entry.command.do(sprite);
    this.future.pop(); this.past.push(entry);
    return events;
  }
  clear(): void { this.past = []; this.future = []; this.group = null; }
  /** Groups cannot nest; undo/redo are available after endGroup. */
  beginGroup(label: string): void {
    this.requireClosedGroup();
    this.group = { label, entries: [] };
  }
  endGroup(): void {
    if (!this.group) throw new Error("No history group is open");
    const { label, entries } = this.group;
    this.group = null;
    if (entries.length === 0) return;
    const bytes = entries.reduce((total, entry) => total + entry.bytes, 0);
    this.past.push({ bytes, command: {
      label,
      do: sprite => entries.flatMap(entry => entry.command.do(sprite)),
      undo: sprite => [...entries].reverse().flatMap(entry => entry.command.undo(sprite)),
      byteSize: () => bytes,
    } });
    this.trim();
  }
  private requireClosedGroup(): void {
    if (this.group) throw new Error("End the history group first");
  }
  private trim(): void {
    // An open group is the newest step and must remain intact, even over budget.
    const keep = this.group && this.group.entries.length > 0 ? 0 : 1;
    while (this.totalBytes > this.maxBytes && this.past.length > keep) this.past.shift();
  }
}

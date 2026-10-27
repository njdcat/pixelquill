import type { DocEvent } from "../contracts";
import { History } from "./history";
import type { Command } from "./history";
import type { Sprite } from "./model";

export class EditorDocument {
  sprite: Sprite;
  readonly history: History;
  dirty = false;
  private readonly listeners = new Set<(events: readonly DocEvent[]) => void>();

  constructor(sprite: Sprite, history = new History()) { this.sprite = sprite; this.history = history; }
  execute(cmd: Command): void { this.changed(this.history.execute(this.sprite, cmd)); }
  undo(): void {
    if (this.history.canUndo) this.changed(this.history.undo(this.sprite));
  }
  redo(): void {
    if (this.history.canRedo) this.changed(this.history.redo(this.sprite));
  }
  replaceSprite(sprite: Sprite): void {
    this.sprite = sprite; this.history.clear(); this.changed([{ type: "sprite" }]);
  }
  subscribe(listener: (events: readonly DocEvent[]) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  markSaved(): void { this.dirty = false; }
  private changed(events: readonly DocEvent[]): void {
    this.dirty = true;
    for (const listener of [...this.listeners]) listener(events);
  }
}
export type DocumentLike = EditorDocument;

import { createStrokeTool } from "./stroke";
export const pencilTool = createStrokeTool("pencil", "Pencil", ctx => ctx.fg);

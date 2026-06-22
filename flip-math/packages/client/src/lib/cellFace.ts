import type { Cell, Operator } from "@fm/shared";

// 运算符的显示符号(减/乘/除用更清晰的字形)。
const opSym: Record<Operator, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
};

// 一张牌反面的展示文本:数字直接显示,运算符用显示符号。
export function backText(cell: Cell): string {
  return cell.back.kind === "num"
    ? String(cell.back.value)
    : opSym[cell.back.op];
}

import type { Durations } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// 所有可调时长 / 数值集中在此。要调节整局节奏,只改这一个文件。
// ─────────────────────────────────────────────────────────────────────────────

// 引擎/服务器权威时长(毫秒):
//   previewMs  开局预览反面
//   answerMs   单次作答窗口
//   revealMs   回合间记忆翻牌停留
//   resolveMs  选满三张后翻牌停留
//   countdownMs 出题前 3-2-1 倒数
export const DURATIONS: Durations = {
  previewMs: 10_000,
  answerMs: 5_000,
  revealMs: 3_000,
  resolveMs: 1_500,
  countdownMs: 3_000,
};

// 先到此分数者获胜。
export const WIN_SCORE = 10;

// 纯客户端 UI 时长(服务器不使用,仅为集中管理放这里)。
export const UI = {
  resultPopupMs: 1_800, // 回合结果小提示(toast)自动消失
};

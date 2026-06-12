// 師匠ボイスマスタ → CSV（スプシ初期化用の種データ）。
// 使い方: node tools/voice-export.mjs shiyue  → tools/voice/shiyue.csv を書き出す。
// このCSVをそのまま Google スプレッドシート/Excel に取り込めば、現状の文言が表で並ぶ。
import { writeFileSync, mkdirSync } from "node:fs";
import { rowsFromMaster, toCsv } from "./voiceSheet.mjs";

const charId = process.argv[2] || "shiyue";
const rows = rowsFromMaster(charId);
mkdirSync(new URL("./voice/", import.meta.url), { recursive: true });
const path = new URL(`./voice/${charId}.csv`, import.meta.url);
writeFileSync(path, toCsv(rows), "utf8");
console.log(`${charId}: ${rows.length} 行を書き出し → tools/voice/${charId}.csv`);

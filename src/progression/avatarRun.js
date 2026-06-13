// 弟子（アバター）ごとに独立な「進行状態（run）」の同期ヘルパー — セーブ整合性の要。
//
// 既読シナリオ・段位(records)・育成日数(daily) は弟子ごとに独立であるべき（新しい弟子は
// ゼロから／複数弟子はそれぞれ別の物語）。しかし消費側（scenarioService 等多数）は従来どおり
// profile レベルの profile.scenarioProgress / profile.records / profile.daily を読み書きする。
//
// そこで「profile レベル＝アクティブ弟子の作業コピー」とし、保存前に flush（profile→弟子.run）、
// 読込・切替後に hydrate（弟子.run→profile）する。これで消費側を一切変えずに per-disciple を成立。
//
// ※ ソウル(wallet.soul)は弟子ごと（各弟子が自分で稼いで使う育成通貨）＝run に含める（soul だけ
//    特別扱い：wallet 内にあり、同じ wallet の meta はアカウント共通なので wallet 全体ではなく soul のみ移す）。
// ※ アカウント共通＝引継ぎ(wallet.meta)・見た目(unlockedPresetIds)・mentorGrowth（師匠は“人”）・
//    rewardLedger（初回報酬の二重取り防止）は run に含めず profile レベルのまま。
import { activeAvatar } from "./avatarFactory.js";

// dayCount = 育成の経過ターン（1ターン＝ゲーム内ひと月。トップレベルの別フィールド）。
// tournamentRuns = 大会の挑戦履歴。いずれも弟子ごとに独立。
export const RUN_FIELDS = ["scenarioProgress", "records", "daily", "dayCount", "tournamentRuns"];

export function emptyRun() {
  return { scenarioProgress: [], records: {}, daily: {}, dayCount: 1, tournamentRuns: [], soul: 0 };
}

// profile レベルの進行状態 → アクティブ弟子の run へ書き戻す（保存前に呼ぶ）。
export function flushRun(profile) {
  const av = activeAvatar(profile);
  if (!av) return profile; // 弟子未作成なら従来どおり profile レベルを使う
  av.run = av.run || emptyRun();
  for (const f of RUN_FIELDS) av.run[f] = profile[f] ?? emptyRun()[f];
  av.run.soul = profile.wallet?.soul ?? 0; // soul は wallet 内（弟子ごと）。meta はアカウント共通で触らない。
  return profile;
}

// アクティブ弟子の run → profile レベルへ反映（読込・切替後に呼ぶ）。
// run 未作成の旧データは、その時点の profile レベル値を弟子の run として取り込む（=移行）。
export function hydrateRun(profile) {
  const av = activeAvatar(profile);
  if (!av) return profile;
  if (!av.run) {
    av.run = {
      scenarioProgress: profile.scenarioProgress || [],
      records: profile.records || {},
      daily: profile.daily || {},
      dayCount: profile.dayCount ?? 1,
      tournamentRuns: profile.tournamentRuns || [],
      soul: profile.wallet?.soul ?? 0, // 旧データの現ソウルをこの弟子のものとして取り込む
    };
  }
  for (const f of RUN_FIELDS) profile[f] = av.run[f] ?? emptyRun()[f];
  // soul（弟子ごと）を反映。meta 等アカウント共通の wallet フィールドは維持。
  profile.wallet = { ...(profile.wallet || {}), soul: av.run.soul ?? 0 };
  return profile;
}

// 弟子を切り替える: 現アクティブの run を退避 → activeAvatarId 変更 → 新アクティブの run を反映。
export function activateAvatar(profile, avatarId) {
  flushRun(profile);
  profile.activeAvatarId = avatarId;
  hydrateRun(profile);
  return profile;
}

// 修行成果（エピローグ＝九蓮制覇後に表示）— docs/shitei-calendar-and-roguelite.md
// 「エピローグ後『修行成果』（新仕様）」。
//
// 修行完了までの月数・大会優勝数・集めた宝から評価（満貫級〜役満級）を出し、
// 弟子の戦闘ロール（タイプ）を確定する。ロールは [[mahjong-roguelite-mode]] / 修行完了DB(F5)で
// そのまま使う（attacker/blocker/gambler）。評価しきい値はチューニング前提。
import { ROLE_MASTER, CHARACTER_MASTER } from "../data/characterMaster.js";
import { avatarParams6 } from "./avatarFactory.js";
import { PLACE_RANKS } from "../data/tournamentMaster.js";

const roleInfo = (id) => ROLE_MASTER.find((r) => r.id === id) || ROLE_MASTER[0];
const mentorRoleOf = (av) => CHARACTER_MASTER.find((c) => c.id === av?.mentorCharacterId)?.role || null;

// 6パラメータ＋師匠ロール傾斜から弟子の戦闘ロールを確定。
// 「育て方の証」＝伸ばしたステに収束。ベースは師匠タイプ（docs「ほぼ師匠タイプに依存」）。
export function avatarRole(params6 = {}, mentorRole = null) {
  const scores = {
    attacker: (params6.fire || 0) + (params6.speed || 0),
    blocker: (params6.guard || 0) + (params6.mental || 0),
    gambler: (params6.gamble || 0) * 2,
  };
  if (mentorRole && scores[mentorRole] != null) scores[mentorRole] += 8; // 師匠タイプへ寄せる
  let best = "attacker", bv = -Infinity;
  for (const k of ["attacker", "blocker", "gambler"]) if (scores[k] > bv) { bv = scores[k]; best = k; }
  return best;
}

// 修行成果の評価。クリア月数（速さ）を主軸に、満貫級〜役満級（PLACE_RANKS）。
// 九蓮最速 ≈ dayCount 25 前後＝役満級。遅くても満貫級が下限＝失敗しないサクセス。
export function evaluateSuccession(profile, av) {
  const months = profile?.dayCount ?? 1;
  const wins = profile?.records?.tournamentsWon ?? 0;
  const treasures = (profile?.records?.treasures || []).length;
  let rankIdx;
  if (months <= 28) rankIdx = 0;       // 役満級
  else if (months <= 34) rankIdx = 1;  // 倍満級
  else if (months <= 42) rankIdx = 2;  // 跳満級
  else rankIdx = 3;                     // 満貫級
  const role = avatarRole(avatarParams6(av), mentorRoleOf(av));
  const ri = roleInfo(role);
  return { rank: PLACE_RANKS[rankIdx], rankIdx, months, wins, treasures, role, roleLabel: ri.label, roleColor: ri.color };
}

// In-game presentation only: the engine and the existing HP settlement timeline
// remain authoritative. Reuse the actual HP rows, including ghost bars and holds.
const activeRenderers = new WeakMap();

export function setupDuelPresentation(screen, game, humanIndex, renderer, { groupBattle = false } = {}) {
  activeRenderers.set(screen, renderer);
  screen.classList.add("duel");
  screen.classList.toggle("duel-group", groupBattle);
  renderer.seatHud = !groupBattle;
  screen.dataset.players = game.numPlayers;
  const stage = screen.querySelector("#self-stage");
  if (stage && !stage.querySelector(".duel-companion-name")) {
    const label = document.createElement("div");
    label.className = "duel-companion-name";
    stage.appendChild(label);
  }
  // Load locally bundled fonts when the game is entered, then redraw Canvas
  // labels. No third-party font request and no delay of the first playable frame.
  if (typeof document !== "undefined" && document.fonts) {
    Promise.allSettled([
      document.fonts.load('600 16px "Duel Sans"'),
      document.fonts.load('600 24px "Duel Serif"'),
    ]).then(() => { if (activeRenderers.get(screen) === renderer && game.wall && screen.classList.contains("seated")) renderer.render(); });
  }
  syncDuelPresentation(screen, game, humanIndex, renderer);
}

export function syncDuelPresentation(screen, game, humanIndex, renderer) {
  if (!screen?.classList.contains("duel")) return;
  const name = screen.querySelector(".duel-companion-name");
  const human = game.players[humanIndex];
  if (name && name.textContent !== human.character.name) name.textContent = human.character.name;
  const active = human.abilities?.some(a => a.activation === "manual" && a.active);
  screen.classList.toggle("duel-powered", !!active);
  screen.style.setProperty("--duel-power", human.character.color || "#ef765f");
  // Seat state stays close to its HP, and is not dependent on colour alone.
  screen.querySelectorAll(".hp-row[data-seat]").forEach(row => {
    const seat = Number(row.dataset.seat);
    const offset = renderer._seatSlots(game.numPlayers).indexOf(seat);
    const p = game.players[(humanIndex + offset) % game.numPlayers];
    if (!p) return;
    const wind = {27:"東",28:"南",29:"西",30:"北"}[p.seatWind] || "";
    const flags = [wind + (p.isDealer ? "・親" : ""), p.riichi ? "リーチ" : "", p.kita?.length ? `北 ${p.kita.length}` : ""].filter(Boolean);
    row.dataset.state = flags.join("  ");
    const label = row.querySelector(".hp-name");
    const text = renderer.seatLabels?.[p.index] ?? p.character.name;
    if (label && label.textContent !== text) { label.textContent = text; label.title = text; }
  });
}

import { bindHome, money, number, pageShell } from "../ui/components.js";

function placeholder(ctx, config) {
  ctx.screenRoot.innerHTML = pageShell(config);
  bindHome(ctx.screenRoot, ctx.router);
}

export async function renderEvents(ctx) {
  placeholder(ctx, {
    title: "Events",
    eyebrow: "ROTATING CONTENT",
    hint: "Framework placeholder",
    trail: "Daily • weekly • limited-time",
    body: `<div class="card-grid"><article class="game-card"><h3>Daily Sprint</h3><p>Future daily objective with a fixed ruleset, entry requirements and reward table.</p><div class="spec-grid"><div class="spec"><span>Status</span><strong>Coming later</strong></div><div class="spec"><span>Refresh</span><strong>Daily</strong></div></div></article><article class="game-card"><h3>Weekend Ladder</h3><p>Future multi-race event with escalating opponents and leaderboard hooks.</p><div class="spec-grid"><div class="spec"><span>Status</span><strong>Coming later</strong></div><div class="spec"><span>Format</span><strong>Ladder</strong></div></div></article></div>`
  });
}

export async function renderTeams(ctx) {
  placeholder(ctx, {
    title: "Teams",
    eyebrow: "SOCIAL SYSTEMS",
    hint: "Database feature",
    trail: "Create • join • compete",
    body: `<div class="empty-state"><strong>No team yet.</strong><span>Planned: team creation, roles, invitations, shared progression, team events and seasonal records. This stays disabled until real accounts and the database layer are active.</span></div>`
  });
}

export async function renderMultiplayer(ctx) {
  placeholder(ctx, {
    title: "Multiplayer",
    eyebrow: "PLAYER VS PLAYER",
    hint: "Requires real accounts",
    trail: "Challenges • async races • wagers later",
    body: `<div class="empty-state"><strong>Multiplayer is intentionally locked.</strong><span>The rest of Forever Racing can be validated on JSON storage first. PvP will be designed after account security, database transactions and anti-dupe safeguards exist.</span></div>`
  });
}

export async function renderLeaderboards(ctx) {
  const stats = ctx.store.player?.stats || {};
  const races = Number(stats.races || 0);
  const wins = Number(stats.wins || 0);
  const rate = races ? (wins / races) * 100 : 0;
  placeholder(ctx, {
    title: "Leaderboards",
    eyebrow: "RECORDS",
    hint: "Local profile preview",
    trail: "Global boards require database accounts",
    body: `<div class="card-grid"><article class="game-card is-selected"><h3>Admin • Local Record</h3><p>This is your current JSON-backed profile, shown as a preview of the eventual leaderboard row.</p><div class="spec-grid"><div class="spec"><span>Wins</span><strong>${number(wins)}</strong></div><div class="spec"><span>Races</span><strong>${number(races)}</strong></div><div class="spec"><span>Win Rate</span><strong>${number(rate, 1)}%</strong></div><div class="spec"><span>Best RT</span><strong>${stats.bestReaction == null ? "—" : `${number(stats.bestReaction, 3)} s`}</strong></div></div></article><article class="game-card"><h3>Future Boards</h3><p>Overall wins, fastest ET by vehicle/class, event ladders, RogueLike clears, team standings and seasonal snapshots.</p></article></div>`
  });
}

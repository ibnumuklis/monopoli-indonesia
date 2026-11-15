// Persistensi pertandingan: room, sesi, event, dadu, transaksi, giliran, snapshot (untuk pemulihan), dan hasil akhir + hadiah.
import { q, tx, one, many } from '../db/index.js';
import { ownedTiles, netWorth, TILES } from '../../../shared/src/index.js';
import { adjustWallet, addXp, addProgress, bumpLeaderboard, economySettings, grantReward } from './economy.js';

export async function createRoomRow(room) {
  const r = await one(`INSERT INTO game_rooms(code,name,mode,is_private,host_user_id,max_players,settings) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [room.code, room.name, room.mode, room.isPrivate, room.hostId, room.maxPlayers, room.settings]);
  return r.id;
}

export async function updateRoomStatus(roomId, status) {
  const col = status === 'playing' ? ', started_at = now()' : status === 'finished' || status === 'closed' ? ', finished_at = now()' : '';
  await q(`UPDATE game_rooms SET status = $2 ${col} WHERE id = $1`, [roomId, status]);
}

export async function startSession(room, game) {
  const s = await one(`INSERT INTO game_sessions(room_id, mode, state, state_seq, tournament_id, adventure_stage) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [room.dbId, room.mode, snapshotOf(room, game), game.seq, room.tournamentId || null, room.adventureStage || null]);
  let seat = 0;
  for (const p of game.players) {
    await q(`INSERT INTO game_players(session_id,user_id,player_ref,seat,display_name,is_bot,team) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [s.id, p.isBot ? null : p.id, p.id, seat++, p.name, p.isBot, p.team]);
  }
  await updateRoomStatus(room.dbId, 'playing');
  return s.id;
}

/** Snapshot lengkap (termasuk metadata room) agar permainan bisa dipulihkan setelah server restart. */
function snapshotOf(room, game) {
  return {
    game,
    room: {
      code: room.code, name: room.name, mode: room.mode, isPrivate: room.isPrivate, hostId: room.hostId, maxPlayers: room.maxPlayers,
      settings: room.settings, tournamentId: room.tournamentId || null, adventureStage: room.adventureStage || null,
      seats: room.seats.map((s) => ({ userId: s.userId, name: s.name, isBot: s.isBot, botLevel: s.botLevel, character: s.character, pawn: s.pawn, dice: s.dice, team: s.team })),
    },
  };
}

/** Simpan event baru (dadu, transaksi, log, giliran) sejak seq terakhir + snapshot state. */
export async function persistProgress(room, game) {
  if (!room.sessionId) return;
  const lastSeq = room.persistedSeq || 0;
  const lastTx = room.persistedTx || 0;
  const evs = game.log.filter((e) => e.seq > lastSeq);
  const txs = game.transactions.filter((t) => t.n > lastTx);
  if (!evs.length && !txs.length) return;
  await tx(async (c) => {
    for (const e of evs) {
      const { seq, t, type, text, ...data } = e;
      await c.query(`INSERT INTO game_events(session_id,seq,type,text,data,created_at) VALUES ($1,$2,$3,$4,$5,to_timestamp($6/1000.0)) ON CONFLICT DO NOTHING`,
        [room.sessionId, seq, type, text, data, t]);
      if (type === 'roll' && data.dice) {
        await c.query(`INSERT INTO dice_rolls(session_id,player_ref,d1,d2,round,created_at) VALUES ($1,$2,$3,$4,$5,to_timestamp($6/1000.0))`,
          [room.sessionId, data.player, data.dice[0], data.dice[1], game.round, t]);
      }
      if (type === 'turn') {
        await c.query(`INSERT INTO game_turns(session_id,turn_no,round,player_ref,started_at) VALUES ($1,$2,$3,$4,to_timestamp($5/1000.0)) ON CONFLICT DO NOTHING`,
          [room.sessionId, seq, game.round, data.player, t]);
      }
    }
    for (const t of txs) {
      await c.query(`INSERT INTO game_transactions(session_id,seq,from_ref,to_ref,amount,reason,created_at) VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0)) ON CONFLICT DO NOTHING`,
        [room.sessionId, t.n, t.from, t.to, t.amount, t.reason, t.t]);
    }
    await c.query(`UPDATE game_sessions SET state = $2, state_seq = $3 WHERE id = $1`, [room.sessionId, snapshotOf(room, game), game.seq]);
  });
  room.persistedSeq = game.seq;
  room.persistedTx = game.txSeq;
}

export async function loadActiveSessions() {
  return many(`SELECT s.id, s.room_id, s.state FROM game_sessions s WHERE s.status = 'playing' AND s.state IS NOT NULL`);
}

export async function abortSession(sessionId) {
  await q(`UPDATE game_sessions SET status='aborted', finished_at=now() WHERE id=$1`, [sessionId]);
}

function checkAdventure(stage, game, pid, won) {
  if (!stage || !won) return 0;
  const o = stage.objective || {};
  const tiles = ownedTiles(game, pid);
  let okObj = true;
  if (o.kind === 'win_own_group') okObj = TILES.filter((t) => t.group === o.group).every((t) => tiles.includes(t.i));
  if (o.kind === 'win_worth') okObj = netWorth(game, pid) >= o.worth || (game.ranking.find((r) => r.id === pid)?.netWorth || 0) >= o.worth;
  if (o.kind === 'win_hotels') okObj = tiles.filter((i) => game.props[i].houses === 5).length >= o.hotels;
  if (!okObj) return 0;
  return game.round <= 35 ? 3 : game.round <= 60 ? 2 : 1;
}

/**
 * Finalisasi: tulis hasil, kepemilikan akhir, lalu hadiah untuk setiap pemain manusia.
 * Mengembalikan ringkasan hadiah per pemain untuk ditampilkan di layar hasil.
 */
export async function finalizeMatch(room, game) {
  if (!room.sessionId || room.finalized) return {};
  room.finalized = true;
  await persistProgress(room, game).catch((e) => console.error('[match] persist', e.message));
  const eco = await economySettings({ query: (t, p) => q(t, p) });
  const duration = Math.round((game.finishedAt - game.startedAt) / 1000);
  const ranked = ['classic', 'team', 'tournament'].includes(room.mode) && !room.isPracticeLike;
  const humans = game.players.filter((p) => !p.isBot);
  const tooShort = game.turnCount < 8; // mencegah farming hadiah dengan mengakhiri permainan secepatnya
  const stage = room.adventureStage ? await one(`SELECT * FROM adventure_stages WHERE id=$1`, [room.adventureStage]) : null;
  const summary = {};

  await tx(async (c) => {
    const winnerIsUser = game.winner && humans.some((h) => h.id === game.winner);
    await c.query(`UPDATE game_sessions SET status='finished', finished_at=now(), winner_user_id=$2, winner_team=$3, end_reason=$4, duration_sec=$5, rounds=$6, state=$7 WHERE id=$1`,
      [room.sessionId, winnerIsUser ? game.winner : null, game.winnerTeam, game.endReason, duration, game.round, snapshotOf(room, game)]);
    await c.query(`UPDATE game_rooms SET status='finished', finished_at=now() WHERE id=$1`, [room.dbId]);
    for (const [i, s] of Object.entries(game.props)) {
      if (!s.owner) continue;
      const owner = game.players.find((p) => p.id === s.owner);
      await c.query(`INSERT INTO player_properties(session_id,property_id,owner_ref,user_id,houses,mortgaged) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [room.sessionId, Number(i), s.owner, owner && !owner.isBot ? owner.id : null, s.houses, s.mortgaged]);
    }
    for (const r of game.ranking) {
      const p = game.players.find((x) => x.id === r.id);
      const won = game.mode === 'team' ? r.team === game.winnerTeam : r.id === game.winner;
      let coins = 0; let xp = 0; let rp = 0;
      if (!p.isBot && !tooShort) {
        const place = r.place;
        coins = (eco.placeCoins || [500, 250, 150, 100])[place - 1] || 100;
        if (won) coins += eco.winCoins || 0;
        xp = (eco.playXp || 60) + (won ? eco.winXp || 120 : 0);
        if (room.mode === 'practice' || room.mode === 'adventure') { coins = Math.round(coins / 2); xp = Math.round(xp / 2); }
        if (ranked) {
          const n = game.players.length;
          rp = won ? (eco.winRp || 25) : Math.round((eco.lossRp || -12) * (place - 1) / Math.max(1, n - 1));
        }
      }
      await c.query(`UPDATE game_players SET final_place=$3, final_networth=$4, final_cash=$5, properties_count=$6, buildings_count=$7, rent_received=$8, rank_points_delta=$9, coins_reward=$10, xp_reward=$11
                     WHERE session_id=$1 AND player_ref=$2`,
        [room.sessionId, r.id, r.place, r.netWorth, r.cash, r.properties, r.buildings, r.rentReceived, rp, coins, xp]);
      if (p.isBot) continue;
      const userId = p.id;
      const out = { place: r.place, won, coins, xp, rp, tooShort };
      if (!tooShort) {
        await c.query(`UPDATE player_profiles SET games_played = games_played + 1, wins = wins + $2, losses = losses + $3, total_rent = total_rent + $4,
                         best_networth = GREATEST(best_networth, $5), rank_points = GREATEST(rank_points + $6, 0), updated_at = now() WHERE user_id = $1`,
          [userId, won ? 1 : 0, won ? 0 : 1, r.rentReceived, r.netWorth, rp]);
        if (rp) await c.query(`INSERT INTO wallet_transactions(user_id,currency,amount,balance_after,reason,ref) SELECT $1,'rank_points',$2,rank_points,'Hasil pertandingan',$3 FROM player_profiles WHERE user_id=$1`, [userId, rp, room.sessionId]);
        await adjustWallet(c, userId, 'coins', coins, 'Hadiah pertandingan', room.sessionId, `match:${room.sessionId}:${userId}:coins`);
        out.level = await addXp(c, userId, xp, 'Hadiah pertandingan');
        const hotels = ownedTiles(game, userId).filter((i) => game.props[i].houses === 5).length;
        await addProgress(c, userId, {
          games: 1, wins: won ? 1 : 0, bought: p.stats.bought, built: p.stats.built, hotels,
          rent_million: Math.floor(p.stats.rentReceived / 1_000_000), own_jakarta: ownedTiles(game, userId).includes(39) ? 1 : 0,
        });
        await bumpLeaderboard(c, userId, Math.max(rp, 0) + (won ? 10 : 2), won);
        const gm = (await c.query(`SELECT guild_id FROM guild_members WHERE user_id=$1`, [userId])).rows[0];
        if (gm) await c.query(`UPDATE guilds SET points = points + $2 WHERE id = $1`, [gm.guild_id, won ? 10 : 2]);
        if (room.tournamentId) {
          const pts = won ? 3 : r.place === 2 ? 1 : 0;
          await c.query(`UPDATE tournament_entries SET points = points + $3, games = games + 1, wins = wins + $4 WHERE tournament_id=$1 AND user_id=$2`, [room.tournamentId, userId, pts, won ? 1 : 0]);
          out.tournamentPoints = pts;
        }
        if (stage) {
          const stars = checkAdventure(stage, game, userId, won);
          if (stars) {
            const prev = (await c.query(`SELECT stars, completed_at FROM adventure_progress WHERE user_id=$1 AND stage_id=$2`, [userId, stage.id])).rows[0];
            await c.query(`INSERT INTO adventure_progress(user_id,stage_id,stars,completed_at) VALUES ($1,$2,$3,now())
                           ON CONFLICT (user_id,stage_id) DO UPDATE SET stars = GREATEST(adventure_progress.stars, $3), completed_at = COALESCE(adventure_progress.completed_at, now())`, [userId, stage.id, stars]);
            if (!prev?.completed_at) {
              out.stageReward = await grantReward(c, userId, { coins: stage.reward_coins, xp: stage.reward_xp, item: stage.reward_item }, `Adventure: ${stage.title}`, stage.id, `adv:${userId}:${stage.id}`);
            }
            out.stars = stars;
          } else out.stars = 0;
        }
      }
      summary[userId] = out;
    }
  });
  return summary;
}

export async function matchHistory(userId, limit = 20) {
  return many(`SELECT s.id, s.mode, s.started_at, s.finished_at, s.duration_sec, s.rounds, s.end_reason, gp.final_place, gp.final_networth, gp.coins_reward, gp.xp_reward, gp.rank_points_delta,
                      (SELECT count(*) FROM game_players x WHERE x.session_id = s.id)::int AS players
                 FROM game_players gp JOIN game_sessions s ON s.id = gp.session_id
                WHERE gp.user_id = $1 AND s.status = 'finished' ORDER BY s.finished_at DESC LIMIT $2`, [userId, limit]);
}

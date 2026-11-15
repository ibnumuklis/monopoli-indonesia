-- Monopoli Indonesia — skema database PostgreSQL (kompatibel Supabase)
-- Server game terhubung dengan role service (melewati RLS). RLS diaktifkan untuk melindungi
-- akses langsung dari klien Supabase (anon/authenticated).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================ AKUN
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username        text NOT NULL,
  email           text,
  password_hash   text,
  auth_provider   text NOT NULL DEFAULT 'local' CHECK (auth_provider IN ('local','guest','supabase')),
  supabase_uid    uuid UNIQUE,
  is_banned       boolean NOT NULL DEFAULT false,
  ban_reason      text,
  muted_until     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_login_at   timestamptz,
  last_seen_at    timestamptz,
  CONSTRAINT username_format CHECK (username ~ '^[A-Za-z0-9_\.]{3,20}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_created_at ON users (created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked     boolean NOT NULL DEFAULT false,
  ip          text,
  user_agent  text
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

-- ============================================================ GUILD
CREATE TABLE IF NOT EXISTS guilds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  tag         text NOT NULL CHECK (char_length(tag) BETWEEN 2 AND 5),
  description text NOT NULL DEFAULT '',
  owner_id    uuid NOT NULL REFERENCES users(id),
  points      integer NOT NULL DEFAULT 0,
  max_members integer NOT NULL DEFAULT 30,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS guilds_name_lower ON guilds (lower(name));

CREATE TABLE IF NOT EXISTS guild_members (
  guild_id  uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','officer','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS guild_members_one_guild ON guild_members (user_id);

-- ============================================================ PROFIL & DOMPET
CREATE TABLE IF NOT EXISTS player_profiles (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name       text NOT NULL,
  title              text NOT NULL DEFAULT 'Pengusaha Pemula',
  bio                text NOT NULL DEFAULT '',
  level              integer NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp                 integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  rank_points        integer NOT NULL DEFAULT 1000 CHECK (rank_points >= 0),
  games_played       integer NOT NULL DEFAULT 0,
  wins               integer NOT NULL DEFAULT 0,
  losses             integer NOT NULL DEFAULT 0,
  total_rent         bigint  NOT NULL DEFAULT 0,
  best_networth      bigint  NOT NULL DEFAULT 0,
  selected_character text NOT NULL DEFAULT 'bima',
  selected_pawn      text NOT NULL DEFAULT 'pawn_classic',
  selected_dice      text NOT NULL DEFAULT 'dice_classic',
  selected_emotes    text[] NOT NULL DEFAULT ARRAY['emote_senyum','emote_mantap','emote_wkwk','emote_semangat'],
  settings           jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_daily_claim   date,
  login_streak       integer NOT NULL DEFAULT 0,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profiles_rank ON player_profiles (rank_points DESC);

CREATE TABLE IF NOT EXISTS player_wallets (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  coins      bigint  NOT NULL DEFAULT 0 CHECK (coins >= 0),
  diamonds   bigint  NOT NULL DEFAULT 0 CHECK (diamonds >= 0),
  tickets    integer NOT NULL DEFAULT 0 CHECK (tickets >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Buku besar semua transaksi mata uang virtual (dapat diaudit)
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency        text NOT NULL CHECK (currency IN ('coins','diamonds','tickets','xp','rank_points')),
  amount          bigint NOT NULL,
  balance_after   bigint NOT NULL,
  reason          text NOT NULL,
  ref             text,
  idempotency_key text UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_tx_user ON wallet_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_tx_created ON wallet_transactions (created_at);

-- ============================================================ KATALOG: KARAKTER, SKIN, ITEM
CREATE TABLE IF NOT EXISTS characters (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  region         text NOT NULL,
  gender         text NOT NULL CHECK (gender IN ('pria','wanita')),
  outfit         text NOT NULL,
  description    text NOT NULL,
  rarity         text NOT NULL DEFAULT 'biasa' CHECK (rarity IN ('biasa','langka','epik','legenda')),
  unlock_type    text NOT NULL DEFAULT 'free' CHECK (unlock_type IN ('free','shop','mission','event','adventure')),
  price_coins    integer NOT NULL DEFAULT 0 CHECK (price_coins >= 0),
  price_diamonds integer NOT NULL DEFAULT 0 CHECK (price_diamonds >= 0),
  palette        jsonb NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS character_skins (
  id             text PRIMARY KEY,
  kind           text NOT NULL CHECK (kind IN ('outfit','pawn','dice','emote','frame')),
  character_id   text REFERENCES characters(id),
  name           text NOT NULL,
  description    text NOT NULL DEFAULT '',
  rarity         text NOT NULL DEFAULT 'biasa',
  unlock_type    text NOT NULL DEFAULT 'shop' CHECK (unlock_type IN ('free','shop','mission','event','adventure')),
  price_coins    integer NOT NULL DEFAULT 0 CHECK (price_coins >= 0),
  price_diamonds integer NOT NULL DEFAULT 0 CHECK (price_diamonds >= 0),
  data           jsonb NOT NULL DEFAULT '{}'::jsonb,
  active         boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_inventory (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_kind   text NOT NULL CHECK (item_kind IN ('character','outfit','pawn','dice','emote','frame')),
  item_id     text NOT NULL,
  source      text NOT NULL DEFAULT 'shop',
  acquired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_kind, item_id)
);

-- ============================================================ DATA PAPAN & KARTU
CREATE TABLE IF NOT EXISTS property_groups (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  color       text NOT NULL,
  house_price integer NOT NULL CHECK (house_price > 0)
);

CREATE TABLE IF NOT EXISTS properties (
  id         integer PRIMARY KEY CHECK (id BETWEEN 0 AND 39),
  name       text NOT NULL,
  type       text NOT NULL CHECK (type IN ('start','property','transport','utility','chance','chest','budaya','tax','jail','parking','gotojail')),
  group_id   text REFERENCES property_groups(id),
  price      integer CHECK (price IS NULL OR price > 0),
  rent       integer[],
  mortgage   integer,
  tax_amount integer,
  region     text,
  landmark   text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS card_decks (
  id   text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS game_cards (
  id         text PRIMARY KEY,
  deck_id    text NOT NULL REFERENCES card_decks(id),
  title      text NOT NULL,
  body       text NOT NULL,
  effect     jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================ PERMAINAN
CREATE TABLE IF NOT EXISTS game_rooms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL,
  name         text NOT NULL,
  mode         text NOT NULL CHECK (mode IN ('classic','team','practice','tournament','adventure')),
  is_private   boolean NOT NULL DEFAULT false,
  host_user_id uuid REFERENCES users(id),
  status       text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','playing','finished','closed')),
  max_players  integer NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 2 AND 4),
  settings     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
CREATE INDEX IF NOT EXISTS rooms_code ON game_rooms (code);
CREATE INDEX IF NOT EXISTS rooms_status ON game_rooms (status, created_at DESC);

CREATE TABLE IF NOT EXISTS game_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  mode           text NOT NULL,
  status         text NOT NULL DEFAULT 'playing' CHECK (status IN ('playing','finished','aborted')),
  state          jsonb,             -- snapshot terakhir untuk pemulihan saat server restart
  state_seq      integer NOT NULL DEFAULT 0,
  tournament_id  uuid,
  adventure_stage text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  winner_user_id uuid REFERENCES users(id),
  winner_team    text,
  end_reason     text,
  duration_sec   integer,
  rounds         integer
);
CREATE INDEX IF NOT EXISTS sessions_status ON game_sessions (status);
CREATE INDEX IF NOT EXISTS sessions_started ON game_sessions (started_at DESC);

CREATE TABLE IF NOT EXISTS game_players (
  id                bigserial PRIMARY KEY,
  session_id        uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES users(id),
  player_ref        text NOT NULL,
  seat              integer NOT NULL CHECK (seat BETWEEN 0 AND 3),
  display_name      text NOT NULL,
  is_bot            boolean NOT NULL DEFAULT false,
  team              text,
  final_place       integer,
  final_networth    bigint,
  final_cash        bigint,
  properties_count  integer,
  buildings_count   integer,
  rent_received     bigint,
  rank_points_delta integer,
  coins_reward      integer,
  xp_reward         integer,
  UNIQUE (session_id, seat)
);
CREATE INDEX IF NOT EXISTS game_players_user ON game_players (user_id);

CREATE TABLE IF NOT EXISTS game_turns (
  id         bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  turn_no    integer NOT NULL,
  round      integer NOT NULL,
  player_ref text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, turn_no)
);

CREATE TABLE IF NOT EXISTS dice_rolls (
  id         bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_ref text NOT NULL,
  d1         smallint NOT NULL CHECK (d1 BETWEEN 1 AND 6),
  d2         smallint NOT NULL CHECK (d2 BETWEEN 1 AND 6),
  round      integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dice_session ON dice_rolls (session_id);

CREATE TABLE IF NOT EXISTS game_transactions (
  id         bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  seq        integer NOT NULL,
  from_ref   text NOT NULL,
  to_ref     text NOT NULL,
  amount     bigint NOT NULL CHECK (amount >= 0),
  reason     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, seq)
);

CREATE TABLE IF NOT EXISTS game_events (
  id         bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  seq        integer NOT NULL,
  type       text NOT NULL,
  text       text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, seq)
);

-- Kepemilikan properti final per sesi (untuk riwayat & statistik)
CREATE TABLE IF NOT EXISTS player_properties (
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  property_id integer NOT NULL REFERENCES properties(id),
  owner_ref  text NOT NULL,
  user_id    uuid REFERENCES users(id),
  houses     smallint NOT NULL DEFAULT 0 CHECK (houses BETWEEN 0 AND 5),
  mortgaged  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (session_id, property_id)
);

-- ============================================================ MISI, ACHIEVEMENT, EVENT
CREATE TABLE IF NOT EXISTS live_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text NOT NULL,
  color       text NOT NULL DEFAULT '#e23b3b',
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS missions (
  id              text PRIMARY KEY,
  kind            text NOT NULL CHECK (kind IN ('daily','weekly','event')),
  event_id        uuid REFERENCES live_events(id) ON DELETE CASCADE,
  title           text NOT NULL,
  metric          text NOT NULL,
  target          integer NOT NULL CHECK (target > 0),
  reward_coins    integer NOT NULL DEFAULT 0,
  reward_diamonds integer NOT NULL DEFAULT 0,
  reward_xp       integer NOT NULL DEFAULT 0,
  reward_tickets  integer NOT NULL DEFAULT 0,
  reward_item     text,
  active          boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_missions (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id text NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  progress   integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  PRIMARY KEY (user_id, mission_id, period_key)
);

CREATE TABLE IF NOT EXISTS achievements (
  id              text PRIMARY KEY,
  title           text NOT NULL,
  description     text NOT NULL,
  metric          text NOT NULL,
  target          integer NOT NULL,
  reward_coins    integer NOT NULL DEFAULT 0,
  reward_diamonds integer NOT NULL DEFAULT 0,
  reward_item     text,
  sort_order      integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_achievements (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  progress       integer NOT NULL DEFAULT 0,
  unlocked_at    timestamptz,
  claimed_at     timestamptz,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS adventure_stages (
  id          text PRIMARY KEY,
  region      text NOT NULL,
  stage_no    integer NOT NULL,
  title       text NOT NULL,
  description text NOT NULL,
  objective   jsonb NOT NULL,
  bots        integer NOT NULL DEFAULT 2,
  bot_level   text NOT NULL DEFAULT 'normal',
  reward_coins integer NOT NULL DEFAULT 0,
  reward_xp    integer NOT NULL DEFAULT 0,
  reward_item  text,
  sort_order   integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS adventure_progress (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage_id     text NOT NULL REFERENCES adventure_stages(id),
  stars        integer NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  completed_at timestamptz,
  PRIMARY KEY (user_id, stage_id)
);

-- ============================================================ SOSIAL
CREATE TABLE IF NOT EXISTS friendships (
  id           bigserial PRIMARY KEY,
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

CREATE TABLE IF NOT EXISTS blocks (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         bigserial PRIMARY KEY,
  channel    text NOT NULL CHECK (channel IN ('room','dm','guild','global')),
  channel_id text NOT NULL,
  sender_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  sender_name text NOT NULL,
  body       text NOT NULL,
  flagged    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_channel ON chat_messages (channel, channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_flagged ON chat_messages (flagged) WHERE flagged;

CREATE TABLE IF NOT EXISTS inbox_messages (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'system' CHECK (kind IN ('system','reward','invite','friend','tournament','admin')),
  title      text NOT NULL,
  body       text NOT NULL,
  reward     jsonb,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at    timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbox_user ON inbox_messages (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS player_reports (
  id          bigserial PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      text NOT NULL CHECK (reason IN ('spam','toxic','cheat','nama_tidak_pantas','lainnya')),
  detail      text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  handled_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  handled_at  timestamptz
);

-- ============================================================ KOMPETISI
CREATE TABLE IF NOT EXISTS tournaments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  description    text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('upcoming','open','finished','cancelled')),
  entry_tickets  integer NOT NULL DEFAULT 1 CHECK (entry_tickets >= 0),
  prize_coins    integer[] NOT NULL DEFAULT ARRAY[5000,2500,1000],
  prize_diamonds integer[] NOT NULL DEFAULT ARRAY[100,50,20],
  starts_at      timestamptz NOT NULL DEFAULT now(),
  ends_at        timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournament_entries (
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points        integer NOT NULL DEFAULT 0,
  games         integer NOT NULL DEFAULT 0,
  wins          integer NOT NULL DEFAULT 0,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period     text NOT NULL CHECK (period IN ('daily','weekly','monthly','season','all')),
  period_key text NOT NULL,
  points     integer NOT NULL DEFAULT 0,
  wins       integer NOT NULL DEFAULT 0,
  games      integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period, period_key)
);
CREATE INDEX IF NOT EXISTS lb_rank ON leaderboard_entries (period, period_key, points DESC);

-- ============================================================ ADMIN
CREATE TABLE IF NOT EXISTS admin_users (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('super_admin','admin','moderator','support')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id            bigserial PRIMARY KEY,
  admin_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  admin_name    text NOT NULL,
  role          text NOT NULL,
  action        text NOT NULL,
  target_type   text,
  target_id     text,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created ON admin_audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS system_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================ ROW LEVEL SECURITY
-- Semua tabel dikunci. Server (service role / koneksi langsung) melewati RLS.
-- Kebijakan baca-milik-sendiri disediakan untuk klien Supabase yang terautentikasi.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','sessions','guilds','guild_members','player_profiles','player_wallets','wallet_transactions',
    'characters','character_skins','player_inventory','property_groups','properties','card_decks','game_cards','game_rooms',
    'game_sessions','game_players','game_turns','dice_rolls','game_transactions','game_events','player_properties','live_events',
    'missions','player_missions','achievements','player_achievements','adventure_stages','adventure_progress','friendships','blocks',
    'chat_messages','inbox_messages','player_reports','tournaments','tournament_entries','leaderboard_entries','admin_users',
    'admin_audit_logs','system_settings']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Fungsi auth.uid() hanya ada di Supabase; kebijakan dibuat kondisional.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'DROP POLICY IF EXISTS own_profile_read ON player_profiles';
    EXECUTE 'CREATE POLICY own_profile_read ON player_profiles FOR SELECT TO authenticated USING (user_id IN (SELECT id FROM users WHERE supabase_uid = auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS own_wallet_read ON player_wallets';
    EXECUTE 'CREATE POLICY own_wallet_read ON player_wallets FOR SELECT TO authenticated USING (user_id IN (SELECT id FROM users WHERE supabase_uid = auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS catalog_read_chars ON characters';
    EXECUTE 'CREATE POLICY catalog_read_chars ON characters FOR SELECT TO anon, authenticated USING (active)';
    EXECUTE 'DROP POLICY IF EXISTS catalog_read_props ON properties';
    EXECUTE 'CREATE POLICY catalog_read_props ON properties FOR SELECT TO anon, authenticated USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS lb_read ON leaderboard_entries';
    EXECUTE 'CREATE POLICY lb_read ON leaderboard_entries FOR SELECT TO anon, authenticated USING (true)';
  END IF;
END $$;

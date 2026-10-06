-- iPhone SMS auto-capture keys.
--
-- iOS gives apps no SMS access, but a Shortcuts "Message" automation can POST
-- the text of a matching bank SMS to /api/shortcut/sms. The shortcut
-- authenticates with a per-user key the user pastes into it once.
--
-- Only a SHA-256 hash of the key is stored; the plaintext is shown once at
-- creation. The key is write-only by design: the endpoint can add a pending
-- transaction for its owner and nothing else.

create table if not exists public.shortcut_keys (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  key_hash        text        not null unique,
  -- First characters of the plaintext, so the UI can show which key is active.
  key_prefix      text        not null,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  last_capture_at timestamptz,
  revoked_at      timestamptz
);

alter table public.shortcut_keys enable row level security;
-- Deliberately no policies: service-role only, like `founding_members`. The
-- key server actions and the shortcut endpoint are the only readers/writers.

-- At most one live key per user; creating a new one revokes the old.
create unique index if not exists shortcut_keys_one_active_per_user
  on public.shortcut_keys (user_id)
  where revoked_at is null;

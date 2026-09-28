CREATE TABLE users (
 id BIGSERIAL PRIMARY KEY,
 phone_number TEXT NOT NULL UNIQUE,
 email_address TEXT NOT NULL UNIQUE,
 display_name TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE dev_otps (
 phone_number TEXT PRIMARY KEY,
 code_hash TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE messages (
 id UUID PRIMARY KEY,
 sender_user_id BIGINT REFERENCES users(id),
 sender_address TEXT NOT NULL,
 sender_name TEXT,
 subject TEXT NOT NULL DEFAULT '',
 body_text TEXT NOT NULL DEFAULT '',
 body_html TEXT,
 message_id TEXT NOT NULL UNIQUE,
 in_reply_to TEXT,
 thread_id UUID NOT NULL,
 external_message_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 sent_at TIMESTAMPTZ
);
CREATE TABLE message_recipients (
 id BIGSERIAL PRIMARY KEY,
 message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 address TEXT NOT NULL,
 recipient_user_id BIGINT REFERENCES users(id),
 UNIQUE(message_id,address)
);
CREATE TABLE mailbox_entries (
 id BIGSERIAL PRIMARY KEY,
 message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 owner_user_id BIGINT NOT NULL REFERENCES users(id),
 folder TEXT NOT NULL CHECK(folder IN ('INBOX','SENT','DRAFTS','TRASH')),
 is_read BOOLEAN NOT NULL DEFAULT false,
 received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 deleted_at TIMESTAMPTZ,
 UNIQUE(message_id,owner_user_id,folder)
);
CREATE INDEX mailbox_owner_folder ON mailbox_entries(owner_user_id,folder,received_at DESC);
CREATE TABLE inbound_receipts (
 external_message_id TEXT NOT NULL,
 recipient_user_id BIGINT NOT NULL REFERENCES users(id),
 PRIMARY KEY(external_message_id,recipient_user_id)
);
CREATE TABLE mail_outbox (
 id BIGSERIAL PRIMARY KEY,
 message_id UUID NOT NULL REFERENCES messages(id),
 recipient TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','failed')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 last_error TEXT,
 UNIQUE(message_id,recipient)
);

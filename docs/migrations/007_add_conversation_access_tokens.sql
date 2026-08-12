-- Protect anonymous conversations with a bearer capability token.
-- Existing conversations are deliberately assigned fresh random hashes,
-- which invalidates old unauthenticated conversation access.
ALTER TABLE conversations
    ADD COLUMN access_token_hash CHAR(64) NULL;

UPDATE conversations
SET access_token_hash = SHA2(UUID(), 256)
WHERE access_token_hash IS NULL;

ALTER TABLE conversations
    MODIFY COLUMN access_token_hash CHAR(64) NOT NULL;

CREATE INDEX idx_conversations_access_token_hash
    ON conversations (access_token_hash);
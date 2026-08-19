-- ============================================================
-- Sikkim Tourism Assistant — MySQL Schema
-- ============================================================
-- Run this against the department's MySQL database before
-- starting the app — MySQL is the only supported backend.
--
-- Notes:
--   • Conversations/messages are managed by the app; the
--     department's existing tables do not need to be modified.
--   • Adjust column sizes / charsets to match the existing DB
--     encoding (usually utf8mb4).
-- ============================================================

CREATE DATABASE IF NOT EXISTS sikkim_tourism
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sikkim_tourism;

-- ── Destinations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS destinations (
                                            id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
                                            name            VARCHAR(200)     NOT NULL,
    slug            VARCHAR(200)     NOT NULL UNIQUE,
    category        ENUM('nature','culture','adventure','pilgrimage','wildlife') NOT NULL,
    description     TEXT             NOT NULL,
    location        VARCHAR(300)     NOT NULL,
    district        VARCHAR(100)     NOT NULL,
    altitude        VARCHAR(100)     NULL,
    best_time       VARCHAR(200)     NOT NULL,
    entry_fee       VARCHAR(100)     NULL,
    permit_required TINYINT(1)       NOT NULL DEFAULT 0,
    permit_info     TEXT             NULL,
    how_to_reach    TEXT             NOT NULL,
    highlights      JSON             NOT NULL DEFAULT ('[]'),
    tags            JSON             NOT NULL DEFAULT ('[]'),
    image_placeholder VARCHAR(20)    NOT NULL DEFAULT '#888888',
    image_url       VARCHAR(300)     NULL,
    latitude        DECIMAL(9,6)     NULL,
    longitude       DECIMAL(9,6)     NULL,
    created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FULLTEXT KEY ft_destinations (name, description)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Conversations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
                                             id                CHAR(36)   NOT NULL,
    access_token_hash CHAR(64)   NOT NULL,
    created_at        DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_conversations_access_token_hash (access_token_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Messages ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
                                        id              CHAR(36)                    NOT NULL,
    conversation_id CHAR(36)                    NOT NULL,
    role            ENUM('user','assistant')    NOT NULL,
    content         LONGTEXT                    NOT NULL,
    client_message_id VARCHAR(64)              NULL,
    created_at      DATETIME                    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_messages_conversation (conversation_id),
    UNIQUE KEY uq_messages_client_id (conversation_id, client_message_id),
    CONSTRAINT fk_messages_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Circulars ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS circulars (
                                         id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
                                         title           VARCHAR(300)  NOT NULL,
    category        ENUM('road_status', 'cancellation_order', 'tender') NOT NULL,
    district        VARCHAR(100)  NULL,
    issue_date      DATE          NOT NULL,
    source_url      VARCHAR(500)  NOT NULL,
    pdf_hash        CHAR(64)      NOT NULL,
    extracted_text  LONGTEXT      NOT NULL,
    ingested_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    file_content    LONGBLOB      NULL,
    file_mime_type  VARCHAR(100)  NULL,
    file_name       VARCHAR(255)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_circulars_pdf_hash (pdf_hash),
    INDEX idx_circulars_category_date (category, issue_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Administrator accounts ────────────────────────────────────────────────────
-- New installations must include this table; migration 004 remains for existing
-- databases created before password-based admin access was introduced.
CREATE TABLE IF NOT EXISTS admin_users (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username      VARCHAR(64)  NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admin_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Travel Agencies ───────────────────────────────────────────────────────────
-- See docs/migrations/005_add_travel_agencies_table.sql for notes.
-- ── Travel Agencies ───────────────────────────────────────────────────────────
-- See docs/migrations/005_add_travel_agencies_table.sql for notes.
CREATE TABLE IF NOT EXISTS travel_agencies (
                                               id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
                                               name                VARCHAR(300)  NOT NULL,
    registration_number VARCHAR(100)  NOT NULL,
    proprietor          VARCHAR(200)  NULL,
    address             VARCHAR(500)  NULL,
    district            VARCHAR(100)  NULL,
    grade               VARCHAR(20)   NULL,
    contact             VARCHAR(200)  NULL,
    email_or_website    VARCHAR(300)  NULL,
    date_of_issue       VARCHAR(50)   NULL,
    renewed_upto        VARCHAR(50)   NULL,
    synced_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_travel_agencies_registration_number (registration_number),
    INDEX idx_travel_agencies_district (district),
    FULLTEXT KEY ft_travel_agencies (name, proprietor)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Adds the Tender category and retains original admin-uploaded road reports
-- so public visitors can preview or download the file.
USE sikkim_tourism;

-- The public UI now has dedicated Cancellation Orders and Tenders lists;
-- migrate legacy generic notices into the former bucket before narrowing the
-- enum so existing deployments can apply this migration safely.
UPDATE circulars SET category = 'cancellation_order' WHERE category = 'notice';

ALTER TABLE circulars
  MODIFY category ENUM('road_status', 'cancellation_order', 'tender') NOT NULL,
  ADD COLUMN file_content LONGBLOB NULL AFTER ingested_at,
  ADD COLUMN file_mime_type VARCHAR(100) NULL AFTER file_content,
  ADD COLUMN file_name VARCHAR(255) NULL AFTER file_mime_type;

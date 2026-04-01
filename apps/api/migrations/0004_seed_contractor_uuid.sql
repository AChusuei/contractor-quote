-- Migration: convert dev seed contractor from human-readable ID to UUID
-- Only affects local dev databases that were seeded with 'contractor-001'.
-- Production contractors already use UUIDs (created via POST /platform/contractors).

UPDATE contractors SET id = '00000000-0000-4000-8000-000000000001' WHERE id = 'contractor-001';
UPDATE customers SET contractor_id = '00000000-0000-4000-8000-000000000001' WHERE contractor_id = 'contractor-001';
UPDATE quotes SET contractor_id = '00000000-0000-4000-8000-000000000001' WHERE contractor_id = 'contractor-001';
UPDATE staff SET contractor_id = '00000000-0000-4000-8000-000000000001' WHERE contractor_id = 'contractor-001';
UPDATE photos SET contractor_id = '00000000-0000-4000-8000-000000000001' WHERE contractor_id = 'contractor-001';
UPDATE appointments SET contractor_id = '00000000-0000-4000-8000-000000000001' WHERE contractor_id = 'contractor-001';
UPDATE data_deletion_log SET contractor_id = '00000000-0000-4000-8000-000000000001' WHERE contractor_id = 'contractor-001';

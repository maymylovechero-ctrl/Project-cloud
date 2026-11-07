CREATE TABLE IF NOT EXISTS repair_requests (
  id BIGSERIAL PRIMARY KEY,
  reporter_name TEXT NOT NULL,
  location TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('computer_network', 'air_conditioning', 'presentation', 'general')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  photo_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed')),
  technician TEXT,
  resolution TEXT,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  rating_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS repair_requests_status_created_idx ON repair_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS repair_requests_technician_idx ON repair_requests (technician, created_at DESC);

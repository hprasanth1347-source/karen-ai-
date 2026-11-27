-- Forward Migration 0013: Google Classroom Student Assignment Reminder System

CREATE TABLE IF NOT EXISTS classroom_courses (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  section TEXT,
  course_state TEXT NOT NULL DEFAULT 'ACTIVE',
  alternate_link TEXT,
  teacher_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_classroom_courses_user ON classroom_courses(user_id, course_state);
ALTER TABLE classroom_courses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY classroom_courses_owner ON classroom_courses FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS classroom_assignments (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  submission_state TEXT NOT NULL DEFAULT 'UNKNOWN',
  excused BOOLEAN NOT NULL DEFAULT FALSE,
  late BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_grade NUMERIC,
  alternate_link TEXT,
  category TEXT NOT NULL DEFAULT 'pending',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_classroom_assignments_user_due ON classroom_assignments(user_id, category, due_at);
ALTER TABLE classroom_assignments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY classroom_assignments_owner ON classroom_assignments FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS classroom_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'dashboard')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'cancelled', 'skipped', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_classroom_reminder_logs_user ON classroom_reminder_logs(user_id, sent_at DESC);
ALTER TABLE classroom_reminder_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY classroom_reminder_logs_owner ON classroom_reminder_logs FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add agent_id column to messages table
-- Allows tracking which agent generated a given assistant message
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS agent_id text;

-- Index for querying messages by agent
CREATE INDEX IF NOT EXISTS messages_agent_id_idx ON public.messages(agent_id);

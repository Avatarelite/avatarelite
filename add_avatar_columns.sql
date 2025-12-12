-- Add columns for My Avatar feature
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS avatar_images text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS avatar_enabled boolean DEFAULT false;

-- Create an index just in case (optional, but good practice if queried often)
-- CREATE INDEX IF NOT EXISTS users_avatar_enabled_idx ON public.users (avatar_enabled);

ALTER TABLE IF EXISTS public.user_settings
  ALTER COLUMN proxmox_node SET DEFAULT 'proxmox';

UPDATE public.user_settings
SET proxmox_node = 'proxmox',
    updated_at = now()
WHERE proxmox_node IS NULL
   OR proxmox_node = ''
   OR proxmox_node = 'pve';

import { supabase } from '../../supabase-client';

/**
 * Browser helper: asks the server to process an uploaded file into searchable sections.
 * Fire-and-forget: the upload is already saved, and files that are not processed yet are
 * still read the old way, so a failure here never blocks the user.
 */
export function requestIngestion(fileId: string): Promise<void> {
  return (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch('/api/documents/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ fileId }),
        keepalive: true,
      });
    } catch (err) {
      console.warn('Document processing request failed:', (err as Error).message);
    }
  })();
}

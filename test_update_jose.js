const url = 'https://slgvzkrymwsdqdjnlbpc.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsZ3Z6a3J5bXdzZHFkam5sYnBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NjE5MDUsImV4cCI6MjA5NzUzNzkwNX0.tE_kFD-4W_C_xcmT3866glIkeDnqeVSMHNo13X4X3sE';

async function run() {
  try {
    const userId = 'de9ff50d-be24-48f7-b7e9-c06bd59b2243';
    console.log(`Querying usage limits for user ID ${userId}...`);
    const selectRes = await fetch(`${url}/rest/v1/usage_limits?user_id=eq.${userId}`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    if (!selectRes.ok) {
      throw new Error(`Select failed: ${await selectRes.text()}`);
    }
    const limits = await selectRes.json();
    console.log('Current usage limits:', limits);

    if (limits.length > 0) {
      console.log('Updating max_interactions to 10000 for premium user...');
      const updateRes = await fetch(`${url}/rest/v1/usage_limits?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          max_interactions: 10000
        })
      });

      console.log('Update status:', updateRes.status);
      const updateText = await updateRes.text();
      console.log('Update response:', updateText);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();

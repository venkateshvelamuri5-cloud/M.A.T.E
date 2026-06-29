require('dotenv').config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment.");
  process.exit(1);
}

async function run() {
  const restUrl = `${url}/rest/v1/interactions_log?limit=1`;
  console.log("Fetching interactions_log schema via REST:", restUrl);
  try {
    const res = await fetch(restUrl, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP error ${res.status}: ${errText}`);
    }
    const data = await res.json();
    console.log("interactions_log data structure:", data);
    if (data && data.length > 0) {
      console.log("Columns found on remote Supabase interactions_log table:", Object.keys(data[0]));
    } else {
      console.log("Query succeeded, but table is empty.");
    }
  } catch (e) {
    console.error("Failed:", e.message);
  }
}

run();

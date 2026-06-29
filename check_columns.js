require('dotenv').config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing environment variables.");
  process.exit(1);
}

async function run() {
  const restUrl = `${url}/rest/v1/agents?limit=1`;
  try {
    const res = await fetch(restUrl, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    const data = await res.json();
    console.log("Agents table columns:", data && data.length > 0 ? Object.keys(data[0]) : "No data");
  } catch (e) {
    console.error("Failed:", e.message);
  }
}

run();

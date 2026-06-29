require('dotenv').config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing environment variables.");
  process.exit(1);
}

async function run() {
  const restUrl = `${url}/rest/v1/agents`;
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
    console.log("Agents in DB:", JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Failed:", e.message);
  }
}

run();

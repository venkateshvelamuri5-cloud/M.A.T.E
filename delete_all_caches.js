const { GoogleGenAI } = require('@google/genai');

async function main() {
  const apiKey = 'AIzaSyAAmWqlsHVEVl5ZPDQrBscARwfWPKO8ASs'; // From .env
  const ai = new GoogleGenAI({ apiKey });

  console.log('Fetching active context caches from Google AI Studio...');
  try {
    const listResponse = await ai.caches.list();
    const caches = listResponse.cachedContents || [];
    
    console.log(`Found ${caches.length} active cache(s) in your account.`);
    
    for (const cache of caches) {
      console.log(`Deleting cache: ${cache.name} (DisplayName: ${cache.displayName})...`);
      await ai.caches.delete({ name: cache.name });
      console.log(`Successfully deleted ${cache.name}!`);
    }
    
    console.log('All active context caches have been cleared. Charging stopped!');
  } catch (error) {
    console.error('Error during cache cleanup:', error);
  }
}

main();

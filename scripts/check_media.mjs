import fs from 'fs';
import readline from 'readline';
async function checkMedia() {
  const rl = readline.createInterface({ input: fs.createReadStream('C:/Users/User/.gemini/antigravity/brain/b5a27224-8be0-499d-80bd-5534d94b1265/.system_generated/logs/transcript.jsonl') });
  for await (const line of rl) {
    if (line.includes('"media"')) {
      const obj = JSON.parse(line);
      if (obj.media && obj.media.length > 0) {
        console.log('Step:', obj.step_index, 'created_at:', obj.created_at, 'media:', obj.media);
      }
    }
  }
}
checkMedia();

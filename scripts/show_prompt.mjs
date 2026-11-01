import fs from 'fs';
import readline from 'readline';

async function show17448() {
  const fileStream = fs.createReadStream('C:/Users/User/.gemini/antigravity/brain/b5a27224-8be0-499d-80bd-5534d94b1265/.system_generated/logs/transcript.jsonl');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.includes('"step_index":17448')) {
      const obj = JSON.parse(line);
      console.log('FULL CONTENT OF 17448:');
      console.log(obj.content);
    }
  }
}
show17448();

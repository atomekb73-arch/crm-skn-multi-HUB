import fs from 'fs';
import readline from 'readline';

async function checkUserInputs() {
  const fileStream = fs.createReadStream('C:/Users/User/.gemini/antigravity/brain/b5a27224-8be0-499d-80bd-5534d94b1265/.system_generated/logs/transcript.jsonl');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.includes('"USER_INPUT"') || line.includes('"USER_EXPLICIT"')) {
      try {
        const obj = JSON.parse(line);
        console.log(`=== USER INPUT ${obj.step_index} (${obj.created_at}) ===`);
        console.log(obj.content?.slice(0, 300));
        console.log('---');
      } catch(e) {}
    }
  }
}
checkUserInputs();

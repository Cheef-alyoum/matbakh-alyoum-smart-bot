import fs from 'node:fs';
import path from 'node:path';

const storageDir = path.join(process.cwd(), 'storage');
const files = ['orders.json', 'leads.json', 'messages.json'];

for (const file of files) {
  const filePath = path.join(storageDir, file);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf-8');
    console.log(`Created ${filePath}`);
  }
}

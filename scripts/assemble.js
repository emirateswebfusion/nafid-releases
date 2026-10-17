const fs = require('fs');
const path = require('path');

const p1 = fs.readFileSync(path.join(__dirname, 'part1.ts'), 'utf8');
const p2 = fs.readFileSync(path.join(__dirname, 'part2.ts'), 'utf8');
const p3 = fs.readFileSync(path.join(__dirname, 'part3.ts'), 'utf8');

const combined = p1 + '\n\n' + p2 + '\n\n' + p3;
const target = path.join(__dirname, '../src/services/offlineAiService.ts');

fs.writeFileSync(target, combined, 'utf8');
console.log('Successfully assembled src/services/offlineAiService.ts (' + combined.length + ' bytes)');

const fs = require('fs');
const content = fs.readFileSync('src/services/offlineAiService.ts', 'utf8');
const lines = content.split('\n');
const cases = {};
lines.forEach((line, idx) => {
  const m = line.match(/^\s*case\s+['"]([^'"]+)['"]\s*:/);
  if (m) {
    const name = m[1];
    if (!cases[name]) cases[name] = [];
    cases[name].push(idx + 1);
  }
});
const duplicates = Object.entries(cases).filter(([name, lineNums]) => lineNums.length > 1);
console.log('Duplicate case statements in src/services/offlineAiService.ts:');
console.log(duplicates);

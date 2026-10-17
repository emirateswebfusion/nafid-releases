const fs = require('fs');
const content = fs.readFileSync('src/services/offlineAiService.ts', 'utf8');
const cases = content.match(/case '[A-Z0-9_]+':/g) || [];
const uniqueCases = [...new Set(cases.map(c => c.replace(/case '|':/g, '')))];
console.log('--- ALL EXISTING INTENT CASES IN OFFLINE_AI_SERVICE (' + uniqueCases.length + ') ---');
console.log(uniqueCases);

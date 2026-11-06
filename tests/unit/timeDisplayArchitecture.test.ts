import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';
it('screens use shop clock helpers and shop-date defaults', () => {
  const root=resolve('src'); const violations:string[]=[];
  const approved=new Set(['utils/time/dateDisplay.ts','utils/print/receipt/receiptCore.ts','components/owner-dashboard/DigitalClock.tsx']);
  function visit(dir:string) {
    for(const entry of readdirSync(dir,{withFileTypes:true})) {
      const path=join(dir,entry.name); if(entry.isDirectory()){visit(path);continue;}
      if(!/\.tsx?$/.test(path))continue;
      const file=relative(root,path).replaceAll('\\','/');if(approved.has(file))continue;
      const source=readFileSync(path,'utf8');
      if(/\.toLocale(?:Date|Time)String\s*\(/.test(source)||/new Date\(\)\.toISOString\(\)\.(?:split|slice)\(/.test(source))violations.push(file);
    }
  }
  visit(root);expect(violations).toEqual([]);
});

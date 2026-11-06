import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';
import ts from 'typescript';

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}

it('keeps browser alerts, alternate toast libraries and copied toast styling out of the renderer', () => {
  const offenders = sources(join(process.cwd(), 'src')).flatMap(file => {
    if (relative(process.cwd(), file).replaceAll('\\', '/') === 'src/components/ui/FloatToast.tsx') return [];
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    let copiedToast = false;
    const inspect = (node: ts.Node) => {
      if (ts.isJsxElement(node)) {
        const markup = node.getText(source);
        const opening = node.openingElement.getText(source);
        // Inspect each element independently; a positioned stack with shared children is allowed.
        if (node.openingElement.tagName.getText(source) === 'div' &&
          /\bfixed\b/.test(opening) && /\b(?:bottom|top)-\d/.test(opening) &&
          !/\binset-/.test(opening) && /(?:slide-in-from|fade-in)/.test(opening) &&
          /bg-(?:slate-900|emerald-500|foreground)/.test(opening) &&
          !/<FloatToast\b/.test(markup)) copiedToast = true;
      }
      ts.forEachChild(node, inspect);
    };
    inspect(source);
    return copiedToast || /\balert\s*\(|['"](?:sonner|react-hot-toast|react-toastify)['"]|bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700\/80/.test(text)
      ? [relative(process.cwd(), file)] : [];
  });
  expect(offenders).toEqual([]);
});

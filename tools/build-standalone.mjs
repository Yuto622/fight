/**
 * Bundles the whole game into one self-contained HTML file that runs from
 * `file://` -- double-click and play, no server, no install.
 *
 * The game is written as ES modules, and a browser will not `import` across a
 * file:// origin.  So this walks the import graph from src/main.js, rewrites
 * each module into an IIFE that publishes its exports into a tiny registry,
 * and inlines the result along with the stylesheet.
 *
 * Every module keeps its own scope, so names that clash between modules (DOWN
 * is an orientation in constants.js and a reading direction in wordRule.js)
 * stay separate.
 *
 * Run with `npm run build:standalone`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'src/main.js');

const IMPORT = /^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const EXPORT_LIST = /^export\s*\{([^}]*)\};?[ \t]*$/gm;
const EXPORT_DECL = /^export\s+(const|let|var|class|function)\s+([A-Za-z_$][\w$]*)/gm;

/** @param {string} file absolute path @returns {string} registry key */
const keyOf = (file) => relative(ROOT, file).replace(/\\/g, '/');

/**
 * Reads a module, collecting what it imports and what it exports.
 * @param {string} file absolute path
 */
function parseModule(file) {
  const source = readFileSync(file, 'utf8');
  const dependencies = [];
  const exported = new Set();

  let body = source.replace(IMPORT, (_match, names, specifier) => {
    const target = resolve(dirname(file), specifier);
    dependencies.push(target);
    const bindings = names
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .join(', ');
    return `const { ${bindings} } = __modules['${keyOf(target)}'];`;
  });

  body = body.replace(EXPORT_LIST, (_match, names) => {
    for (const name of names.split(',').map((entry) => entry.trim()).filter(Boolean)) {
      exported.add(name);
    }
    return '';
  });

  body = body.replace(EXPORT_DECL, (_match, kind, name) => {
    exported.add(name);
    return `${kind} ${name}`;
  });

  return { file, body, dependencies, exported: [...exported] };
}

/** Depth-first walk of the import graph, dependencies emitted first. */
function collect(entry) {
  const parsed = new Map();
  const order = [];
  const visiting = new Set();

  const visit = (file) => {
    if (parsed.has(file)) return;
    if (visiting.has(file)) throw new Error(`import cycle at ${keyOf(file)}`);
    visiting.add(file);
    const module = parseModule(file);
    for (const dependency of module.dependencies) visit(dependency);
    visiting.delete(file);
    parsed.set(file, module);
    order.push(module);
  };

  visit(entry);
  return order;
}

const modules = collect(ENTRY);

const bundle = modules
  .map((module) => {
    const exports = module.exported.map((name) => `    ${name},`).join('\n');
    return [
      `// ---- ${keyOf(module.file)} `.padEnd(74, '-'),
      '(() => {',
      module.body.trimEnd(),
      '',
      `  __modules['${keyOf(module.file)}'] = {`,
      exports,
      '  };',
      '})();',
    ].join('\n');
  })
  .join('\n\n');

const css = readFileSync(join(ROOT, 'styles/main.css'), 'utf8');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

const page = html
  .replace('<link rel="stylesheet" href="styles/main.css">', `<style>\n${css}\n</style>`)
  .replace(
    '<script type="module" src="src/main.js"></script>',
    [
      '<script type="module">',
      '// Bundled by tools/build-standalone.mjs -- edit the files in src/ instead.',
      'const __modules = {};',
      bundle,
      '</script>',
    ].join('\n'),
  )
  .replace(
    '<title>PUYO U-SPEAK</title>',
    '<title>PUYO U-SPEAK</title>\n<!-- Self-contained build: open this file directly in a browser. -->',
  );

mkdirSync(join(ROOT, 'dist'), { recursive: true });
const out = join(ROOT, 'dist/puyo-uspeak.html');
writeFileSync(out, page);

const kb = (Buffer.byteLength(page) / 1024).toFixed(0);
console.log(`wrote dist/puyo-uspeak.html (${kb} KB, ${modules.length} modules inlined)`);

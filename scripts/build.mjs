import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const navigationPages = ['index', 'programme', 'registration', 'travel'];
const pages = [...navigationPages, 'privacy'];
const kinds = ['header', 'footer'];
const check = process.argv.includes('--check');

// Only text BETWEEN these markers is generated. Everything else is kept verbatim.
function replaceShared(page, kind, content, file) {
  const begin = `    <!-- BEGIN SHARED ${kind}: edit partials/${kind}.html, then npm run build -->`;
  const end = `    <!-- END SHARED ${kind} -->`;
  const start = page.indexOf(begin);
  const finish = page.indexOf(end);
  if (start < 0 || finish < start || page.indexOf(begin, start + 1) >= 0 || page.indexOf(end, finish + 1) >= 0) {
    throw new Error(`${file}: missing, duplicate or out-of-order ${kind} markers. No pages written.`);
  }
  const newline = page.includes('\r\n') ? '\r\n' : '\n';
  const body = content.replace(/\r\n|\r|\n/g, newline).replace(/(?:\r?\n)+$/, '');
  return page.slice(0, start + begin.length) + newline + body + newline + page.slice(finish);
}

const partials = Object.fromEntries(kinds.map(kind => [kind, fs.readFileSync(new URL(`partials/${kind}.html`, root), 'utf8')]));
for (const name of navigationPages) {
  if (!partials.header.includes(`{{current:${name}}}`)) throw new Error(`Header missing navigation token for ${name}.`);
}
// Prepare and validate ALL pages before writing any of them.
const updates = pages.map(name => {
  const file = `${name}.html`;
  const url = new URL(file, root);
  const original = fs.readFileSync(url, 'utf8');
  let result = original;
  for (const kind of kinds) {
    const rendered = partials[kind].replace(/\{\{current:(\w+)\}\}/g, (_, target) => {
      if (!pages.includes(target)) throw new Error(`Unknown navigation page: ${target}`);
      return target === name ? ' aria-current="page"' : '';
    });
    if (rendered.includes('{{')) throw new Error(`Unrecognised template token in ${kind}.html`);
    result = replaceShared(result, kind, rendered, file);
  }
  return { file, url, original, result };
});
const changed = updates.filter(item => item.original !== item.result);
if (check) {
  if (changed.length) {
    console.error('Shared regions need updating: ' + changed.map(item => item.file).join(', '));
    process.exitCode = 1;
  } else console.log('Shared regions are up to date. Page content is untouched.');
} else {
  for (const item of changed) fs.writeFileSync(item.url, item.result, 'utf8');
  console.log(`Updated shared regions in ${changed.length} page(s). All other content and whitespace preserved.`);
}

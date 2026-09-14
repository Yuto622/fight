/* index.html とその CSS / JS を1枚の HTML にまとめる。
 *   node tools/build-single.js
 * 出力: uspeak-tetris.html（これ1つで動く。ダブルクリックで開ける） */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function readAsset(file) {
  return fs.readFileSync(path.join(root, file), 'utf8').replace(/\s+$/, '');
}

// </script> がソース中にあっても壊れないようにエスケープする
function safeScript(src) {
  return src.replace(/<\/script>/gi, '<\\/script>');
}

let out = html.replace(
  /<link rel="stylesheet" href="([^"]+)">/g,
  (_, href) => '<style>\n' + readAsset(href) + '\n</style>'
);

out = out.replace(
  /<script src="([^"]+)"><\/script>/g,
  (_, src) => '<script>\n' + safeScript(readAsset(src)) + '\n</script>'
);

out = out.replace('<title>', '<!-- 単一ファイル版（tools/build-single.js が生成）。編集は各ソースを直してから再生成する -->\n<title>');

if (/href="(css|js)\//.test(out) || /src="(css|js)\//.test(out)) {
  throw new Error('埋め込めていない外部参照が残っている');
}

const dest = path.join(root, 'uspeak-tetris.html');
fs.writeFileSync(dest, out);
console.log('書き出し: ' + path.relative(root, dest) + '  ' + (out.length / 1024).toFixed(0) + ' KB');

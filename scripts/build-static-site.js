/* Cloudflare Pages receives only the public app assets used by the web UI.
 * The existing GitHub Pages deployment is unchanged; no CNAME or redirect. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function build(root=path.resolve(__dirname,'..'),output=path.join(root,'.pages-dist')){
  if(fs.existsSync(output))throw Error('Use a fresh output directory; existing files will not be overwritten');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8'),match=sw.match(/const ASSETS = (\[[^\n]+\]);/);
  if(!match)throw Error('Static asset manifest missing');
  const assets=new Set(['index.html','sw.js','manifest.webmanifest']);
  for(const value of JSON.parse(match[1])){
    const file=value.split('?')[0].replace(/^\.\//,'')||'index.html';
    if(!/^(?:[a-z0-9-]+\.(?:html|js|css|webmanifest)|icons\/[a-z0-9-]+\.png)$/.test(file))throw Error('Unexpected public asset '+file);
    assets.add(file);
  }
  const hashes={};
  for(const file of [...assets].sort()){
    const source=path.join(root,file);
    if(!fs.lstatSync(source).isFile()||fs.lstatSync(source).isSymbolicLink())throw Error('Not a regular public asset');
    const bytes=fs.readFileSync(source),target=path.join(output,file);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
    hashes[file]=crypto.createHash('sha256').update(bytes).digest('hex');
  }
  fs.writeFileSync(path.join(output,'_headers'),'/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/sw.js\n  Cache-Control: no-cache\n');
  fs.writeFileSync(path.join(output,'asset-digests.json'),JSON.stringify({version:1,files:hashes},null,2)+'\n');
  return {output,files:[...assets].sort()};
}
if(require.main===module)console.log(JSON.stringify(build()));
module.exports={build};

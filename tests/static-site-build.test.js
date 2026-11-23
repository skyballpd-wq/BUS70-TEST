const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {build}=require('../scripts/build-static-site');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bus70-static-')),out=path.join(temp,'site'),root=path.resolve(__dirname,'..');
try{
 const result=build(root,out),html=fs.readFileSync(path.join(out,'index.html'),'utf8');
 assert(result.files.length>20);
 for(const name of ['apps-script','tests','docs','android','AGENTS.md','CNAME'])assert(!fs.existsSync(path.join(out,name)));
 const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>tag.slice(0,tag.indexOf('>')+1));
 for(const match of markup.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)){
   const file=match[1].split('?')[0].slice(2);assert(fs.existsSync(path.join(out,file)),'missing '+file);
 }
 for(let i=0;i<4;i++)assert(fs.existsSync(path.join(out,'icons/mascot-'+i+'.png')),'dynamic mascot asset');
 assert.equal(html,fs.readFileSync(path.join(root,'index.html'),'utf8'),'same backend and code on both hosts');
 assert.equal(JSON.parse(fs.readFileSync(path.join(out,'manifest.webmanifest'),'utf8')).start_url,'./');
 assert.equal(fs.readFileSync(path.join(out,'sw.js'),'utf8'),fs.readFileSync(path.join(root,'sw.js'),'utf8'));
 const manifest=JSON.parse(fs.readFileSync(path.join(out,'asset-digests.json'),'utf8'));
 assert.equal(Object.keys(manifest.files).length,result.files.length);
 assert.throws(()=>build(root,out),/fresh output/);
 console.log('Same-source dual-host static build, complete assets and private-source exclusions passed');
}finally{fs.rmSync(temp,{recursive:true,force:true});}

// Runs on every Netlify deploy (see netlify.toml). Writes a build id into index.html and into version.json so an open
// copy of Scarlett can tell when a newer version has been deployed and offer a refresh. Never fails the deploy.
const fs = require('fs');
try{
  const id = String(process.env.COMMIT_REF || process.env.DEPLOY_ID || Date.now()).slice(0, 40);
  let html = fs.readFileSync('index.html', 'utf8');
  if(/SCARLETT_BUILD = '[^']*'/.test(html)){
    html = html.replace(/SCARLETT_BUILD = '[^']*'/, "SCARLETT_BUILD = '" + id + "'");
    fs.writeFileSync('index.html', html);
  }
  fs.writeFileSync('version.json', JSON.stringify({ v: id }));
  console.log('stamped build', id);
}catch(e){
  console.log('build stamp skipped:', e && e.message);
}

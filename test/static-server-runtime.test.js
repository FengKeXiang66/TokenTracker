const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { serveStaticFile } = require("../src/lib/static-server");

test("local HTML loads public instance configuration before eager app modules", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),"tokentracker-runtime-html-"));
  const source = '<!doctype html><html><head><script type="module" src="/app.js"></script></head><body>本地用量</body></html>';
  await fs.writeFile(path.join(dir,"index.html"),source);
  await fs.writeFile(path.join(dir,"app.js"),"window.started = true;");
  const server = http.createServer(async (req,res) => {
    const url = new URL(req.url,"http://localhost");
    const options = { localRuntimeConfig:url.searchParams.get("local") === "1" };
    if (!await serveStaticFile(dir,url.pathname,res,options)) res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/index.html?local=1`);
    const html = await response.text();
    assert.equal(response.status,200);
    assert.equal(response.headers.get("cache-control"),"no-store");
    assert.equal(Number(response.headers.get("content-length")),Buffer.byteLength(html));
    assert.ok(html.indexOf('/api/runtime-config.js') < html.indexOf('type="module"'));
    assert.ok(html.indexOf('runtime_config_unavailable') < html.indexOf('/api/runtime-config.js'));
    assert.equal((html.match(/runtime-config\.js/g)||[]).length,1);
    assert.equal(await (await fetch(`${base}/index.html`)).text(),source);
    assert.equal(await (await fetch(`${base}/app.js?local=1`)).text(),"window.started = true;");
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(dir,{recursive:true,force:true});
  }
});

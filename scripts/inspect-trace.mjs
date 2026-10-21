import fs from 'node:fs';
import JSZip from 'jszip';
const zip = await JSZip.loadAsync(fs.readFileSync(process.argv[2]));
for (const name of Object.keys(zip.files).filter(name => /\.(trace|network)$/.test(name))) {
  for (const row of (await zip.file(name).async('string')).split('\n')) {
    if (/"console"|"pageError"|"resource-snapshot"/.test(row)) {
      const event = JSON.parse(row);
      if (event.type === 'resource-snapshot') {
        const resource = event.snapshot;
        console.log(JSON.stringify({ url: resource.request?.url, status: resource.response?.status, failure: resource._failureText, content: resource.response?.content }));
      } else console.log(row);
    }
  }
}

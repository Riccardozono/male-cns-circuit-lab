import { mkdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
const base = 'https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/';
await mkdir(new URL('./source-data/', import.meta.url), {recursive:true});
for (const name of ['body-annotations-male-cns-v1.0-minconf-0.5.feather', 'connectome-weights-male-cns-v1.0-minconf-0.5.feather']) {
  const file = new URL('./source-data/' + name, import.meta.url);
  const response = await fetch(base + name);
  if (!response.ok) throw Error(`${response.status}: ${name}`);
  const length = Number(response.headers.get('content-length'));
  const existing = await stat(file).catch(() => null);
  if(existing?.size === length) { console.log('Already downloaded:', name, length); await response.body.cancel(); continue; }
  console.log('Downloading', name, length, 'bytes');
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
  console.log('Complete', name, (await stat(file)).size);
}

// Primary photographic references, inspected locally; not shipping app assets.
import {mkdir,writeFile}from'node:fs/promises';
const dir=new URL('../tmp/pdfs/curb-references/',import.meta.url);
const files={
  'monaco-hamilton-2025.webp':'https://media.formula1.com/image/upload/c_fit%2Cw_3200%2Ch_1800/q_auto/v1740000001/trackside-images/2025/F1_Grand_Prix_of_Monaco___Practice/2216697302.webp',
  'monaco-verstappen-2025.webp':'https://media.formula1.com/image/upload/c_fit%2Cw_3200%2Ch_1800/q_auto/v1740000001/trackside-images/2025/F1_Grand_Prix_of_Monaco___Practice/2216681387.webp',
  'monaco-norris-2025.webp':'https://media.formula1.com/image/upload/c_fit%2Cw_3200%2Ch_1800/q_auto/v1740000001/trackside-images/2025/F1_Grand_Prix_of_Monaco___Practice/2216688568.webp',
  'lemans-dunlop-aco.jpg':'https://www.lemans.org/media/cache/component_photo_1200/assets/fileuploads/68/4a/684affaa18c9f.jpg',
  'lemans-michelin-aco.jpg':'https://www.lemans.org/media/cache/component_photo_1200/assets/fileuploads/68/49/6849bbd0991f2.jpg',
  'lemans-mulsanne-aco.jpg':'https://www.lemans.org/media/cache/component_photo_1200/assets/fileuploads/68/45/6845b89e4b34e.jpg'
};
await mkdir(dir,{recursive:true});
for(const [name,url]of Object.entries(files)){
  const r=await fetch(url);if(!r.ok)throw Error(name+': '+r.status);
  const bytes=Buffer.from(await r.arrayBuffer());await writeFile(new URL(name,dir),bytes);console.log(name,bytes.length);
}

import {mkdir,writeFile}from'node:fs/promises';
const files={
  'monaco-notes-2025-v2.pdf':'https://www.fia.com/system/files/decision-document/2025_monaco_event_-_f3_monaco_event_notes_2025_v2.pdf',
  'lemans-briefing-2025.pdf':'https://fiawec.alkamelsystems.com/Results_NoticeBoard/13_2025/04_24%20Hours%20of%20Le%20Mans/059_Doc%2059%20-%20BRIEFING%20NOTES.pdf',
  'monza-notes-2025-v1.pdf':'https://www.fia.com/system/files/decision-document/2025_monza_event_-_f2_monza_event_notes_2025_v1.pdf'
};
const dir=new URL('../tmp/pdfs/curb-references/',import.meta.url);await mkdir(dir,{recursive:true});
for(const [name,url]of Object.entries(files)){const r=await fetch(url);if(!r.ok)throw Error(name+': '+r.status);const bytes=Buffer.from(await r.arrayBuffer());await writeFile(new URL(name,dir),bytes);console.log(name,bytes.length);}

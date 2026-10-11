import {mkdir,writeFile} from 'node:fs/promises';
const files={
  monza:'https://www.monzanet.it/wp-content/uploads/2023/09/MAPPA_CIRCUITO_2023_tribune.pdf',
  monaco:'https://www.fia.com/system/files/decision-document/2025_monaco_grand_prix_-_race_directors_event_notes_-_circuit_map_pit_lane_map_ers_battery_containment_area_red_zones.pdf',
  lemans:'https://assets.lemans.org/explorer/pdf/club/2024/aco19-book-24h-a5-gb.pdf'
};
await mkdir(new URL('./maps/',import.meta.url),{recursive:true});
await Promise.all(Object.entries(files).map(async([name,url])=>{
  const r=await fetch(url);if(!r.ok)throw Error(`${name}: ${r.status}`);
  const bytes=Buffer.from(await r.arrayBuffer());await writeFile(new URL(`./maps/${name}.pdf`,import.meta.url),bytes);console.log(name,bytes.length);
}));

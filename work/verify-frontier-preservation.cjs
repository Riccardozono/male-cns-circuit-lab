'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=[
  ['C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save','29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'],
  [path.join(root,'dist-landscape-v560/MAL-E-CNS-Circuit-Lab-portable-5.6.0-x64.exe'),'95f5bff7c029d0f7661ba9677031efc528d5e1d82c76dada42579336b8654424'],
  [path.join(root,'dist-landscape-v560/MAL-E-CNS-Circuit-Lab-setup-5.6.0-x64.exe'),'c070442d86f6e406e84b915774deeae974723b30f40e05929f51516292928ce5']
];
const preserved=files.map(([file,expected])=>{const sha256=hash(file);if(sha256!==expected)throw Error('Protected file changed: '+path.basename(file));return {file:path.basename(file),sha256,unchanged:true};});
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,tagCommit=execFileSync('git',['rev-parse','v5.6.0^{}'],{cwd:root,windowsHide:true,encoding:'utf8'}).trim();
if(version!=='5.6.0'||tagCommit!=='7cb6fcf0b12bd56bd7a7510fef147f7356a2f3a4')throw Error('Protected version or tag changed');
const reportFile=path.join(root,'.impeccable/review/neural-sacl/context-native-3-frontier-functional/verification.json'),native=JSON.parse(fs.readFileSync(reportFile,'utf8'));
if(!native.passed||native.checks.length!==16||native.checks.some(c=>!c.passed)||native.finalEpisode.bestProgress!==2006.2274624276079||native.finalEpisode.laps!==0)throw Error('Actual frontier native verification required');
for(const [file,expected]of Object.entries(native.sourceHashes))if(hash(path.join(root,file))!==expected)throw Error('Changed source after native verification: '+file);
const output={passed:true,date:'2026-10-15',appVersion:version,tagCommit,preserved,nativeReportSha256:hash(reportFile),nativeChecks:native.checks.length,actualNativeEpisode:native.finalEpisode,
  boundary:'Read-only current checks of original save, existing distributed local binaries, app version, local published-tag reference and actual native test/source identity. This does not query remote GitHub, prove model convergence, run the unit suite, create a release or award laps.'};
fs.writeFileSync(path.join(root,'.impeccable/review/neural-sacl/frontier-preservation.json'),JSON.stringify(output,null,2));
console.log('FRONTIER_PRESERVED '+JSON.stringify({passed:true,protectedFiles:preserved.length,nativeChecks:output.nativeChecks,episode:output.actualNativeEpisode,version}));

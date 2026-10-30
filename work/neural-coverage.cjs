'use strict';
const {feature}=require('./neural-local-rbf.cjs');
function coverage(observations,centre){let peak=0;for(const row of observations)peak=Math.max(peak,feature(row.raw,centre));return peak;}
function chooseParent(championEpisode,explorerEpisode,centre){const champion=coverage(championEpisode.observations,centre),explorer=coverage(explorerEpisode.observations,centre);return {parent:explorer>champion+.05?'explorer':'champion',champion,explorer};}
module.exports={coverage,chooseParent};

'use strict';
const C=require('./neural-coverage.cjs');
function chooseParent(champion,explorer,centre){return C.chooseParent({observations:champion.observations.slice(-40)},{observations:explorer.observations.slice(-40)},centre);}
module.exports={...C,chooseParent};

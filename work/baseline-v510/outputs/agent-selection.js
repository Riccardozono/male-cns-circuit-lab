/* Read-only observer choice. Never drives, evolves or mutates an agent. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./simulation.js'));
  else root.MaleCNSAgents=factory(root.FlySim);
})(typeof globalThis!=='undefined'?globalThis:this,function(F){
  'use strict';
  function bestActive(cars,currentId){
    if(!cars?.length)return null;
    const alive=cars.filter(car=>car.alive),pool=alive.length?alive:cars;
    // Exact ties retain the observed car, avoiding needless GPU inspections
    // and camera jumps. The actual simulation ranking is not redefined.
    let leader=pool.find(car=>car.id===currentId)||pool[0];
    for(const car of pool)if(F.compareAgents(car,leader)<0)leader=car;
    return leader;
  }
  class Selection{
    constructor(){this.automatic=true;this.selectedId=0;}
    select(id){this.automatic=false;this.selectedId=id;}
    toggle(){this.automatic=!this.automatic;}
    reset(){this.selectedId=0;}
    update(cars){
      const car=this.automatic?bestActive(cars,this.selectedId):(cars?.find(c=>c.id===this.selectedId)||cars?.[0]);
      if(car)this.selectedId=car.id;return car||null;
    }
  }
  return Object.freeze({bestActive,Selection});
});

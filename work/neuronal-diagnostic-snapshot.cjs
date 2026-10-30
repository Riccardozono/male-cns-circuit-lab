'use strict';
// Diagnostic metadata only, never called by the driving controller. Copy
// simultaneous arrays BEFORE stepping: car is a live mutable physics object.
function capture(state,additionalNeuronalHistory){
  return {seconds:state.totalSimulationSeconds,progress:state.bestProgress,observation:state.observation.slice(),additionalNeuronalHistory:additionalNeuronalHistory.slice(),sensors:state.car.sensorVector.slice(),speedMps:state.car.vehicle.speedMps};
}
module.exports={capture};

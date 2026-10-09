/* Ordered crossing checks use movement segments: no rewards from standing at a gate. */
(function(root){'use strict';
function create(map,car){return{next:0,total:map.checkpoints?.length||0,complete:false,elapsed:0,hits:0,score:0,previous:{x:car.x,z:car.z}}}
function step(r,map,car,dt){if(r.complete)return false;r.elapsed+=dt;const gate=map.checkpoints[r.next],previous=r.previous;r.previous={x:car.x,z:car.z};if(!gate)return false;const a=(previous.x-gate.x)*gate.dx+(previous.z-gate.z)*gate.dz,b=(car.x-gate.x)*gate.dx+(car.z-gate.z)*gate.dz;if(a>0||b<0||b-a<1e-8||Math.hypot(car.x-previous.x,car.z-previous.z)>8)return false;const t=-a/(b-a),x=previous.x+(car.x-previous.x)*t,z=previous.z+(car.z-previous.z)*t,lateral=Math.abs((x-gate.x)*gate.dz-(z-gate.z)*gate.dx);if(lateral>map.road.width/2-1)return false;r.next++;r.complete=r.next===r.total;r.score=r.next*350;if(r.complete)r.score+=Math.max(0,Math.round((map.timeLimit-r.elapsed)*12))+Math.max(0,800-r.hits*100);return true}
function resetPosition(r,car){r.previous={x:car.x,z:car.z}}
const api={create,step,resetPosition};if(typeof module!=='undefined')module.exports=api;else root.DriftRace=api;
})(typeof window!=='undefined'?window:globalThis);

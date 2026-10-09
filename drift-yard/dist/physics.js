/* Original arcade vehicle simulation. SI units: metres, seconds, radians. */
(function(root){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const obstacles=[{x:0,z:0,w:15,d:15},{x:-44,z:26,w:10,d:22},{x:44,z:-26,w:10,d:22},{x:-43,z:-38,w:17,d:8},{x:36,z:41,w:25,d:8}];
const zones=[{x:-25,z:-25,r:9},{x:25,z:-25,r:9},{x:25,z:25,r:9},{x:-25,z:25,r:9}];
function create(spawn={x:0,z:-33,yaw:Math.PI/2}){return{x:spawn.x,z:spawn.z,yaw:spawn.yaw,vx:0,vz:0,steer:0,speed:0,slip:0,drifting:false,collision:false,zone:false,wheel:0};}
function step(s,input,dt,options={}){
 const stats=options.stats||{},arena=options.map||{obstacles,zones,extent:{x:58,z:58}};
 dt=clamp(dt,0,1/30);s.collision=false;
 let fx=Math.sin(s.yaw),fz=Math.cos(s.yaw),rx=fz,rz=-fx;
 let forward=s.vx*fx+s.vz*fz,side=s.vx*rx+s.vz*rz;
 const gas=input.gas?1:0,brake=input.brake?1:0,hand=!!input.handbrake;
 const steer=(input.left?1:0)-(input.right?1:0);
 s.steer+=(steer-s.steer)*(1-Math.exp(-(stats.response||9)*dt));
 let acc=gas*(stats.accel||12);
 if(brake)acc-=forward>1?(stats.brake||23):7;
 if(!gas&&!brake)acc-=Math.sign(forward)*.55;
 forward+=acc*dt;
 forward*=Math.exp(-(.14+Math.abs(forward)*.007+(hand?.6:0))*dt);
 forward=clamp(forward,-8,stats.maxSpeed||32);
 // Steering rotates the body before tyres pull velocity into the new heading.
 const turnFactor=clamp(Math.abs(forward)/7,0,1);
 const turn=s.steer*turnFactor*((stats.steerSpeed||1.15)+(hand?.72:0))*Math.sign(forward||1);
 s.yaw+=turn*dt;
 fx=Math.sin(s.yaw);fz=Math.cos(s.yaw);rx=fz;rz=-fx;
 const oldFx=Math.sin(s.yaw-turn*dt),oldFz=Math.cos(s.yaw-turn*dt);
 s.vx=oldFx*forward+oldFz*side;s.vz=oldFz*forward-oldFx*side;
 forward=s.vx*fx+s.vz*fz;side=s.vx*rx+s.vz*rz;
 const grip=hand?.75:(gas&&Math.abs(s.steer)>.15&&Math.abs(forward)>7?(arena.road?Math.max(4.5,stats.grip||2.05):(stats.grip||2.05)):5.5);
 side*=Math.exp(-grip*dt);
 s.vx=fx*forward+rx*side;s.vz=fz*forward+rz*side;
 s.x+=s.vx*dt;s.z+=s.vz*dt;
 const radius=stats.radius||1.35;
 for(const o of arena.obstacles){
  const cx=clamp(s.x,o.x-o.w/2,o.x+o.w/2),cz=clamp(s.z,o.z-o.d/2,o.z+o.d/2);
  let dx=s.x-cx,dz=s.z-cz,len=Math.hypot(dx,dz);
  if(len<radius){
   if(len<.0001){const ex=o.w/2-Math.abs(s.x-o.x),ez=o.d/2-Math.abs(s.z-o.z);if(ex<ez){dx=Math.sign(s.x-o.x)||1;dz=0;s.x=o.x+dx*(o.w/2+radius);}else{dz=Math.sign(s.z-o.z)||1;dx=0;s.z=o.z+dz*(o.d/2+radius);}len=1;}
   else{s.x+=dx/len*(radius-len);s.z+=dz/len*(radius-len);}
   dx/=len;dz/=len;const into=s.vx*dx+s.vz*dz;if(into<0){s.vx-=1.4*into*dx;s.vz-=1.4*into*dz;s.vx*=.65;s.vz*=.65;s.collision=true;}
  }
 }
 if(arena.road){let nearest=null,best=Infinity;for(const segment of arena.road.segments){const dx=segment.b.x-segment.a.x,dz=segment.b.z-segment.a.z,t=clamp(((s.x-segment.a.x)*dx+(s.z-segment.a.z)*dz)/(segment.len*segment.len),0,1),x=segment.a.x+dx*t,z=segment.a.z+dz*t,d=Math.hypot(s.x-x,s.z-z);if(d<best){best=d;nearest={x,z}}}const limit=arena.road.width/2-radius;if(best>limit&&nearest){const nx=(s.x-nearest.x)/best,nz=(s.z-nearest.z)/best;s.x=nearest.x+nx*limit;s.z=nearest.z+nz*limit;const outward=s.vx*nx+s.vz*nz;if(outward>0){s.vx-=1.2*outward*nx;s.vz-=1.2*outward*nz;s.vx*=.72;s.vz*=.72;s.collision=true}}}
 for(const axis of ['x','z']){if(Math.abs(s[axis])>arena.extent[axis]){s[axis]=clamp(s[axis],-arena.extent[axis],arena.extent[axis]);const vel=axis==='x'?'vx':'vz';s[vel]*=-.3;s.collision=true;}}
 s.speed=Math.hypot(s.vx,s.vz);const f=s.vx*fx+s.vz*fz,l=s.vx*rx+s.vz*rz;
 s.slip=Math.atan2(Math.abs(l),Math.max(.1,Math.abs(f)));
 s.drifting=s.speed>5.5&&f>2&&s.slip>.15&&s.slip<1.3&&!s.collision;
 s.zone=arena.zones.some(z=>Math.hypot(z.x-s.x,z.z-s.z)<z.r);
 s.wheel+=f*dt/.43;return s;
}
const api={create,step,obstacles,zones,clamp};if(typeof module!=='undefined')module.exports=api;else root.DriftPhysics=api;
})(typeof window!=='undefined'?window:globalThis);

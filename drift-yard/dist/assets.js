/* Original parametric 3D vehicles and environments. Each body type has unique geometry. */
(function(){'use strict';const E=Drift3D,G=E.Geometry,C=DriftCatalog;
function surface(color,metal=.0,rough=.8,glow=0){return{color,metal,rough,glow}}
function beam(g,a,b,width,mat){const d=b.map((v,i)=>v-a[i]),len=Math.hypot(...d),n=d.map(v=>v/len),cross=Math.abs(n[1])<.9?[n[2],0,-n[0]]:[1,0,0],cl=Math.hypot(...cross),u=cross.map(v=>v/cl*width/2),v=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]],corners=p=>[[1,1],[-1,1],[-1,-1],[1,-1]].map(([x,y])=>p.map((q,i)=>q+x*u[i]+y*v[i])),aa=corners(a),bb=corners(b);for(let i=0;i<4;i++)g.quad(aa[i],aa[(i+1)%4],bb[(i+1)%4],bb[i],mat);g.quad(...aa.reverse(),mat);g.quad(...bb,mat)}
function ring(g,x,y,z,outer,inner,width,mat,axis='z',segments=32){const p=(a,r,d)=>axis==='x'?[x+d,y+Math.sin(a)*r,z+Math.cos(a)*r]:[x+Math.cos(a)*r,y+Math.sin(a)*r,z+d];for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;for(const side of[-1,1]){const face=[p(a,inner,side*width/2),p(a,outer,side*width/2),p(b,outer,side*width/2),p(b,inner,side*width/2)];if(axis==='x'?side>0:side<0)face.reverse();g.quad(...face,mat)}const edge=[p(a,outer,-width/2),p(b,outer,-width/2),p(b,outer,width/2),p(a,outer,width/2)];if(axis==='x')edge.reverse();g.quad(...edge,mat)}}
function paintMaterial(setup){return surface(C.paintColor(setup),setup.finish==='metal'?.72:setup.finish==='matte'?.04:.4,setup.finish==='matte'?.86:setup.finish==='metal'?.31:.26)}
function accentMaterial(setup){return surface({black:'#172125',acid:'#c7ee49',white:'#edf1e8'}[setup.accent]||'#edf1e8',.2,.38)}
// Lofted closed shells, with smoothly joined sections and fitted caps.
function loft(g,sections,mat,offset=0){const start=g.v.length,profiles=sections.map(([z,w,bottom,top])=>[[-w*.8+offset,bottom,z],[-w+offset,bottom+.06,z],[-w+offset,top-.055,z],[-w*.72+offset,top,z],[offset,top+.018,z],[w*.72+offset,top,z],[w+offset,top-.055,z],[w+offset,bottom+.06,z],[w*.8+offset,bottom,z]]);for(let n=1;n<profiles.length;n++)for(let k=0;k<9;k++)g.quad(profiles[n-1][k],profiles[n][k],profiles[n][(k+1)%9],profiles[n-1][(k+1)%9],mat);for(const [j,reverse]of[[0,false],[profiles.length-1,true]])for(let k=1;k<8;k++){const a=[profiles[j][0],profiles[j][k],profiles[j][k+1]];if(reverse)a.reverse();g.tri(...a,mat)}smoothGeometry(g,start)}
function sidePoint(c,setup,side,y,z){const index=Math.max(0,Math.min(BODY_SEGMENTS-1,Math.floor((z+c.l/2)/c.l*BODY_SEGMENTS))),a=bodySection(c,setup,-c.l/2+c.l*index/BODY_SEGMENTS),b=bodySection(c,setup,-c.l/2+c.l*(index+1)/BODY_SEGMENTS),fraction=(z-a[0][2])/(b[0][2]-a[0][2]),section=a.map((p,i)=>p.map((v,j)=>v+(b[i][j]-v)*fraction));for(const [lo,hi]of[[0,1],[1,2],[2,3]]){const p=section[lo],q=section[hi];if(y>=Math.min(p[1],q[1])-1e-6&&y<=Math.max(p[1],q[1])+1e-6){const t=(y-p[1])/(q[1]-p[1]||1);return[side*(Math.abs(p[0]+(q[0]-p[0])*t)+.008),y,z]}}return[side*(Math.abs(section[3][0])+.008),y,z]}
function doorGap(g,c,setup,side,a,b,mat){const steps=16,dy=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dy,dz),oy=-dz/len*.0055,oz=dy/len*.0055;for(let i=0;i<steps;i++){const t=i/steps,u=(i+1)/steps,p=(v,edge)=>sidePoint(c,setup,side,a[0]+dy*v+oy*edge,a[1]+dz*v+oz*edge);g.quad(p(t,-1),p(u,-1),p(u,1),p(t,1),mat)}}
function pipe(g,x,y,z,side,outer,metal,trim){ring(g,x,y,z,outer,outer*.74,.12,metal,'z',28);const end=z+side*.06,back=z-side*.061;for(let i=0;i<28;i++){const a=i/28*Math.PI*2,b=(i+1)/28*Math.PI*2,p=(t,d)=>[x+Math.cos(t)*outer*.74,y+Math.sin(t)*outer*.74,d];g.quad(p(a,end),p(b,end),p(b,back),p(a,back),trim)}disk(g,x,y,back,outer*.735,trim,28)}
const glyphs={
 A:'01110/10001/10001/11111/10001/10001/10001',B:'11110/10001/10001/11110/10001/10001/11110',C:'01111/10000/10000/10000/10000/10000/01111',D:'11110/10001/10001/10001/10001/10001/11110',E:'11111/10000/10000/11110/10000/10000/11111',F:'11111/10000/10000/11110/10000/10000/10000',G:'01111/10000/10000/10111/10001/10001/01111',H:'10001/10001/10001/11111/10001/10001/10001',I:'11111/00100/00100/00100/00100/00100/11111',J:'00111/00010/00010/00010/10010/10010/01100',K:'10001/10010/10100/11000/10100/10010/10001',L:'10000/10000/10000/10000/10000/10000/11111',M:'10001/11011/10101/10101/10001/10001/10001',N:'10001/11001/10101/10011/10001/10001/10001',O:'01110/10001/10001/10001/10001/10001/01110',P:'11110/10001/10001/11110/10000/10000/10000',Q:'01110/10001/10001/10001/10101/10010/01101',R:'11110/10001/10001/11110/10100/10010/10001',S:'01111/10000/10000/01110/00001/00001/11110',T:'11111/00100/00100/00100/00100/00100/00100',U:'10001/10001/10001/10001/10001/10001/01110',V:'10001/10001/10001/10001/10001/01010/00100',W:'10001/10001/10001/10101/10101/10101/01010',X:'10001/10001/01010/00100/01010/10001/10001',Y:'10001/10001/01010/00100/00100/00100/00100',Z:'11111/00001/00010/00100/01000/10000/11111',
 '0':'01110/10001/10011/10101/11001/10001/01110','1':'00100/01100/00100/00100/00100/00100/01110','2':'01110/10001/00001/00010/00100/01000/11111','3':'11110/00001/00001/01110/00001/00001/11110','4':'00010/00110/01010/10010/11111/00010/00010','5':'11111/10000/10000/11110/00001/00001/11110','6':'01110/10000/10000/11110/10001/10001/01110','7':'11111/00001/00010/00100/01000/01000/01000','8':'01110/10001/10001/01110/10001/10001/01110','9':'01110/10001/10001/01111/00001/00001/01110','-':'00000/00000/00000/11111/00000/00000/00000'};
function plate(g,text,y,z,side=1){const width=.58,height=.145,chars=C.plateText(text||'DRIFT 01'),map={А:'A',В:'B',Е:'E',К:'K',М:'M',Н:'H',О:'O',Р:'P',С:'C',Т:'T',У:'Y',Х:'X'};g.box(0,y,z,width+.025,height+.024,.018,surface('#182025',.2,.65));g.box(0,y,z+side*.014,width,height,.012,surface('#e4e7de',.05,.75));const cell=Math.min(.012,(width-.045)/(chars.length*6-1)),start=-(chars.length*6-1)*cell/2;for(let k=0;k<chars.length;k++){const rows=(glyphs[map[chars[k]]||chars[k]]||'').split('/');for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(rows[row]?.[col]==='1'){const x=(start+(k*6+col)*cell)*side,yy=y+(3-row)*cell,zz=z+side*.022;g.quad([x,yy+cell/2,zz],[x+cell*side,yy+cell/2,zz],[x+cell*side,yy-cell/2,zz],[x,yy-cell/2,zz],surface('#152024',0,.85))}}}
const BODY_SEGMENTS=48;
function bodySection(c,setup,z){const deck=hoodHeight(c.id),L=c.l/2,t=Math.abs(z)/L,corner=c.body==='retro'?.035:c.body==='muscle'?.06:c.body==='super'?.2:.12,half=c.w/2*(1-corner*Math.pow(t,8)),dz=Math.min(Math.abs(z-c.base/2),Math.abs(z+c.base/2)),wheelY=c.radius-C.stats(c.id,setup).height,arch=c.radius+.075,cut=dz<arch?wheelY+Math.sqrt(arch*arch-dz*dz):.39,baseTop=deck+.065*Math.exp(-dz*dz/.24)-(c.body==='super'?.13:.055)*Math.pow(t,6),top=Math.max(baseTop,cut+.055),edge=dz<arch?cut:.39;
 return[[-half*.78,.33,z],[-half,edge,z],[-half,Math.max(edge+.022,top-.12),z],[-half*.91,top,z],[0,deck+.042-(c.body==='super'?.13:.05)*Math.pow(t,6),z],[half*.91,top,z],[half,Math.max(edge+.022,top-.12),z],[half,edge,z],[half*.78,.33,z]];
}
function formulaNose(c,z){const sections=[[.15,.34,.698],[.8,.26,.638],[1.55,.2,.498],[c.l/2-.2,.12,.358],[c.l/2,.085,.308]];for(let i=1;i<sections.length;i++)if(z<=sections[i][0]){const t=(z-sections[i-1][0])/(sections[i][0]-sections[i-1][0]);return[sections[i-1][1]+(sections[i][1]-sections[i-1][1])*t,sections[i-1][2]+(sections[i][2]-sections[i-1][2])*t]}return[.085,.308]}
function bodyTop(c,setup,x,z){if(c.body==='formula'){const [half,top]=formulaNose(c,z);return top-.018*Math.min(1,Math.abs(x)/(half*.72))}const index=Math.max(0,Math.min(BODY_SEGMENTS-1,Math.floor((z+c.l/2)/c.l*BODY_SEGMENTS))),a=bodySection(c,setup,-c.l/2+c.l*index/BODY_SEGMENTS),b=bodySection(c,setup,-c.l/2+c.l*(index+1)/BODY_SEGMENTS),k=x<0?3:4,faces=[[a[k],b[k],b[k+1]],[a[k],b[k+1],a[k+1]]];
 for(const [p,q,r]of faces){const den=(q[2]-r[2])*(p[0]-r[0])+(r[0]-q[0])*(p[2]-r[2]),u=((q[2]-r[2])*(x-r[0])+(r[0]-q[0])*(z-r[2]))/den,v=((r[2]-p[2])*(x-r[0])+(p[0]-r[0])*(z-r[2]))/den;if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)return u*p[1]+v*q[1]+(1-u-v)*r[1]}
 return a[4][1];
}
function bodyDecal(g,c,setup,left,right,start,end,mat,offset=.006){const zs=[start];for(let i=0;i<=BODY_SEGMENTS;i++){const z=-c.l/2+c.l*i/BODY_SEGMENTS;if(z>start&&z<end)zs.push(z)}if(c.body==='formula')for(const z of[.8,1.55,c.l/2-.2])if(z>start&&z<end)zs.push(z);zs.push(end);zs.sort((a,b)=>a-b);const xs=left<0&&right>0?[left,0,right]:[left,right];for(let i=0;i<zs.length-1;i++)for(let j=0;j<xs.length-1;j++){const p=(x,z)=>{if(c.body==='formula'){const half=formulaNose(c,z)[0];x=Math.max(-half*.69,Math.min(half*.69,x*half/.34*.7))}return[x,bodyTop(c,setup,x,z)+offset,z]};g.quad(p(xs[j],zs[i]),p(xs[j],zs[i+1]),p(xs[j+1],zs[i+1]),p(xs[j+1],zs[i]),mat)}}
function smoothGeometry(g,start=0,end=g.v.length){const groups=new Map();for(let i=start;i<end;i+=12){const key=g.v.slice(i,i+3).map(v=>v.toFixed(6)).join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i)}const original=g.v.slice();for(const indices of groups.values())for(const i of indices){const n=original.slice(i+3,i+6),sum=[0,0,0];for(const j of indices){const other=original.slice(j+3,j+6);if(n.reduce((v,k,d)=>v+k*other[d],0)>.78)for(let d=0;d<3;d++)sum[d]+=other[d]}const len=Math.hypot(...sum);if(len>1e-9)for(let d=0;d<3;d++)g.v[i+3+d]=sum[d]/len}}
function disk(g,x,y,z,r,mat,segments=28){for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;g.tri([x,y,z],[x+Math.cos(a)*r,y+Math.sin(a)*r,z],[x+Math.cos(b)*r,y+Math.sin(b)*r,z],mat)}}
// Suspension follows the same steering rotation as the wheel carrier, in body coordinates.
function suspensionJoints(id,setup=C.setup(id),steer=0,frontOnly=false){
 const c=C.getCar(id),joints=[],height=C.stats(id,setup).height;if(c.body!=='formula')return joints;
 for(const side of[-1,1])for(const z of(frontOnly?[c.base/2]:[-c.base/2,c.base/2])){
  const angle=z>0?steer*.42:0,offset=.16*c.radius/.45;
  const hub=[side*c.w*.51-side*offset*Math.cos(angle),c.radius-height,z+side*offset*Math.sin(angle)];
  for(const dy of[-.09,.09]){const end=[hub[0],hub[1]+dy,hub[2]];
   for(const dz of[-.23,.23]){const az=z+dz,half=z>0?formulaNose(c,az)[0]:.30;
    // Both anchors penetrate the shell; upper pickups stay below the tapered nose.
    const y=z>0?Math.min(dy<0?.29:.44,formulaNose(c,az)[1]-.065):dy<0?.33:.56;
    joints.push({start:[side*(half-.025),y,az],end:[...end],hub:[...hub],side,z,angle});
   }
  }
 }
 return joints;
}
function suspension(id,setup=C.setup(id),steer=0,frontOnly=false){const g=new G(),arms=surface('#263035',.3,.55),metal=surface('#b8c2c7',.85,.28),joints=suspensionJoints(id,setup,steer,frontOnly);
 for(const j of joints)beam(g,j.start,j.end,.034,arms);
 for(let i=0;i<joints.length;i+=4){const hub=joints[i].hub;beam(g,[hub[0],hub[1]-.11,hub[2]],[hub[0],hub[1]+.11,hub[2]],.055,metal)}
 return g;
}
function vehicle(id,setup=C.setup(id)){
 const c=C.getCar(id),g=new G(),w=c.w,L=c.l/2,h=c.roof,body=c.body,deck=hoodHeight(id),paint=paintMaterial(setup),trim=surface('#141c20',.1,.83),metal=surface('#b8c2c7',.9,.23),glass=surface({light:'#7799a8',dark:'#121f29',medium:'#263d4c'}[setup.tint]||'#263d4c',.65,.14),seam=surface('#263136',.2,.65),carbon=surface('#20282c',.15,.72),white=surface({amber:'#ffe1a1',blue:'#9fdaff',white:'#d8edff'}[setup.headlights]||'#d8edff',.1,.24,.45),red=surface('#c62e3d',.1,.25,.4);
 const arch=c.radius+.075,wheelY=c.radius-C.stats(id,setup).height;
 if(body==='formula'){
  // Sculpted nose, recessed cockpit and tapered sidepods for the open-wheel car.
  loft(g,[[-L+.2,.2,.27,.42],[-1.72,.32,.3,.7],[-1.05,.35,.31,.8],[-.74,.33,.32,.81],[-.73,.3,.32,.55],[.14,.3,.29,.55],[.15,.34,.29,.68],[.8,.26,.27,.62],[1.55,.2,.25,.48],[L-.2,.12,.24,.34],[L,.085,.24,.29]],paint);
  // Cockpit rim encloses a dark, recessed seat instead of a floating rectangular block.
  g.box(0,.575,-.31,.48,.04,.74,trim);g.box(0,.695,-.59,.34,.25,.13,trim);for(const side of[-1,1])beam(g,[side*.27,.75,-.71],[side*.28,.68,.18],.085,paint);beam(g,[-.27,.75,-.71],[.27,.75,-.71],.06,paint);g.box(0,.595,-.35,.33,.05,.4,trim);
  loft(g,[[-1.62,.19,.66,.73],[-1.26,.24,.69,1.03],[-.92,.16,.73,1.14],[-.79,.13,.76,.97]],paint);
  g.box(0,1.075,-1.04,.2,.13,.1,carbon);
  for(const side of[-1,1]){
   loft(g,[[-1.55,.16,.29,.43],[-1.18,.25,.3,.66],[-.35,.29,.3,.64],[.36,.24,.29,.59],[.65,.12,.3,.42]],paint,side*.58);
   g.box(side*.58,.51,.645,.25,.13,.018,carbon);
   for(let i=0;i<4;i++)g.box(side*.58,.6+i*.009,-.94-i*.095,.25,.012,.035,carbon);
   // Halo uprights and center nose support are anchored into the cockpit surround.
   const haloStart=g.v.length;beam(g,[side*.25,.77,-.74],[side*.29,1.03,-.64],.047,carbon);
   beam(g,[side*.29,1.03,-.64],[side*.28,1.03,.1],.047,carbon);
   beam(g,[side*.28,1.03,.1],[0,.96,.29],.047,carbon);
   if(side<0)beam(g,[0,.96,.29],[0,.67,.42],.046,carbon);(g.noHoodRanges??=[]).push([haloStart,g.v.length]);
   g.box(side*.57,.77,.48,.12,.065,.14,paint);beam(g,[side*.3,.69,.43],[side*.54,.75,.48],.025,carbon);
  }
  for(const end of[-1,1]){
   const z=end*(L-.17),y=end>0?.31:setup.spoiler==='race'?1.07:setup.spoiler==='duck'?.81:.94;
   const levels=setup.bodykit==='race'?3:2;
   for(let i=0;i<levels;i++){const zz=z+i*.11;g.prism([[zz-.13,y+i*.066],[zz+.13,y+i*.066+.015],[zz+.1,y+i*.066+.047],[zz-.11,y+i*.066+.028]],w*(end>0?.87:.79),carbon)}
   for(const side of[-1,1]){g.box(side*w*(end>0?.437:.397),y+.075,z+.045,.026,.22,.43,paint);if(end<0)beam(g,[side*.3,.39,z+.14],[side*.3,y,z+.14],.045,carbon)}
  }
  if(setup.bodykit!=='stock')for(const side of[-1,1])g.box(side*(setup.bodykit==='race'?.8:.76),.285,-.47,setup.bodykit==='race'?.2:.11,.035,1.72,carbon);
  g.box(0,.28,-L+.28,1.3,.04,.5,carbon);for(const x of[-.48,-.24,0,.24,.48])g.box(x,.24,-L+.25,.018,.1,.53,carbon);
  const tips=setup.exhaust==='single'?[.38]:setup.exhaust==='quad'?[-.5,-.35,.35,.5]:[-.42,.42];for(const x of tips)pipe(g,x,.36,-L+.09,-1,.052,metal,trim);
  g.box(0,.445,-L+.16,.61,.165,.19,carbon);plate(g,setup.plate,.445,-L+.052,-1);
 }else{
  // Contoured shell with wheel cut-outs, flared shoulders and rounded bumper corners.
  const shellStart=g.v.length;let previous=null;const sections=BODY_SEGMENTS;
  for(let i=0;i<=sections;i++){const z=-L+c.l*i/sections,pts=bodySection(c,setup,z);
   if(previous){for(let k=0;k<pts.length;k++){
    if((k===3||k===4)&&((body==='roadster'&&previous[0][2]>=-.96&&z<=.65)||(body==='pickup'&&previous[0][2]>=-L+.12&&z<=-.7))){const side=k===3?-1:1,x=side*w*(body==='pickup'?.37:.34),p=(section)=>[x,bodyTop(c,setup,x,section[0][2]),section[0][2]],innerA=p(previous),innerB=p(pts),outerA=previous[k===3?3:5],outerB=pts[k===3?3:5];const floor=body==='pickup'?deck-.24:.52,rail=[outerA,outerB,innerB,innerA],wall=[innerA,innerB,[x,floor,z],[x,floor,previous[0][2]]];if(side>0){rail.reverse();wall.reverse()}g.quad(...rail,paint);g.quad(...wall,trim)}
    else g.quad(previous[k],pts[k],pts[(k+1)%pts.length],previous[(k+1)%pts.length],paint);
   }}else for(let k=1;k<pts.length-1;k++)g.tri(pts[0],pts[k],pts[k+1],paint);previous=pts;
  }for(let k=1;k<previous.length-1;k++)g.tri(previous[0],previous[k+1],previous[k],paint);smoothGeometry(g,shellStart);
  let back=-1.05,front=.4,glassBack=-1.6,glassFront=1.18;
  if(body==='hatch'){back=-L+.35;front=.2;glassBack=-L+.13;glassFront=.98}
  if(body==='wagon'){back=-L+.35;front=.35;glassBack=-L+.13;glassFront=1.25}
  if(body==='sedan'){back=-1.08;front=.52;glassBack=-1.72;glassFront=1.42}
  if(body==='retro'){back=-1.0;front=.52;glassBack=-1.38;glassFront=1.05}
  if(body==='muscle'){back=-1.12;front=.12;glassBack=-1.67;glassFront=.97}
  if(body==='pickup'){back=-.42;front=.85;glassBack=-.61;glassFront=1.52}
  if(body==='super'){back=-.9;front=.36;glassBack=-1.54;glassFront=1.3}
  if(body==='roadster'){back=-.85;front=.56;glassBack=-.96;glassFront=.92}
  const roofW=w*(body==='retro'?.81:.71),beltW=w*.84;
  if(body==='roadster'){
   g.box(0,.54,-.15,w*.68,.08,1.6,trim);g.box(0,(.52+deck+.06)/2,-.97,w*.69,deck+.06-.52,.09,trim);g.box(0,(.52+deck+.06)/2,.64,w*.69,deck+.06-.52,.09,trim);
   g.quad([-beltW/2,deck+.045,.92],[beltW/2,deck+.045,.92],[roofW/2,h,.56],[-roofW/2,h,.56],glass);
   beam(g,[-roofW/2,h,.56],[roofW/2,h,.56],.045,metal);
   for(const side of[-1,1]){beam(g,[side*beltW/2,deck+.045,.92],[side*roofW/2,h,.56],.045,paint);g.box(side*.39,.9,-.53,.43,.62,.17,trim);g.box(side*.39,.66,-.25,.43,.16,.54,trim);g.box(side*.39,1.17,-.53,.29,.17,.18,surface('#433035',.1,.9));
    const center=side*.39,y=1.14,z=-.77;for(const edge of[-1,1])beam(g,[center+edge*.18,deck-.015,z],[center+edge*.18,y,z],.045,metal);for(let i=0;i<16;i++){const a=i/16*Math.PI,b=(i+1)/16*Math.PI;beam(g,[center+Math.cos(a)*.18,y+Math.sin(a)*.18,z],[center+Math.cos(b)*.18,y+Math.sin(b)*.18,z],.045,metal)}
   }
  }else{
   g.quad([-beltW/2,deck+.045,glassFront],[beltW/2,deck+.045,glassFront],[roofW/2,h,front],[-roofW/2,h,front],glass);
   g.quad([-roofW/2,h,back],[roofW/2,h,back],[beltW/2,deck+.045,glassBack],[-beltW/2,deck+.045,glassBack],glass);
   for(const side of[-1,1]){const windowFace=[[side*beltW/2,deck+.045,glassBack],[side*beltW/2,deck+.045,glassFront],[side*roofW/2,h-.03,front],[side*roofW/2,h-.03,back]];if(side>0)windowFace.reverse();g.quad(...windowFace,glass);beam(g,[side*beltW/2,deck+.04,glassFront],[side*roofW/2,h-.025,front],.055,paint);beam(g,[side*beltW/2,deck+.04,glassBack],[side*roofW/2,h-.025,back],.08,paint);beam(g,[side*(beltW/2+.015),deck+.06,-.28],[side*(roofW/2+.015),h-.058,-.28],.055,carbon);beam(g,[side*beltW/2,deck+.025,glassBack],[side*beltW/2,deck+.025,glassFront],.045,metal);if(['wagon','sedan','hatch'].includes(body))beam(g,[side*(beltW/2+.015),deck+.04,back+.4],[side*(roofW/2+.015),h-.05,back+.4],.045,paint)}
   // A crowned roof gives paint a readable curved highlight rather than a flat slab.
   const roofStart=g.v.length,roof=[[-roofW/2,h,back-.025],[-roofW*.43,h+.045,back-.025],[0,h+.07,back-.025],[roofW*.43,h+.045,back-.025],[roofW/2,h,back-.025]];
   for(let i=0;i<4;i++){const a=roof[i],b=roof[i+1],aa=[a[0],a[1],front+.025],bb=[b[0],b[1],front+.025];g.quad(a,aa,bb,b,paint);g.quad([a[0],a[1]-.065,a[2]],[b[0],b[1]-.065,b[2]],b,a,paint);g.quad(aa,bb,[bb[0],bb[1]-.065,bb[2]],[aa[0],aa[1]-.065,aa[2]],paint)}
   for(const side of[-1,1])g.box(side*roofW/2,h-.027,(back+front)/2,.025,.062,front-back+.05,paint);smoothGeometry(g,roofStart);
   for(const side of[-1,1]){const z=glassFront-.025,wy=deck+.045+(h-deck-.045)*(glassFront-z)/(glassFront-front);beam(g,[side*w*.34,wy+.008,z],[side*w*.075,wy+.008,z],.012,carbon)};
  }
  for(const side of[-1,1]){
   // Panel gaps, door handles, sill extensions and mirrors.
   const rearEdge=-c.base/2+arch+.12,frontEdge=c.base/2-arch-.12,low=.49,high=deck-.052;
   const outline=[[high,rearEdge],[low+.055,rearEdge],[low,rearEdge+.06],[low,frontEdge-.06],[low+.055,frontEdge],[high,frontEdge]];
   for(let i=0;i<outline.length-1;i++)doorGap(g,c,setup,side,outline[i],outline[i+1],seam);
   const handleZ=rearEdge+.19,handle=sidePoint(c,setup,side,deck-.13,handleZ);g.box(handle[0]+side*.006,handle[1],handle[2],.025,.031,.15,metal);
   g.box(side*w*.49,.375,0,.07,.085,frontEdge-rearEdge+.22,carbon);
   beam(g,[side*w*.42,deck+.09,glassFront-.15],[side*w*.54,deck+.12,glassFront-.2],.045,carbon);g.box(side*w*.57,deck+.14,glassFront-.2,.22,.13,.25,paint);g.box(side*w*.57,deck+.14,glassFront-.335,.18,.085,.012,metal);g.box(side*w*.58,deck+.115,glassFront-.072,.19,.02,.012,white);
   bodyDecal(g,c,setup,side*w*.28-.005,side*w*.28+.005,glassFront+.045,L-.18,seam,.005);

  }
  // Model-specific front and rear lighting, grille mesh and license recesses.
  const frontZ=L+.016,rearZ=-L-.016,noseHalf=bodySection(c,setup,L)[5][0];
  g.box(0,deck-.28,frontZ,w*.58,.22,.04,trim);
  for(let i=-5;i<=5;i++)g.box(i*w*.045,deck-.28,frontZ+.025,.024,.18,.014,metal);
  for(const side of[-1,1]){
   if(['retro','muscle'].includes(body)){for(const shift of[-.12,.12]){const x=side*noseHalf*.64+shift;ring(g,x,deck-.13,frontZ+.003,.105,.079,.025,metal,'z',28);disk(g,x,deck-.13,frontZ+.018,.077,white,28)}}else{
    const x=side*noseHalf*.66,width=noseHalf*.53;g.box(x,deck-.13,frontZ,width,.15,.035,trim);g.box(x,deck-.105,frontZ+.024,width*.91,.028,.016,white);for(let i=0;i<3;i++)disk(g,x+(i-1)*width*.22,deck-.155,frontZ+.023,.02,white,16);
   }
   g.box(side*noseHalf*.67,deck-.14,rearZ,noseHalf*.51,.135,.036,trim);g.box(side*noseHalf*.67,deck-.1,rearZ-.025,noseHalf*.46,.032,.014,red);g.box(side*noseHalf*.67,deck-.16,rearZ-.025,noseHalf*.46,.025,.014,red);
   g.box(side*w*.36,.46,frontZ+.015,w*.2,.105,.035,trim);g.box(side*noseHalf*.86,deck-.145,frontZ+.024,.035,.025,.008,surface('#e49b38',.1,.35,.15));
  }
  g.box(0,.33,L-.06,w*.96,.07,.28,carbon);g.box(0,.37,-L+.055,w*.81,.08,.27,carbon);for(let x=-3;x<=3;x++)g.box(x*w*.095,.275,-L-.05,.027,.115,.29,carbon);
  const tips=setup.exhaust==='single'?[-w*.29]:setup.exhaust==='quad'?[-w*.31,-w*.22,w*.22,w*.31]:[-w*.3,w*.3];for(const x of tips)pipe(g,x,.455,rearZ-.055,-1,setup.exhaust==='single'?.092:.073,metal,trim);
  for(const z of[frontZ+.045,rearZ-.045])plate(g,setup.plate,.575,z,Math.sign(z));
  if(setup.bodykit!=='stock'){
   const race=setup.bodykit==='race';g.box(0,.345,L-.045,w*(race?1.03:.97),.035,race?.4:.32,carbon);
   for(const side of[-1,1]){g.box(side*w*.505,.345,0,.115,.075,frontEdgeLength(c),carbon);if(race){beam(g,[side*w*.4,.38,L+.025],[side*w*.4,.5,L-.12],.014,metal);const start=g.v.length;g.prism([[L-.25,.38],[L+.03,.43],[L+.03,.47],[L-.25,.41]],.22,carbon);for(let i=start;i<g.v.length;i+=12)g.v[i]+=side*w*.44;}}
  }
  if(body==='retro'){g.box(0,.51,L+.075,w*1.02,.105,.12,metal);g.box(0,.51,-L-.085,w*1.02,.105,.12,metal)}
  if(body==='muscle'){g.prism([[1.02,deck+.03],[1.67,deck+.03],[1.58,deck+.24],[1.12,deck+.24]],.59,paint);g.box(0,deck+.16,1.68,.46,.09,.03,trim)}
  if(body==='pickup'){g.box(0,deck-.22,(-L+.16-.7)/2,w*.75,.06,L-.86,trim);g.box(0,deck+.2,-.7,w*.82,.52,.12,paint);for(const side of[-1,1]){g.box(side*w*.45,deck+.2,-1.65,.18,.52,2.03,paint);beam(g,[side*.74,deck+.1,-.7],[side*.74,deck+.76,-.7],.075,metal);beam(g,[side*.74,deck+.76,-.7],[side*.74,deck+.76,-1.18],.075,metal)}beam(g,[-.74,deck+.76,-.7],[.74,deck+.76,-.7],.075,metal);g.box(0,deck+.2,-L+.07,w*.91,.52,.14,paint);for(let i=-5;i<=5;i++)g.box(i*w*.065,deck-.184,-1.65,.018,.012,1.85,surface('#455158',.4,.54))}
  if(body==='wagon')for(const side of[-1,1]){const x=side*w*.28;beam(g,[x,h+.092,back+.15],[x,h+.092,front-.13],.035,metal);for(const z of[back+.2,front-.18])g.box(x,h+.052,z,.065,.08,.12,carbon)}
  if(body==='super'){for(const side of[-1,1]){g.box(side*w*.5,.73,-.19,.04,.18,.6,trim);for(let i=0;i<4;i++)g.box(side*w*.511,.67+i*.038,-.2,.02,.014,.55,metal)}for(let i=-4;i<=4;i++)g.box(i*.14,bodyTop(c,setup,i*.14,-1.76)+.012,-1.76,.075,.024,.3,carbon)}
 }
 if(body!=='formula'&&(setup.spoiler!=='stock'||['coupe','super'].includes(body))){
  const race=setup.spoiler==='race',duck=setup.spoiler==='duck',height=deck+(race?.55:duck?.11:.25),span=w*(race?1.03:.9);for(const x of[-span*.32,span*.32]){const anchor=body==='formula'?.83:bodyTop(c,setup,x,-L+.26);g.box(x,(anchor+height)/2,-L+.26,.055,Math.max(.025,height-anchor),.09,carbon)};
  g.prism([[-L+.06,height],[-L+.5,height+.035],[-L+.5,height+.095],[-L+.1,height+.07]],span,race?carbon:paint);if(race)for(const side of[-1,1])g.box(side*span/2,height+.08,-L+.26,.035,.23,.53,paint);
 }
 if(setup.livery!=='none'){
  const ink=accentMaterial(setup),start=body==='pickup'?1.58:body==='formula'?.85:body==='roadster'?.98:body==='hatch'?1.03:body==='retro'?1.1:body==='muscle'?1.03:body==='super'?1.35:body==='sedan'?1.47:1.3;
  for(const side of[-1,1])bodyDecal(g,c,setup,side*.22-.085,side*.22+.085,start,L-.14,ink,.006);
  if(setup.livery==='race')for(const side of[-1,1]){if(body==='formula'){const sections=[[-1.18,.25],[-.35,.29],[.36,.24]],p=(i,y)=>[side*(.58+sections[i][1]+.005),y,sections[i][0]];for(let i=0;i<2;i++)g.quad(p(i,.42),p(i+1,.42),p(i+1,.48),p(i,.48),ink)}else{g.box(side*w*.508,deck-.24,-.1,.017,.24,.72,ink);for(let i=0;i<4;i++)g.box(side*w*.512,deck-.23,-.32+i*.13,.009,.15,.04,carbon)}}
 }
 return g;
}
function rim(style='stock'){
 const g=new G(),rubber=surface('#12181c',0,.98),sidewall=surface('#21282e',.05,.86),metal=surface(style==='gold'?'#d7b46c':style==='black'?'#59616c':'#c6d0d7',.9,.21),dark=surface('#20262c',.35,.5),disc=surface('#79828b',.75,.4),segments=48;
 // Rounded tyre shoulders: a revolved meridian instead of a polygonal cylinder.
 const profile=[[-.165,.302],[-.18,.345],[-.167,.416],[-.124,.45],[.124,.45],[.167,.416],[.18,.345],[.165,.302]];
 for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2,p=(v,angle)=>[v[0],Math.sin(angle)*v[1],Math.cos(angle)*v[1]];for(let j=0;j<profile.length-1;j++)g.quad(p(profile[j],a),p(profile[j+1],a),p(profile[j+1],b),p(profile[j],b),j===3?rubber:sidewall);
  for(const x of[-.065,.065]){const p=(angle,offset,r)=>[x+offset,Math.sin(angle)*r,Math.cos(angle)*r];g.quad(p(a,-.023,.451),p(a+.012,.02,.451),p(b-.03,.034,.451),p(b-.042,-.009,.451),sidewall)}
 }
 smoothGeometry(g);
 for(const side of[-1,1]){
  ring(g,side*.17,0,0,.314,.283,.018,metal,'x',segments);ring(g,side*.137,0,0,.261,.052,.012,disc,'x',32);ring(g,side*.159,0,0,.278,.265,.02,dark,'x',32);
  for(let i=0;i<20;i++){const a=i/20*Math.PI*2;g.box(side*.146,Math.sin(a)*.215,Math.cos(a)*.215,.014,.019,.019,dark)}
  const spokes=style==='mesh'?12:style==='aero'?6:style==='sport'?6:style==='black'?7:5;
  for(let i=0;i<spokes;i++){const a=i/spokes*Math.PI*2;const p=(r,angle,x)=>[side*x,Math.sin(angle)*r,Math.cos(angle)*r];for(const shift of(style==='sport'?[0]:[-.035,.035]))g.quad(p(.058,a+shift-.13,.177),p(.058,a+shift+.13,.177),p(.283,a+shift+.025,.177),p(.283,a+shift-.025,.177),metal)}
  if(style==='aero')ring(g,side*.178,0,0,.257,.08,.007,metal,'x',32);
  ring(g,side*.18,0,0,.073,.0,.025,metal,'x',20);for(let i=0;i<5;i++){const a=i/5*Math.PI*2;g.box(side*.199,Math.sin(a)*.047,Math.cos(a)*.047,.016,.021,.021,dark)}
 }
 return g;
}
function frontEdgeLength(c){return c.base-2*(c.radius+.12)}
function brake(id,setup=C.setup(id)){const c=C.getCar(id),g=new G();for(const side of[-1,1])g.box(side*.12,.055,.195,.06,.16,.12,surface(setup.calipers==='acid'?'#c7ee49':setup.calipers==='red'?'#ca3c3d':['super','formula','muscle'].includes(c.body)?'#ca3c3d':'#b48b45',.15,.5));return g}

function hoodHeight(id){const body=C.getCar(id).body;return body==='pickup'?1.17:body==='super'?.9:body==='formula'?.54:.99}
function noseView(source){const g=new G();for(let i=0;i<source.v.length;i+=36){if(source.noHoodRanges?.some(([a,b])=>i>=a&&i<b))continue;const polygon=[source.v.slice(i,i+12),source.v.slice(i+12,i+24),source.v.slice(i+24,i+36)];const clipped=[];for(let j=0;j<3;j++){const a=polygon[j],b=polygon[(j+1)%3],inside=a[2]>=.14,next=b[2]>=.14;if(inside)clipped.push(a);if(inside!==next){const t=(.14-a[2])/(b[2]-a[2]);clipped.push(a.map((v,k)=>v+(b[k]-v)*t))}}for(let k=1;k<clipped.length-1;k++)g.v.push(...clipped[0],...clipped[k],...clipped[k+1])}return g}
function hood(id,setup=C.setup(id)){const c=C.getCar(id);if(c.body==='formula')return noseView(vehicle(id,setup));const g=new G(),paint=paintMaterial(setup),start=.67,end=c.l/2;
 for(let i=0;i<BODY_SEGMENTS;i++){const a=-end+c.l*i/BODY_SEGMENTS,b=-end+c.l*(i+1)/BODY_SEGMENTS;if(b<=start)continue;const aa=bodySection(c,setup,Math.max(start,a)),bb=bodySection(c,setup,b);for(let k=2;k<6;k++)g.quad(aa[k],bb[k],bb[k+1],aa[k+1],paint)}smoothGeometry(g);
 if(c.body==='muscle'){const deck=hoodHeight(id);g.prism([[1.02,deck+.03],[1.67,deck+.03],[1.58,deck+.24],[1.12,deck+.24]],.59,paint)}
 if(setup.livery!=='none'){const ink=accentMaterial(setup);for(const side of[-1,1])bodyDecal(g,c,setup,side*.22-.085,side*.22+.085,start,end-.14,ink,.006)}return g;
}
function showroom(){const g=new G();g.box(0,-.2,0,75,.4,75,'#253333');for(let i=-30;i<=30;i+=3){g.box(i,.005,0,.03,.006,60,'#344344');g.box(0,.005,i,60,.006,.03,'#344344')}
 g.cylinder(0,.06,0,4.5,.12,'#4d605c',64);g.cylinder(0,.125,0,4.22,.015,'#344a47',64);
 for(let i=0;i<60;i++){const a=i/60*Math.PI*2;g.box(Math.sin(a)*4.37,.133,Math.cos(a)*4.37,.035,.018,.32,i%3===0?'#d6ee6b':'#9dad9c',a)}
 g.box(0,5,-13,45,10,.5,'#263e40');g.box(-18,5,0,.5,10,30,'#1c3032');g.box(18,5,0,.5,10,30,'#1c3032');
 for(const x of[-12,-6,0,6,12]){g.box(x,4.7,-12.7,.08,8,.06,'#a1c6b2');g.box(x,8.8,-5,.14,.08,14,'#d5e4cb')}
 for(const x of[-9,9]){g.box(x,1.4,-9,3,2.8,1.5,'#3a5654');for(let y=.4;y<2.8;y+=.45)g.box(x,y,-8.2,2.8,.07,.1,'#789085')}
 return g;
}
// Local geometry keeps road-facing facades and pitched roofs aligned with each route.
function prop(type,variant=0){const d=DriftProps.defs[type],g=new G(),h=d.h,wood=surface(['#9d724b','#a88153','#886342'][variant%3],0,.88),metal=surface('#55656a',.55,.55),dark=surface('#253238',.2,.72),paint=surface(['#b26b4d','#5e8790','#9b9855'][variant%3],.25,.65),box=(x,y,z,w,hh,dd,m)=>g.box(x,y-h/2,z,w,hh,dd,m),cyl=(x,y,z,rr,hh,m,n=12)=>g.cylinder(x,y-h/2,z,rr,hh,m,n);
 if(type==='cone'){box(0,.04,0,.55,.08,.55,dark);const rings=[[.08,.24],[.35,.16],[.48,.12],[.8,.025]];for(let j=1;j<rings.length;j++)for(let k=0;k<12;k++){const a=k*Math.PI/6,b=(k+1)*Math.PI/6,p=(t,r)=>[Math.sin(t)*r[1],r[0]-h/2,Math.cos(t)*r[1]];g.quad(p(a,rings[j-1]),p(b,rings[j-1]),p(b,rings[j]),p(a,rings[j]),j===2?'#e4e5d4':'#e58644')}}
 if(type==='crate'){box(0,.5,0,1,1,1,wood);for(const side of[-1,1]){for(const y of[.13,.87])box(0,y,side*.51,1,.12,.045,dark);for(const x of[-.38,.38])box(x,.5,side*.525,.09,.98,.045,metal);beam(g,[-.4,-.32,side*.53],[.4,.32,side*.53],.055,wood)}box(0,1.015,0,.08,.04,1,metal)}
 if(type==='barrel'){cyl(0,h/2,0,.42,h,paint,18);for(const y of[.09,.34,.91,1.18])cyl(0,y,0,.435,.035,metal,18);cyl(.18,1.267,0,.055,.025,dark,8)}
 if(type==='bin'){box(0,.6,0,.8,1.2,.8,paint);box(0,1.19,0,.87,.12,.87,dark);box(0,1.26,0,.44,.035,.34,metal);for(const side of[-1,1])box(side*.43,.77,0,.07,.22,.25,dark)}
 if(type==='bench'){for(let i=0;i<5;i++)box(0,.5,-.34+i*.17,2.6,.1,.135,wood);for(const x of[-.95,.95]){box(x,.27,0,.11,.54,.78,metal);box(x,.75,-.36,.11,.68,.1,metal)}for(const y of[.77,.98])box(0,y,-.39,2.6,.14,.08,wood);for(const x of[-1.17,1.17]){box(x,.74,0,.075,.43,.075,metal);box(x,.91,0,.09,.075,.65,wood)}}
 if(type==='sign'){box(0,.05,0,.6,.1,.7,dark);box(0,.8,0,.07,1.5,.07,metal);box(0,1.48,0,1,.62,.075,'#426b86');const rows=glyphs[variant===1?'I':'P'].split('/'),cell=.067;for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(rows[row][col]==='1')box((col-2)*cell,1.48+(3-row)*cell,.042,cell*.86,cell*.86,.01,'#e6ebd9')}
 if(type==='rack'){for(const x of[-1.22,1.22])for(const z of[-.52,.52])box(x,1.05,z,.085,2.1,.085,metal);for(const y of[.18,1.0,1.92]){box(0,y,0,2.6,.08,1.2,wood);for(const z of[-.56,.56])box(0,y-.07,z,2.6,.1,.065,metal)}for(const x of[-1.22,1.22])beam(g,[x,-.83,-.52],[x,.95,.52],.035,metal)}
 if(type==='cart'){box(0,.35,0,1.22,.08,1.7,metal);for(const x of[-.56,.56])for(const z of[-.68,.68]){ring(g,x,.17-h/2,z,.17,.08,.12,dark,'x',12);box(x,.24,z,.065,.25,.065,metal)}for(const x of[-.57,.57])box(x,.76,-.91,.07,.85,.07,metal);box(0,1.16,-.91,1.2,.07,.07,dark);for(const side of[-1,1])box(side*.6,.6,0,.055,.07,1.7,metal)}
 if(type==='lamp'){cyl(0,.11,0,.32,.22,dark);cyl(0,2.85,0,.085,5.5,metal,10);beam(g,[0,2.55,0],[0,2.75,.4],.08,metal);box(0,5.64,.3,.7,.16,.9,dark);box(0,5.55,.3,.58,.022,.72,surface('#e9e7c6',0,.7,.18))}
 return g;
}
function propModel(p){const r=p.fallYaw-p.yaw,c=Math.cos(p.tilt),s=Math.sin(p.tilt),pitch=new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);return multiply(E.model(p.x,p.y,p.z,p.yaw),multiply(E.model(0,0,0,r),multiply(pitch,E.model(0,0,0,-r+(p.roll||0))))) }

function sceneryPoint(o,x,y,z){const c=Math.cos(o.yaw),s=Math.sin(o.yaw);return[o.x+x*c+z*s,y,o.z-x*s+z*c]}
function building(g,o,village=false){const p=(x,y,z)=>sceneryPoint(o,x,y,z),wall=village?['#dbc9a1','#becbbb','#b0c2cc','#c5a792'][o.index%4]:['#a5b5b7','#8d9fa8','#bdc8bf','#929caa'][o.index%4],window=surface('#547487',.45,.24),w=o.w,d=o.d,h=o.h;
 g.box(o.x,h/2,o.z,w,h,d,wall,o.yaw);
 if(village){const e=w/2+.35,f=d/2+.35,ridge=h+2.15;g.quad(p(-e,h+.08,-f),p(e,h+.08,-f),p(e,ridge,0),p(-e,ridge,0),'#97574b');g.quad(p(-e,ridge,0),p(e,ridge,0),p(e,h+.08,f),p(-e,h+.08,f),'#85493f');for(const side of[-1,1])g.tri(p(side*e,h+.08,-f),p(side*e,h+.08,f),p(side*e,ridge,0),'#b6957b');g.box(...p(w*.26,h+1.7,-d*.25),.55,1.9,.55,'#a08671',o.yaw);
  for(const x of[-w*.3,w*.3]){g.quad(p(x-.65,1.5,d/2+.02),p(x+.65,1.5,d/2+.02),p(x+.65,2.8,d/2+.02),p(x-.65,2.8,d/2+.02),window)}g.box(...p(0,1.25,d/2+.04),1.1,2.5,.08,'#68594c',o.yaw);g.box(...p(0,.13,d/2+.6),1.6,.26,1.3,'#b4b7a4',o.yaw);
  // Short garden fence stays on the house footprint, beyond the guardrail.
  for(const x of[-w/2-.7,w/2+.7]){for(const z of[-d/2,0,d/2])g.box(...p(x,.8,z),.12,1.6,.12,'#d7d4b9',o.yaw);for(const y of[.5,1.05])beam(g,p(x,y,-d/2),p(x,y,d/2),.1,'#d7d4b9')}
 }else{g.box(o.x,h+.18,o.z,w+.5,.36,d+.5,'#52636b',o.yaw);g.box(...p(0,1.15,d/2+.025),2,2.3,.06,window,o.yaw);
  for(let y=3;y<h-1;y+=2.8){g.quad(p(-w*.4,y,d/2+.025),p(w*.4,y,d/2+.025),p(w*.4,y+1.2,d/2+.025),p(-w*.4,y+1.2,d/2+.025),window);for(const side of[-1,1])g.quad(p(side*(w/2+.025),y,-d*.39),p(side*(w/2+.025),y,d*.39),p(side*(w/2+.025),y+1.2,d*.39),p(side*(w/2+.025),y+1.2,-d*.39),window)}
 }
}
function roadDecor(g,map){for(const o of C.roadScenery(map)){
 if(o.kind==='building'||o.kind==='house')building(g,o,o.kind==='house');
 if(o.kind==='lamp'){g.cylinder(o.x,3,o.z,.1,6,'#4b5f63',6);const p=sceneryPoint(o,0,6,2);beam(g,[o.x,6,o.z],p,.13,'#4b5f63');g.box(...p,1.4,.16,.7,surface('#e4e8ce',.1,.7,.12),o.yaw)}
 if(o.kind==='pine'){g.cylinder(o.x,1.8,o.z,.24,3.6,'#655a47',6);for(let layer=0;layer<3;layer++){const radius=2.2-layer*.5,base=2.1+layer*1.6,top=base+3;for(let k=0;k<7;k++){const a=k*Math.PI*2/7,b=(k+1)*Math.PI*2/7;g.tri([o.x+Math.sin(a)*radius,base,o.z+Math.cos(a)*radius],[o.x,top,o.z],[o.x+Math.sin(b)*radius,base,o.z+Math.cos(b)*radius],layer%2?'#496555':'#3d594b')}}}
 if(o.kind==='rock'){const rings=[{y:-.2,r:o.w/2},{y:o.h*.45,r:o.w*.38},{y:o.h*.82,r:o.w*.2},{y:o.h,r:.5}],n=7;for(let j=1;j<rings.length;j++)for(let k=0;k<n;k++){const point=(a,r)=>[o.x+Math.sin(a)*r.r,r.y,o.z+Math.cos(a)*r.r],a=k*Math.PI*2/n,b=(k+1)*Math.PI*2/n;g.quad(point(a,rings[j-1]),point(b,rings[j-1]),point(b,rings[j]),point(a,rings[j]),j===3?'#b6bdb8':k%2?'#858f8b':'#9aa49b')}}
 if(o.kind==='field'){g.box(o.x,.03,o.z,o.w,.08,o.d,'#afad61',o.yaw);for(let x=-o.w/2+1;x<o.w/2;x+=2){const a=sceneryPoint(o,x,.11,-o.d/2),b=sceneryPoint(o,x,.11,o.d/2);beam(g,a,b,.3,o.index%2?'#87934b':'#c2b96f')}}
 }}
function roadWorld(map){const g=new G(),road=map.road,coast=map.theme==='coast',oval=map.theme==='oval',city=map.theme==='city',mountain=map.theme==='mountain',village=map.theme==='village';g.box(0,-.6,0,1100,1,1100,coast?'#9eaf86':oval?'#769179':city?'#7e9188':mountain?'#839486':village?'#8da575':'#6d8969');if(coast)g.box(105,-.08,0,100,.025,1000,'#4c8799');
 const points=road.points,normal=i=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];if(road.loop&&(i===0||i===points.length-1)){const a=points.at(-2),b=points[1],len=Math.hypot(b.x-a.x,b.z-a.z);return[(b.z-a.z)/len,-(b.x-a.x)/len]}const len=Math.hypot(b.x-a.x,b.z-a.z)||1;return[(b.z-a.z)/len,-(b.x-a.x)/len]},at=(i,offset,y)=>{const n=normal(i),p=points[i];return[p.x+n[0]*offset,y,p.z+n[1]*offset]};
 for(let i=0;i<points.length-1;i++){
  g.quad(at(i,-road.width/2,.015),at(i+1,-road.width/2,.015),at(i+1,road.width/2,.015),at(i,road.width/2,.015),'#454f52');
  for(const side of[-1,1]){
   const edge=side*(road.width/2-.5);g.quad(at(i,edge-.07,.023),at(i+1,edge-.07,.023),at(i+1,edge+.07,.023),at(i,edge+.07,.023),'#e0e5ce');
   g.quad(at(i,side*road.width/2,.017),at(i+1,side*road.width/2,.017),at(i+1,side*(road.width/2+1.4),.017),at(i,side*(road.width/2+1.4),.017),city?'#a3aca6':'#b2b5a1');
   if(city)g.quad(at(i,side*(road.width/2+1.4),.045),at(i+1,side*(road.width/2+1.4),.045),at(i+1,side*(road.width/2+4),.045),at(i,side*(road.width/2+4),.045),'#9da8a5');
   beam(g,at(i,side*road.width/2,.65),at(i+1,side*road.width/2,.65),.16,surface('#a8b9b3',.55,.5));
  }
 }
 for(let d=12;d<road.length;d+=14){const p=C.roadAt(road,d),yaw=Math.atan2(p.dx,p.dz);g.box(p.x,.028,p.z,.15,.009,4.2,'#e1ddb6',yaw);for(const side of[-1,1]){const x=p.x+p.dz*side*road.width/2,z=p.z-p.dx*side*road.width/2;g.box(x,.35,z,.14,.7,.14,'#778e87')}}
 if(!road.loop)for(const d of[0,road.length]){const p=C.roadAt(road,d);for(const side of[-1,1])beam(g,[p.x+p.dz*side*road.width/2,.4,p.z-p.dx*side*road.width/2],[p.x+p.dz*side*road.width/2,.4,p.z-p.dx*side*road.width/2-2],.2,'#c7d0b0')}
 const finish=map.checkpoints.at(-1),yaw=Math.atan2(finish.dx,finish.dz);for(const side of[-1,1])g.box(finish.x+finish.dz*side*(road.width/2+1),2.35,finish.z-finish.dx*side*(road.width/2+1),.25,4.7,.25,'#d7e1bf');g.box(finish.x,4.65,finish.z,road.width+2.5,.55,.3,'#293c34',yaw);for(let i=0;i<Math.floor(road.width+2);i++){const offset=i-(Math.floor(road.width+2)-1)/2;g.box(finish.x+finish.dz*offset,4.65,finish.z-finish.dx*offset,1,.5,.32,i%2?'#e7ebd4':'#26372f',yaw)}
 for(let d=15,index=0;d<road.length;d+=22,index++){const p=C.roadAt(road,d);for(const side of[-1,1]){if(coast&&side>0)continue;const x=p.x+p.dz*side*(road.width/2+10+index%3*4),z=p.z-p.dx*side*(road.width/2+10+index%3*4);if(city||mountain||village)continue;if(oval){g.box(x,1.5,z,5,3,2,'#596f74');g.box(x,3.1,z,5.2,.2,2.2,'#bac4ae')}else{g.cylinder(x,1.7,z,.22,3.4,'#685c43',6);g.cylinder(x,4.1,z,2.2,3.8,index%2?'#486c53':'#5a7c54',7)}}}
 roadDecor(g,map);
 if(oval){g.box(0,.14,0,65,.3,110,'#81a27b');for(const x of[-21,21])for(const z of[-30,0,30])g.box(x,1.8,z,8,3.6,11,'#8da295')}
 if(coast)for(let z=-240;z<=250;z+=32){g.cylinder(75,1,z,7,2.5,'#b1b79c',7);g.box(84,.16,z,13,.3,10,'#c9c1a0')}
 return g;
}
function checkpoint(map,index){const g=new G(),p=map.checkpoints?.[index];if(!p)return g;const yaw=Math.atan2(p.dx,p.dz),ink=surface('#d6ff40',0,.7,.2);g.box(p.x,.045,p.z,map.road.width-1,.016,.32,ink,yaw);for(const side of[-1,1]){const x=p.x+p.dz*side*(map.road.width/2+.5),z=p.z-p.dx*side*(map.road.width/2+.5);g.box(x,1.1,z,.13,2.2,.13,ink);g.box(x,1.9,z,.7,.6,.06,ink,yaw)}return g}
function arenaSurfaces(g,map){const height=.014,paint=map.id==='yard'?'#b8bca8':map.id==='canyon'?'#b5ab8b':'#bac2b0',point=(o,x,z)=>{const p=arenaPointLocal(o,x,z);return[p[0],height+.006,p[1]]},rect=(o,x,z,w,d,col,y=height)=>{const corners=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([a,b])=>{const p=arenaPointLocal(o,x+a,z+b);return[p[0],y,p[1]]});g.quad(...corners,col)};
 const strip=(a,b,width,col,y=height)=>{const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=dz/len*width/2,nz=-dx/len*width/2;g.quad([a[0]-nx,y,a[1]-nz],[b[0]-nx,y,b[1]-nz],[b[0]+nx,y,b[1]+nz],[a[0]+nx,y,a[1]+nz],col)};
 for(const o of map.surfaces||[]){const col=o.kind==='walk'?(map.id==='yard'?'#a1aaa0':map.id==='canyon'?'#a79779':'#929f9b'):o.kind==='road'?'#465357':o.kind==='safety'?'#777d6c':'#56636a';
  if(o.points){for(let i=1;i<o.points.length;i++){const a=o.points[i-1],b=o.points[i];strip(a,b,o.width,col);if(o.kind==='road'){const len=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let d=2;d<len-2;d+=6)strip([a[0]+(b[0]-a[0])*d/len,a[1]+(b[1]-a[1])*d/len],[a[0]+(b[0]-a[0])*Math.min(d+2.5,len)/len,a[1]+(b[1]-a[1])*Math.min(d+2.5,len)/len],.12,paint,height+.006)}}continue}
  rect(o,0,0,o.w,o.d,col);
  if(o.kind==='walk'){for(let x=-o.w/2+1;x<o.w/2;x+=1)rect(o,x,0,.025,o.d,'#828e87',height+.004);for(let z=-o.d/2+1;z<o.d/2;z+=1)rect(o,0,z,o.w,.025,'#828e87',height+.004)}
  if(o.kind==='parking'){for(let x=-o.w/2+1;x<o.w/2;x+=3){rect(o,x,0,.12,o.d,paint,height+.004);rect(o,x+1.5,o.d/2-.25,2.7,.12,paint,height+.004)}}
  if(o.kind==='loading'||o.kind==='safety'){for(const side of[-1,1]){rect(o,0,side*o.d/2,o.w,.13,'#c3b575',height+.004);rect(o,side*o.w/2,0,.13,o.d,'#c3b575',height+.004)}for(let x=-o.w/2+.4;x<o.w/2;x+=1.4)rect(o,x,-o.d/2+.55,.6,.65,'#b6a865',height+.004)}
 }
}
function arenaPointLocal(o,x,z){return[o.x+Math.cos(o.yaw||0)*x+Math.sin(o.yaw||0)*z,o.z-Math.sin(o.yaw||0)*x+Math.cos(o.yaw||0)*z]}

function location(map){if(map.road)return roadWorld(map);const g=new G(),ex=map.extent.x+2,ez=map.extent.z+2,desert=map.id==='canyon',air=map.id==='airfield',port=map.id==='port',plaza=map.id==='yard';
 g.box(0,-.6,0,650,1,650,desert?'#aa8a63':port?'#4f7c83':plaza?'#718879':'#839582');g.box(0,-.085,0,ex*2,.18,ez*2,desert?'#6a6257':air?'#687374':plaza?'#737c7a':'#414f52');
 arenaSurfaces(g,map);
 // Quiet corner markings identify practice areas without colouring whole plazas green.
 for(const z of map.zones){const span=z.r*.83;for(const sx of[-1,1])for(const sz of[-1,1]){g.box(z.x+sx*(span-1),.028,z.z+sz*span,2,.008,.1,'#bdc4a5');g.box(z.x+sx*span,.028,z.z+sz*(span-1),.1,.008,2,'#bdc4a5')}}
 function barrier(x,z,w,d){g.box(x,.5,z,w,1,d,desert?'#c4ac80':'#9daaa1');g.box(x,.8,z,w*.98,.14,d*1.03,'#d5d398')}
 for(let x=-ex;x<ex;x+=5){barrier(x,-ez,4.8,.8);barrier(x,ez,4.8,.8)}for(let z=-ez;z<ez;z+=5){barrier(-ex,z,.8,4.8);barrier(ex,z,.8,4.8)}
 for(let i=0;i<map.obstacles.length;i++){const o=map.obstacles[i];if(o.kind==='building'){building(g,{...o,h:o.h||8,yaw:0,index:i});continue}if(o.kind==='fountain'){g.box(o.x,.15,o.z,o.w,.3,o.d,'#a7b6ac');g.cylinder(o.x,.6,o.z,6,1,'#718681',28);g.cylinder(o.x,1.12,o.z,5.4,.06,surface('#6fadb6',.4,.22),28);g.cylinder(o.x,1.8,o.z,.6,1.7,'#b7c4b9',12);g.cylinder(o.x,2.7,o.z,2.2,.25,'#b7c4b9',20);continue}if(port){const h=i<2?6.8:3.4,col=['#527e7c','#966d52','#435f73','#727f55','#9a7759'][i];g.box(o.x,h/2,o.z,o.w,h,o.d,col);g.box(o.x,h+.08,o.z,o.w+.1,.16,o.d+.1,'#a7aca0');for(let x=-o.w/2+.5;x<o.w/2;x+=1)for(const side of[-1,1])g.box(o.x+x,h/2,o.z+side*o.d/2,.075,h-.2,.12,'#394f50');for(let z=-o.d/2+.5;z<o.d/2;z+=1)for(const side of[-1,1])g.box(o.x+side*o.w/2,h/2,o.z+z,.12,h-.2,.075,'#394f50')}
 else if(air){g.box(o.x,.4,o.z,o.w,.8,o.d,'#aab3a1');g.box(o.x,.83,o.z,o.w-.8,.06,o.d-.8,'#889576');for(let z=-o.d/2+1;z<o.d/2;z+=4)g.cylinder(o.x,.8,o.z+z,.42,1.1,'#d5a35b',6)}
 else{g.box(o.x,1,o.z,o.w,2,o.d,'#9e825e');g.box(o.x,3.4,o.z,o.w*.89,4.8,o.d*.85,'#af9068');if(i===0){g.box(o.x+2,8,o.z-2,o.w*.6,7,o.d*.62,'#bd9c70');g.box(o.x-2,12,o.z-1,o.w*.38,3,o.d*.42,'#c4a77e')}else g.box(o.x+.5,6,o.z,o.w*.5,2,o.d*.56,'#c1a475')}}
 if(port){
  for(const x of[-70,65]){g.box(x,13,ez+14,1.1,26,1.1,'#ac8b4d');g.box(x,25,ez+4,1.2,1,40,'#ac8b4d');g.box(x,19,ez-7,.1,11,.1,'#273d41')}
  for(let x=-80;x<85;x+=8)g.box(x,.042,-ez+8,3,.012,.24,'#d1d2a5');
  g.box(ex+19,1.7,10,9,3.4,96,'#263d4b');g.box(ex+19,6.5,30,9,8,15,'#b8c3b5');g.box(ex+19,11,30,7,1,12,'#597880');
 }else if(air){
  for(let z=-ez+6;z<ez-5;z+=12)g.box(0,.04,z,.35,.012,6,'#e1e4d5');for(const x of[-19,19])g.box(x,.04,0,.25,.012,ez*2-12,'#e1e4d5');
  for(const side of[-1,1])for(let x=-14;x<=14;x+=4)g.box(x,.045,side*(ez-12),2,.014,8,'#e1e4d5');
  for(const x of[-ex-24,ex+24]){g.box(x,8,0,30,16,74,'#849895');g.box(x,16.2,0,33,.4,77,'#b4c0b0');g.box(x+(x<0?15.1:-15.1),6,0,.2,12,53,'#3e5356')}
  g.box(-ex-10,13,-ez-15,7,26,7,'#859b9a');g.box(-ex-10,26,-ez-15,13,5,13,'#4b6c76');g.box(-ex-10,28.6,-ez-15,14,.25,14,'#d0d9c8');

 }else if(plaza){
  for(const side of[-1,1])for(let z=-50;z<=50;z+=20){g.box(side*(ex-5),.18,z,4,.36,8,'#a4b397');for(const dz of[-2,2]){g.cylinder(side*(ex-5),1.8,z+dz,.2,3.6,'#685d4c',7);g.cylinder(side*(ex-5),4.2,z+dz,2.3,3.4,'#4a7358',9)}}
 }else{
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2,r=130+(i%3)*9,h=16+(i*13%32);g.cylinder(Math.sin(a)*r,h/2-2,Math.cos(a)*r,18,h,i%2?'#aa8b66':'#b39772',5)}
  for(let z=-65;z<70;z+=7)for(const side of[-1,1])g.box(side*67,.045,z,.2,.012,3.5,'#dccda2');
 }
 return g;
}
function multiply(a,b){const r=new Float32Array(16);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r}
function spinMatrix(base,angle){const c=Math.cos(angle),s=Math.sin(angle);return multiply(base,new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]))}
E.prop=prop;E.propModel=propModel;E.suspension=suspension;E.suspensionJoints=suspensionJoints;E.formulaNose=formulaNose;E.checkpoint=checkpoint;E.bodySection=bodySection;E.bodyTop=bodyTop;E.vehicle=vehicle;E.rim=rim;E.brake=brake;E.hood=hood;E.hoodHeight=hoodHeight;E.showroom=showroom;E.location=location;E.spinMatrix=spinMatrix;
})();

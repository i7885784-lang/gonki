/* Original fictional vehicles, locations and local progression. All prices are game credits. */
(function(root){'use strict';
const cars=[
{id:'r86',name:'R-86',maker:'ORIGIN',type:'Купе',body:'coupe',desc:'Лёгкое купе с предсказуемым заносом. Твоя точка старта.',price:0,hp:190,accel:12,speed:32,turn:1.15,grip:2.05,brake:23,w:1.98,l:4.65,roof:1.74,base:2.92,radius:.45,paint:'acid'},
{id:'dart',name:'DART GT',maker:'NOVA',type:'Хэтчбек',body:'hatch',desc:'Короткая база, быстрые перекладки и очень живой руль.',price:2600,hp:175,accel:12.8,speed:31,turn:1.34,grip:2.3,brake:24,w:1.86,l:3.85,roof:1.86,base:2.4,radius:.41,paint:'orange'},
{id:'brick',name:'BRICK 80',maker:'HERITAGE',type:'Ретро',body:'retro',desc:'Угловатая классика. Мягкий характер и длинные дуги.',price:3900,hp:160,accel:10.8,speed:30,turn:1.02,grip:1.85,brake:21,w:1.88,l:4.48,roof:1.95,base:2.72,radius:.43,paint:'cream'},
{id:'vector',name:'VECTOR S',maker:'AXIS',type:'Седан',body:'sedan',desc:'Длинная колёсная база помогает удерживать быстрый занос.',price:6500,hp:270,accel:13.8,speed:37,turn:1.02,grip:2.12,brake:26,w:2.04,l:5.05,roof:1.8,base:3.15,radius:.46,paint:'ice'},
{id:'mirage',name:'MIRAGE R',maker:'SOL',type:'Родстер',body:'roadster',desc:'Открытая крыша, низкая посадка и резкий отклик на газ.',price:8800,hp:230,accel:14.4,speed:35,turn:1.28,grip:2.25,brake:26,w:1.93,l:4.08,roof:1.43,base:2.45,radius:.43,paint:'red'},
{id:'hammer',name:'HAMMER V8',maker:'IRON',type:'Маслкар',body:'muscle',desc:'Длинный капот и мощный V8. Газом легко сорвать заднюю ось.',price:12000,hp:390,accel:16,speed:40,turn:.99,grip:1.78,brake:25,w:2.15,l:5.25,roof:1.73,base:3.13,radius:.49,paint:'orange'},
{id:'nomad',name:'NOMAD RS',maker:'AXIS',type:'Универсал',body:'wagon',desc:'Необычный дрифт-проект: тяжёлый кузов, тяга и стабильность.',price:15500,hp:340,accel:14.7,speed:39,turn:.97,grip:2.35,brake:28,w:2.02,l:5.3,roof:1.97,base:3.22,radius:.47,paint:'purple'},
{id:'ranger',name:'RANGER X',maker:'IRON',type:'Пикап',body:'pickup',desc:'Широкая колея, открытый кузов и размашистые силовые заносы.',price:18500,hp:420,accel:14.5,speed:37,turn:.9,grip:1.9,brake:26,w:2.3,l:5.7,roof:2.25,base:3.55,radius:.57,paint:'cyan'},
{id:'vortex',name:'VORTEX GT',maker:'VELA',type:'Суперкар',body:'super',desc:'Низкий клиновидный кузов. Быстро разгоняется и требует точности.',price:26000,hp:520,accel:18.2,speed:45,turn:1.13,grip:2.4,brake:31,w:2.22,l:4.85,roof:1.36,base:2.95,radius:.48,paint:'acid'},
{id:'apex',name:'APEX X',maker:'VELOCE',type:'Трековый',body:'formula',desc:'Открытые колёса, лёгкий кокпит и максимум темпа.',price:36000,hp:610,accel:20.5,speed:49,turn:1.36,grip:2.6,brake:35,w:2.2,l:5.15,roof:1.12,base:3.28,radius:.48,paint:'ice'}
];
const maps=[
{id:'yard',name:'Промзона',tag:'01 / КЛАССИКА',desc:'Контейнеры, знакомые повороты и четыре зоны для комбо.',style:'industrial',extent:{x:58,z:58},spawn:{x:0,z:-33,yaw:Math.PI/2},fog:[.58,.66,.69],bonus:1,obstacles:[{x:0,z:0,w:15,d:15},{x:-44,z:26,w:10,d:22},{x:44,z:-26,w:10,d:22},{x:-43,z:-38,w:17,d:8},{x:36,z:41,w:25,d:8}],zones:[{x:-25,z:-25,r:9},{x:25,z:-25,r:9},{x:25,z:25,r:9},{x:-25,z:25,r:9}]},
{id:'port',name:'Грузовой порт',tag:'02 / ТЕХНИКА',desc:'Длинные коридоры между контейнерами. Бонус к награде +10%.',style:'harbour',extent:{x:88,z:68},spawn:{x:-64,z:-49,yaw:Math.PI/2},fog:[.39,.55,.61],bonus:1.1,obstacles:[{x:-30,z:0,w:15,d:56},{x:28,z:18,w:15,d:56},{x:54,z:-41,w:38,d:10},{x:-58,z:37,w:31,d:11},{x:4,z:-35,w:23,d:10}],zones:[{x:-30,z:-42,r:9},{x:-30,z:41,r:9},{x:28,z:-22,r:8},{x:30,z:53,r:8},{x:67,z:9,r:10}]},
{id:'airfield',name:'Аэродром',tag:'03 / СКОРОСТЬ',desc:'Широкая взлётная полоса и слалом. Место для быстрых машин.',style:'airfield',extent:{x:92,z:100},spawn:{x:0,z:-77,yaw:0},fog:[.68,.76,.79],bonus:1,obstacles:[{x:-45,z:35,w:10,d:58},{x:44,z:-23,w:10,d:50},{x:-39,z:-57,w:24,d:10},{x:40,z:69,w:24,d:10}],zones:[{x:0,z:-40,r:11},{x:-15,z:0,r:10},{x:15,z:38,r:10},{x:0,z:78,r:11}]},
{id:'canyon',name:'Горное плато',tag:'04 / ДЛИННЫЕ ДУГИ',desc:'Кольцо вокруг скалы и сложные перекладки. Награда +20%.',style:'canyon',extent:{x:78,z:78},spawn:{x:0,z:-56,yaw:Math.PI/2},fog:[.72,.63,.51],bonus:1.2,obstacles:[{x:0,z:0,w:49,d:42},{x:-52,z:26,w:13,d:14},{x:49,z:-29,w:13,d:15},{x:-37,z:-55,w:15,d:10},{x:32,z:56,w:15,d:10}],zones:[{x:-40,z:-25,r:9},{x:0,z:-43,r:10},{x:42,z:15,r:10},{x:0,z:44,r:10}]}
];
// Wide, flat roads with gentle curves. Geometry and collisions share these segments.
function roadData(controls,width,loop=false){let points=[];for(let i=0;i<(loop?controls.length:controls.length-1);i++)for(let j=0;j<8;j++){const at=n=>controls[loop?(n+controls.length)%controls.length:Math.max(0,Math.min(controls.length-1,n))],p0=at(i-1),p1=at(i),p2=at(i+1),p3=at(i+2),t=j/8,t2=t*t,t3=t2*t;points.push({x:.5*((2*p1[0])+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),z:.5*((2*p1[1])+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)})}points.push(loop?{...points[0]}:{x:controls.at(-1)[0],z:controls.at(-1)[1]});let length=0;const segments=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.z-a.z);segments.push({a,b,len,start:length,nx:(b.z-a.z)/len,nz:-(b.x-a.x)/len});length+=len}return{points,segments,width,loop,length}}
function roadAt(road,distance){const d=Math.max(0,Math.min(road.length,distance)),s=road.segments.find(s=>s.start+s.len>=d)||road.segments.at(-1),t=(d-s.start)/s.len;return{x:s.a.x+(s.b.x-s.a.x)*t,z:s.a.z+(s.b.z-s.a.z)*t,dx:(s.b.x-s.a.x)/s.len,dz:(s.b.z-s.a.z)/s.len}}
function roadDistance(road,x,z){let nearest=Infinity;for(const s of road.segments){const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,t=Math.max(0,Math.min(1,((x-s.a.x)*dx+(z-s.a.z)*dz)/(s.len*s.len)));nearest=Math.min(nearest,Math.hypot(x-s.a.x-t*dx,z-s.a.z-t*dz))}return nearest}
function roadScenery(map){const result=[],road=map.road;if(!road||!['city','mountain','village'].includes(map.theme))return result;
 const place=(p,side,offset,kind,w,d,h,index)=>{const x=p.x+p.dz*side*offset,z=p.z-p.dx*side*offset,radius=Math.hypot(w,d)/2;if(roadDistance(road,x,z)<road.width/2+radius+3)return;result.push({kind,x,z,w,d,h,yaw:Math.atan2(p.dx,p.dz)-side*Math.PI/2,index})};
 const stride=map.theme==='city'?52:map.theme==='mountain'?52:48;
 for(let distance=24,index=0;distance<road.length-12;distance+=stride,index++){const p=roadAt(road,distance);for(const side of[-1,1]){
  if(map.theme==='city'){place(p,side,road.width/2+17,'building',10+index%3*2,12,9+index%5*4,index);place(p,side,road.width/2+3.5,'lamp',.5,.5,6,index)}
  if(map.theme==='village'){place(p,side,road.width/2+17,'house',7+index%2,9,4+index%2*.7,index);if(index%3===0)place(p,side,road.width/2+46,'field',30,32,.12,index)}
  if(map.theme==='mountain'){place(p,side,road.width/2+65,'rock',38+index%3*5,38+index%3*5,20+index%4*10,index);place(p,side,road.width/2+13,'pine',4,4,8,index)}
 }}return result;
}
function racingMap(id,name,tag,desc,controls,width,loop,theme){const road=roadData(controls,width,loop),spawn=roadAt(road,6),count=loop?14:12,checkpoints=Array.from({length:count},(_,i)=>roadAt(road,loop?road.length*(i+1)/count:10+(road.length-20)*(i+1)/count));return{id,name,tag,desc,kind:'race',theme,road,checkpoints,timeLimit:180,extent:{x:Math.ceil(Math.max(...road.points.map(p=>Math.abs(p.x)))+45),z:Math.ceil(Math.max(...road.points.map(p=>Math.abs(p.z)))+45)},spawn:{x:spawn.x,z:spawn.z,yaw:Math.atan2(spawn.dx,spawn.dz)},fog:theme==='coast'?[.57,.72,.77]:theme==='oval'?[.66,.74,.76]:theme==='city'?[.61,.7,.76]:theme==='mountain'?[.58,.68,.73]:theme==='village'?[.68,.76,.71]:[.65,.73,.69],bonus:1,obstacles:[],zones:[]}}
maps.push(
 racingMap('highway','Зелёное шоссе','05 / ГОНКА · ЛЕГКО','Длинные прямые и плавные повороты. От старта до финиша.',[[0,-230],[0,-120],[22,-35],[10,65],[-18,150],[0,230]],22,false,'forest'),
 racingMap('oval','Скоростной овал','06 / ГОНКА · ЛЕГКО','Один круг по широкой трассе. Четырнадцать контрольных точек.',Array.from({length:12},(_,i)=>[Math.sin(i*Math.PI/6)*85,Math.cos(i*Math.PI/6)*125]),24,true,'oval'),
 racingMap('coast','Прибрежная дорога','07 / ГОНКА · ЛЕГКО','Широкая дорога вдоль моря с мягкими связками поворотов.',[[0,-215],[-25,-145],[10,-70],[35,10],[0,90],[-25,165],[0,235]],22,false,'coast'),
 racingMap('city','Городское кольцо','08 / ГОНКА · ГОРОД','Один круг по бульвару: кварталы, фонари и широкие дуги.',[[-100,-145],[25,-145],[110,-90],[110,65],[65,145],[-65,145],[-110,65],[-110,-65]],24,true,'city'),
 racingMap('mountain','Скальный перевал','09 / ГОНКА · ГОРЫ','Связки поворотов между скалами и хвойным лесом.',[[0,-280],[-38,-195],[-50,-105],[40,-10],[52,85],[-38,180],[0,285]],22,false,'mountain'),
 racingMap('village','Деревенская дорога','10 / ГОНКА · ДЕРЕВНЯ','Дома, поля и сады вдоль спокойной загородной дороги.',[[0,-280],[15,-180],[-22,-80],[-10,25],[24,125],[12,215],[0,285]],24,false,'village'),
 racingMap('lanes','Деревенские переулки','11 / ГОНКА · УЗКО','Дорога шириной 10 метров. Тормози перед поворотами.',[[0,-245],[14,-145],[-22,-45],[20,55],[12,160],[0,250]],10,false,'village'),
 racingMap('ridge','Лесной серпантин','12 / ГОНКА · УЗКО','Девятиметровая дорога среди скал и сосен.',[[0,-250],[-30,-160],[-22,-65],[34,35],[18,145],[0,250]],9,false,'mountain')
);
// Drift arenas have a fixed architecture layer and a separate movable-prop layer.
const driftLayout={yard:{name:'Городская площадь',desc:'Площадь с фонтаном, кафе, лавками и сбиваемыми предметами.',obstacles:[{x:0,z:0,w:15,d:15,kind:'fountain'},{x:-44,z:26,w:10,d:22,kind:'building',h:9},{x:44,z:-26,w:10,d:22,kind:'building',h:12},{x:-43,z:-38,w:17,d:8,kind:'building',h:6},{x:36,z:41,w:25,d:8,kind:'building',h:8}]},port:{desc:'Новые портовые проезды: штабели неподвижны, бочки, ящики и лавки можно сбивать.',obstacles:[{x:-43,z:-15,w:16,d:44},{x:40,z:15,w:16,d:44},{x:0,z:42,w:30,d:9},{x:-55,z:43,w:22,d:9},{x:55,z:-40,w:24,d:9},{x:0,z:-47,w:16,d:10,kind:'building',h:5}],zones:[{x:-8,z:-12,r:10},{x:-8,z:23,r:10},{x:-68,z:15,r:8},{x:65,z:15,r:9}]},airfield:{desc:'Испытательная площадка с конусами, багажными ящиками и сервисной зоной.',obstacles:[{x:-60,z:0,w:18,d:36,kind:'building',h:8},{x:56,z:24,w:20,d:30,kind:'building',h:7},{x:-24,z:42,w:8,d:24},{x:24,z:-35,w:8,d:24},{x:-52,z:-64,w:24,d:10,kind:'building',h:5},{x:52,z:73,w:24,d:10,kind:'building',h:5}],zones:[{x:0,z:-42,r:12},{x:0,z:0,r:12},{x:0,z:45,r:12},{x:36,z:20,r:8}]},canyon:{desc:'Новый маршрут вокруг скал: сервисные павильоны и подвижный инвентарь.',obstacles:[{x:0,z:4,w:36,d:28},{x:-40,z:-20,w:14,d:18},{x:40,z:22,w:14,d:18},{x:-32,z:50,w:16,d:12},{x:30,z:-46,w:16,d:10}],zones:[{x:0,z:-25,r:9},{x:32,z:-15,r:9},{x:-30,z:22,r:9},{x:0,z:43,r:10}],extra:[{x:-65,z:-44,w:10,d:9,kind:'building',h:5},{x:64,z:43,w:10,d:9,kind:'building',h:5}]}};
for(const map of maps.filter(m=>!m.road)){const layout=driftLayout[map.id];Object.assign(map,{desc:layout.desc,props:[]});if(layout.name)map.name=layout.name;if(layout.obstacles)map.obstacles=layout.obstacles;if(layout.zones)map.zones=layout.zones;if(layout.extra)map.obstacles.push(...layout.extra);
}
// Authored functional groups replace the former whole-arena grid.
function arenaPoint(x,z,yaw,dx,dz){return{x:x+Math.cos(yaw)*dx+Math.sin(yaw)*dz,z:z-Math.sin(yaw)*dx+Math.cos(yaw)*dz}}
function arenaGroup(map,id,kind,x,z,yaw=0,profile='storage'){
 map.propGroups.push({id,kind,x,z,yaw});const add=(type,dx,dz,angle=0,variant=0)=>map.props.push({type,...arenaPoint(x,z,yaw,dx,dz),yaw:yaw+angle,variant,group:id});
 if(kind==='rest'){add('bench',0,0);add('bin',2.2,0,0,1);add('lamp',-2.3,-1);if(/cafe|terminal|stop|overlook|quay/.test(id))add('sign',3.3,-1.6,0,/cafe|terminal|stop/.test(id)?0:1);map.surfaces.push({kind:'walk',x,z,w:8,d:4,yaw});return}
 map.surfaces.push({kind:kind==='works'?'safety':'loading',x,z:z,w:10,d:9,yaw});
 if(kind==='works'){for(const dx of[-3,3])for(const dz of[-3,0,3])add('cone',dx,dz);add('crate',0,0);add('barrel',0,2,0,2);return}
 if(profile==='cargo'){for(const dx of[-2,0,2])for(const dz of[0,2])add('crate',dx,dz,0,1)}
 else if(profile==='service'){for(const dx of[-2,0])add('crate',dx,0);for(const dx of[2,3.6])for(const dz of[0,2])add('barrel',dx,dz,0,1)}
 else{for(const [dx,dz]of[[-2,0],[0,0],[2,0],[-2,2],[0,2]])add('crate',dx,dz);for(const dz of[-.5,1.5,3.5])add('barrel',3,dz,0,2)}
 add('rack',-.7,-1.8);if(profile==='cargo')add('cart',-3.6,1.5);for(const dx of[-4,4])for(const dz of[-3,4])add('cone',dx,dz);
}
function authoredArena(map){map.props=[];map.propGroups=[];map.surfaces=[];
 const group=(...args)=>arenaGroup(map,...args),path=(points,width=3,kind='walk')=>map.surfaces.push({kind,points,width}),parking=(x,z,w,d,yaw=0)=>map.surfaces.push({kind:'parking',x,z,w,d,yaw});
 if(map.id==='yard'){
  path([[-14,-14],[14,-14],[14,14],[-14,14],[-14,-14]],4);
  path([[-52,-52],[52,-52],[52,52],[-52,52],[-52,-52]],3);
  path([[0,-52],[0,-14]],3);path([[-52,0],[-14,0]],3);path([[14,0],[52,0]],3);path([[0,14],[0,52]],3);
  path([[-43,-34],[-43,-27],[-52,-27]],3);path([[-39,25],[-35,25],[-35,52]],3);path([[39,-24],[35,-24],[35,-52]],3);path([[34,37],[34,32],[52,32]],3);
  for(const [id,x,z,yaw]of[['font-n',0,-14,0],['font-w',-14,0,Math.PI/2],['font-e',14,0,-Math.PI/2],['font-s',0,14,Math.PI],['cafe',-42,-27,0],['west',-35,25,Math.PI/2],['east',35,-24,-Math.PI/2],['south-cafe',34,32,Math.PI]])group(id,'rest',x,z,yaw);
  group('cafe-delivery','loading',-23,-46);group('maintenance','loading',25,51);parking(-22,-35,15,7);parking(25,27,17,8);
 }
 if(map.id==='port'){
  group('office-break','rest',-15,-42);group('quay-break','rest',-78,40,Math.PI/2);
  group('west-containers','loading',-29,-18,Math.PI/2);group('east-containers','loading',26,15,-Math.PI/2);
  group('north-stack','loading',0,31,Math.PI);group('quay-stack','loading',-55,31,Math.PI);group('dock-supplies','loading',72,-10);
  path([[-83,-57],[-83,57]],3);path([[-15,-42],[-15,-57],[-83,-57]],3);path([[-78,40],[-83,40]],3);
  path([[-15,-35],[-15,22],[18,22],[18,-35]],6,'road');parking(0,-33,22,8);parking(67,-27,18,8);
 }
 if(map.id==='airfield'){
  group('terminal-left','rest',-59,24);group('terminal-right','rest',56,46);
  group('south-service','loading',-52,-52,0,'service');group('north-service','loading',52,62,Math.PI,'service');
  group('left-baggage','loading',-44,0,Math.PI/2,'cargo');group('right-baggage','loading',39,25,-Math.PI/2,'cargo');
  map.propGroups.push({id:'slalom',kind:'training',x:0,z:0,yaw:0});for(const z of[-60,-40,-20,0,20,40,60])for(const x of[-8,8])map.props.push({type:'cone',x,z,yaw:0,variant:0,group:'slalom'});
  path([[-59,18],[-59,24],[-75,24]],3);path([[56,39],[56,46],[74,46]],3);path([[-75,-70],[-75,70]],4);path([[74,-50],[74,60]],4);
  parking(-45,31,15,9);parking(57,52,17,7);path([[-40,-78],[-40,-52],[0,-52]],5,'road');
 }
 if(map.id==='canyon'){
  group('west-stop','rest',-65,-32);group('east-stop','rest',64,55);group('overlook','rest',-20,65,Math.PI);
  group('west-supplies','loading',-65,-56,Math.PI);group('east-supplies','loading',64,31,Math.PI);
  group('road-repairs','works',50,-54);
  path([[-65,-39.5],[-65,-32],[-55,-32]],2.8);path([[64,47.5],[64,55],[45,55],[-20,65]],2.8);path([[-20,65],[-45,65]],2.8);
  parking(-57,-15,13,9);parking(56,61,15,8);
  path([[-52,-62],[-52,-36],[-59,-5],[-51,22],[-48,57]],5,'road');path([[54,-64],[57,-20],[56,14],[54,52]],5,'road');
 }
}
for(const map of maps.filter(m=>!m.road))authoredArena(map);

const paints={acid:'#c7ee49',orange:'#f8844e',ice:'#d5e4e9',purple:'#9d8ad5',red:'#db5155',cyan:'#4fc0c8',cream:'#c5b894',black:'#384849',blue:'#4079cd',pink:'#e692ba',green:'#438665',silver:'#9ea9ad'};
const upgrades={engine:{name:'Двигатель',text:'Быстрее разгон и выше максимальная скорость',base:800},steering:{name:'Подвеска',text:'Быстрее перекладки, ниже посадка',base:650},tyres:{name:'Шины',text:'Больше контроля и устойчивости на выходе',base:600},brakes:{name:'Тормоза',text:'Короче торможение перед поворотом',base:550}};
const cosmetics={rims:[{id:'stock',name:'Серебро',price:0},{id:'black',name:'Графит',price:900},{id:'gold',name:'Золото',price:1400}],spoiler:[{id:'stock',name:'Заводской',price:0},{id:'duck',name:'Лип-спойлер',price:700},{id:'race',name:'Антикрыло',price:1600}],livery:[{id:'none',name:'Чистый кузов',price:0},{id:'stripe',name:'Две полосы',price:600},{id:'race',name:'Гоночный',price:1200}]};
cosmetics.rims.push({id:'mesh',name:'Сетка',price:1700},{id:'aero',name:'Аэродиски',price:1900},{id:'sport',name:'Шесть спиц',price:1300});
Object.assign(cosmetics,{
 finish:[{id:'gloss',name:'Глянец',price:0},{id:'matte',name:'Матовый',price:500},{id:'metal',name:'Металлик',price:750}],
 bodykit:[{id:'stock',name:'Заводской',price:0},{id:'sport',name:'Спорт',price:1100},{id:'race',name:'Трек',price:2100}],
 exhaust:[{id:'stock',name:'Двойной',price:0},{id:'single',name:'Один выход',price:500},{id:'quad',name:'Четыре выхода',price:1000}],
 tint:[{id:'medium',name:'Обычные',price:0},{id:'light',name:'Светлые',price:350},{id:'dark',name:'Тёмные',price:550}],
 headlights:[{id:'white',name:'Белые',price:0},{id:'amber',name:'Жёлтые',price:450},{id:'blue',name:'Ледяные',price:650}],
 calipers:[{id:'stock',name:'Заводские',price:0},{id:'red',name:'Красные',price:350},{id:'acid',name:'Лайм',price:350}],
 accent:[{id:'white',name:'Белый',price:0},{id:'black',name:'Чёрный',price:0},{id:'acid',name:'Лайм',price:250}]
});
const plateText=value=>String(value||'').toUpperCase().replace(/[^A-ZАВЕКМНОРСТУХ0-9 -]/g,'').replace(/\s+/g,' ').trim().slice(0,9);
const validHex=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const paintColor=s=>s.paint==='custom'&&validHex(s.customPaint)?s.customPaint:paints[s.paint]||paints.ice;
const getCar=id=>cars.find(c=>c.id===id)||cars[0],getMap=id=>maps.find(m=>m.id===id)||maps[0];
function setup(id){const s={paint:getCar(id).paint,customPaint:'#4079cd',plate:'DRIFT 01',engine:0,steering:0,tyres:0,brakes:0,unlocked:{}};for(const [key,options]of Object.entries(cosmetics)){s[key]=options[0].id;s.unlocked[key]=options.filter(o=>o.price===0).map(o=>o.id)}if(['ice','cream'].includes(getCar(id).paint))s.accent='black';return s}
function fresh(old={}){const p={version:2,credits:8000,owned:['r86'],selected:'r86',map:'yard',configs:{r86:setup('r86')},raceBests:{},bests:{yard:Math.max(0,Number(old.best)||0)},totalEarned:0,runs:0,nextRun:1,paidRuns:[],welcomed:false};if(paints[old.paint])p.configs.r86.paint=old.paint;return p}
const cleanInt=(n,lo,hi)=>Math.min(hi,Math.max(lo,Math.floor(Number(n)||0)));
function hydrate(raw,old={}){if(!raw||raw.version!==2)return fresh(old);const p=fresh();p.credits=cleanInt(raw.credits,0,1e9);p.owned=cars.filter(c=>Array.isArray(raw.owned)&&raw.owned.includes(c.id)).map(c=>c.id);if(!p.owned.includes('r86'))p.owned.unshift('r86');p.selected=p.owned.includes(raw.selected)?raw.selected:'r86';p.map=getMap(raw.map).id;p.configs={};for(const id of p.owned){const v=raw.configs?.[id]||{},s=setup(id);s.customPaint=validHex(v.customPaint)?v.customPaint:s.customPaint;s.paint=paints[v.paint]||v.paint==='custom'&&validHex(v.customPaint)?v.paint:s.paint;s.plate=plateText(v.plate)||s.plate;for(const k of Object.keys(upgrades))s[k]=cleanInt(v[k],0,3);for(const k of Object.keys(cosmetics)){s.unlocked[k]=cosmetics[k].filter(o=>o.price===0||v.unlocked?.[k]?.includes(o.id)).map(o=>o.id);s[k]=s.unlocked[k].includes(v[k])?v[k]:s[k];if(k==='accent'&&!v[k]&&['ice','cream'].includes(s.paint))s[k]='black'}p.configs[id]=s}p.raceBests={};for(const m of maps.filter(m=>m.kind==='race')){const t=cleanInt(raw.raceBests?.[m.id],0,1e9);if(t>0)p.raceBests[m.id]=t}p.bests={};for(const m of maps)p.bests[m.id]=cleanInt(raw.bests?.[m.id],0,1e9);p.totalEarned=cleanInt(raw.totalEarned,0,1e9);p.runs=cleanInt(raw.runs,0,1e8);p.nextRun=cleanInt(raw.nextRun,1,1e9);p.paidRuns=Array.isArray(raw.paidRuns)?raw.paidRuns.filter(Number.isInteger).slice(-50):[];p.welcomed=!!raw.welcomed;return p}
function stats(id,s=setup(id)){const c=getCar(id);return{accel:c.accel*(1+.1*s.engine),maxSpeed:c.speed*(1+.065*s.engine),steerSpeed:c.turn*(1+.055*s.steering),grip:c.grip*(1+.08*s.tyres),brake:c.brake*(1+.17*s.brakes),response:9+s.steering*1.4,radius:Math.max(1.25,c.w*.65),hp:Math.round(c.hp*(1+.13*s.engine)),height:-s.steering*.045}}
function upgradePrice(id,key,level){return Math.round(upgrades[key].base*(1+getCar(id).price/45000)*(level+1))}
function transact(profile,action){const p=JSON.parse(JSON.stringify(profile)),id=action.id||p.selected,c=cars.find(c=>c.id===id);if(!c)return{ok:false,error:'Машина не найдена'};const owned=p.owned.includes(id),s=p.configs[id];let cost=0;
 if(action.type==='buy'){if(owned)return{ok:false,error:'Эта машина уже в гараже'};cost=c.price;if(p.credits<cost)return{ok:false,error:'Недостаточно кредитов'};p.owned.push(id);p.configs[id]=setup(id);p.selected=id}
 else if(action.type==='select'){if(!owned)return{ok:false,error:'Сначала купи эту машину'};p.selected=id}
 else if(action.type==='upgrade'){if(!owned||!upgrades[action.key])return{ok:false,error:'Сначала купи машину'};if(s[action.key]>=3)return{ok:false,error:'Максимальный уровень'};cost=upgradePrice(id,action.key,s[action.key]);if(p.credits<cost)return{ok:false,error:'Недостаточно кредитов'};s[action.key]++}
 else if(action.type==='paint'){if(!owned||!paints[action.value])return{ok:false,error:'Цвет недоступен'};s.paint=action.value}
 else if(action.type==='customPaint'){if(!owned||!validHex(action.value))return{ok:false,error:'Цвет недоступен'};s.customPaint=action.value.toLowerCase();s.paint='custom'}
 else if(action.type==='plate'){const value=plateText(action.value);if(!owned||!value)return{ok:false,error:'Введи номер: буквы и цифры, до 9 знаков'};s.plate=value}
 else if(action.type==='cosmetic'){const option=cosmetics[action.key]?.find(o=>o.id===action.value);if(!owned||!option)return{ok:false,error:'Деталь недоступна'};cost=s.unlocked[action.key].includes(option.id)?0:option.price;if(p.credits<cost)return{ok:false,error:'Недостаточно кредитов'};if(!s.unlocked[action.key].includes(option.id))s.unlocked[action.key].push(option.id);s[action.key]=option.id}
 else return{ok:false,error:'Неизвестное действие'};p.credits-=cost;return{ok:true,profile:p,cost};
}
function reward(profile,{runId,score,map,completed,trial,distance,elapsed}){if(trial||profile.paidRuns.includes(runId))return{profile,reward:0};const p=JSON.parse(JSON.stringify(profile));const base=Math.floor(Math.max(0,score)/8),bonus=completed&&(score>=500||distance>=300)?300:0;const amount=Math.floor((base+bonus)*getMap(map).bonus);p.credits=Math.min(1e9,p.credits+amount);p.totalEarned+=amount;p.runs++;p.paidRuns.push(runId);p.paidRuns=p.paidRuns.slice(-50);if(completed&&getMap(map).kind==='race'&&Number.isFinite(elapsed)&&elapsed>0){const ms=Math.round(elapsed*1000);p.raceBests??={};p.raceBests[map]=Math.min(p.raceBests[map]||Infinity,ms)}if(completed)p.bests[map]=Math.max(p.bests[map]||0,Math.floor(score));return{profile:p,reward:amount}}
const api={roadDistance,roadScenery,roadAt,plateText,paintColor,cars,maps,paints,upgrades,cosmetics,getCar,getMap,setup,fresh,hydrate,stats,upgradePrice,transact,reward};if(typeof module!=='undefined')module.exports=api;else root.DriftCatalog=api;
})(typeof window!=='undefined'?window:globalThis);

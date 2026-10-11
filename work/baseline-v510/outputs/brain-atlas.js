/* Read-only connectome visualizer. No changes to neural state, genomes or physics. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MaleCNSAtlas=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const PALETTE={neutral:[.44,.56,.62],input:[.94,.74,.41],descending:[1,.52,.39],ascending:[.65,.71,1],active:[.41,.83,.77],selected:[1,.88,.63]};
  function coordinates(graph){
    const valid=new Uint8Array(graph.n),indices=[],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<graph.n;i++){
      const p=i*3,xyz=[graph.positions[p],graph.positions[p+1],graph.positions[p+2]];
      if(xyz.some(v=>!Number.isFinite(v)||v===graph.missingPosition))continue;
      valid[i]=1;indices.push(i);xyz.forEach((v,a)=>{min[a]=Math.min(min[a],v);max[a]=Math.max(max[a],v);});
    }
    const center=indices.length?min.map((v,a)=>(v+max[a])/2):[0,0,0],span=indices.length?Math.max(1,...max.map((v,a)=>v-min[a])):1,positions=new Float32Array(graph.n*3);
    for(const i of indices)for(let a=0;a<3;a++)positions[i*3+a]=(graph.positions[i*3+a]-center[a])*2/span;
    return {valid,indices,positions,center,span,missing:graph.n-indices.length};
  }
  function sample(indices,limit,mandatory=[]){
    const n=Math.min(limit,indices.length),result=new Set();
    for(let j=0;j<n;j++)result.add(indices[Math.floor(j*indices.length/n)]);
    const allowed=new Set(indices);for(const i of mandatory)if(allowed.has(i))result.add(i);
    return Array.from(result);
  }
  function project(xyz,camera,width,height){
    const x=(xyz[0]-camera.focus[0])*camera.fit,y=(xyz[1]-camera.focus[1])*camera.fit,z=(xyz[2]-camera.focus[2])*camera.fit;
    const rx=x*Math.cos(camera.yaw)-z*Math.sin(camera.yaw),rz=x*Math.sin(camera.yaw)+z*Math.cos(camera.yaw);
    const ry=y*Math.cos(camera.pitch)-rz*Math.sin(camera.pitch),depth=y*Math.sin(camera.pitch)+rz*Math.cos(camera.pitch);
    const perspective=1/Math.max(.35,1+depth*.16),scale=Math.min(width,height)*.41*camera.zoom;
    return {x:width/2+rx*scale*perspective+camera.pan[0],y:height/2+ry*scale*perspective+camera.pan[1],depth,perspective};
  }
  // A bounded read-only sample, not a claim to draw every active connection.
  function edges(graph,activity,valid,mask,limit=220,selected=-1,gains=null){
    if(!limit)return [];
    const sources=[];
    for(let i=0;i<graph.n;i++)if(valid[i]&&mask[i]&&Math.abs(activity[i])>.002)sources.push(i);
    sources.sort((a,b)=>Math.abs(activity[b])-Math.abs(activity[a])||a-b);sources.length=Math.min(256,sources.length);
    if(selected>=0&&valid[selected]&&mask[selected]&&Math.abs(activity[selected])>.002&&!sources.includes(selected))sources.push(selected);
    const heap=[],offer=item=>{
      if(heap.length===limit&&item.score<=heap[0].score)return;
      if(heap.length<limit){heap.push(item);let k=heap.length-1;while(k>0){const p=(k-1)>>1;if(heap[p].score<=heap[k].score)break;[heap[p],heap[k]]=[heap[k],heap[p]];k=p;}}
      else{heap[0]=item;let k=0;for(;;){const l=k*2+1,r=l+1;let s=k;if(l<heap.length&&heap[l].score<heap[s].score)s=l;if(r<heap.length&&heap[r].score<heap[s].score)s=r;if(s===k)break;[heap[k],heap[s]]=[heap[s],heap[k]];k=s;}}
    };
    for(const source of sources)for(let e=graph.rowOffsets[source];e<graph.rowOffsets[source+1];e++){
      const target=graph.targets[e];if(!valid[target]||!mask[target]||(selected>=0&&source!==selected&&target!==selected))continue;
      const contribution=.9*activity[source]*graph.csrWeights[e]*(gains?gains[graph.learning.groups[source]]:1),score=Math.abs(contribution);
      if(score>.00001)offer({source,target,score,contribution});
    }
    return heap.sort((a,b)=>b.score-a.score);
  }
  const VERTEX=`#version 300 es
    precision highp float;
    layout(location=0) in vec3 a_position;
    layout(location=1) in vec3 a_color;
    layout(location=2) in float a_energy;
    layout(location=3) in float a_flag;
    uniform vec2 u_angles; uniform vec3 u_focus; uniform float u_fit;
    uniform vec2 u_scale; uniform vec2 u_pan; uniform float u_dpr;
    out vec3 v_color; out float v_energy; out float v_flag;
    void main(){
      vec3 p=(a_position-u_focus)*u_fit;
      float x=p.x*cos(u_angles.x)-p.z*sin(u_angles.x),z=p.x*sin(u_angles.x)+p.z*cos(u_angles.x);
      float y=p.y*cos(u_angles.y)-z*sin(u_angles.y),depth=p.y*sin(u_angles.y)+z*cos(u_angles.y);
      float perspective=1.0/max(0.35,1.0+depth*0.16);
      gl_Position=vec4(vec2(x,-y)*u_scale*perspective+u_pan,clamp(depth*0.2,-0.98,0.98),1.0);
      gl_PointSize=(a_flag>1.5?13.0:a_flag>.5?5.2:2.0+a_energy*2.4)*u_dpr*perspective;
      v_color=a_color;v_energy=a_energy;v_flag=a_flag;
    }`;
  const POINT_FRAGMENT=`#version 300 es
    precision highp float; in vec3 v_color; in float v_energy; in float v_flag; out vec4 outColor;
    void main(){vec2 p=gl_PointCoord*2.0-1.0;float r=dot(p,p);if(r>1.0)discard;
      vec3 normal=vec3(p.x,-p.y,sqrt(1.0-r));float light=.55+.45*max(0.0,dot(normal,normalize(vec3(-.4,.55,.8))));
      float strength=v_flag>.5?1.0:.52+.48*v_energy;
      outColor=vec4(v_color*light*strength,1.0);
    }`;
  const LINE_FRAGMENT=`#version 300 es
    precision highp float; in vec3 v_color; in float v_energy; out vec4 outColor;
    void main(){outColor=vec4(v_color,.10+.48*v_energy);}`;
  function program(gl,fragment){
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(message);}return shader;};
    const vertex=compile(gl.VERTEX_SHADER,VERTEX),pixel=compile(gl.FRAGMENT_SHADER,fragment),p=gl.createProgram();gl.attachShader(p,vertex);gl.attachShader(p,pixel);gl.linkProgram(p);gl.deleteShader(vertex);gl.deleteShader(pixel);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
    return {p,uniforms:Object.fromEntries(['angles','focus','fit','scale','pan','dpr'].map(k=>[k,gl.getUniformLocation(p,'u_'+k)]))};
  }
  class Viewer{
    constructor(canvas,onChange=()=>{}){
      this.canvas=canvas;this.onChange=onChange;this.visible=true;this.dirty=true;this.lastUpdate=0;this.lastPaint=0;this.frozen=false;this.filter='all';this.colorMode='class';this.limit=18000;this.edgeLimit=220;this.selected=-1;this.metrics={width:0,height:0,dpr:1};this.reset();
      this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'low-power'});
      if(this.gl){try{this.initGL();this.backend='WebGL 2';}catch(error){this.gl=null;const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);this.canvas=replacement;this.contextError=error.message;}}
      if(!this.gl){this.ctx=this.canvas.getContext('2d',{alpha:false});this.backend='Canvas 2D · fallback';this.limit=6000;}
      this.bind();
      if(typeof IntersectionObserver!=='undefined')this.observer=new IntersectionObserver(items=>{this.visible=items[0].isIntersecting;if(this.visible){this.dirty=true;this.resize();}}),this.observer.observe(this.canvas);
      this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.canvas);
    }
    initGL(){const gl=this.gl;this.pointProgram=program(gl,POINT_FRAGMENT);this.lineProgram=program(gl,LINE_FRAGMENT);this.pointBuffer=gl.createBuffer();this.lineBuffer=gl.createBuffer();}
    setGraph(graph,policy){
      this.graph=graph;this.coords=coordinates(graph);this.inputSet=new Set(graph.inputs);this.readoutSet=new Set(policy.nodes);this.outputSet=new Set(graph.outputs);this.selected=-1;this.frozen=false;this.activity=new Float32Array(graph.n);this.allowed=new Uint8Array(graph.n);this.reset();this.rebuild();this.lastUpdate=0;
    }
    reset(){this.camera={yaw:-.42,pitch:.18,zoom:1.65,pan:[0,0],focus:[0,0,0],fit:1};this.preset='orbit';this.dirty=true;}
    setPreset(preset){this.reset();this.preset=preset;const angles={orbit:[-.42,.18],xy:[0,0],yz:[Math.PI/2,0],xz:[0,Math.PI/2]};[this.camera.yaw,this.camera.pitch]=angles[preset]||angles.orbit;this.notify();}
    resize(){const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);this.metrics={width:rect.width,height:rect.height,dpr};if(rect.width&&rect.height){const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;this.dirty=true;}}
    rebuild(){
      if(!this.graph)return;
      const g=this.graph,indices=this.coords.indices.filter(i=>this.filter==='all'||this.filter==='inputs'&&this.inputSet.has(i)||this.filter==='readout'&&this.readoutSet.has(i)||this.filter==='descending'&&g.classNames[g.classCodes[i]]==='descending_neuron'||this.filter==='active'&&Math.abs(this.activity[i])>.002);
      this.allowed.fill(0);for(const i of indices)this.allowed[i]=1;
      this.nodes=sample(indices,this.limit,[...this.outputSet,...this.readoutSet,...(this.selected>=0?[this.selected]:[])]);
      this.pointData=new Float32Array(this.nodes.length*8);this.upload();this.dirty=true;this.notify();
    }
    update(car,sim,force=false,gains=null){
      if(!this.graph||!car?.brain)return;
      const now=performance.now(),changed=car.id!==this.carId;
      if(changed){this.frozen=false;force=true;}
      if(this.frozen&&!force||!force&&now-this.lastUpdate<300)return;
      const stateChanged=this.generation!==sim.generation||this.running!==sim.running||this.carAlive!==car.alive||this.mode!==sim.mode;
      this.lastUpdate=now;this.carId=car.id;this.generation=sim.generation;this.carAlive=car.alive;this.running=sim.running;this.mode=sim.mode;this.gains=gains;
      this.slots=Number.isInteger(car.brain.activeCount)?car.brain.activeCount:this.graph.n;
      let changedActivity=false;this.nonzero=0;
      for(let i=0;i<this.activity.length;i++){const v=car.brain.activity[i];if(v!==this.activity[i])changedActivity=true;this.activity[i]=v;if(Math.abs(v)>.002)this.nonzero++;}
      if(changedActivity||force){if(this.filter==='active')this.rebuild();else this.upload();this.dirty=true;}
      if(changedActivity||force||stateChanged)this.notify();
    }
    color(i){
      if(i===this.selected)return PALETTE.selected;
      if(this.colorMode==='activity'){const a=clamp(Math.abs(this.activity[i])*8,0,1);return PALETTE.neutral.map((v,k)=>v*.35*(1-a)+PALETTE.active[k]*a);}
      const kind=this.graph.classNames[this.graph.classCodes[i]];
      return this.inputSet.has(i)?PALETTE.input:this.readoutSet.has(i)||kind==='descending_neuron'?PALETTE.descending:kind==='ascending_neuron'?PALETTE.ascending:PALETTE.neutral;
    }
    upload(){
      if(!this.nodes)return;
      for(let j=0;j<this.nodes.length;j++){const i=this.nodes[j],o=j*8;this.pointData.set(this.coords.positions.subarray(i*3,i*3+3),o);this.pointData.set(this.color(i),o+3);this.pointData[o+6]=clamp(Math.abs(this.activity[i])*8,0,1);this.pointData[o+7]=i===this.selected?2:this.readoutSet.has(i)?1:0;}
      this.activeEdges=edges(this.graph,this.activity,this.coords.valid,this.allowed,this.edgeLimit,this.selected,this.gains);
      this.lineData=new Float32Array(this.activeEdges.length*16);const max=this.activeEdges[0]?.score||1;
      this.activeEdges.forEach((e,j)=>{for(const [k,i]of [e.source,e.target].entries()){const o=j*16+k*8;this.lineData.set(this.coords.positions.subarray(i*3,i*3+3),o);this.lineData.set(e.contribution<0?[.88,.46,.49]:PALETTE.active,o+3);this.lineData[o+6]=Math.sqrt(e.score/max);}});
      if(this.gl&&!this.contextLost){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.pointBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.pointData,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.lineData,gl.DYNAMIC_DRAW);}
    }
    uniforms(program,buffer){
      const gl=this.gl,c=this.camera,m=this.metrics,scale=Math.min(m.width,m.height)*.41*c.zoom;
      gl.useProgram(program.p);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);for(const [loc,size,offset]of [[0,3,0],[1,3,12],[2,1,24],[3,1,28]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,32,offset);}
      const u=program.uniforms;gl.uniform2f(u.angles,c.yaw,c.pitch);gl.uniform3fv(u.focus,c.focus);gl.uniform1f(u.fit,c.fit);gl.uniform2f(u.scale,scale*2/m.width,scale*2/m.height);gl.uniform2f(u.pan,c.pan[0]*2/m.width,-c.pan[1]*2/m.height);gl.uniform1f(u.dpr,m.dpr);
    }
    render(time=performance.now()){
      const m=this.metrics;if(!m.width||!m.height||!this.nodes||!this.visible||this.contextLost)return;
      if(this.gl){const gl=this.gl;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.035,.06,.085,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);this.uniforms(this.lineProgram,this.lineBuffer);gl.drawArrays(gl.LINES,0,this.activeEdges.length*2);
        gl.depthMask(true);gl.disable(gl.BLEND);this.uniforms(this.pointProgram,this.pointBuffer);gl.drawArrays(gl.POINTS,0,this.nodes.length);
      }else{
        const c=this.ctx;c.setTransform(m.dpr,0,0,m.dpr,0,0);c.fillStyle='#091016';c.fillRect(0,0,m.width,m.height);
        const projected=new Map(),point=i=>{if(!projected.has(i))projected.set(i,project(this.coords.positions.subarray(i*3,i*3+3),this.camera,m.width,m.height));return projected.get(i);};
        for(const e of this.activeEdges){const a=point(e.source),b=point(e.target);c.strokeStyle=e.contribution<0?'rgba(225,110,117,.24)':'rgba(104,211,197,.25)';c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}
        const order=this.nodes.slice().sort((a,b)=>point(b).depth-point(a).depth);
        for(const i of order){const p=point(i),rgb=this.color(i),a=clamp(Math.abs(this.activity[i])*8,0,1),special=this.readoutSet.has(i);c.fillStyle=`rgb(${rgb.map(v=>Math.round(v*255*(special?1:.45+.55*a))).join(',')})`;c.beginPath();c.arc(p.x,p.y,(i===this.selected?6:special?2.7:1.2)*p.perspective,0,Math.PI*2);c.fill();}
      }
      this.lastPaint=time;this.dirty=false;
    }
    pick(x,y){
      let chosen=-1,best=144,depth=Infinity;const m=this.metrics;
      for(const i of this.nodes){const p=project(this.coords.positions.subarray(i*3,i*3+3),this.camera,m.width,m.height),distance=(p.x-x)**2+(p.y-y)**2;if(distance<best-.1||Math.abs(distance-best)<.1&&p.depth<depth){chosen=i;best=distance;depth=p.depth;}}
      this.selected=chosen;this.rebuild();return chosen;
    }
    selectBody(id){const i=this.graph.bodyIds.findIndex(v=>String(v)===String(id));if(i<0)return 'ID non presente in questo modello.';if(!this.coords.valid[i])return 'Neurone presente, ma senza coordinate somatiche: non può essere localizzato.';this.selected=i;this.filter='all';this.camera.fit=1;this.rebuild();this.focusSelection();return '';}
    focusSelection(){if(this.selected<0)return;this.camera.focus=Array.from(this.coords.positions.subarray(this.selected*3,this.selected*3+3));this.camera.pan=[0,0];this.camera.zoom=Math.max(1.8,this.camera.zoom);this.dirty=true;this.notify();}
    fitSelection(){
      if(!this.nodes?.length)return;
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const i of this.nodes)for(let a=0;a<3;a++){const v=this.coords.positions[i*3+a];min[a]=Math.min(min[a],v);max[a]=Math.max(max[a],v);}
      this.camera.focus=min.map((v,a)=>(v+max[a])/2);this.camera.fit=2/Math.max(.05,...max.map((v,a)=>v-min[a]));this.camera.zoom=1;this.camera.pan=[0,0];this.dirty=true;this.notify();
    }
    info(){return {backend:this.backend,displayedNodes:this.nodes?.length||0,coordinates:this.coords?.indices.length||0,missingCoordinates:this.coords?.missing||0,displayedEdges:this.activeEdges?.length||0,selected:this.selected,filter:this.filter,frozen:this.frozen,slots:this.slots||0,nonzero:this.nonzero||0,agentId:this.carId??0,generation:this.generation||1,preset:this.preset,zoom:this.camera.zoom,yaw:this.camera.yaw,pitch:this.camera.pitch,mode:this.mode,running:this.running,alive:this.carAlive};}
    notify(){this.onChange(this.info());}
    invalidate(){this.lastUpdate=0;this.dirty=true;}
    bind(){
      const canvas=this.canvas;let gesture=null;
      canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==2)return;gesture={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:0,pan:e.shiftKey||e.button===2};canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});});
      canvas.addEventListener('pointermove',e=>{if(!gesture)return;const dx=e.clientX-gesture.lastX,dy=e.clientY-gesture.lastY;gesture.moved+=Math.abs(dx)+Math.abs(dy);gesture.lastX=e.clientX;gesture.lastY=e.clientY;if(gesture.moved<4)return;if(gesture.pan){this.camera.pan[0]+=dx;this.camera.pan[1]+=dy;}else{this.camera.yaw+=dx*.006;this.camera.pitch=clamp(this.camera.pitch+dy*.006,-Math.PI/2,Math.PI/2);this.preset='orbit';}this.dirty=true;this.notify();});
      const release=e=>{if(gesture&&e.type==='pointerup'&&gesture.moved<4&&e.button===0&&this.graph){const rect=canvas.getBoundingClientRect();this.pick(e.clientX-rect.left,e.clientY-rect.top);}gesture=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);};
      canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',()=>{gesture=null;});canvas.addEventListener('contextmenu',e=>e.preventDefault());
      canvas.addEventListener('wheel',e=>{e.preventDefault();this.camera.zoom=clamp(this.camera.zoom*Math.exp(-clamp(e.deltaY,-150,150)*.002),.3,5);this.dirty=true;this.notify();},{passive:false});
      canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')this.camera.yaw-=.1;else if(e.key==='ArrowRight')this.camera.yaw+=.1;else if(e.key==='ArrowUp')this.camera.pitch=clamp(this.camera.pitch-.1,-Math.PI/2,Math.PI/2);else if(e.key==='ArrowDown')this.camera.pitch=clamp(this.camera.pitch+.1,-Math.PI/2,Math.PI/2);else if(e.key==='+'||e.key==='=')this.camera.zoom=clamp(this.camera.zoom*1.15,.3,5);else if(e.key==='-')this.camera.zoom=clamp(this.camera.zoom/1.15,.3,5);else if(e.key==='Home'){this.fitSelection();e.preventDefault();return;}else if(e.key==='Escape'){this.selected=-1;this.rebuild();e.preventDefault();return;}else return;e.preventDefault();this.preset='orbit';this.dirty=true;this.notify();});
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;this.backend='Contesto 3D perso · attendi il ripristino';this.notify();});
      canvas.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.initGL();this.backend='WebGL 2';this.upload();this.dirty=true;this.notify();});
    }
  }
  return {Viewer,coordinates,sample,project,edges};
});

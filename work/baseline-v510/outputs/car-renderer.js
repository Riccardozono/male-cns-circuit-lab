/* Presentation only. A generated orthographic GT3 R illustration, not a mesh.
 * Reads steering/brake state; never changes an agent, policy, RNG or physics.
 * Prepared colour/mip canvases are bounded; no per-car asset decoding/tinting.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MaleCNSCars=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const REVISION='992-top-sprite-1',HALF_LENGTH=12,WIDTH_RATIO=2.05/4.619;
  const SIZES=Object.freeze([64,256,512]),MAX_COLOURS=8,DOT_THRESHOLD=8;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const colour=value=>/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():'#ff7658';
  function detailLevel(pixelLength){return pixelLength<DOT_THRESHOLD?'dot':pixelLength<=48?64:pixelLength<=160?256:512;}
  function alphaBounds(data,width,height){
    let left=width,top=height,right=-1,bottom=-1,opaque=0,transparent=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const a=data[(y*width+x)*4+3];if(a===0)transparent++;
      if(a<16)continue;opaque++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(right<left||bottom<top)throw Error('Sprite senza carrozzeria visibile.');
    return Object.freeze({x:left,y:top,width:right-left+1,height:bottom-top+1,opaque,transparent,pixels:width*height});
  }
  function displayState(car){
    const raw=Number(car.vehicle?.steeringAngle);
    const steer=Number.isFinite(raw)?raw:(Number(car.steer)||0)*.58;
    return Object.freeze({steering:clamp(steer,-.58,.58),braking:car.alive!==false&&Number(car.outputs?.[2])>.02});
  }
  function tyres(ctx,state){
    // Fixed presentation coordinates follow the unchanged SI wheelbase/tracks.
    ctx.fillStyle='#080b10';
    for(const [x,y]of [[7.815,-4.365],[7.815,4.365],[-5.21,-4.313],[-5.21,4.313]]){
      ctx.save();ctx.translate(x,y);if(x>0)ctx.rotate(state.steering);
      ctx.beginPath();ctx.roundRect(-1.77,-.78,3.54,1.56,.35);ctx.fill();ctx.restore();
    }
  }
  function fallback(ctx,colourValue){
    const h=HALF_LENGTH*WIDTH_RATIO;ctx.fillStyle=colourValue;
    ctx.beginPath();ctx.moveTo(-12,-h*.7);ctx.lineTo(-9,-h);ctx.lineTo(5,-h);ctx.quadraticCurveTo(12,-h*.9,12,-h*.45);ctx.lineTo(12,h*.45);ctx.quadraticCurveTo(12,h*.9,5,h);ctx.lineTo(-9,h);ctx.lineTo(-12,h*.7);ctx.closePath();ctx.fill();
    ctx.fillStyle='#0b1118';ctx.beginPath();ctx.roundRect(-5,-h*.72,11,h*1.44,2);ctx.fill();
    ctx.fillStyle=colourValue;ctx.fillRect(-3,-h*.55,5,h*1.1);
    ctx.fillStyle='#f4efdf';for(const y of [-h*.65,h*.65]){ctx.beginPath();ctx.ellipse(9.5,y,1,.65,0,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#181c23';ctx.fillRect(-11.8,-h,1.5,h*2);
  }
  function brakeLamps(ctx){
    ctx.strokeStyle='#ff4c54';ctx.lineWidth=.3;ctx.lineCap='round';ctx.beginPath();
    ctx.moveTo(-9.2,-4.05);ctx.quadraticCurveTo(-10.1,-2.8,-10.15,-1.9);
    ctx.moveTo(-9.2,4.05);ctx.quadraticCurveTo(-10.1,2.8,-10.15,1.9);ctx.stroke();
  }
  class Renderer{
    constructor({makeCanvas,loadImage}={}){
      this.makeCanvas=makeCanvas||((w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;});
      this.loadImage=loadImage||(url=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Immagine auto non disponibile.'));i.src=url;}));
      this.state='idle';this.error='';this.cache=new Map();this.colours=[];this.base=null;this.source=null;this.builds=0;
      this.draws={dot:0,sprite:0,fallback:0};this.loading=null;
    }
    load(url,palette=[]){
      if(this.loading)return this.loading;
      this.state='loading';this.loading=this.loadImage(url).then(image=>{
        const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
        const probe=this.makeCanvas(width,height),pctx=probe.getContext('2d',{willReadFrequently:true});
        pctx.drawImage(image,0,0);const bounds=alphaBounds(pctx.getImageData(0,0,width,height).data,width,height);
        this.source=Object.freeze({url,width,height,bounds});
        this.base=this.makeCanvas(512,Math.ceil(512*WIDTH_RATIO));
        const bctx=this.base.getContext('2d',{willReadFrequently:true});bctx.imageSmoothingQuality='high';
        bctx.drawImage(image,bounds.x,bounds.y,bounds.width,bounds.height,0,0,this.base.width,this.base.height);
        probe.width=probe.height=0; // no retained full-resolution working canvas
        this.state='ready';for(const value of [...new Set(palette.map(colour))].slice(0,MAX_COLOURS))this.prepareColour(value);
        return this.status();
      }).catch(error=>{this.state='fallback';this.error=error.message;return this.status();});
      return this.loading;
    }
    prepareColour(value){
      const key=colour(value);if(!this.base||this.colours.includes(key))return;
      while(this.colours.length>=MAX_COLOURS){
        const oldest=this.colours.shift();for(const size of SIZES){const c=this.cache.get(oldest+':'+size);if(c){c.width=c.height=0;this.cache.delete(oldest+':'+size);}}
      }
      const large=this.makeCanvas(this.base.width,this.base.height),ctx=large.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(this.base,0,0);const pixels=ctx.getImageData(0,0,large.width,large.height),data=pixels.data;
      const rgb=[1,3,5].map(i=>parseInt(key.slice(i,i+2),16));
      // Runtime paint material: tint bright neutral bodywork, retaining original
      // alpha, carbon, dark glazing, red rear lamps and high-contrast shading.
      for(let i=0;i<data.length;i+=4){
        if(!data[i+3])continue;const min=Math.min(data[i],data[i+1],data[i+2]),max=Math.max(data[i],data[i+1],data[i+2]);
        if(max-min>42||min<100)continue;const amount=clamp((min-100)/65,0,.84);
        for(let c=0;c<3;c++)data[i+c]=Math.round(data[i+c]*((1-amount)+amount*rgb[c]/255));
      }
      ctx.putImageData(pixels,0,0);this.cache.set(key+':512',large);
      for(const size of [64,256]){
        const mip=this.makeCanvas(size,Math.ceil(size*WIDTH_RATIO)),mctx=mip.getContext('2d');mctx.imageSmoothingQuality='high';mctx.drawImage(large,0,0,mip.width,mip.height);this.cache.set(key+':'+size,mip);
      }
      this.colours.push(key);this.builds++;
    }
    // Caller supplies its local transform. All physical dimensions stay 24 ×
    // (24 * official width/length) and car.scale remains owned by the simulator.
    drawLocal(ctx,car,{color='#ff7658',pixelLength=24}={}){
      const key=colour(color),lod=detailLevel(pixelLength),state=displayState(car);
      ctx.save();
      if(lod==='dot'){
        ctx.fillStyle=key;ctx.beginPath();ctx.arc(0,0,2.5*24/Math.max(.01,pixelLength),0,Math.PI*2);ctx.fill();ctx.restore();this.draws.dot++;return 'dot';
      }
      tyres(ctx,state);let sprite=null;
      if(this.state==='ready'){this.prepareColour(key);sprite=this.cache.get(key+':'+lod);}
      if(sprite){ctx.imageSmoothingEnabled=true;ctx.drawImage(sprite,-12,-12*WIDTH_RATIO,24,24*WIDTH_RATIO);this.draws.sprite++;}
      else{fallback(ctx,key);this.draws.fallback++;}
      if(state.braking)brakeLamps(ctx);ctx.restore();return sprite?'sprite':'fallback';
    }
    drawPreview(canvas,car,color='#ff7658',dpr=1){
      const rect=canvas.getBoundingClientRect(),width=rect.width,height=rect.height;
      if(!width||!height)return false;
      const ratio=clamp(dpr,1,2),w=Math.round(width*ratio),h=Math.round(height*ratio);
      if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
      const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
      const length=Math.min(width-16,(height-12)/WIDTH_RATIO),scale=length/24;
      ctx.save();ctx.translate(width/2,height/2);ctx.scale(scale,scale);ctx.globalAlpha=car.alive===false?.38:1;
      this.drawLocal(ctx,car,{color,pixelLength:length*ratio});ctx.restore();return true;
    }
    status(){
      const cachedPixels=[...this.cache.values()].reduce((s,c)=>s+c.width*c.height,0)+(this.base?this.base.width*this.base.height:0);
      return {revision:REVISION,state:this.state,error:this.error,source:this.source,colours:this.colours.length,cacheEntries:this.cache.size,cacheBytes:cachedPixels*4,builds:this.builds,draws:{...this.draws}};
    }
  }
  return Object.freeze({Renderer,REVISION,HALF_LENGTH,WIDTH_RATIO,SIZES,MAX_COLOURS,DOT_THRESHOLD,alphaBounds,detailLevel,displayState});
});


const $ = id => document.getElementById(id);
const canvas=$('preview'),ctx=canvas.getContext('2d',{willReadFrequently:true});
const work=document.createElement('canvas'),wctx=work.getContext('2d',{willReadFrequently:true});
const raw=document.createElement('canvas'),rctx=raw.getContext('2d',{willReadFrequently:true});
const video=$('video'),img=$('image');
let type=null,url=null,mode='map',depth=null,depthBusy=false,rendering=false,cancelRender=false,renderPhase=0,previewJob=0,lastInference=0;
const defaults={black:3,white:97,gamma:0.95,blur:0,scanPosition:45,scanWidth:12,scanGlow:75,scanSpeed:45};
const labels={black:['BLACK POINT',0,35,1],white:['WHITE POINT',65,100,1],gamma:['GAMMA',0.3,2.4,.05],blur:['DEPTH SOFTEN',0,6,1],scanPosition:['SCAN POSITION',0,100,1],scanWidth:['SCAN WIDTH',2,45,1],scanGlow:['SCAN INTENSITY',0,100,1],scanSpeed:['SCAN SPEED',0,100,1]};
const settings={...defaults};
function setStatus(t){$('status').textContent=t}
function setEngine(t){$('modelStatus').textContent=t}
function source(){return type==='video'?video:img}
function dims(){const s=source();return type==='video'?[video.videoWidth,video.videoHeight]:[img.naturalWidth,img.naturalHeight]}
function clock(s){s=Math.max(0,s||0);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`}
function sizeCanvas(c,w,h){if(c.width!==w)c.width=w;if(c.height!==h)c.height=h}
function renderControls(){
 const names=Object.keys(labels).filter(k=>mode==='scan'||!k.startsWith('scan'));
 $('sliders').innerHTML=names.map(k=>{const [label,min,max,step]=labels[k];return `<div class="control"><label for="${k}"><span>${label}</span><output id="v-${k}">${settings[k]}</output></label><input id="${k}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[k]}"></div>`}).join('');
 names.forEach(k=>$(k).addEventListener('input',e=>{settings[k]=+e.target.value;$('v-'+k).textContent=settings[k];paint()}));
}
renderControls();
document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('.mode').forEach(x=>x.classList.toggle('active',x===b));renderControls();paint()});
function grade(depthResult,w,h,phase=0){
 const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true}),id=x.createImageData(w,h);
 const sw=depthResult.width,sh=depthResult.height;
 let data=depthResult.values||depthResult.bytes;
 if(!data||!data.length)throw Error('No depth data returned');
 let min=Infinity,max=-Infinity;
 for(let i=0;i<data.length;i++){let v=data[i];if(v<min)min=v;if(v>max)max=v}
 const span=Math.max(1e-8,max-min),lo=settings.black/100,hi=settings.white/100;
 const radius=settings.scanWidth/100,center=(settings.scanPosition/100+phase)%1;
 for(let y=0;y<h;y++)for(let xx=0;xx<w;xx++){
  const sx=Math.min(sw-1,Math.floor(xx*sw/w)),sy=Math.min(sh-1,Math.floor(y*sh/h));
  const v=(data[sy*sw+sx]-min)/span;
  const n=Math.max(0,Math.min(1,(v-lo)/Math.max(.001,hi-lo)));
  const d=Math.pow(n,settings.gamma);
  let z=Math.round(d*255);
  if(mode==='scan'){
    // Wave travels through DEPTH (not a 2D screen wipe).
    const delta=Math.abs(d-center),dist=Math.min(delta,1-delta);
    const edge=Math.exp(-Math.pow(dist/Math.max(.005,radius),2)*4);
    const base=d*.19;
    z=Math.round(Math.min(255,255*(base+edge*(.25+settings.scanGlow/100*.9))));
  }
  const i=(y*w+xx)*4;id.data[i]=id.data[i+1]=id.data[i+2]=z;id.data[i+3]=255;
 }
 x.putImageData(id,0,0);
 if(settings.blur){const b=document.createElement('canvas');b.width=w;b.height=h;const bx=b.getContext('2d');bx.filter=`blur(${settings.blur}px)`;bx.drawImage(c,0,0);return b}
 return c;
}
function drawSourceToRaw(w,h){
 sizeCanvas(raw,w,h);rctx.drawImage(source(),0,0,w,h);
 return rctx.getImageData(0,0,w,h);
}
async function infer(w,h){
 if(!window.signalForge)throw Error('Depth engine unavailable');
 const pixels=drawSourceToRaw(w,h);
 const res=await window.signalForge.runDepth({width:w,height:h,rgba:Array.from(pixels.data)});
 if(!res.ok)throw Error(res.error||'Depth inference failed');
 return res;
}
async function loadDepth(){setEngine('LOADING MODEL // FIRST USE DOWNLOAD');const w=96,h=96;const rgba=new Array(w*h*4).fill(128);for(let i=3;i<rgba.length;i+=4)rgba[i]=255;const r=await window.signalForge.runDepth({width:w,height:h,rgba});if(!r.ok)throw Error(r.error);setEngine('DEPTH ENGINE READY')}
$('loadModel').onclick=async()=>{try{await loadDepth();if(type)await refreshDepth(true)}catch(e){setEngine('ERROR: '+e.message)}};
async function refreshDepth(force=false){
 if(!type||rendering||depthBusy)return;
 if(type==='video'&&!force&&Date.now()-lastInference<600)return;
 depthBusy=true;const job=++previewJob;
 try{
  const [sw,sh]=dims();if(!sw||!sh)return;
  setEngine('ANALYZING DEPTH…');
  const scale=Math.min(1,512/Math.max(sw,sh));const w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
  const result=await infer(w,h);
  if(job===previewJob){depth=result;lastInference=Date.now();setEngine('DEPTH ENGINE READY');paint()}
 }catch(e){setEngine('ERROR: '+e.message);setStatus('DEPTH ERROR: '+e.message)}
 finally{depthBusy=false}
}
function paint(){
 if(!type)return;
 const [sw,sh]=dims();if(!sw||!sh)return;
 const scale=Math.min(1,900/Math.max(sw,sh)),w=Math.round(sw*scale),h=Math.round(sh*scale);
 sizeCanvas(canvas,w,h);ctx.fillStyle='#050505';ctx.fillRect(0,0,w,h);
 if(depth){const frame=grade(depth,w,h,renderPhase);ctx.drawImage(frame,0,0,w,h)}
 else{ctx.drawImage(source(),0,0,w,h)}
}
async function importFile(f){
 if(!f)return;
 if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(f);
 depth=null;type=f.type.startsWith('video/')?'video':f.type.startsWith('image/')?'image':null;
 if(!type){setStatus('UNSUPPORTED FILE');return}
 $('fileName').textContent=f.name;$('empty').hidden=true;renderPhase=0;previewJob++;
 try{
  if(type==='video'){
   video.pause();video.src=url;video.load();
   await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Video codec unsupported in this browser'))});
   $('play').disabled=false;video.currentTime=0;
  }else{
   img.src=url;await img.decode();$('play').disabled=true;
  }
  setStatus('SOURCE LOADED // DEPTH ANALYSIS STARTING');paint();await refreshDepth(true)
 }catch(e){setStatus('IMPORT ERROR: '+e.message)}
}
$('file').onchange=e=>importFile(e.target.files[0]);
const screen=document.querySelector('.screen');screen.ondragover=e=>e.preventDefault();screen.ondrop=e=>{e.preventDefault();importFile(e.dataTransfer.files[0])};
$('play').onclick=()=>{if(type!=='video')return;if(video.paused)video.play().catch(e=>setStatus(e.message));else video.pause()};
video.onplay=()=>$('play').textContent='❚❚';video.onpause=()=>$('play').textContent='▶';
video.onseeked=()=>{if(!rendering)refreshDepth(true)};
video.ontimeupdate=()=>{if(!rendering&&video.duration){$('timeline').value=Math.round(video.currentTime/video.duration*1000);$('time').textContent=`${clock(video.currentTime)} / ${clock(video.duration)}`}};
$('timeline').oninput=()=>{if(type==='video'&&video.duration&&!rendering)video.currentTime=video.duration*+$('timeline').value/1000};
let lastTick=performance.now();
function tick(now){
 const dt=Math.min(.1,(now-lastTick)/1000);lastTick=now;
 if(!rendering&&type){
  if(mode==='scan'&&settings.scanSpeed>0){renderPhase=(renderPhase+dt*settings.scanSpeed/100*.28)%1;paint()}
  if(type==='video'&&!video.paused){refreshDepth();if(mode==='map')paint()}
 }
 requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
function download(blob,name){const a=document.createElement('a');const u=URL.createObjectURL(blob);a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000)}
$('exportImage').onclick=async()=>{
 if(!type)return setStatus('IMPORT MEDIA FIRST');
 if(!depth)await refreshDepth(true);
 if(!depth)return setStatus('DEPTH NOT READY');
 const [w,h]=dims();const out=grade(depth,w,h,renderPhase);
 out.toBlob(b=>{if(b)download(b,'depth-forge-frame.png')},'image/png');
};
async function seek(t){
 if(Math.abs(video.currentTime-t)<.0001)return;
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('Video seek timed out'))},15000);function cleanup(){clearTimeout(timer);video.removeEventListener('seeked',done)}function done(){cleanup();resolve()}video.addEventListener('seeked',done,{once:true});video.currentTime=t});
}
$('cancel').onclick=()=>{cancelRender=true;setStatus('CANCEL REQUESTED // FINISHING CURRENT FRAME')};
$('exportVideo').onclick=async()=>{
 if(rendering)return;
 if(!type)return setStatus('IMPORT MEDIA FIRST');
 if(!('VideoEncoder' in window))return setStatus('MP4 EXPORT REQUIRES CHROME/EDGE WITH WEBCODECS');
 const [sw,sh]=dims(),limit=$('resolution').value;
 const scale=limit==='source'?1:Math.min(1,+limit/sh);
 let w=Math.max(2,Math.round(sw*scale/2)*2),h=Math.max(2,Math.round(sh*scale/2)*2);
 const fps=+$('fps').value;
 const duration=type==='video'?video.duration:5;
 if(!Number.isFinite(duration)||duration<=0)return setStatus('INVALID VIDEO DURATION');
 if(duration*fps>18000)return setStatus('CLIP TOO LONG FOR BROWSER RENDER (MAX 10 MIN @ 30 FPS)');
 rendering=true;cancelRender=false;video.pause();$('cancel').disabled=false;$('exportVideo').disabled=true;$('progress').value=0;
 let encoder=null;
 try{
  setStatus('LOADING MP4 ENCODER…');
  const {Muxer,ArrayBufferTarget}=await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/+esm');
  const config={codec:'avc',width:w,height:h,bitrate:Math.max(1_000_000,Math.min(18_000_000,w*h*fps*.11)),framerate:fps,avc:{format:'avc'}};
  const supported=await VideoEncoder.isConfigSupported(config);
  if(!supported.supported)throw Error('H.264 encoding unavailable in this browser');
  const target=new ArrayBufferTarget();
  const muxer=new Muxer({target,video:{codec:'avc',width:w,height:h,frameRate:fps},fastStart:'in-memory',firstTimestampBehavior:'offset'});
  encoder=new VideoEncoder({output:(chunk,meta)=>muxer.addVideoChunk(chunk,meta),error:e=>setStatus('ENCODER ERROR: '+e.message)});
  encoder.configure(config);
  const frameCount=Math.ceil(duration*fps);
  for(let i=0;i<frameCount;i++){
   if(cancelRender)throw Error('Render cancelled');
   const t=Math.min(duration-.001,i/fps);
   if(type==='video')await seek(t);
   const inferenceScale=Math.min(1,512/Math.max(sw,sh));
   const iw=Math.max(1,Math.round(sw*inferenceScale)),ih=Math.max(1,Math.round(sh*inferenceScale));
   const d=await infer(iw,ih);
   const phase=mode==='scan'?(i/fps*settings.scanSpeed/100*.28)%1:0;
   const processed=grade(d,w,h,phase);
   const frame=new VideoFrame(processed,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});
   encoder.encode(frame);frame.close();
   if(encoder.encodeQueueSize>4)await new Promise(resolve=>setTimeout(resolve,0));
   $('progress').value=Math.round((i+1)/frameCount*100);
   $('progressText').textContent=`FRAME ${i+1}/${frameCount} // ${$('progress').value}%`;
   if(i%3===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  await encoder.flush();encoder.close();encoder=null;muxer.finalize();
  download(new Blob([target.buffer],{type:'video/mp4'}),`depth-forge-${mode}.mp4`);
  setStatus('RENDER COMPLETE // MP4 DOWNLOADED (SILENT)');
 }catch(e){setStatus('RENDER STOPPED: '+e.message)}
 finally{if(encoder&&encoder.state!=='closed')encoder.close();rendering=false;$('cancel').disabled=true;$('exportVideo').disabled=false;await refreshDepth(true);paint()}
};

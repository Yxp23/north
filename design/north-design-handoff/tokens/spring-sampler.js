// Exact spring sampler extracted from the approved prototype.
function springSamples(duration,stiffness=340,damping=22){const mass=1,w0=Math.sqrt(stiffness/mass),zeta=damping/(2*Math.sqrt(stiffness*mass)),wd=w0*Math.sqrt(1-zeta*zeta),samples=[];for(let i=0;i<=48;i++){const t=(i/48)*duration/1000;const v=1-Math.exp(-zeta*w0*t)*(Math.cos(wd*t)+(zeta*w0/wd)*Math.sin(wd*t));samples.push({v:i===48?1:v,offset:i/48});}return samples;}
export { springSamples };

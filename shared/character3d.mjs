import { readAvatar, avatarOptions } from "./avatar.mjs";

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const center = points => points[0].map((_, i) => points.reduce((n, p) => n + p[i], 0) / points.length);

// Real XYZ mesh, independent of the renderer. Low polygon counts keep portraits
// cheap; the same geometry can be exported to a GPU renderer later.
export function characterMesh(raw, detailed = false, compact = false) {
  const avatar = readAvatar(raw);
  const color = avatarOptions.color.find(c => c.id === avatar.color).hex;
  const faces = [];
  function face(points, origin, color) {
    const normal = cross(sub(points[1], points[0]), sub(points[2], points[0]));
    if (dot(normal, sub(center(points), origin)) < 0) points.reverse();
    faces.push({ points, color });
  }
  function box(origin, size, color) {
    const points = Array.from({ length: 8 }, (_, i) => origin.map((v, axis) => v + ((i >> axis & 1) ? 1 : -1) * size[axis] / 2));
    for (const indices of [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]]) face(indices.map(i => points[i]), origin, color);
  }
  function oval(origin, size, color, power = 1) {
    const slices = compact ? 6 : detailed ? 12 : 8, rings = compact ? 4 : detailed ? 8 : 6;
    const shape = n => Math.sign(n) * Math.pow(Math.abs(n), power);
    const point = (r, s) => {
      const lat = -Math.PI / 2 + Math.PI * r / rings, lon = 2 * Math.PI * s / slices;
      return [shape(Math.cos(lat) * Math.cos(lon)), shape(Math.sin(lat)), shape(Math.cos(lat) * Math.sin(lon))].map((v, i) => origin[i] + v * size[i]);
    };
    for (let r=0;r<rings;r++) for(let s=0;s<slices;s++) {
      const points = r===0 ? [point(r,s),point(r+1,s+1),point(r+1,s)] : r===rings-1 ? [point(r,s),point(r,s+1),point(r+1,s)] : [point(r,s),point(r,s+1),point(r+1,s+1),point(r+1,s)];
      face(points, origin, color);
    }
  }
  // Body, boots, arms and back pack remain visible when rotated.
  oval([0,-0.45,0], [0.5,0.6,0.32], color, 0.6);
  box([0,-0.35,-0.36], [0.5,0.55,0.2], "#27344D");
  for (const side of [-1,1]) {
    oval([side*0.26,-1.1,0.1], [0.22,0.25,0.32], "#27344D", 0.5);
    oval([side*0.64,-0.46,0], [0.18,0.43,0.19], color, 0.65);
    oval([side*0.65,-0.76,0.05], [0.19,0.2,0.2], "#DCE6FA", 0.6);
  }
  oval([0,0.49,0], [0.64,0.56,0.45], color, avatar.species === "robot" ? 0.38 : 1);
  oval([0,0.48,0.39], [0.5,0.3,0.16], "#17263E", 0.48);
  for (const side of [-1,1]) oval([side*0.23,0.52,0.55], [0.075,avatar.species === "alien" ? 0.14 : 0.095,0.025], "#AEFFE5");
  box([0,0.27,0.555], [0.15,0.035,0.025], "#FFFFFF");
  if (avatar.species === "cat") {
    for (const side of [-1,1]) {
      const origin=[side*0.45,1.02,0];
      const a=[side*0.22,0.87,0.14],b=[side*0.65,0.85,0.12],c=[side*0.58,1.37,-0.03],d=[side*0.44,0.87,-0.3];
      for (const points of [[a,b,c],[a,c,d],[b,d,c],[a,d,b]]) face(points,origin,color);
    }
    oval([0,0.36,0.57], [0.07,0.045,0.03], "#FF9BAF");
    oval([0.43,-0.7,-0.42], [0.18,0.42,0.17], color);
  } else if (avatar.species === "alien") {
    for(const side of [-1,1]) {
      box([side*0.4,1.1,0], [0.07,0.35,0.07], color);
      oval([side*0.4,1.3,0], [0.13,0.13,0.13], "#B4FFDA");
    }
  } else {
    box([0,1.13,0], [0.07,0.25,0.07], "#DCE6FA");
    oval([0,1.29,0], [0.12,0.12,0.12], color);
  }
  if(avatar.accessory === "visor") box([0,0.57,0.6], [1.06,0.14,0.06], "#67D8EF");
  if(avatar.accessory === "crown") {
    box([0,1.03,0.02], [0.92,0.14,0.55], "#DFAB30");
    for(const x of [-0.36,0,0.36]) box([x,1.19,0.24], [0.13,0.25,0.13], "#FFD65C");
  }
  return faces;
}

export function projectCharacter(mesh, yaw = -0.35) {
  const cy=Math.cos(yaw),sy=Math.sin(yaw), pitch=0.12;
  const rotate=([x,y,z])=>{
    const rx=x*cy+z*sy,rz=-x*sy+z*cy;
    return [rx,y*Math.cos(pitch)-rz*Math.sin(pitch),y*Math.sin(pitch)+rz*Math.cos(pitch)];
  };
  return mesh.flatMap((face,index)=>{
    const points=face.points.map(rotate), c=center(points);
    const n=cross(sub(points[1],points[0]),sub(points[2],points[0]));
    const length=Math.hypot(...n);
    if(length<1e-8 || dot(n,sub([0,0,7],c))<=0) return [];
    const normal=n.map(v=>v/length);
    const light=0.6+Math.max(0,dot(normal,[-0.45,0.65,0.6]))*0.45;
    const rgb=face.color.slice(1).match(/../g).map(v=>Math.min(255,Math.round(parseInt(v,16)*light)));
    return [{ id:index,depth:c[2],color:`rgb(${rgb.join(",")})`,points:points.map(([x,y,z])=>`${(100+x*57/(1-z/7)).toFixed(2)},${(103-y*57/(1-z/7)).toFixed(2)}`).join(" ") }];
  }).sort((a,b)=>a.depth-b.depth);
}

import { Box3, BufferAttribute, BufferGeometry, Group, MathUtils, Matrix4, Mesh, Sphere, Vector3 } from 'three';

export function wheelPivot(parent,center,radius,steers) {
  const hub = new Group();
  hub.position.copy(center);
  hub.userData.wheelRadius = radius;
  hub.userData.steers = steers;
  const roller = new Group();
  hub.add(roller);
  parent.add(hub);
  return {hub,roller};
}

export function wheelAnimator(body) {
  const wheels = [];
  body.traverse(hub=>{
    if (hub.userData.wheelRadius) wheels.push(hub);
  });
  return (travel,steering=0)=>{
    for (const hub of wheels) {
      const {wheelRadius,steers} = hub.userData;
      const roller = hub.children[0];
      roller.rotation.x = (roller.rotation.x-travel/wheelRadius)%(Math.PI*2);
      if (steers) hub.rotation.y = -.49*MathUtils.clamp(steering,-1,1);
    }
  };
}

function subsetGeometry(source, triangles) {
  const geometry = new BufferGeometry();
  const idx = source.index;
  const vertCount = triangles.length * 3;
  for (const [name, attr] of Object.entries(source.attributes)) {
    const itemSize = attr.itemSize;
    const array = new attr.array.constructor(vertCount * itemSize);
    for (let t = 0; t < triangles.length; t++) {
      const tri = triangles[t];
      for (let k = 0; k < 3; k++) {
        const srcVert = idx ? idx.getX(tri * 3 + k) : tri * 3 + k;
        const dstBase = (t * 3 + k) * itemSize;
        for (let c = 0; c < itemSize; c++) array[dstBase + c] = attr.array[srcVert * itemSize + c];
      }
    }
    geometry.setAttribute(name, new BufferAttribute(array, itemSize, attr.normalized));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function rigClusteredWheels(model) {
  model.updateMatrixWorld(true);
  const modelBox = new Box3().setFromObject(model);
  const modelSize = modelBox.getSize(new Vector3());
  if (modelBox.isEmpty() || modelSize.y <= 0 || modelSize.x <= 0) return model;

  const point = new Vector3();
  const extracted = [];

  model.traverse(node => {
    if (!node.isMesh || !node.geometry?.attributes?.position) return;
    const g = node.geometry;
    const pos = g.attributes.position;
    const idx = g.index;
    const triCount = Math.floor((idx ? idx.count : pos.count) / 3);
    if (triCount < 12) return;

    const parent = Array.from({length: pos.count}, (_, i) => i);
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
    const vmap = new Map();
    const pts = new Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      point.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
      pts[i] = point.clone();
      const key = `${Math.round(point.x * 500)},${Math.round(point.y * 500)},${Math.round(point.z * 500)}`;
      const existing = vmap.get(key);
      if (existing !== undefined) unite(existing, i);
      else vmap.set(key, i);
    }
    for (let t = 0; t < triCount; t++) {
      const a = idx ? idx.getX(t * 3) : t * 3;
      const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      unite(a, b);
      unite(a, c);
    }
    const comps = new Map();
    for (let t = 0; t < triCount; t++) {
      const a = idx ? idx.getX(t * 3) : t * 3;
      const root = find(a);
      let comp = comps.get(root);
      if (!comp) comps.set(root, comp = { box: new Box3(), tris: [] });
      comp.tris.push(t);
      const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      comp.box.expandByPoint(pts[a]).expandByPoint(pts[b]).expandByPoint(pts[c]);
    }
    const wheelComps = [];
    for (const comp of comps.values()) {
      const s = comp.box.getSize(new Vector3());
      const ctr = comp.box.getCenter(new Vector3());
      if (comp.box.min.y <= modelBox.min.y + modelSize.y * .08 &&
          s.y > modelSize.y * .24 && s.y < modelSize.y * .65 &&
          Math.abs(s.y - s.z) < Math.max(s.y, s.z) * .20 &&
          Math.abs(ctr.x) > modelSize.x * .24 && s.x < s.y * .8) {
        wheelComps.push({ ...comp, ctr, radius: (s.y + s.z) / 4 });
      }
    }
    if (wheelComps.length >= 4) extracted.push({ node, wheelComps, triCount });
  });

  if (!extracted.length) return model;

  const body = new Group(), sprung = new Group();
  sprung.name = 'Sprung exterior';
  sprung.add(model);
  body.add(sprung);

  const origin = new Matrix4();
  for (const { node, wheelComps, triCount } of extracted) {
    const frontZ = Math.min(...wheelComps.map(w => w.ctr.z));
    const wheelTriSet = new Uint8Array(triCount);
    for (const w of wheelComps) {
      for (const t of w.tris) wheelTriSet[t] = 1;
      const steers = Math.abs(w.ctr.z - frontZ) < w.radius * .7;
      const { roller } = wheelPivot(body, w.ctr, w.radius, steers);
      const wheelMesh = new Mesh(subsetGeometry(node.geometry, w.tris), node.material);
      origin.makeTranslation(-w.ctr.x, -w.ctr.y, -w.ctr.z).multiply(node.matrixWorld);
      origin.decompose(wheelMesh.position, wheelMesh.quaternion, wheelMesh.scale);
      roller.add(wheelMesh);
    }
    const bodyTris = [];
    for (let t = 0; t < triCount; t++) if (!wheelTriSet[t]) bodyTris.push(t);
    const bodyGeo = subsetGeometry(node.geometry, bodyTris);
    node.geometry.dispose();
    node.geometry = bodyGeo;
  }
  return body;
}

export function rigNamedWheels(model) {
  const roles = ['FL','FR','RL','RR'];
  const parts = roles.map(role=>model.getObjectByName('Wheel_'+role));
  if (parts.some(part=>!part)) return rigClusteredWheels(model);
  for (const role of ['RL_Inner','RR_Inner']) {
    const part = model.getObjectByName('Wheel_'+role);
    if (part) {
      roles.push(role);
      parts.push(part);
    }
  }
  model.updateMatrixWorld(true);
  const bounds = parts.map(part=>new Box3().setFromObject(part));
  if (bounds.some(box=>box.isEmpty() || box.max.y-box.min.y<.12)) return model;
  const body = new Group(), sprung = new Group();
  sprung.name = 'Sprung exterior';
  sprung.add(model);
  body.add(sprung);
  for (const [i,part] of parts.entries()) {
    const box = bounds[i];
    const radius = (box.max.y-box.min.y)/2;
    const {roller} = wheelPivot(body,box.getCenter(new Vector3()),radius,roles[i][0]==='F');
    roller.attach(part);
  }
  return body;
}

export function rigBmwWheels(model) {
  const original = model.getObjectByName('WHeelsandrims_2');
  if (!original || original.children.length!==3 || !original.children.every(node=>node.isMesh && node.geometry.index)) {
    return model;
  }
  model.updateMatrixWorld(true);
  const buckets = Array.from({length:4},()=>({box:new Box3(),parts:[]}));
  const points = [new Vector3(),new Vector3(),new Vector3()];
  for (const part of original.children) {
    const indices = buckets.map(()=>[]);
    const bounds = buckets.map(()=>new Box3());
    const {index,attributes} = part.geometry;
    for (let i=0;i<index.count;i+=3) {
      for (let k=0;k<3;k++) {
        points[k].fromBufferAttribute(attributes.position,index.getX(i+k)).applyMatrix4(part.matrixWorld);
      }
      const right = points[0].x+points[1].x+points[2].x>0;
      const rear = points[0].z+points[1].z+points[2].z>0;
      const slot = Number(right)*2+Number(rear);
      indices[slot].push(index.getX(i),index.getX(i+1),index.getX(i+2));
      for (const point of points) bounds[slot].expandByPoint(point);
    }
    for (const [i,bucket] of buckets.entries()) {
      if (!indices[i].length) continue;
      const fixed = part.material.name==='Caliper1Mtl';
      const geometry = new BufferGeometry();
      for (const [name,attribute] of Object.entries(attributes)) geometry.setAttribute(name,attribute);
      geometry.setIndex(new BufferAttribute(new index.array.constructor(indices[i]),1));
      const worldBounds = bounds[i];
      geometry.boundingBox = worldBounds.clone().applyMatrix4(part.matrixWorld.clone().invert());
      geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new Sphere());
      if (!fixed) bucket.box.union(worldBounds);
      bucket.parts.push({mesh:new Mesh(geometry,part.material),matrix:part.matrixWorld.clone(),fixed});
    }
  }
  if (buckets.some(bucket=>bucket.box.isEmpty())) return model;

  const body = new Group(), sprung = new Group();
  sprung.name = 'Sprung exterior';
  sprung.add(model);
  body.add(sprung);
  original.removeFromParent();
  for (const [i,{box,parts}] of buckets.entries()) {
    const center = box.getCenter(new Vector3());
    const radius = (box.max.y-box.min.y)/2;
    const {hub,roller} = wheelPivot(body,center,radius,i%2===0);
    const origin = new Matrix4().makeTranslation(-center.x,-center.y,-center.z);
    for (const {mesh,matrix,fixed} of parts) {
      mesh.matrix.copy(origin).multiply(matrix);
      mesh.matrix.decompose(mesh.position,mesh.quaternion,mesh.scale);
      (fixed ? hub : roller).add(mesh);
    }
  }
  return body;
}

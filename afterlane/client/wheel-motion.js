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

export function rigNamedWheels(model) {
  const roles = ['FL','FR','RL','RR'];
  const parts = roles.map(role=>model.getObjectByName('Wheel_'+role));
  if (parts.some(part=>!part)) return model;
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

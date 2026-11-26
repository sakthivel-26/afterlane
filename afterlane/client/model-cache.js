const storageName = 'afterlane-vehicle-models-v1';
const databaseName = 'afterlane-models-v1';
const storeName = 'glb';
let databaseRequest;
let versionsRequest;

function modelVersions() {
  versionsRequest ??= fetch('/model-versions.json',{cache:'no-store'}).then(response=>{
    if (!response.ok) throw new Error('Model version list unavailable');
    return response.json();
  }).catch(()=>{
    versionsRequest=undefined;
    return null;
  });
  return versionsRequest;
}

export async function hasAsset(path) {
  const versions = await modelVersions();
  return versions ? Boolean(versions[path]) : true;
}

function database() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  databaseRequest ??= new Promise(resolve=>{
    try {
      const request = indexedDB.open(databaseName,1);
      request.onupgradeneeded=()=>request.result.createObjectStore(storeName);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=request.onblocked=()=>resolve(null);
    } catch { resolve(null); }
  });
  return databaseRequest;
}

function useStore(db,mode,operation) {
  return new Promise(resolve=>{
    try {
      const transaction=db.transaction(storeName,mode);
      const request=operation(transaction.objectStore(storeName));
      transaction.oncomplete=()=>resolve(request.result ?? null);
      transaction.onerror=transaction.onabort=()=>resolve(null);
    } catch { resolve(null); }
  });
}

async function cacheStorage() {
  try { return await globalThis.caches?.open(storageName); }
  catch { return null; }
}

export async function loadCachedModel(loader,path,revision) {
  const [versions,cache]=await Promise.all([modelVersions(),cacheStorage()]);
  const db=cache ? null : await database();
  const version=versions?.[path];
  const cacheVersion=version ?? revision;
  const url=version ? path+'?v='+version : revision ? path+'?revision='+revision : path;
  const parse=bytes=>loader.parseAsync(bytes,path.slice(0,path.lastIndexOf('/')+1));
  const remove=()=>cache ? cache.delete(path).catch(()=>{}) : useStore(db,'readwrite',store=>store.delete(path));
  let cached;

  if (cache) {
    cached=await cache.match(path).then(async response=>response && ({
      version:response.headers.get('X-Afterlane-Model-Version'),
      bytes:await response.arrayBuffer(),
    })).catch(()=>null);
  } else if (db) {
    const entry=await useStore(db,'readonly',store=>store.get(path));
    cached=entry instanceof ArrayBuffer ? {bytes:entry} : entry;
  }

  if (versions && !version) {
    if (cached) await remove();
    throw new Error(`Model unavailable: ${path}`);
  }
  if (cached && ((!versions && !revision) || cached.version===cacheVersion)) {
    try { return await parse(cached.bytes); }
    catch {
      await remove();
      cached=null;
    }
  }

  if (!cache && !db) return loader.loadAsync(url);
  let response, bytes, model;
  try {
    response=await fetch(url);
    if (!response.ok) throw new Error(`Model unavailable: ${path}`);
    bytes=await response.arrayBuffer();
    model=await parse(bytes);
  } catch (error) {
    if (cached) {
      try { return await parse(cached.bytes); }
      catch { await remove(); }
    }
    throw error;
  }
  const servedVersion=cacheVersion ?? response.headers.get('ETag')?.replaceAll('"','');
  if (servedVersion && cache) {
    const headers={'Content-Type':'model/gltf-binary','X-Afterlane-Model-Version':servedVersion};
    await cache.put(path,new Response(bytes,{headers})).catch(()=>{});
  } else if (servedVersion && db) {
    await useStore(db,'readwrite',store=>store.put({version:servedVersion,bytes},path));
  }
  return model;
}

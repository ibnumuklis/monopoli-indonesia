// Optimasi performa: gabungkan mesh statis per material menjadi satu geometri (draw call jauh lebih sedikit).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function mergeStatic(root: THREE.Object3D, exclude: THREE.Object3D[] = []) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const ex = new Set(exclude);
  const isExcluded = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (ex.has(p)) return true; return false; };
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  const remove: THREE.Mesh[] = [];
  root.traverse((o: any) => {
    if (!o.isMesh || isExcluded(o)) return;
    const m = o.material as THREE.Material;
    if (Array.isArray(o.material) || (m as any).transparent || (m as any).map) return;
    let g: THREE.BufferGeometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const keep = new Set(['position', 'normal', ...((m as any).vertexColors ? ['color'] : [])]);
    for (const k of Object.keys(g.attributes)) if (!keep.has(k)) g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    let b = buckets.get(m);
    if (!b) { b = { geos: [], cast: false }; buckets.set(m, b); }
    b.geos.push(g); b.cast = b.cast || o.castShadow;
    remove.push(o);
  });
  for (const o of remove) o.parent?.remove(o);
  for (const [m, b] of buckets) {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = b.cast; mesh.receiveShadow = true;
    // geometri sudah dalam ruang lokal root
    root.add(mesh);
  }
  return root;
}

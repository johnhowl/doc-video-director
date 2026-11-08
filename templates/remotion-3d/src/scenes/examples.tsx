import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import * as THREE from 'three';
import {Labels, Stage} from '../lib/Stage';
import {Membrane, Soft} from '../lib/materials';
import {C, V3, lerp3, mix, phase, rng, window4} from '../lib/core';

type Show = {showLabels?: boolean};

/* ------------------------------------------------------------------ */
/* 02-02  细胞工厂总览：外景环绕 → 推进 → 依次点亮细胞核、线粒体、溶酶体 */
/* ------------------------------------------------------------------ */
const Chromatin: React.FC<{seed: number}> = ({seed}) => {
  const geo = useMemo(() => {
    const r = rng(seed);
    const pts: THREE.Vector3[] = [];
    let p = new THREE.Vector3((r() - 0.5) * 1.6, (r() - 0.5) * 1.6, (r() - 0.5) * 1.6);
    for (let i = 0; i < 26; i++) {
      p = p.clone().add(new THREE.Vector3((r() - 0.5) * 0.7, (r() - 0.5) * 0.7, (r() - 0.5) * 0.7));
      if (p.length() > 1.25) p.multiplyScalar(1.1 / p.length());
      pts.push(p);
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.035, 6, false);
  }, [seed]);
  return (
    <mesh geometry={geo}>
      <Soft color={C.chromatin} rough={0.6} glow={0.15} />
    </mesh>
  );
};

export const CellFactory: React.FC<Show> = ({showLabels = true}) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const layout = useMemo(() => {
    const r = rng(11);
    const shell = (min: number, max: number) => {
      const d = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 0.7, r() - 0.5).normalize();
      const p = d.multiplyScalar(mix(min, max, r()));
      if (p.z > 0.6 && p.x < 1.2) p.z = -p.z; // nothing between the camera path and the nucleus
      return p.toArray() as V3;
    };
    return {
      mito: Array.from({length: 11}, () => ({p: shell(2.3, 4.1), rot: [r() * 3, r() * 3, r() * 3] as V3, s: 0.85 + r() * 0.4})),
      lyso: Array.from({length: 12}, () => ({p: shell(2.0, 4.2), s: 0.14 + r() * 0.1})),
      ves: Array.from({length: 40}, () => ({p: shell(1.9, 4.6), s: 0.04 + r() * 0.05})),
    };
  }, []);
  // camera: orbit outside, then dolly inside toward the nucleus, then drift to the lysosomes
  const orbit = phase(t, 0, 4.5);
  const dolly = phase(t, 4, 8.5);
  const drift = phase(t, 9, 12.5);
  const ang = mix(-0.5, 0.35, orbit) + drift * 0.35;
  const dist = mix(15.5, 7.4, dolly);
  const pos: V3 = [Math.sin(ang) * dist, mix(2.6, 1.1, dolly), Math.cos(ang) * dist];
  const at = lerp3(lerp3([0, 0, 0], [-1.1, 0, 0], dolly), [1.6, -0.4, 1.2], drift);
  const gN = window4(t, 4.6, 5.4, 7.2, 7.9);
  const gM = window4(t, 7.4, 8.1, 9.5, 10.1);
  const gL = window4(t, 9.7, 10.4, 12.6, 13.4);
  return (
    <AbsoluteFill>
      <Stage pos={pos} at={at} fov={34}>
        <group scale={[1.18, 0.9, 1]}>
          <mesh>
            <sphereGeometry args={[5, 96, 64]} />
            <Membrane color={C.membrane} opacity={mix(0.3, 0.12, dolly)} />
          </mesh>
        </group>
        {/* nucleus: double membrane + nucleolus + chromatin */}
        <group position={[-1.1, 0, 0]}>
          <mesh>
            <sphereGeometry args={[1.62, 64, 48]} />
            <Membrane color={C.nucleus} opacity={0.42} emissive={C.energy} glow={gN * 0.6} />
          </mesh>
          <mesh>
            <sphereGeometry args={[1.5, 64, 48]} />
            <Membrane color={C.nucleus} opacity={0.18} />
          </mesh>
          <mesh position={[0.35, 0.25, 0.1]}>
            <sphereGeometry args={[0.42, 32, 24]} />
            <Soft color={C.nucleolus} glow={0.1 + gN * 0.5} />
          </mesh>
          {[3, 5, 8, 13].map((s) => (
            <Chromatin key={s} seed={s} />
          ))}
        </group>
        {/* endoplasmic reticulum: stacked curved sheets around the nucleus */}
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[-1.1, (i - 2) * 0.28, 0]} rotation={[Math.PI / 2, 0, 0.6 + i * 0.25]} scale={[1, 1, 0.35]}>
            <torusGeometry args={[2.0 + i * 0.12, 0.09, 10, 96, Math.PI * 1.1]} />
            <Soft color={C.er} opacity={0.6} />
          </mesh>
        ))}
        {layout.mito.map((m, i) => (
          <group key={i} position={m.p} rotation={m.rot} scale={m.s}>
            <mesh>
              <capsuleGeometry args={[0.24, 0.75, 10, 20]} />
              <Soft color={C.mito} glow={0.05 + gM * 1.4} emissive="#ff9a3a" />
            </mesh>
          </group>
        ))}
        {layout.lyso.map((l, i) => (
          <mesh key={i} position={l.p} scale={l.s}>
            <sphereGeometry args={[1, 24, 18]} />
            <Soft color={C.lyso} glow={0.05 + gL * 1.6} emissive="#b8ff6a" />
          </mesh>
        ))}
        {layout.ves.map((v, i) => (
          <mesh key={i} position={v.p} scale={v.s}>
            <sphereGeometry args={[1, 12, 10]} />
            <Membrane color="#d8eef2" opacity={0.6} />
          </mesh>
        ))}
      </Stage>
      <Labels
        show={showLabels}
        shot="02-02"
        title="每个细胞都是一座小工厂"
        callouts={[
          {from: 4.8, to: 7.8, text: '细胞核 · 档案室'},
          {from: 7.6, to: 10.0, text: '线粒体 · 发电站'},
          {from: 9.9, to: 13.3, text: '溶酶体 · 回收站'},
        ]}
      />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* 02-04  DNA 损伤与修复：右手双螺旋 → 局部损伤 → 修复蛋白夹住 → 剪掉 → 补齐 */
/* ------------------------------------------------------------------ */
const PITCH = 3.4; // one full turn (10 base pairs)
const R = 0.9;
class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(private x0: number, private x1: number, private phase0: number) {
    super();
  }
  getPoint(u: number, target = new THREE.Vector3()) {
    const x = mix(this.x0, this.x1, u);
    const th = (2 * Math.PI * x) / PITCH + this.phase0; // right-handed about +x
    return target.set(x, R * Math.cos(th), R * Math.sin(th));
  }
}
const BASE_COLORS = ['#f0a830', '#2fb59a', '#e0606a', '#6a7fe0'];

export const DnaRepair: React.FC<Show> = ({showLabels = true}) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const X0 = -7;
  const X1 = 7;
  const strandA = useMemo(() => new THREE.TubeGeometry(new Helix(X0, X1, 0), 600, 0.09, 10), []);
  const strandB = useMemo(() => new THREE.TubeGeometry(new Helix(X0, X1, Math.PI * 0.82), 600, 0.09, 10), []);
  const pairs = useMemo(() => {
    const r = rng(3);
    const list: {x: number; a: V3; b: V3; mid: V3; c: number}[] = [];
    for (let x = X0 + 0.17; x < X1; x += 0.34) {
      const thA = (2 * Math.PI * x) / PITCH;
      const thB = thA + Math.PI * 0.82;
      const a: V3 = [x, R * Math.cos(thA), R * Math.sin(thA)];
      const b: V3 = [x, R * Math.cos(thB), R * Math.sin(thB)];
      list.push({x, a, b, mid: lerp3(a, b, 0.5), c: Math.floor(r() * 4)});
    }
    return list;
  }, []);
  const damaged = new Set([19, 20, 21]);
  const pDamage = phase(t, 2.0, 3.2);
  const pArrive = phase(t, 3.4, 5.4);
  const pCut = phase(t, 5.6, 7.0);
  const pFill = phase(t, 7.2, 9.4);
  const pLeave = phase(t, 9.8, 11.8);
  const dx = pairs[20].x;
  const spin = t * 0.22;
  const camPos: V3 = lerp3([1.5, 2.4, 12.5], [dx + 1.8, 1.6, 8.2], phase(t, 1.5, 6.5));
  const half = (from: V3, to: V3, color: string, glow: number, key: string, scale = 1, offset: V3 = [0, 0, 0], opacity = 1) => {
    const a = new THREE.Vector3(...from).add(new THREE.Vector3(...offset));
    const b = new THREE.Vector3(...to).add(new THREE.Vector3(...offset));
    const mid = a.clone().lerp(b, 0.5);
    const len = a.distanceTo(b) * scale;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return (
      <mesh key={key} position={mid} quaternion={q}>
        <cylinderGeometry args={[0.07, 0.07, len, 10]} />
        <Soft color={color} glow={glow} opacity={opacity} />
      </mesh>
    );
  };
  return (
    <AbsoluteFill>
      <Stage pos={camPos} at={[dx * phase(t, 1.5, 6.5), 0, 0]} fov={34}>
        <group rotation={[spin, 0, 0]}>
          <mesh geometry={strandA}>
            <Soft color="#e0a95a" />
          </mesh>
          <mesh geometry={strandB}>
            <Soft color="#5f9fd6" />
          </mesh>
          {pairs.map((p, i) => {
            const col = BASE_COLORS[p.c];
            const partner = BASE_COLORS[(p.c + 2) % 4];
            const items = [half(p.a, p.mid, col, 0.05, `a${i}`)];
            if (!damaged.has(i)) {
              items.push(half(p.b, p.mid, partner, 0.05, `b${i}`));
            } else {
              // damaged nucleotide on strand B: darkens and kinks, is cut out, then a new one grows in
              const kink: V3 = [0, 0.25 * pDamage, 0.25 * pDamage];
              const away: V3 = [0, 2.2 * pCut, 2.6 * pCut];
              if (pCut < 1) {
                const c = new THREE.Color(partner).lerp(new THREE.Color(C.damage), pDamage).getStyle();
                items.push(half(p.b, p.mid, c, 0.3 * pDamage, `d${i}`, 1, [kink[0] + away[0], kink[1] + away[1], kink[2] + away[2]], 1 - pCut));
              }
              if (pFill > 0) items.push(half(p.b, p.mid, partner, 0.9 * (1 - pLeave * 0.8), `n${i}`, pFill));
            }
            return <React.Fragment key={i}>{items}</React.Fragment>;
          })}
        </group>
        {/* repair complex: clamp ring + two lobes */}
        <group position={[dx, mix(4.5, 0, pArrive) + pLeave * 5, mix(2.5, 0, pArrive) + pLeave * 1.5]} scale={0.8}>
          <mesh rotation={[0, Math.PI / 2, 0]} scale={mix(1.5, 1, phase(t, 4.6, 5.6))}>
            <torusGeometry args={[1.35, 0.17, 16, 64]} />
            <Soft color={C.repair} opacity={0.75} glow={0.3} />
          </mesh>
          <mesh position={[0, 1.55, -0.6]} scale={[0.55, 0.45, 0.5]}>
            <sphereGeometry args={[1, 32, 24]} />
            <Soft color={C.repair} opacity={0.88} glow={0.15} />
          </mesh>
          <mesh position={[0.2, -1.5, -0.6]} scale={[0.45, 0.38, 0.45]}>
            <sphereGeometry args={[1, 32, 24]} />
            <Soft color="#3fb3a8" opacity={0.88} glow={0.15} />
          </mesh>
        </group>
      </Stage>
      <Labels
        show={showLabels}
        shot="02-04"
        title="图纸上的错字：DNA 损伤与修复"
        callouts={[
          {from: 2.3, to: 4.6, text: '一处损伤'},
          {from: 4.6, to: 6.4, text: '修复蛋白找到它'},
          {from: 6.4, to: 8.0, text: '剪掉受损部分'},
          {from: 8.0, to: 10.6, text: '补上新的'},
        ]}
      />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* 02-05  端粒：染色体末端的保护帽，随三次分裂一次次变短                  */
/* ------------------------------------------------------------------ */
const chromatidGeo = (side: number) => {
  const pts = [
    new THREE.Vector3(side * 0.55, 2.1, 0),
    new THREE.Vector3(side * 0.3, 1.0, 0.05),
    new THREE.Vector3(side * 0.14, 0, 0),
    new THREE.Vector3(side * 0.3, -1.0, -0.05),
    new THREE.Vector3(side * 0.55, -2.1, 0),
  ];
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.36, 24);
};

export const Telomere: React.FC<Show> = ({showLabels = true}) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const geoL = useMemo(() => chromatidGeo(-1), []);
  const geoR = useMemo(() => chromatidGeo(1), []);
  const events = [2.6, 5.4, 8.2];
  const n = events.filter((e) => t >= e + 0.6).length;
  const shrink = events.reduce((acc, e) => acc + phase(t, e, e + 0.8), 0);
  const capLen = mix(0.62, 0.08, shrink / 3);
  const flash = Math.max(...events.map((e) => window4(t, e - 0.1, e + 0.15, e + 0.5, e + 1.0)));
  const ghost = Math.max(...events.map((e) => window4(t, e, e + 0.3, e + 0.9, e + 1.5)));
  const ghostX = Math.max(...events.map((e) => phase(t, e, e + 1.5))) * 3.2;
  const caps: {p: V3; dir: V3}[] = [
    {p: [-0.55, 2.1, 0], dir: [-0.25, 1, 0]},
    {p: [0.55, 2.1, 0], dir: [0.25, 1, 0]},
    {p: [-0.55, -2.1, 0], dir: [-0.25, -1, 0]},
    {p: [0.55, -2.1, 0], dir: [0.25, -1, 0]},
  ];
  const body = (opacity: number, key: string) => (
    <group key={key}>
      <mesh geometry={geoL}>
        <Soft color="#4f7fb8" opacity={opacity} />
      </mesh>
      <mesh geometry={geoR}>
        <Soft color="#4f7fb8" opacity={opacity} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.32, 32, 24]} />
        <Soft color="#35577f" opacity={opacity} />
      </mesh>
      {caps.map((c, i) => {
        const d = new THREE.Vector3(...c.dir).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        const pos = new THREE.Vector3(...c.p).add(d.clone().multiplyScalar(capLen / 2 + 0.1));
        return (
          <mesh key={i} position={pos} quaternion={q}>
            <capsuleGeometry args={[0.37, capLen, 8, 20]} />
            <Soft color="#ffa53a" emissive="#ff8a1a" glow={0.45 + flash * 1.2} opacity={opacity} />
          </mesh>
        );
      })}
    </group>
  );
  return (
    <AbsoluteFill>
      <Stage pos={[Math.sin(t * 0.12) * 2.2, 0.4, 13.5]} at={[1.0, 0, 0]} fov={34}>
        <group rotation={[0, Math.sin(t * 0.25) * 0.35, 0]}>{body(1, 'main')}</group>
        {ghost > 0.01 ? <group position={[ghostX, 0, -1]}>{body(ghost * 0.45, 'ghost')}</group> : null}
      </Stage>
      <Labels
        show={showLabels}
        shot="02-05"
        title="鞋带头的塑料套：端粒"
        callouts={[
          {from: 0.8, to: 2.5, text: '末端的保护帽：端粒', x: 1180, y: 240},
          {from: 2.7, to: 12, text: n >= 3 && t > 9.6 ? '端粒太短：停止分裂' : `分裂第 ${Math.max(1, n)} 次`, x: 1180, y: 760},
        ]}
      />
    </AbsoluteFill>
  );
};

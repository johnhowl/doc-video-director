import React, {useLayoutEffect, useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {C, V3, rng} from './core';

/** Image-based lighting + renderer settings shared by every scene. */
const Env: React.FC<{exposure?: number}> = ({exposure = 1}) => {
  const {gl, scene} = useThree();
  useLayoutEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    (scene as unknown as {environmentIntensity: number}).environmentIntensity = 0.42;
    gl.localClippingEnabled = true;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    return () => {
      scene.environment = null;
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene, exposure]);
  return null;
};

/** Sets the camera every frame from a pure function of time. */
export const Rig: React.FC<{pos: V3; at: V3; fov?: number}> = ({pos, at, fov}) => {
  const {camera} = useThree();
  useLayoutEffect(() => {
    camera.position.set(...pos);
    camera.lookAt(...at);
    if (fov && 'fov' in camera) (camera as THREE.PerspectiveCamera).fov = fov;
    camera.updateProjectionMatrix();
  });
  return null;
};

/** Slowly drifting particles give depth to the "inside the body" medium. */
export const Motes: React.FC<{count?: number; spread?: number; color?: string; seed?: number}> = ({
  count = 260,
  spread = 14,
  color = '#9fc3d6',
  seed = 7,
}) => {
  const frame = useCurrentFrame();
  const base = useMemo(() => {
    const r = rng(seed);
    return Array.from({length: count}, () => ({
      p: [(r() - 0.5) * spread * 2, (r() - 0.5) * spread, (r() - 0.5) * spread * 1.4 - 2] as V3,
      s: 0.008 + r() * 0.03,
      v: 0.2 + r() * 0.6,
      ph: r() * Math.PI * 2,
    }));
  }, [count, spread, seed]);
  const mesh = useMemo(() => new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.35, depthWrite: false}),
    count,
  ), [count, color]);
  const m = new THREE.Matrix4();
  const t = frame / 30;
  base.forEach((b, i) => {
    const y = b.p[1] + Math.sin(t * 0.3 * b.v + b.ph) * 0.15;
    const x = b.p[0] + t * 0.04 * b.v;
    m.makeScale(b.s, b.s, b.s).setPosition(x, y, b.p[2]);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return <primitive object={mesh} />;
};

export const Stage: React.FC<{
  pos: V3;
  at: V3;
  fov?: number;
  bg?: string;
  fogNear?: number;
  fogFar?: number;
  exposure?: number;
  motes?: boolean;
  children: React.ReactNode;
}> = ({pos, at, fov = 35, bg = C.bg, fogNear = 10, fogFar = 34, exposure = 0.9, motes = true, children}) => {
  const {width, height} = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} gl={{antialias: true, alpha: false}} camera={{fov, near: 0.05, far: 120}}>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[C.bgFog, fogNear, fogFar]} />
      <Env exposure={exposure} />
      <Rig pos={pos} at={at} fov={fov} />
      <hemisphereLight args={['#cfe6ff', '#1a2433', 0.32]} />
      <directionalLight position={[-4, 6, 6]} intensity={1.7} color="#fff1dc" />
      <directionalLight position={[5, -2, -4]} intensity={0.9} color="#7fb6ff" />
      {motes ? <Motes /> : null}
      {children}
    </ThreeCanvas>
  );
};

/** Background gradient behind the canvas edges (vignette-free, just depth). */
export const Backdrop: React.FC<{top?: string; bottom?: string}> = ({top = '#122a40', bottom = '#0a1622'}) => (
  <AbsoluteFill style={{background: `linear-gradient(${top}, ${bottom})`}} />
);

/** Review overlay: shot id + plain-language title, and timed callouts.
 *  For the final cut, on-screen text is rebuilt in HyperFrames; set showLabels=false. */
export const Labels: React.FC<{
  shot: string;
  title: string;
  callouts?: {from: number; to: number; text: string; x?: number; y?: number}[];
  show?: boolean;
}> = ({shot, title, callouts = [], show = true}) => {
  const frame = useCurrentFrame();
  if (!show) return null;
  const sec = frame / 30;
  const font = '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
  return (
    <AbsoluteFill style={{pointerEvents: 'none', fontFamily: font}}>
      <div style={{position: 'absolute', left: 96, top: 72, color: '#e8f1f6'}}>
        <div style={{fontSize: 26, opacity: 0.6, letterSpacing: 2}}>{shot}</div>
        <div style={{fontSize: 52, fontWeight: 700, marginTop: 6}}>{title}</div>
      </div>
      {callouts.map((c, i) => {
        const o = Math.min(1, Math.max(0, (sec - c.from) / 0.4), Math.max(0, (c.to - sec) / 0.4));
        if (o <= 0) return null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: c.x ?? 1240,
              top: c.y ?? 760,
              opacity: o,
              color: '#ffffff',
              fontSize: 44,
              fontWeight: 600,
              padding: '10px 22px',
              background: 'rgba(10,22,34,0.55)',
              borderLeft: '4px solid #ffc46b',
            }}
          >
            {c.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

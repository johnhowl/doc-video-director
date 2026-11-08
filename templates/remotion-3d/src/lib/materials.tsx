import React from 'react';
import * as THREE from 'three';

/** Translucent biological membrane (cell, nucleus, vesicles). */
export const Membrane: React.FC<{color: string; opacity?: number; emissive?: string; glow?: number; clip?: THREE.Plane[]}> = ({
  color,
  opacity = 0.35,
  emissive = '#000000',
  glow = 0,
  clip,
}) => (
  <meshPhysicalMaterial
    color={color}
    roughness={0.28}
    metalness={0}
    transmission={0.55}
    thickness={0.6}
    ior={1.34}
    clearcoat={0.6}
    clearcoatRoughness={0.25}
    sheen={0.6}
    sheenColor={'#dff6ff'}
    transparent
    opacity={opacity}
    depthWrite={false}
    side={THREE.DoubleSide}
    emissive={emissive}
    emissiveIntensity={glow}
    clippingPlanes={clip}
  />
);

/** Soft, slightly waxy organelle / molecule surface. */
export const Soft: React.FC<{color: string; glow?: number; emissive?: string; opacity?: number; rough?: number; clip?: THREE.Plane[]}> = ({
  color,
  glow = 0,
  emissive,
  opacity = 1,
  rough = 0.45,
  clip,
}) => (
  <meshPhysicalMaterial
    color={color}
    roughness={rough}
    metalness={0}
    clearcoat={0.35}
    clearcoatRoughness={0.4}
    sheen={0.4}
    sheenColor={'#ffffff'}
    emissive={emissive ?? color}
    emissiveIntensity={glow}
    transparent={opacity < 1}
    opacity={opacity}
    depthWrite={opacity >= 0.98}
    side={clip ? THREE.DoubleSide : THREE.FrontSide}
    clippingPlanes={clip}
  />
);

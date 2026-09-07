import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Floating gold torus
const FloatingTorus = ({ position, color = '#FFD700' }) => (
  <Float speed={2} rotationIntensity={1.2} floatIntensity={1.5}>
    <mesh position={position}>
      <torusGeometry args={[0.8, 0.28, 32, 64]} />
      <meshStandardMaterial color={color} metalness={0.7} roughness={0.2} />
    </mesh>
  </Float>
);

// Floating dark icosahedron with distort material
const FloatingOrb = ({ position }) => (
  <Float speed={1.5} rotationIntensity={1} floatIntensity={2}>
    <mesh position={position}>
      <icosahedronGeometry args={[0.7, 1]} />
      <MeshDistortMaterial
        color="#1a1a1a"
        distort={0.35}
        speed={1.5}
        metalness={0.6}
        roughness={0.3}
      />
    </mesh>
  </Float>
);

// Floating octahedron — gold
const FloatingDiamond = ({ position }) => (
  <Float speed={1.8} rotationIntensity={1.5} floatIntensity={1.8}>
    <mesh position={position} rotation={[0.4, 0.6, 0]}>
      <octahedronGeometry args={[0.65, 0]} />
      <meshStandardMaterial
        color="#FFD700"
        metalness={0.9}
        roughness={0.15}
        emissive="#FFD700"
        emissiveIntensity={0.2}
      />
    </mesh>
  </Float>
);

// Tiny accent cube that orbits slowly
const OrbitingCube = ({ radius = 2.2 }) => {
  const ref = useRef();
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 0.4;
    if (ref.current) {
      ref.current.position.x = Math.cos(t) * radius;
      ref.current.position.y = Math.sin(t * 1.2) * 0.6;
      ref.current.position.z = Math.sin(t) * radius;
      ref.current.rotation.x = t;
      ref.current.rotation.y = t * 0.7;
    }
  });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.4, 0.4, 0.4]} />
      <meshStandardMaterial color="#000000" metalness={0.5} roughness={0.4} />
    </mesh>
  );
};

// Soft ambient + a couple of point lights to make gold pop
const SceneLights = () => (
  <>
    <ambientLight intensity={0.6} />
    <pointLight position={[5, 5, 5]} intensity={1.2} color="#FFD700" />
    <pointLight position={[-5, -3, 3]} intensity={0.6} color="#FFFFFF" />
  </>
);

// Main 3D canvas — fixed composition so it looks balanced across screen sizes
export default function HeroScene() {
  // Memoize positions so we don't re-allocate each render
  const positions = useMemo(
    () => ({
      torus:   [2.4,  1.0, -0.5],
      orb:     [-2.3, -0.8, 0.3],
      diamond: [-1.8,  1.4, 0.6],
    }),
    []
  );

  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 50 }}
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: true }}
    >
      <SceneLights />
      <FloatingTorus position={positions.torus} />
      <FloatingOrb position={positions.orb} />
      <FloatingDiamond position={positions.diamond} />
      <OrbitingCube />
    </Canvas>
  );
}
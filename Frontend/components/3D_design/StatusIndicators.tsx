"use client";

export function StatusIndicators() {
  return (
    <group position={[-14, 4, -11]}>
      <mesh>
        <boxGeometry args={[0.1, 6, 0.1]} />
        <meshStandardMaterial color="#1a2a40" />
      </mesh>
      {["#00ff66", "#00aaff", "#ffaa00"].map((color, i) => (
        <mesh key={i} position={[0, 2 - i * 2, 0.1]}>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} roughness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

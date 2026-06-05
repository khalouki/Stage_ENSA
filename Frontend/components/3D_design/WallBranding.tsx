"use client";
import { Text, useTexture } from "@react-three/drei";

export function WallBranding({ dark }: { dark: boolean }) {
  const texture = useTexture("/ENSA.png");
  const textColor = dark ? "#8899aa" : "#66778a";
  const labelColor = dark ? "#556677" : "#8899aa";

  return (
    <group position={[2, -1.5, -11.85]}>
      {/* Logo — small and unobtrusive, top-right of back wall */}
      <mesh position={[0, 8.6, 0]}>
        <planeGeometry args={[1.8, 1.9]} />
        <meshStandardMaterial
          map={texture}
          transparent
          alphaTest={0.05}
          opacity={dark ? 0.55 : 0.65}
        />
      </mesh>

      {/* Institution name */}
      <Text
        position={[0, 6.9, 0]}
        fontSize={0.8}
        color={textColor}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.12}
      >
        ENSA BÉNI MELLAL
      </Text>

      {/* Subtle divider line */}
      <mesh position={[0, 5.92, 0]}>
        <boxGeometry args={[2.2, 0.015, 0.01]} />
        <meshStandardMaterial color={labelColor} />
      </mesh>

      {/* Project label */}
      <Text
        position={[0, 6.36, 0]}
        fontSize={0.18}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.06}
      >
        FabLab Virtuel — PFE Industrie 4.0
      </Text>
    </group>
  );
}

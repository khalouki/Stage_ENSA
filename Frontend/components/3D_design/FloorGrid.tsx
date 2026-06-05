"use client";
import { Grid } from "@react-three/drei";
import { Theme } from "./types";

export function FloorGrid({ theme }: { theme: Theme }) {
  const dark = theme === "dark";
  return (
    <Grid
      position={[0, 0.008, 0]}
      args={[30, 24]}
      cellSize={1}
      cellThickness={0.3}
      cellColor={dark ? "#383c44" : "#b8b4aa"}
      sectionSize={4}
      sectionThickness={0.6}
      sectionColor={dark ? "#454a55" : "#a0988c"}
      fadeDistance={28}
      fadeStrength={2}
      infiniteGrid={false}
    />
  );
}

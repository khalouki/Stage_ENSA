export type CopilotDataPoint = {
  label: string;
  value: string | number | null;
  unit?: string | null;
};

export type CopilotResponse = {
  answer: string;
  intent: string;
  machine_id?: number | null;
  severity: "info" | "warning" | "critical";
  confidence: number;
  low_confidence: boolean;
  extracted_machines: Array<{ id: number; name: string }>;
  data_points: CopilotDataPoint[];
  recommendations: string[];
  generated_at: string;
};

export type ChatMessage =
  | { id: number; role: "user"; content: string }
  | { id: number; role: "assistant"; content: string; response: CopilotResponse };

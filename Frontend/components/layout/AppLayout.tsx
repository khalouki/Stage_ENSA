import Navbar from "./Navbar";
import Footer from "./Footer";
import { AiCopilotWidget } from "@/components/dashboard/copilot";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 bg-background dark:bg-[#1e293b]">{children}</main>
      <Footer />
      <AiCopilotWidget />
    </div>
  );
}

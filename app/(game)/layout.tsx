import { OutageBanner } from "@/components/outage-banner";
import { PhoneFrame } from "@/components/phone-frame";
import { TabBar } from "@/components/tab-bar";
import { Toast } from "@/components/toast";

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <PhoneFrame>
      <main className="relative flex min-h-0 flex-1 flex-col">
        <OutageBanner />
        {children}
        <Toast />
      </main>
      <TabBar />
    </PhoneFrame>
  );
}

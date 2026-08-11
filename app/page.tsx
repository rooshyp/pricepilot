import type { Metadata } from "next";
import { PricePilotApp } from "@/components/PricePilotApp";

export const metadata: Metadata = {
  title: "Pricing command center",
  description:
    "Explore portfolio economics, price frontiers, scenarios, sensitivity, and test-ready recommendations.",
};

export default function Home() {
  return <PricePilotApp />;
}

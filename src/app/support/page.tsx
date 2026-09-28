import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Support | First Move: Start Small" };

export default function SupportPage() {
  return <LegalPage document="support.md" />;
}

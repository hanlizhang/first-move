import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Privacy Policy | First Move: Start Small" };

export default function PrivacyPage() {
  return <LegalPage document="privacy-policy.md" />;
}

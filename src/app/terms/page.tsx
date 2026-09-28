import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Terms of Use | First Move: Start Small" };

export default function TermsPage() {
  return <LegalPage document="terms-of-use.md" />;
}

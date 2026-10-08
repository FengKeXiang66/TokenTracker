import React from "react";
import { copy } from "../../lib/copy";

export function LegalLinks() {
  return (
    <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-oai-gray-400">
      <a href="/pricing.html" className="hover:underline">{copy("legal.nav.pricing")}</a>
      <a href="/terms.html" className="hover:underline">{copy("legal.nav.terms")}</a>
      <a href="/privacy.html" className="hover:underline">{copy("landing.v2.nav.privacy")}</a>
      <a href="mailto:rynnsun0509@gmail.com" className="hover:underline">{copy("legal.nav.support")}</a>
    </nav>
  );
}

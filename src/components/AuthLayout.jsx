import React from "react";
import FernwerkLogo from "@/components/brand/FernwerkLogo";

// Auth-Seiten-Hintergrund mit FERNWERK-Marke, Tagline und dunkler Atmosphäre.
export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <FernwerkLogo size={44} showWord={false} />
          </div>
          <p className="text-[11px] tracking-[0.04em] text-muted-foreground mt-3">Dein Unternehmen. Dein Leben. Dein Weg.</p>
        </div>
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-lime/10 border border-lime/30 mb-3">
            <Icon className="w-6 h-6 text-lime" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="glass rounded-2xl border border-white/10 p-6 shadow-2xl">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
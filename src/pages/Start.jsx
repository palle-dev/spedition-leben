import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { Building2, Plus, Play } from "lucide-react";
import { formatGameTime, formatEuro } from "@/lib/gameData";

export default function StartScreen() {
  const { newGame, listGames, loadGame, busy, showToast } = useGame();
  const [games, setGames] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [names, setNames] = useState({ companyName: "", playerName: "", partnerName: "Mara" });

  useEffect(() => {
    listGames().then((r) => setGames(r.games || [])).catch(() => {});
  }, [listGames]);

  async function create() {
    try {
      await newGame({
        companyName: names.companyName || "Nordlicht Transport GmbH",
        playerName: names.playerName || "Spielerin",
        partnerName: names.partnerName || "Mara"
      });
    } catch (e) { showToast(e.message, "error"); }
  }

  return (
    <div className="min-h-screen bg-office flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-wood/40 border border-wood/60 mb-4">
            <Building2 className="w-8 h-8 text-amber-300" />
          </div>
          <h1 className="text-3xl font-display font-bold text-amber-200">Spedition &amp; Leben</h1>
          <p className="text-amber-100/60 mt-2">Eine Wirtschaftssimulation über Transport, Unternehmertum und Privatleben.</p>
        </div>

        {games.length > 0 && !showForm && (
          <div className="space-y-2 mb-4">
            <h2 className="text-sm uppercase tracking-wide text-amber-300/70">Spielstand fortsetzen</h2>
            {games.map((g) => (
              <button key={g.id} onClick={() => loadGame(g.id)}
                className="w-full text-left px-4 py-3 rounded-lg bg-office-2 border border-wood/40 hover:border-amber-400/60 transition flex items-center justify-between">
                <div>
                  <div className="font-medium text-amber-100">{g.company || "Unbenannt"}</div>
                  <div className="text-xs text-amber-100/50">{g.gameTime != null ? formatGameTime(g.gameTime) : ""}</div>
                </div>
                <Play className="w-4 h-4 text-amber-300" />
              </button>
            ))}
          </div>
        )}

        {showForm ? (
          <div className="bg-office-2 border border-wood/40 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-amber-100">Neue Spedition gründen</h2>
            <Field label="Firmenname" value={names.companyName} onChange={(v) => setNames({ ...names, companyName: v })} placeholder="Nordlicht Transport GmbH" />
            <Field label="Dein Name" value={names.playerName} onChange={(v) => setNames({ ...names, playerName: v })} placeholder="Spielerin" />
            <Field label="Name der Partnerin / des Partners" value={names.partnerName} onChange={(v) => setNames({ ...names, partnerName: v })} placeholder="Mara" />
            <div className="flex gap-2">
              <button onClick={create} disabled={busy} className="flex-1 px-4 py-2 rounded-md bg-amber-500 text-amber-950 hover:bg-amber-400 disabled:opacity-40 font-semibold">Gründen</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md bg-wood/30 hover:bg-wood/50 text-sm">Abbrechen</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)}
            className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-wood/50 hover:border-amber-400/60 hover:bg-wood/20 transition flex items-center justify-center gap-2 text-amber-100">
            <Plus className="w-5 h-5" /> Neues Spiel beginnen
          </button>
        )}

        <p className="text-xs text-amber-100/40 mt-6 text-center">
          Start: Hamburg · 75.000 € Firma · 7.500 € Privat · 3 Lkw · 3 Fahrer · 8 Angebote
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-xs text-amber-100/60">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-md bg-office border border-wood/40 focus:border-amber-400 outline-none text-amber-50" />
    </label>
  );
}
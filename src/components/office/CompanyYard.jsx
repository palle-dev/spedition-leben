import React, { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, MapPin, Network, Palette } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { dayOf, formatGameTime } from "@/lib/gameData";
import "./yard.css";

const COLORS = ["#a3e635", "#38bdf8", "#c4b5fd", "#fb923c", "#f472b6"];
const COLOR_NAMES = ["Limette", "Himmelblau", "Lavendel", "Orange", "Pink"];

// Company identity belongs in the office header, not in a second decorative hero.
export default function CompanyYard({ children = null }) {
  const { state, send, showToast, busy, backgroundAdvance } = useGame();
  const [edit, setEdit] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [motto, setMotto] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const id = useId();
  const brand = state.journey?.brand || { color: COLORS[0], motto: "Wir bringen Zukunft auf die Straße." };
  const accent = COLORS.includes(brand.color) ? brand.color : COLORS[0];
  const branches = (state.branches || []).filter(b => b.status === "active");
  const headquarters = branches.find(b => b.isHeadquarters);
  const disabled = saving || busy || backgroundAdvance?.active;
  function toggleEditor() {
    if (disabled) return;
    setColor(accent); setMotto(brand.motto || ""); setError(""); setEdit(!edit);
  }
  async function save(event) {
    event.preventDefault();
    if (lock.current || disabled) return;
    lock.current = true; setSaving(true); setError("");
    try {
      const result = await send("setCompanyIdentity", { color, motto });
      if (result?.error || result?.ok === false) throw new Error(result.error || "Der Firmenauftritt konnte nicht gespeichert werden.");
      setEdit(false); showToast("Firmenauftritt gespeichert.", "success");
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setSaving(false); }
  }
  return <section className="ff-company" style={/** @type {React.CSSProperties} */ ({ "--company-accent": accent })} aria-label="Dein Unternehmen">
    <div className="ff-company-heading">
      <div className="ff-company-identity">
        <p className="ff-company-eyebrow"><span className="ff-company-mark" aria-hidden="true" /> GESCHÄFTSLEITUNG <span className="ff-company-day">TAG {dayOf(state.gameTime)}</span></p>
        <h1>{state.company?.name || "Deine Spedition"}</h1>
        {brand.motto && <p className="ff-company-motto">{brand.motto}</p>}
      </div>
      <button type="button" className="ff-company-edit" onClick={toggleEditor} disabled={disabled} aria-label="Firmenauftritt bearbeiten" aria-expanded={edit} aria-controls={id}><Palette size={16} aria-hidden="true" /><span>Auftritt bearbeiten</span></button>
    </div>
    <div className="ff-company-toolbar">
      <div className="ff-company-context">
        {headquarters && <span><MapPin size={14} aria-hidden="true" />{headquarters.city}<span className="ff-company-context-label">Hauptsitz</span></span>}
        <Link to="/filialen"><Network size={14} aria-hidden="true" />{branches.length} {branches.length === 1 ? "Standort" : "Standorte"}<ArrowUpRight size={13} aria-hidden="true" /></Link>
        <span className="ff-company-time">{formatGameTime(state.gameTime)}</span>
      </div>
      {children}
    </div>
    {edit && <form id={id} className="ff-company-editor" onSubmit={save}>
      <div><h2>Deine Handschrift.</h2><p>Firmenfarbe und Leitsatz für Deinen Unternehmensauftritt.</p></div>
      <fieldset disabled={disabled}>
        <legend>Firmenfarbe</legend>
        <div className="ff-company-palette">{COLORS.map((c, i) => <button key={c} type="button" style={{ background: c }} aria-label={COLOR_NAMES[i]} aria-pressed={color === c} onClick={() => setColor(c)}>{color === c && <Check size={19} />}</button>)}</div>
        <label htmlFor={id + "-motto"}>Leitsatz <span>{motto.length}/80</span></label>
        <input id={id + "-motto"} maxLength={80} value={motto} onChange={e => setMotto(e.target.value)} placeholder="Was Deine Spedition ausmacht" />
        <div className="ff-company-editor-actions"><button type="submit" className="ff-company-save">{saving ? "Wird gespeichert …" : "Änderungen speichern"}</button><button type="button" onClick={() => setEdit(false)}>Abbrechen</button></div>
      </fieldset>
      {error && <p role="alert" className="ff-company-error">{error}</p>}
    </form>}
  </section>;
}

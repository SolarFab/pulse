import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — Pulse",
  description: "Wie Pulse mit personenbezogenen Daten umgeht.",
};

const wrap: CSSProperties = { maxWidth: 760, margin: "0 auto", padding: "40px 24px 80px", lineHeight: 1.65 };
const muted: CSSProperties = { color: "#6b6b6b", fontSize: 14 };
const h2: CSSProperties = { fontSize: 20, letterSpacing: "-0.01em", margin: "40px 0 8px", paddingTop: 18, borderTop: "1px solid #ececec" };
const p: CSSProperties = { fontSize: 15, color: "#444" };
const link: CSSProperties = { color: "#8b5cf6" };
const strong: CSSProperties = { color: "#1a1a1a", fontWeight: 600 };

export default function Datenschutz() {
  return (
    <main style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 20, borderBottom: "1px solid #ececec", marginBottom: 32 }}>
        <strong style={{ fontWeight: 700 }}>Pulse</strong>
        <Link href="/" style={{ ...muted, textDecoration: "none" }}>← Zur Startseite</Link>
      </div>

      <h1 style={{ fontSize: 30, letterSpacing: "-0.02em", margin: "0 0 6px" }}>Datenschutzerklärung</h1>

      <h2 style={{ ...h2, border: 0, padding: 0, marginTop: 12 }}>Verantwortlicher</h2>
      <p style={p}>
        Fabian Kratz, Stettiner Straße 41, 35410 Hungen, Deutschland ·{" "}
        <a style={link} href="mailto:fkratzdesign@gmail.com">fkratzdesign@gmail.com</a>
      </p>

      <h2 style={h2}>Worum es geht</h2>
      <p style={p}>
        Pulse ist eine Web-App, die Veranstaltungen in Berlin auf einer interaktiven Karte zeigt und
        einen KI-Concierge bietet, den man in natürlicher Sprache fragen kann. Nachfolgend erläutern
        wir, welche personenbezogenen Daten dabei verarbeitet werden.
      </p>

      <h2 style={h2}>Server-Logs (Hosting)</h2>
      <p style={p}>
        Beim Aufruf der App verarbeitet der Hosting-Anbieter <span style={strong}>Vercel Inc.</span>{" "}
        automatisch technisch notwendige Zugriffsdaten (u. a. IP-Adresse, Datum/Uhrzeit, aufgerufene
        Seite, Browsertyp). Rechtsgrundlage ist das berechtigte Interesse an einer sicheren und
        stabilen Bereitstellung (Art. 6 Abs. 1 lit. f DSGVO). Server können sich in der EU und den USA
        befinden.
      </p>

      <h2 style={h2}>Nutzerkonto</h2>
      <p style={p}>
        Für ein Konto verarbeiten wir Ihre <span style={strong}>E-Mail-Adresse</span> und Ihr Passwort
        (verschlüsselt gespeichert). Authentifizierung und Speicherung erfolgen über{" "}
        <span style={strong}>Supabase</span> (Datenbank &amp; Auth) in einer EU-Region. Rechtsgrundlage
        ist die Vertragserfüllung bzw. Ihre Einwilligung (Art. 6 Abs. 1 lit. b und a DSGVO).
      </p>

      <h2 style={h2}>KI-Concierge</h2>
      <p style={p}>
        Wenn Sie den Chat nutzen, werden Ihre Eingaben zur Erzeugung einer Antwort an{" "}
        <span style={strong}>Anthropic (Claude)</span> übermittelt. Geben Sie dort bitte keine sensiblen
        personenbezogenen Daten ein. Rechtsgrundlage ist Ihre Nutzung der Funktion (Art. 6 Abs. 1 lit. b/f
        DSGVO).
      </p>

      <h2 style={h2}>Cookies</h2>
      <p style={p}>
        Wir verwenden ausschließlich technisch notwendige bzw. Sitzungs-Cookies für die Anmeldung
        (Supabase). Es kommen <span style={strong}>keine Werbe- oder Tracking-Cookies</span> zum Einsatz.
      </p>

      <h2 style={h2}>Auftragsverarbeiter</h2>
      <p style={p}>
        Vercel (Hosting), Supabase (Datenbank &amp; Authentifizierung, EU-Region) und Anthropic
        (Beantwortung von Chat-Anfragen). Mit diesen Anbietern bestehen entsprechende Vereinbarungen
        zur Auftragsverarbeitung. Wir verkaufen oder vermieten Ihre Daten nicht.
      </p>

      <h2 style={h2}>Speicherdauer &amp; Löschung</h2>
      <p style={p}>
        Kontodaten werden gespeichert, solange Ihr Konto besteht. Auf Wunsch löschen wir Ihr Konto und
        die zugehörigen Daten; schreiben Sie dazu an{" "}
        <a style={link} href="mailto:fkratzdesign@gmail.com">fkratzdesign@gmail.com</a>.
      </p>

      <h2 style={h2}>Ihre Rechte</h2>
      <p style={p}>
        Sie haben nach der DSGVO das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
        Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht auf Beschwerde bei einer
        Datenschutz-Aufsichtsbehörde.
      </p>

      <p style={{ ...muted, marginTop: 40 }}>
        Stand: Juli 2026. Siehe auch das <Link style={link} href="/impressum">Impressum</Link>.
      </p>
    </main>
  );
}

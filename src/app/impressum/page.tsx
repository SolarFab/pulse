import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Impressum — Pulse",
  description: "Impressum und rechtliche Angaben zu Pulse.",
};

const wrap: CSSProperties = { maxWidth: 760, margin: "0 auto", padding: "40px 24px 80px", lineHeight: 1.65 };
const muted: CSSProperties = { color: "#6b6b6b", fontSize: 14 };
const box: CSSProperties = { background: "#fff", border: "1px solid #ececec", borderRadius: 12, padding: "16px 18px", lineHeight: 1.9, fontSize: 15 };
const h3: CSSProperties = { fontSize: 15, fontWeight: 600, margin: "22px 0 4px" };
const link: CSSProperties = { color: "#8b5cf6" };

export default function Impressum() {
  return (
    <main style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 20, borderBottom: "1px solid #ececec", marginBottom: 32 }}>
        <strong style={{ fontWeight: 700 }}>Pulse</strong>
        <Link href="/" style={{ ...muted, textDecoration: "none" }}>← Zur Startseite</Link>
      </div>

      <h1 style={{ fontSize: 30, letterSpacing: "-0.02em", margin: "0 0 6px" }}>Impressum</h1>
      <p style={muted}>Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz)</p>

      <div style={box}>
        Fabian Kratz<br />
        Stettiner Straße 41<br />
        35410 Hungen<br />
        Deutschland
      </div>

      <h3 style={h3}>Kontakt</h3>
      <p style={{ fontSize: 15 }}>
        E-Mail: <a style={link} href="mailto:fkratzdesign@gmail.com">fkratzdesign@gmail.com</a><br />
        Telefon: 01579-2341672
      </p>
      <p style={muted}>Die Telefonnummer wird über einen externen Dienstleister bereitgestellt.</p>

      <h3 style={h3}>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h3>
      <p style={{ fontSize: 15 }}>Fabian Kratz (Anschrift wie oben)</p>

      <h3 style={h3}>Haftung für Inhalte</h3>
      <p style={{ fontSize: 15, color: "#444" }}>
        Die Inhalte dieser Website wurden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit,
        Vollständigkeit und Aktualität der Inhalte kann ich jedoch keine Gewähr übernehmen. Als
        Diensteanbieter bin ich gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den
        allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG bin ich als Diensteanbieter jedoch
        nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen.
      </p>

      <h3 style={h3}>Haftung für Links</h3>
      <p style={{ fontSize: 15, color: "#444" }}>
        Dieses Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte ich keinen
        Einfluss habe. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder
        Betreiber der Seiten verantwortlich.
      </p>

      <h3 style={h3}>Urheberrecht</h3>
      <p style={{ fontSize: 15, color: "#444" }}>
        Die durch den Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem
        deutschen Urheberrecht. Veranstaltungsangaben stammen aus öffentlich zugänglichen Quellen; die
        Rechte an den jeweiligen Inhalten verbleiben bei den jeweiligen Veranstaltern.
      </p>

      <p style={{ ...muted, marginTop: 40 }}>
        Siehe auch die <Link style={link} href="/datenschutz">Datenschutzerklärung</Link>.
      </p>
    </main>
  );
}

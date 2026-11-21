"use client";

/** Last-resort error screen (the root layout itself failed). Plain HTML, no app styles needed. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#eef2f7", color: "#0f172a", margin: 0 }}>
        <main style={{ maxWidth: 460, margin: "15vh auto", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 24 }}>CampusConnect is temporarily unavailable</h1>
          <p style={{ color: "#475569" }}>Please try again in a moment.</p>
          <button
            onClick={() => reset()}
            style={{ marginTop: 16, padding: "10px 20px", fontSize: 16, borderRadius: 8, border: 0, background: "#1e3a8a", color: "#fff", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

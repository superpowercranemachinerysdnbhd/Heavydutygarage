"use client";

/** Last-resort error screen (the whole app failed to load). Plain, readable in light and dark mode. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#f4f5f7", color: "#1a1f26", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", padding: 16 }}>
        <div style={{ maxWidth: 480 }}>
          <h2 style={{ marginTop: 0 }}>Something went wrong · Ada masalah</h2>
          <p>What you just did may not have been saved. Check your internet connection, then reload.</p>
          <p>Apa yang anda buat tadi mungkin belum disimpan. Semak sambungan internet, kemudian muat semula.</p>
          {error.digest && <p style={{ color: "#666", fontSize: 13 }}>Error code: {error.digest}</p>}
          <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => window.location.reload()} style={{ padding: "10px 16px", fontSize: 16 }}>Reload · Muat semula</button>
            <a href="/jobs" style={{ padding: "10px 16px", fontSize: 16 }}>Work orders</a>
          </p>
        </div>
      </body>
    </html>
  );
}

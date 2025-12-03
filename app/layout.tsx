import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          margin: 0,
          backgroundColor: "#FFFFFF",
          color: "#000000",
        }}
      >
        {children}
      </body>
    </html>
  );
}



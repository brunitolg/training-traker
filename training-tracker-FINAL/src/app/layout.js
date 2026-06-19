import "./globals.css";

export const metadata = {
  title: "Training Tracker",
  description: "Piano allenamenti Bruno & Achille",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "CA DL Knowledge Test Prep",
  description: "Practice questions for the California Driver's License Knowledge Test",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
